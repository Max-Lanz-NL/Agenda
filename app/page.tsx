'use client';

import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { ArrowRight, Bell, Calendar, CalendarCheck, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Dumbbell, Flag, GraduationCap, Grid3X3, House, Link2, List, Plus, Search, Settings, Users, Utensils, X } from 'lucide-react';
import { add, changeMonth, date, defaults, demo, eventNote, format, initialDay, key, labels, minutes, monday, monthStart, time, type Event } from '../lib/calendar';
import { Availability, SettingsPanel, Calendars, PublicAvailability, type Preferences } from './panels';

import { resolveCalendarIcon } from '../lib/calendar-icons';

import { proposalsRequest, type Proposal } from '../lib/proposals';

const views = [{ title: 'Dag', icon: Calendar }, { title: 'Week', icon: CalendarDays }, { title: 'Maand', icon: Grid3X3 }, { title: 'Lijst', icon: List }];
const navigation = [{ title: 'Home', icon: House }, { title: "Agenda’s", icon: Calendar }, { title: 'Vrienden', icon: Users }, { title: 'Beschikbaarheid', icon: CalendarCheck }, { title: 'Taken', icon: ClipboardCheck }];
const hours = Array.from({ length: 15 }, (_, i) => i + 8);
const eventIcon = (event: Event) => event.calendar === 'school' ? GraduationCap : event.calendar === 'sport' ? Flag : event.calendar === 'study' ? House : event.title === 'Diner' ? Utensils : Dumbbell;

function Month({ selected, month, select, shift, events, large = false }: { selected: string; month: string; select: (d: string) => void; shift?: (n: number) => void; events: Event[]; large?: boolean }) {
  const first = monthStart(month);
  const start = monday(first);
  const next = changeMonth(first, 1);
  const count = Math.ceil((date(add(next, -1)).getDate() + Math.round((+date(first) - +date(start)) / 86400000)) / 7) * 7;
  return <section className={large ? 'month large-month' : 'card month'}>
    {shift && <div className="card-heading"><h2>{format(month, { month: 'long', year: 'numeric' })}</h2><div className="row"><button aria-label="Vorige maand" onClick={() => shift(-1)}><ChevronLeft /></button><button aria-label="Volgende maand" onClick={() => shift(1)}><ChevronRight /></button></div></div>}
    <div className="month-grid">{labels.map(label => <span className="weekday" key={label}>{label}</span>)}
      {Array.from({ length: count }, (_, i) => {
        const day = add(start, i);
        const entries = events.filter(event => event.day === day);
        return <button key={day} className={day === selected ? 'chosen' : day < first || day >= next ? 'outside' : ''} onClick={() => select(day)}>
          <span>{date(day).getDate()}</span>{large ? entries.slice(0, 3).map(event => <small key={event.id}>{event.start} {event.title}</small>) : entries.length > 0 && <i />}
        </button>;
      })}
    </div>
  </section>;
}

