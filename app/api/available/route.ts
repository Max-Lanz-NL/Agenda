import { localBrowser, localShareDirectory } from '../../../lib/local-proposals';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const directory = localShareDirectory;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const interval = /^(?:[01]\d|2[0-3]):[0-5]\d – (?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const local = () => !process.env.VERCEL && !process.env.NEXT_PUBLIC_SUPABASE_URL;
const respond = (status: number) => Response.json({}, { status, headers });
const digest = (secret: string) => createHash('sha256').update(secret).digest('hex');
const linkPath = (token: string) => join(directory, token + '.json');

function safeRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 62).flatMap(row => {
    if (!row || typeof row.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.day) || !Number.isFinite(Date.parse(row.day)) || !Array.isArray(row.slots)) return [];
    const slots = row.slots.slice(0, 1440).filter((slot: unknown) => typeof slot === 'string' && interval.test(slot));
    return [{ day: row.day as string, busy: row.busy === true, slots: slots as string[] }];
  });
}

async function loadLocal(token: string) {
  const text = await readFile(linkPath(token), 'utf8');
  return JSON.parse(text) as { expires_at: string; revokeHash: string; slots: unknown };
}

function canWriteLocally(request: Request) {
  if (!local() || request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const host = request.headers.get('host') || new URL(request.url).host;
  if (!/^(localhost|127[.]0[.]0[.]1|\[::1\])(?::[0-9]{1,5})?$/i.test(host)) return false;
  const origin = request.headers.get('origin');
  return !origin || origin === 'http://' + host || origin === 'https://' + host;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token || !uuid.test(token)) return respond(404);

  if (local()) {
    try {
      const link = await loadLocal(token);
      if (Date.parse(link.expires_at) <= Date.now()) return respond(404);
      return Response.json({ slots: safeRows(link.slots) }, { headers });
    } catch {
      return respond(404);
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return respond(404);
  const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.from('availability_links').select('slots').eq('token', token).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error || !data) return respond(error ? 503 : 404);
  return Response.json({ slots: safeRows(data.slots) }, { headers });
}

export async function POST(request: Request) {
  if (!canWriteLocally(request)) return respond(403);
  let input: { lifetime?: number; slots?: unknown };
  try {
    const text = await request.text();
    if (text.length > 262144) return respond(413);
    input = JSON.parse(text);
    if (!input || ![1, 7, 30].includes(input.lifetime ?? 0)) return respond(400);
  } catch { return respond(400); }

  const slots = safeRows(input.slots).filter(row => row.busy);
  if (!slots.length) return respond(400);
  const token = randomUUID();
  const revokeKey = randomUUID();
  const expires_at = new Date(Date.now() + input.lifetime! * 86400000).toISOString();
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(linkPath(token), JSON.stringify({ slots, expires_at, revokeHash: digest(revokeKey), owner: localBrowser(request) }), { flag: 'wx' });
    return Response.json({ token, expires_at, revokeKey }, { status: 201, headers });
  } catch { return respond(500); }
}

export async function DELETE(request: Request) {
  if (!canWriteLocally(request)) return respond(403);
  const token = new URL(request.url).searchParams.get('token');
  const revokeKey = request.headers.get('x-revoke-key');
  if (!token || !uuid.test(token) || !revokeKey || !uuid.test(revokeKey)) return respond(404);
  try {
    const link = await loadLocal(token);
    if (link.revokeHash !== digest(revokeKey)) return respond(404);
    await unlink(linkPath(token));
    return new Response(null, { status: 204, headers });
  } catch { return respond(404); }
}
