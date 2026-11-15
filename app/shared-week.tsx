'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { add, format, labels, minutes, monday, time } from '../lib/calendar';
import { cloud, proposalsRequest } from '../lib/proposals';

type SharedDay = { day: string; slots: string[] };
type Draft = { day: string; start: string; end: string };

function ProposalTime({ label, value, onChange }: { label: string; value: string; onChange: (time: string) => void }) {
  const [hour, minute] = value.split(':');
  return <div className="proposal-time-field">
    <span>{label}</span>
    <details className="proposal-time" onToggle={event => {
      if (!event.currentTarget.open) return;
      for (const list of event.currentTarget.querySelectorAll<HTMLElement>(".proposal-time-options")) {
        const selected = list.querySelector<HTMLElement>('[aria-pressed="true"]');
        if (selected) list.scrollTop = selected.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - (list.clientHeight - selected.offsetHeight) / 2;
      }
    }}>
      <summary className="control" aria-label={label + ': ' + value}><Clock3 aria-hidden="true" />{value}<ChevronDown aria-hidden="true" /></summary>
      <div className="card proposal-time-menu">
        {[{ title: 'Uur', size: 24, value: hour }, { title: 'Minuut', size: 60, value: minute }].map((column, index) =>
          <div key={column.title}>
            <strong>{column.title}</strong>
            <div className="proposal-time-options" aria-label={column.title} role="group">
              {Array.from({ length: column.size }, (_, number) => {
                const option = String(number).padStart(2, '0');
                return <button key={option} type="button" aria-pressed={option === column.value}
                  onClick={event => {
                    onChange(index === 0 ? option + ':' + minute : hour + ':' + option);
                    if (index === 1) {
                      const menu = event.currentTarget.closest('details');
                      if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); }
                    }
                  }}>{option}</button>;
              })}
            </div>
          </div>
        )}
      </div>
    </details>
  </div>;
}

