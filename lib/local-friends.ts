import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { localBrowser, uuid } from './local-identity';

type Day = { day: string; busy: true; slots: string[] };
type Member = { id: string; name: string; paused: boolean; slots: Day[] };
type Friend = { id: string; members: [Member, Member] };
type Invite = { id: string; owner: string; name: string; expires: number };
type Store = { friends: Friend[]; invites: Invite[] };
const directory = join(process.cwd(), '.agenda-local');
const file = join(directory, 'friends.json');
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
let queue: Promise<unknown> = Promise.resolve();

async function read(): Promise<Store> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { friends: [], invites: [] };
    throw error;
  }
}

async function write(store: Store) {
  await mkdir(directory, { recursive: true });
  const temporary = file + '.' + randomUUID();
  await writeFile(temporary, JSON.stringify(store));
  await rename(temporary, file);
}

function activeInvites(invites: Invite[]) {
  return new Map(invites.filter(item => item.expires > Date.now()).map(item => [item.owner, item]));
}

function sanitize(value: unknown): Day[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 62).flatMap(row => {
    if (typeof row?.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.day) || !Array.isArray(row.slots)) return [];
    const slots = row.slots.slice(0, 100).filter((slot: unknown) => typeof slot === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d – (?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(slot));
    return [{ day: row.day, busy: true as const, slots }];
  });
}

export async function friendProposalShare(id: string, actor: string) {
  const friend = (await read()).friends.find(item => item.id === id && item.members.some(member => member.id === actor));
  const other = friend?.members.find(member => member.id !== actor);
  const own = friend?.members.find(member => member.id === actor);
  if (!other || other.paused || !own || own.paused) return null;
  const ownDates = new Map(own.slots.map(day => [day.day, day.slots]));
  const slots = other.slots.filter(day => ownDates.has(day.day))
    .map(day => ({ ...day, slots: [...day.slots, ...ownDates.get(day.day)!] }));
  return { owner: other.id, slots, expires_at: new Date(Date.now() + 60000).toISOString() };
}

export async function handleFriends(request: Request) {
  const actor = localBrowser(request);
  if (!actor) return json({}, 401);
  if (request.method === 'GET') {
    const { friends, invites } = await read();
    const invite = new URL(request.url).searchParams.get('invite');
    const active = activeInvites(invites);
    const invitation = [...active.values()].find(item => item.id === invite && item.owner !== actor);
    return json({
      friends: friends.filter(friend => friend.members.some(member => member.id === actor)).map(friend => {
        const own = friend.members.find(member => member.id === actor)!;
        const other = friend.members.find(member => member.id !== actor)!;
        return { id: friend.id, name: other.name, paused: own.paused, otherPaused: other.paused, days: other.paused ? [] : other.slots };
      }),
      invites: active.has(actor) ? [active.get(actor)!].map(({ id, name }) => ({ id, name })) : [],
      invitation: invitation ? { name: invitation.name } : null,
    });
  }

  let input;
  try {
    const text = await request.text();
    if (text.length > 262144) return json({}, 413);
    input = JSON.parse(text);
    if (!input || typeof input !== 'object') return json({}, 400);
  } catch { return json({}, 400); }
  const operation = queue.then(async () => {
    const store = await read();
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const member = (id: string, name: string): Member => ({ id, name, paused: true, slots: [] });
    if (input.action === 'invite' && name && name.length <= 60) {
      const existing = activeInvites(store.invites).get(actor);
      if (existing) return json({ id: existing.id });
      const id = randomUUID();
      store.invites = [...activeInvites(store.invites).values()];
      store.invites.push({ id, owner: actor, name, expires: Date.now() + 7 * 86400000 });
      await write(store);
      return json({ id }, 201);
    }
    if (typeof input.id !== 'string' || !uuid.test(input.id)) return json({}, 400);
    if (input.action === 'accept' && name && name.length <= 60) {
      const invite = [...activeInvites(store.invites).values()].find(item => item.id === input.id && item.owner !== actor);
      if (!invite) return json({}, 404);
      const existing = store.friends.find(friend => friend.members.some(item => item.id === actor) && friend.members.some(item => item.id === invite.owner));
      const id = existing?.id || randomUUID();
      if (!existing) store.friends.push({ id, members: [member(invite.owner, invite.name), member(actor, name)] });
      store.invites = store.invites.filter(item => item.owner !== invite.owner);
      await write(store);
      return json({ id });
    }
    if (input.action === 'revoke') {
      if (activeInvites(store.invites).get(actor)?.id === input.id) store.invites = store.invites.filter(item => item.owner !== actor);
      await write(store);
      return json({});
    }
    const own = store.friends.find(item => item.id === input.id)?.members.find(item => item.id === actor);
    if (!own) return json({}, 404);
    if (input.action === 'share' && typeof input.paused === 'boolean') {
      own.paused = input.paused;
      own.slots = own.paused ? [] : sanitize(input.days);
      await write(store);
      return json({});
    }
    if (input.action === 'remove') {
      store.friends = store.friends.filter(item => item.id !== input.id);
      await write(store);
      return json({});
    }
    return json({}, 400);
  });
  queue = operation.catch(() => {});
  return operation.catch(() => json({}, 503));
}
