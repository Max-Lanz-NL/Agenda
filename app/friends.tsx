'use client';

import { useEffect, useRef, useState } from 'react';
import { Link2, Pause, Play, Users, X } from 'lucide-react';
import { add, busyBlocks, format, freeBlocks, key, time, type CalendarSettings, type Event } from '../lib/calendar';
import { cloud, localBrowserKey } from '../lib/proposals';
import { SharedWeek } from './shared-week';

type Day = { day: string; slots: string[] };
type Friend = { id: string; name: string; paused: boolean; otherPaused: boolean; days: Day[] };
type Invite = { id: string; name: string };
type Sharing = Record<string, { enabled?: boolean; calendars: string[] }>;
type Data = { friends: Friend[]; invites: Invite[]; invitation: { name: string } | null };

async function request(invite = '', body?: object) {
  const response = await fetch('/api/friends' + (invite ? '?invite=' + encodeURIComponent(invite) : ''), {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'x-agenda-browser': localBrowserKey() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error('De wijziging kon niet worden uitgevoerd.');
  return response.json();
}

export function Friends({ active, inviteOpen, closeInvite, profileName, calendars, events }: { profileName: string; active: boolean; inviteOpen: boolean; closeInvite: () => void; calendars: CalendarSettings[]; events: Event[] }) {
  const [data, setData] = useState<Data>({ friends: [], invites: [], invitation: null });
  const [sharing, setSharing] = useState<Sharing>({});
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState('');
  const [invitation, setInvitation] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const inviteDialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState('');
  const now = new Date();
  const today = key(now);
  const nextQuarter = Math.max(480, Math.ceil((now.getHours() * 60 + now.getMinutes() + Number(now.getSeconds() > 0)) / 15) * 15);
  const friend = data.friends.find(item => item.id === selected) || data.friends[0];
  const filters = friend && sharing[friend.id];
  const selectedCalendars = filters?.calendars || [];
  const ownEvents = events.filter(item => selectedCalendars.includes(item.calendar));
  const common = friend?.days.map(row => {
    const busy = row.slots.map((slot, i) => {
      const [start, end] = slot.split(' – ');
      return { id: String(i), day: row.day, start, end, calendar: '', title: '' };
    });
    return { day: row.day, slots: row.day >= today ? freeBlocks([...ownEvents, ...busy], row.day, row.day === today ? time(nextQuarter) : '08:00', '22:00', 30, 0) : [] };
  }) || [];
  const sharingPayload = JSON.stringify(Object.entries(sharing).map(([id, setting]) => ({
    action: 'share', id, paused: !setting.enabled,
    days: setting.enabled ? Array.from({ length: 35 }, (_, index) => {
      const day = add(today, index);
      return { day, slots: busyBlocks(events.filter(item => setting.calendars.includes(item.calendar)), day) };
    }) : [],
  })));

  useEffect(() => {
    if (cloud) return;
    try { setSharing(JSON.parse(localStorage.getItem('agenda-friend-sharing') || '{}')); } catch {}
    setInvitation(new URLSearchParams(location.search).get('vriend') || '');
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !active) return;
    let current = true;
    const refresh = () => { void request(invitation).then(result => { if (current) setData(result); }).catch(() => {}); };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { current = false; clearInterval(timer); };
  }, [active, invitation, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem('agenda-friend-sharing', JSON.stringify(sharing));
    const updates: object[] = JSON.parse(sharingPayload);
    let current = true;
    void Promise.allSettled(updates.map(update => request('', update))).then(results => {
      if (current && results.some(result => result.status === 'rejected')) setStatus('De deelinstellingen konden niet worden bijgewerkt.');
    });
    return () => { current = false; };
  }, [ready, sharing, sharingPayload]);

  async function act(body: object) {
    try {
      const result = await request('', body);
      setData(await request(invitation));
      return result;
    } catch { setStatus('De wijziging kon niet worden uitgevoerd.'); }
  }

  useEffect(() => {
    const dialog = inviteDialog.current;
    if (!dialog) return;
    if (inviteOpen && !dialog.open) { setStatus(''); dialog.showModal(); }
    if (!inviteOpen && dialog.open) dialog.close();
  }, [active, inviteOpen]);

  if (!active) return null;
  if (cloud) return <section className="card form-card"><h2>Vrienden</h2><p>Vrienden is beschikbaar in de lokale versie zonder Supabase.</p></section>;

  return <div className="friends-layout">
    <dialog className="card dialog link-name-dialog friend-invite-dialog" ref={inviteDialog} aria-labelledby="friend-invite-title" onClose={closeInvite}>
      <div className="card-heading">
        <h2 id="friend-invite-title">Vriend uitnodigen</h2>
        <button type="button" aria-label="Sluiten" onClick={() => inviteDialog.current?.close()}><X /></button>
      </div>
      {data.invites.length === 0 && <button className="primary row" type="button" disabled={creatingInvite} onClick={async () => {
        setCreatingInvite(true);
        try {
          const result = await act({ action: 'invite', name: profileName });
          if (result) setStatus('Uitnodigingslink aangemaakt.');
        } finally { setCreatingInvite(false); }
      }}>Maak vriendenlink</button>}
      {data.invites.map(invite => <div className="friends-invite" key={invite.id}><b>Actieve vriendenlink</b>
        <div className="wrap"><button className="control row" onClick={async () => {
          try { await navigator.clipboard.writeText(location.origin + '/?vriend=' + invite.id); setStatus('Uitnodigingslink gekopieerd.'); }
          catch { setStatus('Kopiëren is niet beschikbaar in deze browser.'); }
        }}><Link2 />Kopiëren</button><button className="danger" onClick={() => act({ action: 'revoke', id: invite.id })}>Intrekken</button></div>
      </div>)}
      <p role="status">{status}</p>
    </dialog>
    <aside className="card form-card form-grid friends-sidebar">
      <div className="panel-heading"><span><Users /></span><h2>Mijn vrienden</h2></div>
      {data.friends.map(item => <button key={item.id} className="friends-person" aria-pressed={friend?.id === item.id} onClick={() => setSelected(item.id)}>
        <span>{item.name.slice(0, 1).toUpperCase()}</span>{item.name}
      </button>)}
      {!data.friends.length && <p>Voeg iemand toe om jullie vrije tijden te vergelijken.</p>}
      {!inviteOpen && <p role="status">{status}</p>}
    </aside>
    <div className="friends-main">
      {invitation && <section className="card form-card form-grid">
        <h2>Vriendschapsuitnodiging</h2>
        {data.invitation ? <form className="form-grid" onSubmit={async event => {
          event.preventDefault();
          const result = await act({ action: 'accept', id: invitation, name: profileName });
          if (result) { setSelected(result.id); setInvitation(''); history.replaceState(null, '', '/'); setStatus('Vriend toegevoegd.'); }
        }}><p>{data.invitation.name} wil je toevoegen.</p><button className="primary">Accepteren</button></form> : <p>Deze uitnodiging is niet beschikbaar voor dit browserprofiel.</p>}
      </section>}
      {friend && <section className="card form-card form-grid friends-sharing">
        <div className="panel-heading"><h2>Delen met {friend.name}</h2></div>
        <div className="wrap">{calendars.map(calendar => <label className="check" key={calendar.id}>
          <input type="checkbox" checked={selectedCalendars.includes(calendar.id)} onChange={event => {
            const checked = event.target.checked;
            setSharing(current => {
              const setting = current[friend.id] || { calendars: [] };
              const included = checked ? [...setting.calendars, calendar.id] : setting.calendars.filter(id => id !== calendar.id);
              return { ...current, [friend.id]: { enabled: setting.enabled && included.length > 0, calendars: included } };
            });
          }} />{calendar.title}
        </label>)}</div>
        <div className="wrap">
          <button className="control row" disabled={!selectedCalendars.length} onClick={() => {
            setSharing(current => ({ ...current, [friend.id]: { calendars: selectedCalendars, enabled: !filters?.enabled } }));
          }}>{filters?.enabled ? <><Pause />Delen pauzeren</> : <><Play />Delen starten</>}</button>
          <button className="danger" onClick={() => { if (window.confirm('Wil je deze vriend verwijderen?')) void act({ action: 'remove', id: friend.id }); }}>Vriend verwijderen</button>
        </div>
        {friend.otherPaused && <p>{friend.name} deelt op dit moment geen tijden.</p>}
        {!friend.otherPaused && !filters?.enabled && <p>Kies welke agenda’s meetellen en start delen om jullie vrije tijden te vergelijken.</p>}
      </section>}
      {friend && !friend.otherPaused && friend.days.length > 0 && <SharedWeek key={friend.id} rows={friend.days} token={friend.id}
        friendName={friend.name} common={filters?.enabled ? common : undefined} />}
    </div>
  </div>;
}
