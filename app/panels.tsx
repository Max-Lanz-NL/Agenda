'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, Copy, Globe2, Link2, Search, Share2 } from 'lucide-react';
import { SharedWeek } from './shared-week';
import { cloud, localBrowserKey } from '../lib/proposals';
import ICAL from 'ical.js';
import { add, busyBlocks, changeMonth, defaults, format, freeBlocks, key, labels, minutes, monday, monthStart, type Event } from '../lib/calendar';

import { calendarIcons, resolveCalendarIcon } from '../lib/calendar-icons';

type Calendar = typeof defaults[number];
export type Preferences = { group: boolean; dark: boolean };
type Workspace = { events: Event[]; calendars: Calendar[]; preferences: Preferences; tasks: { title: string; done: boolean }[] };
export function SettingsPanel({ preferences, setPreferences, workspace, restore }: { preferences: Preferences; setPreferences: Dispatch<SetStateAction<Preferences>>; workspace: Workspace; restore: (data: Workspace) => void }) {
  const [email, setEmail] = useState('');
  const [user, setUser] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    const subscription = cloud?.auth.onAuthStateChange((_event, session) => setUser(session?.user.email || '')).data.subscription;
    return () => subscription?.unsubscribe();
  }, []);
  async function backup(load: boolean) {
    if (!cloud) return;
    const { data } = await cloud.auth.getUser();
    if (!data.user) return;
    if (load) {
      const { data: saved, error } = await cloud.from('workspaces').select('data').eq('user_id', data.user.id).maybeSingle();
      if (saved) restore(saved.data as Workspace);
      setStatus(error?.message || (saved ? 'Werkruimte teruggezet.' : 'Er is nog geen back-up.'));
    } else {
      const { error } = await cloud.from('workspaces').upsert({ user_id: data.user.id, data: workspace });
      setStatus(error?.message || 'Werkruimte opgeslagen in Supabase.');
    }
  }
  return <div className="card form-card form-grid"><h2>Weergave</h2>
    <label className="check"><input type="checkbox" checked={preferences.group} onChange={e => setPreferences(current => ({ ...current, group: e.target.checked }))} />Schooluren samenvoegen</label>
    <label className="check"><input type="checkbox" checked={preferences.dark} onChange={e => setPreferences(current => ({ ...current, dark: e.target.checked }))} />Donkere modus</label>
    <h2>Account</h2>{!cloud ? <p>Supabase is nog niet geconfigureerd. Afspraken worden in deze browser bewaard.</p> : user ? <>
      <p>Ingelogd als {user}</p><div className="wrap"><button className="control" onClick={() => backup(false)}>Back-up opslaan</button><button className="control" onClick={() => backup(true)}>Back-up terugzetten</button><button className="control" onClick={() => cloud.auth.signOut()}>Uitloggen</button></div>
    </> : <form className="form-grid" onSubmit={async e => { e.preventDefault(); const { error } = await cloud.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } }); setStatus(error?.message || 'Controleer je e-mail voor de inloglink.'); }}><label>E-mailadres<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><button className="primary">Stuur een inloglink</button></form>}
    <p role="status">{status}</p>
  </div>;
}

