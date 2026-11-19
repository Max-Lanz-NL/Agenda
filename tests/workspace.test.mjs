import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyWorkspace, mergeWorkspace, migrateBrowser, workspace, WorkspaceSync } from '../lib/workspace.ts';
import { demo } from '../lib/calendar.ts';

const event = (id, title = id) => ({ id, title, day: '2026-11-19', start: '10:00', end: '11:00', calendar: 'personal' });
const copy = value => structuredClone(value);
const withEvents = (...events) => ({ ...emptyWorkspace(), events });

function database(initial) {
  let saved = initial ? { data: copy(initial), revision: 1 } : null;
  return {
    read: async () => copy(saved),
    async write(data, revision) {
      if ((saved?.revision || 0) !== revision) return null;
      saved = { data: copy(data), revision: revision + 1 };
      return copy(saved);
    },
    value: () => copy(saved),
  };
}

function engine(data, store, base = null) {
  const states = [];
  const caches = [];
  const sync = new WorkspaceSync({ data: copy(data), base: copy(base) }, store,
    cache => caches.push(copy(cache)), state => states.push(copy(state)));
  return { sync, states, caches };
}

test('new devices load account data before saving any local defaults', async () => {
  const db = database(withEvents(event('remote')));
  const { sync, states } = engine(emptyWorkspace(), db);
  await sync.sync();
  assert.equal(sync.data.events[0].id, 'remote');
  assert.equal(db.value().revision, 1);
  assert.equal(states.at(-1).status, 'saved');
});

test('separate devices preserve additions, edits and deletions', async () => {
  const base = withEvents(event('a'), event('b'));
  const local = withEvents({ ...event('a'), title: 'Nieuw' }, event('b'), event('c'));
  const remote = withEvents({ ...event('a'), location: 'School' }, event('d'));
  const result = mergeWorkspace(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.data.events.map(item => item.id).sort(), ['a', 'c', 'd']);
  assert.equal(result.data.events.find(item => item.id === 'a').location, 'School');
  assert.equal(result.data.events.find(item => item.id === 'a').title, 'Nieuw');
});

test('concurrent writes use revision checks and merge both changes', async () => {
  const base = withEvents(event('a'));
  const db = database(base);
  const baseline = db.value();
  const first = engine(base, db, baseline).sync;
  const second = engine(base, db, baseline).sync;
  first.change(current => ({ ...current, events: [...current.events, event('first')] }));
  second.change(current => ({ ...current, events: [...current.events, event('second')] }));
  await Promise.all([first.sync(), second.sync()]);
  assert.deepEqual(db.value().data.events.map(item => item.id).sort(), ['a', 'first', 'second']);
});

test('competing edits require a choice and do not silently overwrite', async () => {
  const base = withEvents(event('a'));
  const db = database(base);
  const { sync, states } = engine(base, db, db.value());
  sync.change(() => withEvents(event('a', 'Laptop')));
  await db.write(withEvents(event('a', 'Telefoon')), 1);
  await sync.sync();
  assert.equal(states.at(-1).status, 'conflict');
  assert.equal(db.value().data.events[0].title, 'Telefoon');
  await sync.resolve(true);
  assert.equal(db.value().data.events[0].title, 'Laptop');
});

test('offline edits survive a failed save and resume on reconnect', async () => {
  const db = database(emptyWorkspace());
  let online = false;
  const store = { read: async () => { if (!online) throw new Error('offline'); return db.read(); }, write: db.write };
  const { sync, states, caches } = engine(emptyWorkspace(), store, db.value());
  sync.change(() => withEvents(event('offline')));
  await sync.sync();
  assert.ok(['error', 'offline'].includes(states.at(-1).status));
  assert.equal(caches.at(-1).data.events[0].id, 'offline');
  online = true;
  await sync.sync();
  assert.equal(db.value().data.events[0].id, 'offline');
});

test('changes during a save stay pending until acknowledged', async () => {
  const db = database(emptyWorkspace());
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  let first = true;
  const store = { read: db.read, async write(data, revision) {
    if (first) { first = false; entered(); await blocked; }
    return db.write(data, revision);
  } };
  const { sync } = engine(emptyWorkspace(), store, db.value());
  sync.change(() => withEvents(event('first')));
  const saving = sync.sync();
  await started;
  sync.change(current => ({ ...current, events: [...current.events, event('later')] }));
  release();
  await saving;
  assert.deepEqual(db.value().data.events.map(item => item.id), ['first', 'later']);
});

test('an account switch stops stale requests from changing the current UI or cache', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { sync, states, caches } = engine(emptyWorkspace(), { read: () => pending, write: async () => null });
  const loading = sync.sync();
  sync.stop();
  const notifications = states.length;
  const writes = caches.length;
  release({ data: withEvents(event('other-user')), revision: 1 });
  await loading;
  assert.equal(states.length, notifications);
  assert.equal(caches.length, writes);
});

test('migration keeps real and edited events while removing unchanged demonstration data', () => {
  const modified = { ...demo[0], title: 'Echte les' };
  const migrated = migrateBrowser({ ...emptyWorkspace(), events: [...demo.slice(1), modified, event('real')], tasks: [{ title: 'Mijn taak', done: false }] });
  assert.deepEqual(migrated.events.map(item => item.title), ['Echte les', 'real']);
  assert.equal(migrated.tasks[0].id, 'legacy-task:0:Mijn taak');
  assert.throws(() => workspace({ events: [] }));
});

test('local storage failures remain visible', () => {
  const notifications = [];
  const sync = new WorkspaceSync({ data: emptyWorkspace(), base: null }, null, () => { throw new Error('quota'); }, state => notifications.push(state));
  sync.change(() => withEvents(event('unsaved')));
  assert.equal(notifications.at(-1).status, 'error');
  assert.match(notifications.at(-1).message, /Exporteer/);
});