export function SharedWeek({ rows, token }: { rows: SharedDay[]; token: string }) {
  const first = monday(rows[0].day);
  const last = monday(rows[rows.length - 1].day);
  const [week, setWeek] = useState(first);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState('');
  const [sender, setSender] = useState('');
  const currentWeek = week < first || week > last ? first : week;
  const byDay = new Map(rows.map(row => [row.day, row.slots]));
  const days = labels.map((label, index) => ({ label, day: add(currentWeek, index) }));
  const boundaries = rows.flatMap(row => row.slots.flatMap(slot => slot.split(' – ').map(minutes)));
  const startHour = Math.floor(Math.min(480, ...boundaries) / 60);
  const endHour = Math.ceil(Math.max(1320, ...boundaries) / 60);
  const span = (endHour - startHour) * 60;
  const top = (at: string) => (minutes(at) - startHour * 60) / span * 100;
  const overlaps = (item: Draft) => byDay.get(item.day)?.some(slot => {
    const [start, end] = slot.split(' – ');
    return start < item.end && end > item.start;
  });

  useEffect(() => {
    const subscription = cloud?.auth.onAuthStateChange((_event, session) => setSignedIn(!!session)).data.subscription;
    return () => subscription?.unsubscribe();
  }, []);

  return <main className="shared-calendar">
    <header><h1>Gedeelde agenda</h1><span><i /> Bezet</span></header>
    <div className="row shared-week-controls">
      <button className="control" aria-label="Vorige week" disabled={currentWeek <= first} onClick={() => setWeek(add(currentWeek, -7))}><ChevronLeft /></button>
      <strong>{format(currentWeek, { day: 'numeric', month: 'short' })} – {format(add(currentWeek, 6), { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
      <button className="control" aria-label="Volgende week" disabled={currentWeek >= last} onClick={() => setWeek(add(currentWeek, 7))}><ChevronRight /></button>
    </div>
    <div className="calendar-scroll">
      <div className="calendar shared-week" style={{ '--columns': 7, '--shared-hours': endHour - startHour } as React.CSSProperties}>
        <div className="grid-header" />
        {days.map(({ day, label }) => <div className="grid-header" key={day}>{label} {Number(day.slice(-2))}</div>)}
        <div className="shared-time-labels">{Array.from({ length: endHour - startHour }, (_, i) => <span key={i}>{time((startHour + i) * 60)}</span>)}</div>
        {days.map(({ day }) => <div className="day-column shared-day" key={day} data-shared={byDay.has(day)}>
          {byDay.has(day) && <button className="shared-add" type="button" aria-label={'Voorstel doen op ' + day} onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            const offset = event.detail ? Math.floor(((event.clientY - rect.top) / rect.height) * span / 15) * 15 : 60;
            const start = Math.min(1425, startHour * 60 + Math.max(0, Math.min(span - 15, offset)));
            const item = { day, start: time(start), end: time(Math.min(1439, start + 30)) };
            if (overlaps(item) && event.detail) return;
            setStatus(''); setMessage(''); setDraft(item);
          }} />}
          {byDay.get(day)?.map(slot => {
            const [start, end] = slot.split(' – ');
            return <div className="shared-week-busy" key={slot} style={{ top: top(start) + '%', height: (top(end) - top(start)) + '%' }}>{slot}</div>;
          })}
        </div>)}
      </div>
    </div>
    {draft && <div className="overlay" onClick={() => setDraft(null)}>
      <section className="card dialog form-grid" role="dialog" aria-modal="true" aria-label="Afspraak voorstellen" onClick={event => event.stopPropagation()}>
        <div className="card-heading"><h2>Afspraak voorstellen</h2><button type="button" onClick={() => setDraft(null)}>Sluiten</button></div>
        {cloud && !signedIn ? <form className="form-grid" onSubmit={async event => {
          event.preventDefault();
          const { error } = await cloud.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/?vrij=' + encodeURIComponent(token) } });
          setStatus(error ? 'De inloglink kon niet worden verstuurd.' : 'Controleer je e-mail voor de inloglink.');
        }}><label>E-mailadres<input required type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><button className="primary">Stuur inloglink</button></form>
        : <form className="form-grid" onSubmit={async event => {
          event.preventDefault(); setSending(true);
          try {
            const result = await proposalsRequest({ action: 'propose', token, ...draft, message, sender });
            setStatus(result.code === 'ok' ? 'Voorstel verstuurd.' : result.code === 'busy' ? 'Dit tijdslot is bezet.' : result.code === 'duplicate' ? 'Je hebt dit tijdslot al voorgesteld.' : result.code === 'own_link' ? 'Open je link in een ander browserprofiel om een voorstel te sturen.' : result.code === 'old_link' ? 'Maak een nieuwe agendalink aan om voorstellen te ontvangen.' : 'Het voorstel kon niet worden verstuurd.');
          } catch { setStatus('Het voorstel kon niet worden verstuurd.'); }
          finally { setSending(false); }
        }}>
          <p>{format(draft.day, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <div className="two"><ProposalTime label="Begintijd" value={draft.start} onChange={start => setDraft({ ...draft, start })} /><ProposalTime label="Eindtijd" value={draft.end} onChange={end => setDraft({ ...draft, end })} /></div>
          {!cloud && <label>Je naam<input required maxLength={60} value={sender} onChange={event => setSender(event.target.value)} /></label>}
          <label>Bericht (optioneel)<textarea value={message} maxLength={500} onChange={event => setMessage(event.target.value)} /></label>
          {overlaps(draft) && <p>Dit tijdslot overlapt een bezet blok.</p>}
          <button className="primary" disabled={sending || status === 'Voorstel verstuurd.' || draft.start >= draft.end || overlaps(draft)}>Versturen</button>
        </form>}
        <p role="status">{status}</p>
      </section>
    </div>}
  </main>;
}
