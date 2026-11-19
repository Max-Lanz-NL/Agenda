'use client';

import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { cloud } from '../lib/proposals';
import { emptyWorkspace, migrateBrowser, workspace, WorkspaceSync, type Cache, type Snapshot, type SyncState, type Workspace, type WorkspaceStore } from '../lib/workspace';

const guestKey = 'agenda-device-v2';
const accountKey = (id: string) => 'agenda-account-v2:' + id;

function readCache(key: string): Cache | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const saved = JSON.parse(raw) as Cache;
  if (saved.base && (!Number.isSafeInteger(saved.base.revision) || saved.base.revision < 0)) throw new Error('Ongeldige opgeslagen versie.');
  return { data: workspace(saved.data), base: saved.base ? { ...saved.base, data: workspace(saved.base.data) } : null };
}

export function useWorkspace() {
  const [state, setState] = useState<SyncState>({ data: emptyWorkspace(), status: 'loading', message: 'Agenda laden…' });
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [hasLocalData, setHasLocalData] = useState(false);
  const sync = useRef<WorkspaceSync | null>(null);
  const local = useRef<Cache>({ data: emptyWorkspace(), base: null });
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    let identity: string | null | undefined;
    let serial = 0;
    const publicPage = new URLSearchParams(location.search).has('vrij');
    if (publicPage) { setReady(true); return; }
    try {
      const old = localStorage.getItem('agenda-v1');
      local.current = readCache(guestKey) || { data: old ? migrateBrowser(JSON.parse(old)) : emptyWorkspace(), base: null };
    } catch {
      setState(current => ({ ...current, status: 'error', message: 'De lokale agenda kon niet worden gelezen. De oorspronkelijke browsergegevens zijn bewaard.' }));
      setReady(true);
      return;
    }
    setHasLocalData(local.current.data.events.length > 0 || local.current.data.tasks.length > 0);

    function selectAccount(account: { id: string; email?: string } | null) {
      if (!active || identity === (account?.id || null)) return;
      identity = account?.id || null;
      serial++;
      const generation = serial;
      sync.current?.stop();
      if (debounce.current) clearTimeout(debounce.current);
      setUser(account ? { id: account.id, email: account.email || '' } : null);
      const key = account ? accountKey(account.id) : guestKey;
      let cache: Cache;
      try { cache = account ? readCache(key) || { data: emptyWorkspace(), base: null } : local.current; }
      catch {
        setState({ data: emptyWorkspace(), status: 'error', message: 'De lokale accountgegevens konden niet worden gelezen. Exporteer de browsergegevens voordat je verdergaat.' });
        setReady(true);
        sync.current = null;
        return;
      }
      let store: WorkspaceStore | null = null;
      if (account && cloud) {
        const client = cloud;
        const snapshot = (row: { data: unknown; revision: number }): Snapshot => ({ data: workspace(row.data), revision: row.revision });
        store = {
          async read() {
            const { data, error } = await client.from('workspaces').select('data, revision').eq('user_id', account.id).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
            if (error) throw new Error('Controleer de verbinding en databaseconfiguratie.');
            return data ? snapshot(data) : null;
          },
          async write(data, revision) {
            const request = revision === 0
              ? client.from('workspaces').insert({ user_id: account.id, data })
              : client.from('workspaces').update({ data }).eq('user_id', account.id).eq('revision', revision);
            const result = await request.select('data, revision').abortSignal(AbortSignal.timeout(15000)).maybeSingle();
            if (result.error?.code === '23505') return null;
            if (result.error) throw new Error('Opslaan in je account is niet gelukt.');
            return result.data ? snapshot(result.data) : null;
          },
        };
      }
      const engine = new WorkspaceSync(cache, store, value => {
        localStorage.setItem(key, JSON.stringify(value));
        if (!account) local.current = value;
      }, value => { if (active && generation === serial) setState(value); });
      sync.current = engine;
      engine.change(current => current);
      setReady(true);
      void engine.sync();
    }

    if (!cloud) selectAccount(null);
    // Keep Supabase calls out of the auth callback, which runs under its session lock.
    const subscription = cloud?.auth.onAuthStateChange((event, session) => {
      setTimeout(() => {
        if (!active) return;
        if (event === 'PASSWORD_RECOVERY') setRecovering(true);
        if (event === 'SIGNED_OUT') setRecovering(false);
        selectAccount(session?.user || null);
      }, 0);
    }).data.subscription;
    const refresh = () => { if (document.visibilityState === 'visible') void sync.current?.sync(); };
    const interval = setInterval(refresh, 15000);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    function receive(event: StorageEvent) {
      const key = identity ? accountKey(identity) : guestKey;
      if (event.key === key && event.newValue) {
        // This tab's own delta remains pending while fetching edits from the other tab.
        if (identity) void sync.current?.sync();
        else {
          try { local.current = readCache(guestKey) || local.current; sync.current?.change(() => local.current.data); } catch { /* Keep this tab's readable copy. */ }
        }
      }
    }
    window.addEventListener('storage', receive);
    return () => {
      active = false;
      serial++;
      subscription?.unsubscribe();
      sync.current?.stop();
      clearInterval(interval);
      if (debounce.current) clearTimeout(debounce.current);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', receive);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const update = useCallback(<K extends keyof Workspace>(field: K, action: SetStateAction<Workspace[K]>) => {
    sync.current?.change(current => ({ ...current, [field]: typeof action === 'function' ? (action as (value: Workspace[K]) => Workspace[K])(current[field]) : action }));
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { void sync.current?.sync(); }, 800);
  }, []);

  const setEvents = useCallback((action: SetStateAction<Workspace['events']>) => update('events', action), [update]);
  const setCalendars = useCallback((action: SetStateAction<Workspace['calendars']>) => update('calendars', action), [update]);
  const setPreferences = useCallback((action: SetStateAction<Workspace['preferences']>) => update('preferences', action), [update]);
  const setTasks = useCallback((action: SetStateAction<Workspace['tasks']>) => update('tasks', action), [update]);

  function importLocal() {
    const source = local.current.data;
    sync.current?.change(current => ({
      ...current,
      events: [...current.events, ...source.events.filter(event => !current.events.some(saved => saved.id === event.id))],
      calendars: [...current.calendars, ...source.calendars.filter(item => !current.calendars.some(saved => saved.id === item.id))],
      tasks: [...current.tasks, ...source.tasks.filter(item => !current.tasks.some(saved => saved.id === item.id))],
    }));
    void sync.current?.sync();
    setHasLocalData(false);
  }

  function exportData() {
    const data = sync.current?.data || Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('agenda-')).map(key => [key, localStorage.getItem(key)]));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'agenda-' + new Date().toISOString().slice(0, 10) + '.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const restore = (data: Workspace) => { sync.current?.change(() => workspace(data)); void sync.current?.sync(); };
  return { ...state, ready, user, recovering, hasLocalData, editable: !!sync.current, setEvents, setCalendars, setPreferences, setTasks, restore, importLocal, exportData,
    retry: () => sync.current?.sync(), resolve: (useLocal: boolean) => sync.current?.resolve(useLocal) };
}