export default function Agenda() {
  const [page, setPage] = useState('Home');
  const [view, setView] = useState('Week');
  const [day, setDay] = useState(initialDay);
  const [mini, setMini] = useState(initialDay);
  const [events, setEvents] = useState(demo);
  const [calendars, setCalendars] = useState(defaults);
  const [preferences, setPreferences] = useState<Preferences>({ group: true, dark: false });
  const [tasks, setTasks] = useState([{ title: 'Huiswerk maken', done: false }, { title: 'Boeken meenemen', done: false }, { title: 'Golf reserveren', done: false }]);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState('');
  const [edit, setEdit] = useState<Event | null>(null);
  const [lessons, setLessons] = useState<Event[]>([]);
  const [ready, setReady] = useState(false);
  const [publicToken, setPublicToken] = useState('');
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setPublicToken(new URLSearchParams(location.search).get('vrij') || '');
    try {
      const stored = JSON.parse(localStorage.getItem('agenda-v1') || '{}');
      if (stored.events) setEvents(stored.events);
      if (stored.calendars) setCalendars(stored.calendars);
      if (stored.preferences) setPreferences(stored.preferences);
      if (stored.tasks) setTasks(stored.tasks);
    } catch { /* Use the initial workspace if browser data is invalid. */ }
    setReady(true);
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (ready && !publicToken) localStorage.setItem('agenda-v1', JSON.stringify({ events, calendars, preferences, tasks }));
    document.documentElement.classList.toggle('dark', preferences.dark);
  }, [ready, publicToken, events, calendars, preferences, tasks]);

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalStatus, setProposalStatus] = useState('');
  const [seenOutcomes, setSeenOutcomes] = useState<string[]>([]);
  const outcomes = proposals.filter(item => !item.incoming && item.status !== 'pending').map(item => item.id);
  const hasNotification = proposals.some(item => item.incoming && item.status === 'pending') || outcomes.some(id => !seenOutcomes.includes(id));
  const booked: Event[] = proposals.filter(item => item.status === 'accepted').map(item => ({
    id: 'proposal:' + item.id, title: 'Gedeelde afspraak', day: item.day, start: item.start, end: item.end,
    calendar: 'personal', source: 'Voorstel', note: item.message,
  }));

  useEffect(() => {
    if (publicToken || !ready) return;
    let active = true;
    const refresh = () => { void proposalsRequest().then(result => {
      if (active && (result.proposals || result.code === 'login')) setProposals(result.proposals || []);
    }).catch(() => {}); };
    refresh();
    const poll = setInterval(refresh, 10000);
    return () => { active = false; clearInterval(poll); };
  }, [publicToken, ready]);

  async function decide(item: Proposal, accept: boolean) {
    if (accept && [...events, ...booked].some(event => event.day === item.day && event.start < item.end && event.end > item.start)) {
      setProposalStatus('Dit tijdslot is inmiddels bezet. Het voorstel blijft open.');
      return;
    }
    try {
      const result = await proposalsRequest({ action: 'decide', id: item.id, accept });
      if (result.code === 'ok') {
        setProposals(current => current.map(proposal => proposal.id === item.id ? { ...proposal, status: accept ? 'accepted' : 'declined' } : proposal));
        setProposalStatus(accept ? 'Afspraak geaccepteerd.' : 'Voorstel afgewezen.');
      } else setProposalStatus(result.code === 'busy' ? 'Een van beide agenda’s is inmiddels bezet. Het voorstel blijft open.' : 'Het voorstel kon niet worden bijgewerkt.');
    } catch { setProposalStatus('Het voorstel kon niet worden bijgewerkt.'); }
  }

  const visible = [...events, ...booked].filter(event => calendars.some(calendar => calendar.id === event.calendar && calendar.visible)).sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));
  const today = now ? key(now) : '';
  const startWeek = monday(day);
  const days = view === 'Dag' ? [day] : Array.from({ length: 7 }, (_, i) => add(startWeek, i));
  const week = Math.floor((Math.round((+date(add(startWeek, 3)) - +date(startWeek.slice(0, 4) + '-01-01')) / 86400000) + 7) / 7);
  const upcoming = visible.filter(event => event.day >= startWeek && event.calendar !== 'school');
  const firstSchool = visible.find(event => event.day >= startWeek && event.calendar === 'school');
  const upcomingCards = [...(firstSchool ? [{ ...firstSchool, title: 'School', end: visible.filter(event => event.day === firstSchool.day && event.calendar === 'school').at(-1)!.end }] : []), ...upcoming].slice(0, 3);
  const searchResults = query.trim() ? visible.filter(event => [event.title, event.location, event.source].join(' ').toLowerCase().includes(query.trim().toLowerCase())) : [];
  const selectDay = (value: string) => { setDay(value); setMini(value); };
  const shift = (amount: number) => selectDay(view === 'Maand' ? changeMonth(day, amount) : add(day, amount * (view === 'Dag' ? 1 : 7)));

  function create(onDay = day, start = '09:00') {
    setLessons([]);
    setEdit({ id: '', title: '', day: onDay, start, end: time(Math.min(1439, minutes(start) + 60)), calendar: 'personal' });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    if (edit.end <= edit.start || !edit.title.trim()) {
      const field = event.currentTarget.elements.namedItem('end') as HTMLInputElement;
      field.setCustomValidity('Kies een eindtijd na de begintijd en geef de afspraak een naam.');
      field.reportValidity();
      return;
    }
    const saved = { ...edit, title: edit.title.trim(), id: edit.id || crypto.randomUUID() };
    setEvents(current => [...current.filter(item => item.id !== saved.id), saved]);
    selectDay(saved.day);
    setEdit(null);
  }

  function show(event: Event) { setEdit(event); setLessons([]); }

  function gridMinute(clientY: number, target: HTMLElement) {
    const range = target.getBoundingClientRect();
    return 8 * 60 + Math.max(0, Math.min(885, Math.floor(((clientY - range.top) / range.height) * 900 / 15) * 15));
  }

  function drawEvent(event: Event, group?: Event[]) {
    const calendar = calendars.find(item => item.id === event.calendar) || defaults[2];
    const Icon = resolveCalendarIcon(calendars.find(item => item.id === event.calendar)?.icon) || eventIcon(event);
    const from = Math.max(minutes(event.start), 480);
    const to = Math.min(minutes(event.end), 1380);
    if (to <= from) return null;
    return <button key={event.id} className="event" style={{ top: (from - 480) / 9 + '%', height: (to - from) / 9 + '%', '--event-color': calendar.color, '--event-bg': calendar.background } as React.CSSProperties}
      draggable={!group && !event.source} onDragStart={e => e.dataTransfer.setData('text/plain', event.id)}
      onClick={e => { e.stopPropagation(); if (group) { setEdit(null); setLessons(group); } else show(event); }}>
      <strong><Icon />{event.title}</strong><span>{event.start} – {event.end}</span>{group && <ChevronDown className="event-expand" />}
    </button>;
  }

  if (publicToken) return <PublicAvailability token={publicToken} />;

  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setPage('Home')}><span><CalendarCheck /></span><b>Agenda</b></button>
      <nav>{navigation.map(({ title, icon: Icon }) => <button title={title} key={title} className={page === title ? 'nav active' : 'nav'} onClick={() => { setPage(title); setMenu(''); }}><Icon /><span>{title}</span>{title === 'Taken' && tasks.some(task => !task.done) && <small>{tasks.filter(task => !task.done).length}</small>}</button>)}</nav>
      <div className="sidebar-bottom">
        <button title="Instellingen" className={page === 'Instellingen' ? 'nav active' : 'nav'} onClick={() => setPage('Instellingen')}><Settings /><span>Instellingen</span></button>
        <button className="profile" onClick={() => setMenu(menu === 'account' ? '' : 'account')}><span className="avatar">MW</span><span><b>Max Witte</b><small>max@agenda.app</small></span><ChevronDown /></button>
        {menu === 'account' && <button className="account-popup card" onClick={() => { setPage('Instellingen'); setMenu(''); }}>Accountinstellingen</button>}
      </div>
    </aside>
    <main>
      <header className="topbar">
        <div className="period row">
          {page === 'Home' && <><button className="control" aria-label="Vorige periode" onClick={() => shift(-1)}><ChevronLeft /></button><button className="control" aria-label="Volgende periode" onClick={() => shift(1)}><ChevronRight /></button></>}
          <h1>{page === 'Home' ? format(day, { month: 'long', year: 'numeric' }) : page}</h1>
          {page === 'Home' && <button aria-label="Kies datum" onClick={() => setMenu(menu === 'date' ? '' : 'date')}><ChevronDown /></button>}
          {menu === 'date' && <input className="date-popup" type="date" value={day} onChange={e => { if (e.target.value) selectDay(e.target.value); setMenu(''); }} />}
        </div>
        <div className="top-actions row">
          <div className="search"><Search /><input aria-label="Zoeken in Agenda" placeholder="Zoeken in Agenda..." value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Zoekopdracht wissen" onClick={() => setQuery('')}><X /></button>}
            {query.trim() && <div className="card search-results">{searchResults.length ? searchResults.slice(0, 10).map(event => <button key={event.id} onClick={() => { show(event); setQuery(''); }}><b>{event.title}</b><small>{format(event.day, { day: 'numeric', month: 'short' })} · {event.start}</small></button>) : <p>Geen afspraken gevonden.</p>}</div>}
          </div>
          <div className="notification-wrap"><button aria-label="Meldingen" className={hasNotification ? 'notification has-proposals' : 'notification'} onClick={() => { setSeenOutcomes(outcomes); setMenu(menu === 'alerts' ? '' : 'alerts'); }}><Bell /></button>{menu === 'alerts' && <div className="card alert-popup proposal-popup">
              <h2>Meldingen</h2>
              {proposals.length ? proposals.map(proposal => <article key={proposal.id}>
                <b>{proposal.incoming ? 'Voorstel van ' + proposal.sender : 'Verstuurd voorstel'}</b>
                <small>{format(proposal.day, { day: 'numeric', month: 'short' })} · {proposal.start} – {proposal.end}</small>
                {proposal.message && <p>{proposal.message}</p>}
                {proposal.incoming && proposal.status === 'pending' ? <div className="wrap">
                  <button className="primary" onClick={() => decide(proposal, true)}>Accepteren</button>
                  <button className="control" onClick={() => decide(proposal, false)}>Afwijzen</button>
                </div> : <small>{proposal.status === 'accepted' ? 'Geaccepteerd' : proposal.status === 'declined' ? 'Afgewezen' : 'Wacht op antwoord'}</small>}
              </article>) : <p>Je hebt geen meldingen.</p>}
              {proposalStatus && <p role="status">{proposalStatus}</p>}
            </div>}</div>
          <button className="primary row" onClick={() => create()}><Plus /> Maken</button>
        </div>
      </header>
      {page === 'Home' ? <div className="dashboard">
        <section className="planner">
          <div className="toolbar"><div className="tabs">{views.map(({ title, icon: Icon }) => <button key={title} aria-pressed={view === title} className={view === title ? 'selected' : ''} onClick={() => setView(title)}><Icon /><span>{title}</span></button>)}</div>
            <div className="row toolbar-nav"><button className="control today" onClick={() => selectDay(key(new Date()))}>Vandaag</button><button className="control" aria-label="Vorige" onClick={() => shift(-1)}><ChevronLeft /></button><button className="control" aria-label="Volgende" onClick={() => shift(1)}><ChevronRight /></button></div>
          </div>
          {view === 'Maand' ? <Month selected={day} month={day} select={d => { selectDay(d); setView('Dag'); }} events={visible} large /> : view === 'Lijst' ? <div className="card list-view">{visible.filter(event => event.day >= day).length ? visible.filter(event => event.day >= day).map(event => <button key={event.id} onClick={() => show(event)}><b>{event.title}</b><span>{format(event.day, { weekday: 'short', day: 'numeric', month: 'short' })} · {event.start} – {event.end}</span></button>) : <p>Geen aankomende afspraken.</p>}</div> : <div className="calendar-scroll">
            <div className={'calendar ' + (view === 'Dag' ? 'single' : '')} style={{ '--columns': days.length } as React.CSSProperties}>
              <div className="grid-header week-number">W{week}</div>
              {days.map((value, i) => <div key={value} className="grid-header"><button className={value === day || value === today ? 'day-selected' : ''} onClick={() => selectDay(value)}>{view === 'Dag' ? format(value, { weekday: 'long', day: 'numeric' }) : labels[i] + ' ' + date(value).getDate()}</button></div>)}
              <div className="time-labels">{hours.map(hour => <span key={hour}>{time(hour * 60)}</span>)}</div>
              {days.map(value => {
                const dayEvents = visible.filter(event => event.day === value);
                const school = dayEvents.filter(event => event.calendar === 'school');
                const other = preferences.group ? dayEvents.filter(event => event.calendar !== 'school') : dayEvents;
                const clock = now ? now.getHours() * 60 + now.getMinutes() : 0;
                const marker = value === today && clock >= 480 && clock < 1380 ? clock : value === initialDay && day.startsWith('2025-01') ? 1102 : null;
                return <div key={value} className="day-column" onClick={(e: MouseEvent<HTMLDivElement>) => create(value, time(gridMinute(e.clientY, e.currentTarget)))} onDragOver={e => e.preventDefault()} onDrop={e => {
                  e.preventDefault();
                  const item = events.find(event => event.id === e.dataTransfer.getData('text/plain') && !event.source);
                  if (!item) return;
                  const duration = minutes(item.end) - minutes(item.start);
                  const start = Math.min(1439 - duration, gridMinute(e.clientY, e.currentTarget));
                  setEvents(current => current.map(event => event.id === item.id ? { ...event, day: value, start: time(start), end: time(start + duration) } : event));
                }}>
                  {preferences.group && school.length > 0 && drawEvent({ ...school[0], title: 'School', end: school.reduce((end, item) => item.end > end ? item.end : end, school[0].end) }, school)}
                  {other.map(event => drawEvent(event))}
                  {marker !== null && <div className="time-marker" style={{ top: (marker - 480) / 9 + '%' }} />}
                </div>;
              })}
            </div>
          </div>}
        </section>
        <aside className="right-panel">
          <Month selected={day} month={mini} select={selectDay} shift={n => setMini(changeMonth(mini, n))} events={visible} />
          <section className="card upcoming"><div className="card-heading"><h2>Aankomende events</h2><button className="text-button" onClick={() => { setView('Lijst'); selectDay(startWeek); }}>Alles bekijken <ArrowRight /></button></div>
            {upcomingCards.length ? upcomingCards.map(event => { const Icon = resolveCalendarIcon(calendars.find(item => item.id === event.calendar)?.icon) || eventIcon(event); const calendar = calendars.find(item => item.id === event.calendar)!; return <button key={event.id} className="upcoming-item" onClick={() => event.calendar === 'school' && preferences.group ? setLessons(visible.filter(item => item.calendar === 'school' && item.day === event.day)) : show(event)}><span className="event-icon" style={{ color: calendar.color, background: calendar.background }}><Icon /></span><span><b>{event.title}</b><small>{format(event.day, { weekday: 'short', day: 'numeric', month: 'short' })}, {event.start} – {event.end}</small></span></button>; }) : <p>Geen afspraken deze periode.</p>}
          </section>
          <button className="share-card" onClick={() => setPage('Beschikbaarheid')}><span className="share-icon"><Link2 /></span><span><b>Beschikbaarheid delen</b><small>Deel je vrije tijden met een link</small></span><ChevronRight /></button>
        </aside>
      </div> : <section className="content">
        {page === "Agenda’s" && <Calendars calendars={calendars} setCalendars={setCalendars} setEvents={setEvents} />}
        {page === 'Beschikbaarheid' && <Availability calendars={calendars} events={[...events, ...booked]} day={day} />}
        {page === 'Instellingen' && <SettingsPanel preferences={preferences} setPreferences={setPreferences} workspace={{ events, calendars, preferences, tasks }} restore={data => { setEvents(data.events); setCalendars(data.calendars); setPreferences(data.preferences); setTasks(data.tasks); }} />}
        {page === 'Vrienden' && <div className="card form-card"><h2>Vrienden</h2><p>Vrienden en groepen zijn voorbereid voor een volgende versie.</p></div>}
        {page === 'Taken' && <div className="card form-card task-panel"><div className="panel-heading"><span><ClipboardCheck /></span><h2>Mijn taken</h2><small>{tasks.filter(task => !task.done).length} open</small></div><div className="task-list">{tasks.map((task, i) => <label className="check" key={i}><input type="checkbox" checked={task.done} onChange={e => setTasks(current => current.map((item, j) => i === j ? { ...item, done: e.target.checked } : item))} /><span>{task.title}</span></label>)}</div><form className="row task-form" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); const title = String(data.get('task')).trim(); if (title) setTasks(current => [...current, { title, done: false }]); e.currentTarget.reset(); }}><input name="task" aria-label="Nieuwe taak" placeholder="Nieuwe taak" required /><button className="primary">Toevoegen</button></form></div>}
      </section>}
    </main>
    {(edit || lessons.length > 0) && <div className="overlay" onClick={() => { setEdit(null); setLessons([]); }}><section className="card dialog" role="dialog" aria-modal="true" aria-label={edit ? 'Afspraak' : 'Schoolrooster'} onClick={e => e.stopPropagation()}>
      <div className="card-heading"><h2>{edit ? edit.id ? 'Afspraakdetails' : 'Afspraak maken' : 'Schoolrooster'}</h2><button aria-label="Sluiten" onClick={() => { setEdit(null); setLessons([]); }}><X /></button></div>
      {edit?.source === "Voorstel" ? <div className="form-grid"><b>{edit.title}</b><p>{edit.day} · {edit.start} – {edit.end}</p>{edit.note && <p>{edit.note}</p>}</div> : edit ? <form className="form-grid" onSubmit={save}>
        {edit.source && <p>Bron: {edit.source}</p>}
        <label>Titel<input autoFocus required value={edit.title} onChange={e => { setEdit({ ...edit, title: e.target.value }); (e.target.form?.elements.namedItem('end') as HTMLInputElement | null)?.setCustomValidity(''); }} /></label>
        <label>Datum<input required type="date" value={edit.day} onChange={e => setEdit({ ...edit, day: e.target.value })} /></label>
        <div className="two"><label>Begintijd<input required type="time" value={edit.start} onChange={e => { setEdit({ ...edit, start: e.target.value }); (e.target.form?.elements.namedItem('end') as HTMLInputElement | null)?.setCustomValidity(''); }} /></label><label>Eindtijd<input required name="end" type="time" value={edit.end} onChange={e => { e.target.setCustomValidity(''); setEdit({ ...edit, end: e.target.value }); }} /></label></div>
        <label>Agenda<select value={edit.calendar} onChange={e => setEdit({ ...edit, calendar: e.target.value })}>{calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.title}</option>)}</select></label>
        <label>Locatie<input value={edit.location || ''} onChange={e => setEdit({ ...edit, location: e.target.value })} /></label>
        <label>Notities<textarea rows={2} value={eventNote(edit)} onChange={e => setEdit({ ...edit, note: e.target.value })} /></label>
        <div className="dialog-actions">{edit.id && <button type="button" className="danger" onClick={() => { setEvents(current => current.filter(event => event.id !== edit.id)); setEdit(null); }}>Verwijderen</button>}<button className="primary" type="submit">Opslaan</button></div>
      </form> : <div className="list-view">{lessons.map(lesson => {
        const match = lesson.title.match(/^(\d+)\s+(.+)$/);
        const [subject, ...details] = (match?.[2] || lesson.title).split(/\s+-\s+/);
        const note = eventNote(lesson);
        return <button key={lesson.id} onClick={() => show(lesson)}>
          <b className="lesson-meta">{lesson.start} – {lesson.end}{lesson.location && <><span aria-hidden="true"> | </span>{lesson.location}</>}</b>
          <div className="lesson-details"><strong className="lesson-subject">{subject}</strong>
          {(match || details.length > 0) && <span>{[match && match[1] + 'e', ...details].filter(Boolean).join(' · ')}</span>}
          {note && <span>{note}</span>}</div>
        </button>;
      })}</div>}
    </section></div>}
  </div>;
}
