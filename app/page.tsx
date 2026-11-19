'use client';

import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { ArrowRight, Bell, Calendar, CalendarCheck, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, ClipboardCheck, Dumbbell, Flag, GraduationCap, Grid3X3, House, Link2, List, PanelLeft, PanelRight, Plus, Search, Settings, UserPlus, Users, Utensils, X } from 'lucide-react';
import { add, changeMonth, date, defaults, eventNote, format, initialDay, key, labels, minutes, monday, monthStart, nextEvents, time, type Event } from '../lib/calendar';
import { Availability, SettingsPanel, Calendars, PublicAvailability, defaultProfileName } from './panels';

import { Friends } from './friends';
import { resolveCalendarIcon } from '../lib/calendar-icons';

import { cloud, proposalsRequest, type Proposal } from '../lib/proposals';
import { useWorkspace } from './use-workspace';

const views = [{ title: 'Dag', icon: Calendar }, { title: 'Week', icon: CalendarDays }, { title: 'Maand', icon: Grid3X3 }, { title: 'Lijst', icon: List }];
const navigation = [{ title: 'Home', icon: House }, { title: "Agenda’s", icon: Calendar }, { title: 'Vrienden', icon: Users }, { title: 'Beschikbaarheid', icon: CalendarCheck }, { title: 'Taken', icon: ClipboardCheck }];
const hours = Array.from({ length: 15 }, (_, i) => i + 8);
const eventIcon = (event: Event) => event.calendar === 'school' ? GraduationCap : event.calendar === 'sport' ? Flag : event.calendar === 'study' ? House : event.title === 'Diner' ? Utensils : Dumbbell;

