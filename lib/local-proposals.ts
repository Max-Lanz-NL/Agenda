import { localBrowser, uuid } from './local-identity';
import { friendProposalShare } from './local-friends';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Proposal } from './proposals';

export const localShareDirectory = join(process.cwd(), '.agenda-local', 'links');
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

type LocalProposal = Omit<Proposal, 'incoming'> & { owner: string; senderId: string };
const file = join(process.cwd(), '.agenda-local', 'proposals.json');
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<LocalProposal[]> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function save(rows: LocalProposal[]) {
  await mkdir(join(process.cwd(), '.agenda-local'), { recursive: true });
  const temporary = file + '.tmp';
  await writeFile(temporary, JSON.stringify(rows));
  await rename(temporary, file);
}

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start < b.end && a.end > b.start;

export async function localProposals(request: Request) {
  const actor = localBrowser(request);
  if (!actor) return json({ code: 'login' }, 401);
  if (request.method === 'GET') {
    try {
      const proposals = (await load()).filter(item => item.owner === actor || item.senderId === actor).reverse()
        .map(({ owner, senderId, ...item }) => ({ ...item, sender: owner === actor ? item.sender : '', incoming: owner === actor }));
      return json({ proposals });
    } catch { return json({ code: 'unavailable' }, 503); }
  }

  let input;
  try {
    const text = await request.text();
    if (text.length > 4096) return json({ code: 'invalid' }, 400);
    input = JSON.parse(text);
    if (!input || typeof input !== 'object') return json({ code: 'invalid' }, 400);
  } catch { return json({ code: 'invalid' }, 400); }

  const operation = queue.then(async () => {
    const rows = await load();
    if (input.action === 'decide') {
      const item = rows.find(row => row.id === input.id && row.owner === actor && row.status === 'pending');
      if (!item || typeof input.accept !== 'boolean') return json({ code: 'unavailable' }, 409);
      if (input.accept && rows.some(row => row.status === 'accepted' && row.day === item.day && overlaps(item, row) &&
        [row.owner, row.senderId].some(id => id === item.owner || id === item.senderId))) return json({ code: 'busy' }, 409);
      item.status = input.accept ? 'accepted' : 'declined';
      await save(rows);
      return json({ code: 'ok' });
    }
    if (input.action !== 'propose' || typeof input.token !== 'string' || !uuid.test(input.token) ||
      typeof input.day !== 'string' || typeof input.start !== 'string' || !clock.test(input.start) ||
      typeof input.end !== 'string' || !clock.test(input.end) || input.end <= input.start ||
      typeof input.message !== 'string' || input.message.length > 500 ||
      typeof input.sender !== 'string' || !input.sender.trim() || input.sender.length > 60) return json({ code: 'invalid' }, 400);
    const link = await friendProposalShare(input.token, actor) || await readFile(join(localShareDirectory, input.token + '.json'), 'utf8').then(text => JSON.parse(text)).catch(() => null);
    if (!link || Date.parse(link.expires_at) <= Date.now()) return json({ code: 'unavailable' }, 409);
    if (!link.owner) return json({ code: 'old_link' }, 409);
    if (link.owner === actor) return json({ code: 'own_link' }, 409);
    const day = link.slots.find((row: { day: string; busy: boolean }) => row.day === input.day && row.busy);
    if (!day) return json({ code: 'unavailable' }, 409);
    if (day.slots.some((slot: string) => {
      const [start, end] = slot.split(' – ');
      return overlaps(input, { start, end });
    })) return json({ code: 'busy' }, 409);
    if (rows.some(item => item.senderId === actor && item.owner === link.owner && item.day === input.day &&
      item.start === input.start && item.end === input.end && item.status !== 'declined')) return json({ code: 'duplicate' }, 409);
    rows.push({ id: randomUUID(), owner: link.owner, senderId: actor, sender: input.sender.trim(), day: input.day,
      start: input.start, end: input.end, message: input.message.trim(), status: 'pending' });
    await save(rows);
    return json({ code: 'ok' }, 201);
  });
  queue = operation.catch(() => {});
  return operation.catch(() => json({ code: 'unavailable' }, 503));
}
