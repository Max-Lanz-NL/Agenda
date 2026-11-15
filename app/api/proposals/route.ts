import { localMode } from '../../../lib/local-identity';
import { localProposals } from '../../../lib/local-proposals';
import { createClient } from '@supabase/supabase-js';

const headers = { 'Cache-Control': 'no-store' };
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });

async function access(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await db.auth.getUser(token);
  return user ? { db, user } : null;
}

export async function GET(request: Request) {
  if (localMode()) return localProposals(request);
  const session = await access(request);
  if (!session) return json({ code: 'login' }, 401);
  const { db, user } = session;
  const { data, error } = await db.from('appointment_proposals').select('id, owner_id, sender_id, sender_label, day, starts, ends, message, status')
    .or('owner_id.eq.' + user.id + ',sender_id.eq.' + user.id).order('created_at', { ascending: false });
  if (error) return json({ code: 'unavailable' }, 503);
  return json({ proposals: data.map(row => ({
    id: row.id, incoming: row.owner_id === user.id, sender: row.owner_id === user.id ? row.sender_label : '',
    day: row.day, start: row.starts.slice(0, 5), end: row.ends.slice(0, 5), message: row.message, status: row.status,
  })) });
}

export async function POST(request: Request) {
  if (localMode()) return localProposals(request);
  const session = await access(request);
  if (!session) return json({ code: 'login' }, 401);
  const { db, user } = session;
  let input;
  try {
    const text = await request.text();
    if (text.length > 4096) return json({ code: 'invalid' }, 400);
    input = JSON.parse(text);
    if (!input || typeof input !== 'object') return json({ code: 'invalid' }, 400);
  } catch { return json({ code: 'invalid' }, 400); }

  if (input.action === 'decide' && typeof input.id === 'string' && uuid.test(input.id) && typeof input.accept === 'boolean') {
    const { data, error } = await db.rpc('agenda_decide', { actor: user.id, proposal: input.id, accept: input.accept });
    return error ? json({ code: 'unavailable' }, 503) : json({ code: data }, data === 'ok' ? 200 : 409);
  }
  if (input.action !== 'propose' || typeof input.token !== 'string' || !uuid.test(input.token) ||
    typeof input.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.day) ||
    typeof input.start !== 'string' || !time.test(input.start) ||
    typeof input.end !== 'string' || !time.test(input.end) || input.end <= input.start ||
    typeof input.message !== 'string' || input.message.length > 500) return json({ code: 'invalid' }, 400);
  const { data, error } = await db.rpc('agenda_propose', {
    actor: user.id, label: user.email || 'Agenda-gebruiker', share_token: input.token,
    requested_day: input.day, requested_start: input.start, requested_end: input.end, note: input.message,
  });
  return error ? json({ code: 'unavailable' }, 503) : json({ code: data }, data === 'ok' ? 201 : 409);
}