function IconPicker({ calendar, onChange }: { calendar: Calendar; onChange: (icon?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const Icon = resolveCalendarIcon(calendar.icon) || CalendarDays;
  const options = Object.entries(calendarIcons)
    .filter(([id, option]) => id !== "calendar" && option.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return <div className="icon-picker" ref={root} onKeyDown={event => {
    if (open && event.key === 'Escape') { event.preventDefault(); close(); }
  }}>
    <button className="calendar-setting-icon" ref={trigger} type="button" aria-label={'Icoon wijzigen voor ' + calendar.title}
      aria-expanded={open} aria-haspopup="dialog" title="Icoon wijzigen" style={{ color: calendar.color, background: calendar.background }}
      onClick={() => { setQuery(''); setOpen(current => !current); }}><Icon aria-hidden="true" /></button>
    {open && <div className="icon-picker-popup card" role="dialog" aria-label="Agenda-icoon kiezen">
      <label className="icon-picker-search"><Search aria-hidden="true" /><input autoFocus type="search" placeholder="Zoek een icoon…" aria-label="Zoek een icoon" value={query} onChange={event => setQuery(event.target.value)} /></label>
      {options.length ? <div className="icon-picker-grid">{options.map(([id, { Icon: OptionIcon, label }]) =>
        <button key={id} type="button" title={label} aria-label={label} aria-pressed={id === (calendar.icon || '')}
          onClick={() => { onChange(id || undefined); close(); }}><OptionIcon aria-hidden="true" /></button>
      )}</div> : <p>Geen icoontjes gevonden.</p>}
    </div>}
  </div>;
}

const palette = ['#2457ff', '#099fc5', '#138878', '#3e9d22', '#b3820a', '#dd651c', '#db3657', '#ca4296', '#834be8', '#515b72'];

function CalendarColorPicker({ calendar, onChange }: { calendar: Calendar; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(calendar.color);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function choose(color: string) {
    onChange(color);
    close();
  }

  return <div className="icon-picker color-picker" ref={root} onKeyDown={event => {
    if (open && event.key === 'Escape') { event.preventDefault(); close(); }
  }}>
    <button type="button" className="color-picker-trigger" ref={trigger} aria-expanded={open} aria-haspopup="dialog"
      aria-label={'Kleur wijzigen voor ' + calendar.title} title="Kleur wijzigen"
      onClick={() => { setDraft(calendar.color); setOpen(current => !current); }}>
      <span style={{ background: calendar.color }} />
    </button>
    {open && <div className="icon-picker-popup color-picker-popup card" role="dialog" aria-label="Agendakleur kiezen">
      <h3>Agendakleur</h3>
      <div className="color-picker-grid">{palette.map(color => <button key={color} type="button"
        aria-label={'Kleur ' + color} aria-pressed={calendar.color.toLowerCase() === color} title={color}
        onClick={() => choose(color)}><span style={{ background: color }} /></button>)}</div>
      <form className="color-picker-form" onSubmit={event => {
        event.preventDefault();
        if (/^#[0-9a-f]{6}$/i.test(draft.trim())) choose(draft.trim().toLowerCase());
      }}>
        <input aria-label="Hexkleur" value={draft} onChange={event => setDraft(event.target.value)}
          placeholder="#6d4aff" spellCheck={false} maxLength={7} />
        <button className="control" disabled={!/^#[0-9a-f]{6}$/i.test(draft.trim())}>Toepassen</button>
      </form>
    </div>}
  </div>;
}

export function Calendars({ calendars, setCalendars, setEvents }: { calendars: Calendar[]; setCalendars: Dispatch<SetStateAction<Calendar[]>>; setEvents: Dispatch<SetStateAction<Event[]>> }) {
  const [feed, setFeed] = useState('');
  const [destination, setDestination] = useState('school');
  const [status, setStatus] = useState('');
  async function importText(raw: string) {
    const calendar = calendars.find(item => item.id === destination);
    if (!calendar) throw new Error('Kies eerst een agenda.');
    const prefix = calendar.id === 'school' ? 'ics:' : 'ics:' + calendar.id + ':';
    const component = new ICAL.Component(ICAL.parse(raw));
    const entries = component.getAllSubcomponents('vevent').flatMap((item): Event[] => {
      const lesson = new ICAL.Event(item);
      if (!lesson.startDate || !lesson.endDate || lesson.startDate.isDate || lesson.isRecurring() || lesson.isRecurrenceException()) return [];
      const start = lesson.startDate.toJSDate();
      const end = lesson.endDate.toJSDate();
      if (key(start) !== key(end) || +end <= +start) return [];
      const clock = (value: Date) => value.toTimeString().slice(0, 5);
      return [{ id: prefix + lesson.uid + ':' + lesson.startDate.toString(), title: lesson.summary || 'Les', day: key(start), start: clock(start), end: clock(end), calendar: calendar.id, location: lesson.location, note: lesson.description, source: 'Magister · ICS', original: item.toString() }];
    });
    if (!entries.length) throw new Error('Geen afzonderlijke lessen gevonden in dit ICS-bestand.');
    const ids = new Set(entries.map(entry => entry.id));
    setEvents(current => [...current.filter(item => !ids.has(item.id)), ...new Map(entries.map(entry => [entry.id, entry])).values()]);
    setStatus(entries.length + ' afspraken ingelezen in ' + calendar.title + '. Terugkerende reeksen en meerdaagse afspraken worden overgeslagen.');
  }
  return <div className="settings-grid feature-grid">
    <section className="card form-card form-grid"><div className="panel-heading"><span><CalendarDays /></span><h2>Mijn agenda’s</h2></div>
      {calendars.map(calendar => <div className="calendar-setting" key={calendar.id}>
        <IconPicker calendar={calendar} onChange={icon => setCalendars(items => items.map(item => item.id === calendar.id ? { ...item, icon } : item))} />
        <label className="calendar-visibility">
          <span>{calendar.title}</span>
          <input type="checkbox" role="switch" aria-label={calendar.title + ' tonen'} checked={calendar.visible} onChange={e => setCalendars(items => items.map(item => item.id === calendar.id ? { ...item, visible: e.target.checked } : item))} />
        </label>
        <CalendarColorPicker calendar={calendar} onChange={color => setCalendars(items => items.map(item => item.id === calendar.id ? { ...item, color, background: color + '24' } : item))} />
      </div>)}
      <form className="wrap" onSubmit={e => { e.preventDefault(); const title = String(new FormData(e.currentTarget).get('title')).trim(); if (title) setCalendars(items => [...items, { ...defaults[2], title, id: crypto.randomUUID() }]); e.currentTarget.reset(); }}><input name="title" placeholder="Naam nieuwe agenda" aria-label="Naam nieuwe agenda" required /><button className="primary">Toevoegen</button></form>
    </section>
    <section className="card form-card form-grid"><div className="panel-heading"><span><Globe2 /></span><h2>Externe agenda’s</h2></div><div className="provider"><b>Google Calendar</b><span>Niet geconfigureerd</span></div><div className="provider"><b>Microsoft Outlook</b><span>Niet geconfigureerd</span></div><div className="provider"><b>Apple iCloud</b><span>Niet geconfigureerd</span></div>
      <label>Importeren naar<select value={destination} onChange={e => setDestination(e.target.value)}>{calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.title}</option>)}</select></label>
      <form className="form-grid" onSubmit={async e => { e.preventDefault(); setStatus('Lessen ophalen…'); try {
        const response = await fetch('/api/calendar-import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: feed }),
        });
        if (!response.ok) throw new Error();
        await importText(await response.text());
      } catch { setStatus('De link kon niet worden ingelezen. Download het ICS-bestand en importeer het hieronder.'); } }}><label>Magister iCalendar-link<input type="url" value={feed} onChange={e => setFeed(e.target.value)} placeholder="https://…" required /></label><button className="control">Lessen ophalen</button></form>
      <label>ICS-bestand importeren<input type="file" accept=".ics,text/calendar" onChange={async e => { const file = e.target.files?.[0]; if (file) try { await importText(await file.text()); } catch { setStatus('Het bestand bevat geen leesbare afzonderlijke lessen.'); } e.target.value = ''; }} /></label><p role="status">{status}</p>
    </section>
  </div>;
}

type SlotDay = { day: string; slots: string[]; busy?: true };
export function PublicAvailability({ token }: { token: string }) {
  const [rows, setRows] = useState<SlotDay[]>([]);
  const [status, setStatus] = useState('Beschikbaarheid laden…');
  useEffect(() => {
    let active = true;
    fetch('/api/available?token=' + encodeURIComponent(token), { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (active) { setRows(data.slots); setStatus(''); }
    }).catch(() => { if (active) setStatus('Deze beschikbaarheidslink is ongeldig of verlopen.'); });
    return () => { active = false; };
  }, [token]);
  const busy = rows.filter(row => row.busy);
  if (busy.length) return <SharedWeek rows={busy} token={token} />;
  return <main className="public-page"><section className="card form-card"><h1>Beschikbaarheid</h1>{status && <p role="status">{status}</p>}<SlotList rows={rows} /></section></main>;
}

function SlotList({ rows }: { rows: SlotDay[] }) {
  return <div className="slot-list">{rows.map(({ day, slots }) => <div key={day}><b>{format(day, { weekday: 'long', day: 'numeric', month: 'long' })}</b><span>{slots.length ? slots.join(' · ') : 'Geen vrije tijd'}</span></div>)}</div>;
}

type ShareLink = { token: string; expires_at: string; revokeKey?: string };

function ShareCalendar({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [month, setMonth] = useState(() => monthStart(from || key(new Date())));
  const [edge, setEdge] = useState<'from' | 'to'>('from');
  const start = monday(month);
  const next = changeMonth(month, 1);
  const today = key(new Date());

  function choose(value: string) {
    if (edge === 'from') {
      onChange(value, value);
      setEdge('to');
    } else {
      onChange(value < from ? value : from, value < from ? from : value);
      setEdge('from');
    }
    setMonth(monthStart(value));
  }

  return <div className="share-calendar">
    <div className="share-calendar-edges">
      <button type="button" aria-pressed={edge === 'from'} onClick={() => setEdge('from')}>Begindatum</button>
      <button type="button" aria-pressed={edge === 'to'} onClick={() => setEdge('to')}>Einddatum</button>
    </div>
    <div className="share-calendar-heading">
      <strong>{format(month, { month: 'long', year: 'numeric' })}</strong>
      <button type="button" aria-label="Vorige maand" onClick={() => setMonth(changeMonth(month, -1))}><ChevronLeft /></button>
      <button type="button" aria-label="Volgende maand" onClick={() => setMonth(next)}><ChevronRight /></button>
    </div>
    <div className="share-calendar-grid">
      {labels.map(label => <small key={label}>{label}</small>)}
      {Array.from({ length: 42 }, (_, index) => {
        const value = add(start, index);
        const selected = value === from || value === to;
        return <button key={value} type="button" aria-pressed={selected} aria-current={value === today ? 'date' : undefined}
          aria-label={format(value, { day: 'numeric', month: 'long', year: 'numeric' })}
          disabled={edge === 'to' && !!from && (value < add(from, -61) || value > add(from, 61))}
          data-outside={value < month || value >= next} data-in-range={value > from && value < to}
          onClick={() => choose(value)}>{Number(value.slice(-2))}</button>;
      })}
    </div>
    <button className="share-calendar-today" type="button" onClick={() => setMonth(monthStart(today))}>Naar vandaag</button>
  </div>;
}

export function Availability({ calendars, events, day }: { calendars: Calendar[]; events: Event[]; day: string }) {
  const [from, setFrom] = useState(day);
  const [to, setTo] = useState(add(day, 6));
  const [start, setStart] = useState('15:00');
  const [end, setEnd] = useState('21:00');
  const [minimum, setMinimum] = useState(60);
  const [buffer, setBuffer] = useState(0);
  const [days, setDays] = useState([1, 2, 3, 4, 5, 6, 0]);
  const [included, setIncluded] = useState(calendars.map(calendar => calendar.id));
  const [lifetime, setLifetime] = useState(7);
  const [status, setStatus] = useState('');
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [saving, setSaving] = useState(false);
  const valid = !!from && !!to && to >= from && to <= add(from, 61) && !!start && end > start && minimum >= 15 && minimum <= 720 && buffer >= 0 && buffer <= 120;
  const considered = events.filter(event => included.includes(event.calendar));
  const rows: SlotDay[] = [];
  for (let cursor = from; valid && cursor <= to; cursor = add(cursor, 1)) {
    const weekday = new Date(cursor + 'T12:00:00').getDay();
    if (days.includes(weekday)) rows.push({ day: cursor, slots: freeBlocks(considered, cursor, start, end, minimum, buffer) });
  }
  const message = ['Mijn vrije tijden', ...rows.filter(row => row.slots.length).map(row => format(row.day, { weekday: 'short', day: 'numeric', month: 'short' }) + ' — ' + row.slots.join(', '))].join('\n');
  const shareUrl = (token: string) => location.origin + '/?vrij=' + token;

  useEffect(() => {
    if (!cloud) {
      try {
        const saved = JSON.parse(localStorage.getItem('agenda-local-links') || '[]') as ShareLink[];
        setLinks(saved.filter(link => Date.parse(link.expires_at) > Date.now()));
      } catch { setLinks([]); }
      return;
    }
    void cloud.from('availability_links').select('token, expires_at').gt('expires_at', new Date().toISOString()).order('expires_at').then(({ data }) => { if (data) setLinks(data); });
  }, []);

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setStatus('Gekopieerd.'); } catch { setStatus('Kopiëren is niet beschikbaar in deze browser.'); }
  }

  async function publish() {
    if (!rows.length || !included.length || saving) return;
    setSaving(true);
    try {
      const slots = rows.map(({ day }) => ({ day, busy: true, slots: busyBlocks(considered, day) }));
      let link: ShareLink;
      if (cloud) {
        const { data } = await cloud.auth.getUser();
        if (!data.user) { setStatus('Log eerst in via Instellingen.'); return; }
        link = { token: crypto.randomUUID(), expires_at: new Date(Date.now() + lifetime * 86400000).toISOString() };
        const { error } = await cloud.from('availability_links').insert({ ...link, user_id: data.user.id, slots });
        if (error) throw error;
      } else {
        const response = await fetch('/api/available', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-agenda-browser': localBrowserKey() }, body: JSON.stringify({ lifetime, slots }),
        });
        if (!response.ok) throw new Error();
        link = await response.json();
        localStorage.setItem('agenda-local-links', JSON.stringify([...links, link]));
      }
      setLinks(current => [...current, link]);
      setStatus('Agendalink aangemaakt.');
    } catch { setStatus('De agendalink kon niet worden aangemaakt.'); }
    finally { setSaving(false); }
  }

  async function revoke(link: ShareLink) {
    try {
      if (cloud) {
        const { error } = await cloud.from('availability_links').delete().eq('token', link.token);
        if (error) throw error;
      } else {
        const response = await fetch('/api/available?token=' + encodeURIComponent(link.token), {
          method: 'DELETE', headers: { 'x-revoke-key': link.revokeKey || '' },
        });
        if (!response.ok) throw new Error();
        localStorage.setItem('agenda-local-links', JSON.stringify(links.filter(item => item.token !== link.token)));
      }
      setLinks(current => current.filter(item => item.token !== link.token));
      setStatus('Link ingetrokken.');
    } catch { setStatus('De agendalink kon niet worden ingetrokken.'); }
  }
  return <div className="availability-layout">
    <section className="card form-card form-grid availability-link-card">
      <div className="panel-heading"><span><Link2 /></span><h2>Agendalink delen</h2></div>
      <p>Bezoekers zien alleen bezette tijden in één kleur. De link gebruikt je gekozen periode, dagen en agenda’s en toont een momentopname.</p>
      {!cloud && <p>Deze lokale link werkt op deze computer zolang de agenda-app draait.</p>}
        <div className="wrap">
          <div className="share-period-field"><span>Te delen periode</span>
        <details className="share-period">
          <summary className="control"><CalendarDays aria-hidden="true" /><span>{from && to ? format(from, { day: 'numeric', month: 'short' }) + (to !== from ? ' – ' + format(to, { day: 'numeric', month: 'short' }) : '') : 'Kies datums'}</span><ChevronDown aria-hidden="true" /></summary>
          <div className="card share-period-menu">
            <div className="share-period-presets" aria-label="Snel een periode kiezen">
              {[[1, '1 dag'], [7, '1 week'], [30, '1 maand']].map(([length, label]) => {
                const first = from || key(new Date());
                const last = add(first, Number(length) - 1);
                return <button key={label} type="button" aria-pressed={from === first && to === last}
                  onClick={() => { setFrom(first); setTo(last); }}>{label}</button>;
              })}
            </div>
            <ShareCalendar from={from} to={to} onChange={(first, last) => { setFrom(first); setTo(last); }} />
          </div>
        </details>
          </div>
          <label>Link verloopt na<select value={lifetime} onChange={e => setLifetime(Number(e.target.value))}><option value={1}>1 dag</option><option value={7}>7 dagen</option><option value={30}>30 dagen</option></select></label>
          <button className="primary row" disabled={saving || !rows.length || !included.length} onClick={publish}><Link2 />Link aanmaken</button>
        </div>
        {links.map(link => <div className="availability-link-row" key={link.token}>
          <input aria-label="Agendalink" readOnly value={shareUrl(link.token)} onFocus={e => e.target.select()} />
          <button className="control" onClick={() => copy(shareUrl(link.token))}>Kopiëren</button>
          <button className="danger" onClick={() => revoke(link)}>Intrekken</button>
        </div>)}
      <p role="status">{status}</p>
    </section>
    <section className="card form-card form-grid"><div className="panel-heading"><span><Clock3 /></span><h2>Beschikbaarheid instellen</h2></div>
    <div className="availability-section"><h3>Periode en tijden</h3>
    <div className="availability-presets" aria-label="Snelle periodes">
      {[['Vandaag', 0], ['Komende 7 dagen', 6], ['Komende 14 dagen', 13]].map(([label, days]) => <button type="button" key={label} className="control" onClick={() => {
        const today = key(new Date());
        setFrom(today);
        setTo(add(today, Number(days)));
      }}>{label}</button>)}
    </div>
    <div className="two"><label>Van<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>Tot en met<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>
    <div className="two"><label>Vanaf<input type="time" value={start} onChange={e => setStart(e.target.value)} /></label><label>Tot<input type="time" value={end} onChange={e => setEnd(e.target.value)} /></label></div>
    <div className="two"><label>Minimale duur (min)<input type="number" min={15} max={720} value={minimum} onChange={e => setMinimum(e.target.valueAsNumber || 0)} /></label><label>Buffer (min)<input type="number" min={0} max={120} value={buffer} onChange={e => setBuffer(e.target.valueAsNumber || 0)} /></label></div>
    </div>
    <fieldset><legend>Dagen</legend><div className="wrap">{['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map((label, index) => { const n = (index + 1) % 7; return <label className="check" key={n}><input type="checkbox" checked={days.includes(n)} onChange={e => setDays(current => e.target.checked ? [...current, n] : current.filter(item => item !== n))} />{label}</label>; })}</div></fieldset>
    <fieldset><legend>Agenda’s</legend><div className="wrap">{calendars.map(calendar => <label className="check" key={calendar.id}><input type="checkbox" checked={included.includes(calendar.id)} onChange={e => setIncluded(current => e.target.checked ? [...current, calendar.id] : current.filter(id => id !== calendar.id))} /><span className="availability-dot" style={{ background: calendar.color }} aria-hidden="true" />{calendar.title}</label>)}</div></fieldset>
    {!valid && <p>Kies een geldige periode van maximaal 62 dagen en controleer de tijden en duur.</p>}
  </section><section className="card form-card form-grid"><div className="panel-heading"><span><Link2 /></span><h2>Vrije tijden</h2><small>{rows.reduce((total, row) => total + row.slots.length, 0)} blokken</small></div>
    {rows.length ? <div className="availability-results">{rows.map(({ day, slots }) => <div className="availability-day" key={day}>
      <div className="availability-date"><span>{day.slice(-2)}</span><b>{format(day, { weekday: 'long', month: 'short' }).replace(/\s+/g, ' · ')}</b></div>
      {slots.length ? <div className="availability-slots">{slots.map(slot => {
        const [start, end] = slot.split(' – ');
        const duration = minutes(end) - minutes(start);
        const hours = Math.floor(duration / 60);
        const remainder = duration % 60;
        return <div className="availability-slot" key={slot}><span>{slot}</span><small>{hours ? hours + ' u' : ''}{remainder ? (hours ? ' ' : '') + remainder + ' min' : ''}</small></div>;
      })}</div> : <small>Geen vrije tijd</small>}
    </div>)}</div> : <p>Kies een geldige periode en minstens één dag om vrije tijden te zien.</p>}
    <div className="availability-sharing">
    <div className="wrap"><button className="primary row" disabled={!rows.length} onClick={() => copy(message)}><Copy />Kopiëren</button><a className="control row" href={rows.length ? 'https://wa.me/?text=' + encodeURIComponent(message) : undefined} target="_blank" rel="noreferrer">WhatsApp</a><button className="control row" disabled={!rows.length} onClick={async () => { if (!navigator.share) { setStatus('Delen via andere apps is niet beschikbaar in deze browser.'); return; } try { await navigator.share({ text: message }); } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('Delen is mislukt.'); } }}><Share2 />Delen</button></div>
    </div>
  </section></div>;
}