function Month({ selected, month, select, shift, events, calendars, groupSchool = false, large = false }: { selected: string; month: string; select: (d: string) => void; shift?: (n: number) => void; events: Event[]; calendars?: typeof defaults; groupSchool?: boolean; large?: boolean }) {
  const first = monthStart(month);
  const start = monday(first);
  const next = changeMonth(first, 1);
  const count = Math.ceil((date(add(next, -1)).getDate() + Math.round((+date(first) - +date(start)) / 86400000)) / 7) * 7;
  return <section className={large ? 'month large-month' : 'card month'}>
    {shift && <div className="card-heading"><h2>{format(month, { month: 'long', year: 'numeric' })}</h2><div className="row"><button aria-label="Vorige maand" onClick={() => shift(-1)}><ChevronLeft /></button><button aria-label="Volgende maand" onClick={() => shift(1)}><ChevronRight /></button></div></div>}
    <div className="month-grid">{labels.map(label => <span className="weekday" key={label}>{label}</span>)}
      {Array.from({ length: count }, (_, i) => {
        const day = add(start, i);
        const dayEvents = events.filter(event => event.day === day);
        const school = large && groupSchool ? dayEvents.filter(event => event.calendar === 'school') : [];
        const entries = school.length ? dayEvents.flatMap(event => {
          if (event.calendar !== 'school') return [event];
          if (event.id !== school[0].id) return [];
          const end = school.reduce((latest, lesson) => lesson.end > latest ? lesson.end : latest, event.end);
          return [{ ...event, title: 'School', end }];
        }) : dayEvents;
        const modifiers = [day === selected && 'chosen', (day < first || day >= next) && 'outside', large && i % 7 >= 5 && 'weekend'].filter(Boolean).join(' ');
        return <button key={day} className={modifiers} onClick={() => select(day)}
          aria-label={large ? format(day, { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + entries.length + ' afspraken' : undefined}
          aria-pressed={large ? day === selected : undefined}>
          <span className={large ? 'month-date' : undefined}>{date(day).getDate()}</span>
          {large ? <>
            {entries.slice(0, 3).map(event => <span className="month-event" key={event.id}
              style={{ '--month-color': calendars?.find(calendar => calendar.id === event.calendar)?.color || 'var(--accent)' } as React.CSSProperties}>
              <span>{event.start}{school[0]?.id === event.id && '–' + event.end}</span><b>{event.title}</b>
            </span>)}
            {entries.length > 3 && <small className="month-overflow">+{entries.length - 3} meer</small>}
            {entries.length > 0 && <small className="month-mobile-count">{entries.length}</small>}
          </> : entries.length > 0 && <i />}
        </button>;
      })}
    </div>
  </section>;
}

export default function Agenda() {
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [expandedSchool, setExpandedSchool] = useState<string | null>(null);
  const [preview, setPreview] = useState<Event | null>(null);
  const gesture = useRef<{ event: Event; mode: 'move' | 'resize'; y: number; offset: number } | null>(null);
  const [page, setPage] = useState('Home');
  const [view, setView] = useState('Week');
  const [day, setDay] = useState(initialDay);
  const [mini, setMini] = useState(initialDay);
  const sync = useWorkspace();
  const { events, calendars, preferences, tasks } = sync.data;
  const { setEvents, setCalendars, setPreferences, setTasks, ready } = sync;
  const profileName = preferences.displayName?.trim() || defaultProfileName;
  const initials = profileName.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const completedTasks = tasks.filter(task => task.done).length;
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState('');
  const [edit, setEdit] = useState<Event | null>(null);
  const [lessons, setLessons] = useState<Event[]>([]);
  const [publicToken, setPublicToken] = useState('');
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setPublicToken(params.get('vrij') || '');
    if (params.has('vriend')) setPage('Vrienden');
    const today = key(new Date());
    setDay(today);
    setMini(today);
    if (params.has('account')) setPage('Instellingen');
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', preferences.dark);
  }, [preferences.dark]);

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
    setProposals([]);
    setEdit(null);
    setLessons([]);
    setQuery('');
    if (publicToken || !ready) return;
    let active = true;
    const refresh = () => { void proposalsRequest().then(result => {
      if (active && (result.proposals || result.code === 'login')) setProposals(result.proposals || []);
    }).catch(() => {}); };
    refresh();
    const poll = setInterval(refresh, 10000);
    return () => { active = false; clearInterval(poll); };
  }, [publicToken, ready, sync.user?.id]);

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
  const selectedDayEvents = visible.filter(event => event.day === day);
  const startWeek = monday(day);
  const days = view === 'Dag' ? [day] : Array.from({ length: 7 }, (_, i) => add(startWeek, i));
  const week = Math.floor((Math.round((+date(add(startWeek, 3)) - +date(startWeek.slice(0, 4) + '-01-01')) / 86400000) + 7) / 7);
  const clock = now ? time(now.getHours() * 60 + now.getMinutes()) : '00:00';
  const upcoming = nextEvents(visible, today, clock);
  const schoolDays = new Map<string, Event[]>();
  for (const event of upcoming) {
    if (preferences.group && event.calendar === 'school') {
      const lessons = schoolDays.get(event.day) || [];
      lessons.push(event);
      schoolDays.set(event.day, lessons);
    }
  }
  const upcomingCards = upcoming.flatMap(event => {
    const lessons = schoolDays.get(event.day);
    if (event.calendar !== 'school' || !lessons) return [{ event, lessons: undefined }];
    if (event.id !== lessons[0].id) return [];
    const end = lessons.reduce((latest, lesson) => lesson.end > latest ? lesson.end : latest, event.end);
    return [{ event: { ...event, title: 'School', end }, lessons }];
  }).slice(0, 3);
  const searchResults = query.trim() ? visible.filter(event => [event.title, event.location, event.source].join(' ').toLowerCase().includes(query.trim().toLowerCase())) : [];
  const selectDay = (value: string) => { setDay(value); setMini(value); };
  const shift = (amount: number) => selectDay(view === 'Maand' ? changeMonth(day, amount) : add(day, amount * (view === 'Dag' || view === 'Lijst' ? 1 : 7)));

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

  function startGesture(e: PointerEvent<HTMLButtonElement>, event: Event, mode: 'move' | 'resize') {
    if (!e.isPrimary || e.button !== 0) return;
    const column = e.currentTarget.closest<HTMLElement>('.day-column');
    if (!column) return;
    gesture.current = { event, mode, y: e.clientY, offset: gridMinute(e.clientY, column) - minutes(event.start) };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function gesturePlacement(e: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active) return null;
    const { event, mode, offset, y } = active;
    const origin = e.currentTarget.closest<HTMLElement>('.day-column');
    const column = mode === 'resize' ? origin : document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.day-column');
    const day = column?.dataset.day;
    if (!column || !day || (day === event.day && Math.abs(e.clientY - y) < 4)) return null;
    const slot = gridMinute(e.clientY, column);
    const start = minutes(event.start);
    const duration = minutes(event.end) - start;
    if (mode === 'resize') {
      const delta = Math.round((e.clientY - y) * 60 / (column.getBoundingClientRect().height / 15) / 15) * 15;
      return { ...event, end: time(Math.min(1439, Math.max(start + 15, minutes(event.end) + delta))) };
    }
    const newStart = Math.max(0, Math.min(1439 - duration, slot - offset));
    return { ...event, day, start: time(newStart), end: time(newStart + duration) };
  }

  function finishGesture(e: PointerEvent<HTMLButtonElement>) {
    const placement = gesturePlacement(e);
    gesture.current = null;
    setPreview(null);
    if (placement) setEvents(current => current.map(item => item.id === placement.id ? placement : item));
  }

  function cancelGesture() {
    gesture.current = null;
    setPreview(null);
  }

  function drawEvent(event: Event, group?: Event[]) {
    const calendar = calendars.find(item => item.id === event.calendar) || defaults[2];
    const Icon = resolveCalendarIcon(calendars.find(item => item.id === event.calendar)?.icon) || eventIcon(event);
    const from = Math.max(minutes(event.start), 480);
    const to = Math.min(minutes(event.end), 1380);
    if (to <= from) return null;
    const editable = !group && !event.source;
    return <div key={event.id} className={'event' + (editable ? ' event-editable' : '')} style={{ top: (from - 480) / 9 + '%', height: (to - from) / 9 + '%', '--event-color': calendar.color } as React.CSSProperties} onClick={e => e.stopPropagation()}>
      <button type="button" className="event-main" aria-expanded={group ? expandedSchool === event.day : undefined} onClick={() => group ? setExpandedSchool(current => current === event.day ? null : event.day) : show(event)}>
        <strong><Icon />{event.title}</strong><span>{event.start} – {event.end}</span>{group && <ChevronDown className="event-expand" />}
      </button>
      {editable && (['move', 'resize'] as const).map(mode => <button key={mode} type="button" className={'event-handle ' + mode}
        aria-label={(mode === 'move' ? 'Verplaats ' : 'Wijzig de duur van ') + event.title}
        onPointerDown={e => startGesture(e, event, mode)}
        onPointerMove={e => { if (gesture.current) setPreview(gesturePlacement(e)); }}
        onPointerUp={finishGesture} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture}
        onClick={e => { if (e.detail === 0) show(event); }}>{mode === 'move' ? '⠿' : '━'}</button>)}
    </div>;
  }

  if (!ready) return <main className="public-page"><p role="status">Agenda laden…</p></main>;
  if (publicToken) return <PublicAvailability token={publicToken} />;
  if (!sync.editable) return <main className="public-page"><p role="alert">{sync.message}</p><button className="control" onClick={sync.exportData}>Browsergegevens downloaden</button></main>;

  return <div className={navigationCollapsed ? "shell navigation-collapsed" : "shell"}>
    <aside className="sidebar" id="agenda-navigation">
      <button className="brand" onClick={() => setPage('Home')}><span><CalendarCheck /></span><b>Agenda</b></button>
      <nav>{navigation.map(({ title, icon: Icon }) => <button title={title} aria-label={title} data-mobile-label={title === "Beschikbaarheid" ? "Vrije tijd" : title} aria-current={page === title ? "page" : undefined} key={title} className={page === title ? 'nav active' : 'nav'} onClick={() => { setPage(title); setMenu(''); }}><Icon /><span>{title}</span>{title === 'Taken' && tasks.some(task => !task.done) && <small>{tasks.filter(task => !task.done).length}</small>}</button>)}</nav>
      <div className="sidebar-bottom">
        <button title="Instellingen" aria-label="Instellingen" data-mobile-label="Instellingen" aria-current={page === "Instellingen" ? "page" : undefined} className={page === 'Instellingen' ? 'nav active' : 'nav'} onClick={() => setPage('Instellingen')}><Settings /><span>Instellingen</span></button>
        <button className="profile" onClick={() => setMenu(menu === 'account' ? '' : 'account')}><span className="avatar">{initials}</span><span><b>{profileName}</b><small>{sync.user?.email || 'Op dit apparaat'}</small></span><ChevronDown /></button>
        {menu === 'account' && <button className="account-popup card" onClick={() => { setPage('Instellingen'); setMenu(''); }}>Accountinstellingen</button>}
      </div>
    </aside>
    <main>
      <header className="topbar">
        <div className="period row">
          <button className="control sidebar-toggle" aria-label="Navigatie" aria-controls="agenda-navigation" aria-expanded={!navigationCollapsed} onClick={() => { setNavigationCollapsed(value => !value); setMenu(''); }}><PanelLeft /></button>
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
          {page === 'Vrienden'
            ? <button className="primary row" disabled={!!cloud} onClick={() => setMenu('friend-invite')}><UserPlus aria-hidden="true" />Uitnodiging maken</button>
            : <button className="primary row" onClick={() => create()}><Plus /> Maken</button>}
        </div>
      </header>
      <div className={'sync-banner sync-' + sync.status}>
        <p role="status">{sync.message}</p>
        <div className="wrap">
          {!sync.user && <button className="text-button" onClick={() => setPage('Instellingen')}>Op andere apparaten gebruiken</button>}
          {(sync.status === 'error' || sync.status === 'offline') && <button className="text-button" onClick={() => void sync.retry()}>Opnieuw proberen</button>}
          {sync.status === 'conflict' && <>
            <button className="control" onClick={sync.exportData}>Lokale kopie downloaden</button>
            <button className="control" onClick={() => void sync.resolve(true)}>Mijn wijzigingen behouden</button>
            <button className="control" onClick={() => void sync.resolve(false)}>Cloudversie laden</button>
          </>}
        </div>
      </div>
      {page === 'Home' ? <div className={detailsCollapsed ? "dashboard details-collapsed" : "dashboard"}>
        <section className="planner">
          <div className="toolbar"><div className="tabs">{views.map(({ title, icon: Icon }) => <button key={title} aria-pressed={view === title} className={view === title ? 'selected' : ''} onClick={() => setView(title)}><Icon /><span>{title}</span></button>)}</div>
            <div className="row toolbar-nav"><button className="control sidebar-toggle" aria-label="Zijpaneel" aria-controls="agenda-details" aria-expanded={!detailsCollapsed} onClick={() => setDetailsCollapsed(value => !value)}><PanelRight /></button><button className="control today" onClick={() => selectDay(key(new Date()))}>Vandaag</button><button className="control" aria-label="Vorige" onClick={() => shift(-1)}><ChevronLeft /></button><button className="control" aria-label="Volgende" onClick={() => shift(1)}><ChevronRight /></button></div>
          </div>
          {view === 'Maand' ? <Month selected={day} month={day} select={d => { selectDay(d); setView('Dag'); }} events={visible} calendars={calendars} groupSchool={preferences.group} large /> : view === 'Lijst' ? <div className="card list-view">{selectedDayEvents.length ? selectedDayEvents.map(event => <button key={event.id} onClick={() => show(event)}><b>{event.title}</b><span>{format(event.day, { weekday: 'short', day: 'numeric', month: 'short' })} · {event.start} – {event.end}</span></button>) : <p>Geen afspraken op deze datum.</p>}</div> : <div className="calendar-scroll" role="region" aria-label={view + "kalender"} tabIndex={0}>
            <div className={'calendar ' + (view === 'Dag' ? 'single' : '')} style={{ '--columns': days.length } as React.CSSProperties}>
              <div className="grid-header week-number">W{week}</div>
              {days.map((value, i) => <div key={value} className="grid-header"><button className={value === day || value === today ? 'day-selected' : ''} onClick={() => selectDay(value)}>{view === 'Dag' ? format(value, { weekday: 'long', day: 'numeric' }) : labels[i] + ' ' + date(value).getDate()}</button></div>)}
              <div className="time-labels">{hours.map(hour => <span key={hour}>{time(hour * 60)}</span>)}</div>
              {days.map(value => {
                const dayEvents = visible.filter(event => event.day === value);
                const school = dayEvents.filter(event => event.calendar === 'school');
                const other = preferences.group ? dayEvents.filter(event => event.calendar !== 'school') : dayEvents;
                const clock = now ? now.getHours() * 60 + now.getMinutes() : 0;
                const marker = value === today && clock >= 480 && clock < 1380 ? clock : null;
                const expanded = expandedSchool === value;
                const draft = preview?.day === value ? preview : null;
                const draftStart = draft ? Math.max(480, minutes(draft.start)) : 0;
                const draftEnd = draft ? Math.min(1380, minutes(draft.end)) : 0;
                return <div key={value} data-day={value} className="day-column" onClick={e => {
                  const slot = time(gridMinute(e.clientY, e.currentTarget));
                  if (!dayEvents.some(event => event.start <= slot && slot < event.end)) create(value, slot);
                }}>
                  {preferences.group && school.length > 0 && drawEvent({ ...school[0], title: 'School', end: school.reduce((end, item) => item.end > end ? item.end : end, school[0].end) }, school)}
                  {preferences.group && expanded && school.length > 0 && <div className="school-details" onClick={e => e.stopPropagation()}>
                    <button className="text-button" onClick={() => setExpandedSchool(null)}>School inklappen</button>
                    {school.map((lesson, index) => {
                      const previousEnd = school.slice(0, index).reduce((latest, item) => item.end > latest ? item.end : latest, '');
                      return <div key={lesson.id}>
                        {previousEnd && previousEnd < lesson.start && <small>Tussenuur · {previousEnd} – {lesson.start}</small>}
                        <button onClick={() => show(lesson)}><b>{lesson.title}</b><small>{lesson.start} – {lesson.end}{lesson.location ? ' · ' + lesson.location : ''}</small>{eventNote(lesson) && <small>{eventNote(lesson)}</small>}</button>
                      </div>;
                    })}
                  </div>}
                  {draft && draftEnd > draftStart && <div className="event-preview" aria-hidden="true" style={{ top: (draftStart - 480) / 9 + '%', height: (draftEnd - draftStart) / 9 + '%' }}>{draft.start} – {draft.end}</div>}
                  {other.map(event => drawEvent(event))}
                  {marker !== null && <div className="time-marker" style={{ top: (marker - 480) / 9 + '%' }} />}
                </div>;
              })}
            </div>
          </div>}
        </section>
        <aside id="agenda-details" className="right-panel" hidden={detailsCollapsed}>
          <Month selected={day} month={mini} select={selectDay} shift={n => setMini(changeMonth(mini, n))} events={visible} />
          <section className="card upcoming"><div className="card-heading"><h2>Aankomende events</h2><button className="text-button" onClick={() => { setView('Lijst'); selectDay(upcomingCards[0]?.event.day || day); }}>Naar lijst <ArrowRight /></button></div>
            {upcomingCards.length ? upcomingCards.map(({ event, lessons }) => { const Icon = resolveCalendarIcon(calendars.find(item => item.id === event.calendar)?.icon) || eventIcon(event); const calendar = calendars.find(item => item.id === event.calendar)!; return <button key={event.id} className="upcoming-item" onClick={() => lessons ? setLessons(lessons) : show(event)}><span className="event-icon" style={{ color: calendar.color, background: calendar.background }}><Icon /></span><span><b>{event.title}</b><small>{format(event.day, { weekday: 'short', day: 'numeric', month: 'short' })}, {event.start} – {event.end}</small></span></button>; }) : <p>Geen komende afspraken.</p>}
          </section>
          <button className="share-card" onClick={() => setPage('Beschikbaarheid')}><span className="share-icon"><Link2 /></span><span><b>Beschikbaarheid delen</b><small>Deel je vrije tijden met een link</small></span><ChevronRight /></button>
        </aside>
      </div> : <section className="content" key={sync.user?.id || 'local'}>
        {page === "Agenda’s" && <Calendars calendars={calendars} setCalendars={setCalendars} setEvents={setEvents} />}
        {page === 'Beschikbaarheid' && <Availability calendars={calendars} events={[...events, ...booked]} day={day} />}
        {page === 'Instellingen' && <SettingsPanel preferences={preferences} setPreferences={setPreferences} sync={sync} />}

        {page === 'Taken' && <div className="task-board">
          {tasks.length > 0 && <div className="card task-progress">
            <small>{completedTasks} van {tasks.length} afgerond</small>
            <progress max={tasks.length} value={completedTasks} aria-label="Afgeronde taken" />
          </div>}
          <div className="task-columns">
            {[false, true].map(done => {
              const count = done ? completedTasks : tasks.length - completedTasks;
              return <section className="card form-card task-panel" key={String(done)}>
                <div className="panel-heading">
                  <span>{done ? <CircleCheck aria-hidden="true" /> : <ClipboardCheck aria-hidden="true" />}</span>
                  <h2>{done ? 'Afgerond' : 'Open taken'}</h2>
                  <small>{count}</small>
                </div>
                {!done && <form className="row task-form" onSubmit={event => {
                  event.preventDefault();
                  const title = String(new FormData(event.currentTarget).get('task')).trim();
                  if (title) setTasks(current => [...current, { id: crypto.randomUUID(), title, done: false }]);
                  event.currentTarget.reset();
                }}>
                  <input name="task" aria-label="Nieuwe taak" placeholder="Nieuwe taak" required />
                  <button className="primary row"><Plus aria-hidden="true" />Toevoegen</button>
                </form>}
                {count > 0 ? <div className="task-list">{tasks.map((task, i) => task.done === done && <label className="check" key={task.id}>
                  <input type="checkbox" checked={task.done} onChange={event => setTasks(current => current.map((item, j) => i === j ? { ...item, done: event.target.checked } : item))} />
                  <span>{task.title}</span>
                </label>)}</div> : <p className="task-empty">{done ? 'Afgevinkte taken verschijnen hier.' : 'Je hebt geen open taken.'}</p>}
              </section>;
            })}
          </div>
        </div>}
      </section>}
      <Friends profileName={profileName} active={page === 'Vrienden'} inviteOpen={menu === 'friend-invite'} closeInvite={() => setMenu(current => current === 'friend-invite' ? '' : current)} calendars={calendars} events={[...events, ...booked]} />
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
