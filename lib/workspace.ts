import { defaults, demo, type Event, type CalendarSettings } from './calendar.ts';

export type Preferences = { group: boolean; dark: boolean; displayName?: string };
export type Task = { id: string; title: string; done: boolean };
export type Workspace = { events: Event[]; calendars: CalendarSettings[]; preferences: Preferences; tasks: Task[] };
export type Snapshot = { data: Workspace; revision: number };
export type Cache = { data: Workspace; base: Snapshot | null };

export function emptyWorkspace(): Workspace {
  return { events: [], calendars: defaults.map(item => ({ ...item })), preferences: { group: true, dark: false }, tasks: [] };
}

// Old browser workspaces and manual backups did not give tasks a stable ID.
export function workspace(value: unknown): Workspace {
  const data = value as Workspace;
  if (!data || !Array.isArray(data.events) || !Array.isArray(data.calendars) || !Array.isArray(data.tasks) ||
    !data.preferences || typeof data.preferences.group !== 'boolean' || typeof data.preferences.dark !== 'boolean' ||
    !data.events.every(event => event && typeof event.id === 'string' && typeof event.title === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(event.day) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(event.start) &&
      /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(event.end) && event.end > event.start && typeof event.calendar === 'string') ||
    !data.calendars.every(item => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.color === 'string' && typeof item.background === 'string' && typeof item.visible === 'boolean') ||
    !data.tasks.every(item => item && typeof item.title === 'string' && typeof item.done === 'boolean')) {
    throw new Error('De opgeslagen agenda heeft een ongeldig formaat.');
  }
  return { ...data, tasks: data.tasks.map((item, index) => ({ ...item, id: item.id || 'legacy-task:' + index + ':' + item.title })) };
}

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function migrateBrowser(value: unknown): Workspace {
  const data = workspace(value);
  const sampleTasks = ['Huiswerk maken', 'Boeken meenemen', 'Golf reserveren'];
  return {
    ...data,
    events: data.events.filter(event => !demo.some(sample => same(sample, event))),
    tasks: data.tasks.filter(item => item.done || !sampleTasks.includes(item.title)),
  };
}

// Apply only changes since this device's last acknowledged snapshot.
// Different fields can merge, while competing edits require an explicit choice.
export function mergeWorkspace(base: Workspace, local: Workspace, remote: Workspace) {
  const conflicts: string[] = [];
  function fields<T extends object>(before: T, current: T, other: T, label: string): T {
    const result = { ...other };
    for (const field of new Set([...Object.keys(before), ...Object.keys(current)])) {
      if (same(before[field], current[field])) continue;
      if (!same(before[field], other[field]) && !same(current[field], other[field])) conflicts.push(label);
      if (field in current) result[field] = current[field];
      else delete result[field];
    }
    return result;
  }
  function entries<T extends { id: string }>(before: T[], current: T[], other: T[], label: string): T[] {
    const old = new Map(before.map(item => [item.id, item]));
    const local = new Map(current.map(item => [item.id, item]));
    const merged = new Map(other.map(item => [item.id, item]));
    for (const id of new Set([...old.keys(), ...local.keys()])) {
      const previous = old.get(id);
      const changed = local.get(id);
      const external = merged.get(id);
      if (same(previous, changed)) continue;
      if (previous && changed && external) merged.set(id, fields(previous, changed, external, label));
      else {
        if (!same(previous, external) && !same(changed, external)) conflicts.push(label);
        if (changed) merged.set(id, changed);
        else merged.delete(id);
      }
    }
    return [...merged.values()];
  }
  return {
    data: {
      events: entries(base.events, local.events, remote.events, 'afspraken'),
      calendars: entries(base.calendars, local.calendars, remote.calendars, 'agenda’s'),
      tasks: entries(base.tasks, local.tasks, remote.tasks, 'taken'),
      preferences: fields(base.preferences, local.preferences, remote.preferences, 'instellingen'),
    } as Workspace,
    conflicts: [...new Set(conflicts)],
  };
}

export interface WorkspaceStore {
  read(): Promise<Snapshot | null>;
  write(data: Workspace, revision: number): Promise<Snapshot | null>;
}

export type SyncState = {
  data: Workspace;
  status: 'local' | 'loading' | 'saving' | 'saved' | 'offline' | 'error' | 'conflict';
  message: string;
  updatedAt?: string;
};

export class WorkspaceSync {
  data: Workspace;
  base: Snapshot | null;
  private running = false;
  private active = true;
  private conflict: Snapshot | null = null;
  private hasRead = false;
  private storageFailed = false;
  private store: WorkspaceStore | null;
  private persist: (cache: Cache) => void;
  private notify: (state: SyncState) => void;

  constructor(
    cache: Cache,
    store: WorkspaceStore | null,
    persist: (cache: Cache) => void,
    notify: (state: SyncState) => void,
  ) {
    this.data = cache.data;
    this.base = cache.base;
    this.store = store;
    this.persist = persist;
    this.notify = notify;
  }

  private publish(status: SyncState['status'], message: string) {
    if (!this.active) return;
    try {
      this.persist({ data: this.data, base: this.base });
      this.storageFailed = false;
    } catch { this.storageFailed = true; }
    this.notify({ data: this.data, status: this.storageFailed ? 'error' : status,
      message: this.storageFailed ? 'Opslaan in deze browser lukt niet. Exporteer je agenda als veiligheidskopie.' : message,
      updatedAt: status === 'saved' ? new Date().toISOString() : undefined });
  }

  change(update: (current: Workspace) => Workspace) {
    if (!this.active) return;
    this.data = update(this.data);
    this.publish(this.conflict ? 'conflict' : this.store ? 'saving' : 'local',
      this.store ? 'Wijzigingen wachten op synchronisatie.' : 'Opgeslagen op dit apparaat.');
  }

  stop() { this.active = false; }

  async sync() {
    if (!this.active || this.running || !this.store || this.conflict) return;
    this.running = true;
    this.publish(this.hasRead ? 'saving' : 'loading', 'Agenda synchroniseren…');
    try {
      for (let attempt = 0; attempt < 5 && this.active; attempt++) {
        const remote = await this.store.read();
        if (!this.active) return;
        this.hasRead = true;
        if (remote) {
          if (!this.base) {
            if (!same(this.data, emptyWorkspace())) {
              this.base = { data: emptyWorkspace(), revision: 0 };
              this.conflict = remote;
              this.publish('conflict', 'Er staat al een agenda in je account. Kies of je je lokale wijzigingen wilt toevoegen of de cloudversie wilt laden.');
              return;
            }
            // A new device loads the account's data before it can write anything.
            this.data = remote.data;
            this.base = remote;
          } else {
            const merged = mergeWorkspace(this.base.data, this.data, remote.data);
            if (merged.conflicts.length) {
              this.conflict = remote;
              this.publish('conflict', 'Deze gegevens zijn op twee apparaten gewijzigd: ' + merged.conflicts.join(', ') + '. Kies welke versie je wilt behouden.');
              return;
            }
            this.data = merged.data;
            this.base = remote;
          }
          if (same(this.data, remote.data)) {
            this.publish('saved', 'Opgeslagen en gesynchroniseerd.');
            return;
          }
        }
        const submitted = structuredClone(this.data);
        const saved = await this.store.write(submitted, remote?.revision || 0);
        if (!this.active) return;
        if (!saved) continue;
        // Edits made while the request was in flight stay pending.
        this.data = mergeWorkspace(submitted, this.data, saved.data).data;
        this.base = saved;
        this.publish('saving', 'Wijzigingen synchroniseren…');
      }
      if (this.active) {
        this.publish(same(this.data, this.base?.data) ? 'saved' : 'saving',
          same(this.data, this.base?.data) ? 'Opgeslagen en gesynchroniseerd.' : 'Nieuwe wijzigingen worden bij de volgende synchronisatie opgeslagen.');
      }
    } catch (error) {
      this.publish(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error',
        'Synchroniseren lukt nog niet. Je wijzigingen blijven op dit apparaat. ' + (error instanceof Error ? error.message : 'Probeer opnieuw.'));
    } finally { this.running = false; }
  }

  resolve(useLocal: boolean) {
    if (!this.conflict) return;
    this.data = useLocal && this.base ? mergeWorkspace(this.base.data, this.data, this.conflict.data).data : this.conflict.data;
    this.base = this.conflict;
    this.conflict = null;
    this.publish('saving', 'Keuze opslaan…');
    return this.sync();
  }
}
