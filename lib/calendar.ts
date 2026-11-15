export type Event = { id: string; title: string; day: string; start: string; end: string; calendar: string; location?: string; note?: string; source?: string; original?: string };
export const initialDay = '2025-01-16';
export const labels = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
export type CalendarSettings = { id: string; title: string; color: string; background: string; visible: boolean; icon?: string };
export const defaults: CalendarSettings[] = [
  { id: 'school', title: 'School', color: '#2457ff', background: '#e5edff', visible: true },
  { id: 'sport', title: 'Sport', color: '#3e9d22', background: '#e6f8df', visible: true },
  { id: 'personal', title: 'Persoonlijk', color: '#834be8', background: '#f0e4ff', visible: true },
  { id: 'study', title: 'Studie', color: '#099fc5', background: '#dff6fd', visible: true },
];
export function key(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
export function date(day: string) { return new Date(day + 'T12:00:00'); }
export function add(day: string, amount: number) {
  const value = date(day); value.setDate(value.getDate() + amount); return key(value);
}
export function monday(day: string) { return add(day, -((date(day).getDay() + 6) % 7)); }
export function monthStart(day: string) { return day.slice(0, 8) + '01'; }
export function changeMonth(day: string, amount: number) {
  const value = date(monthStart(day)); value.setMonth(value.getMonth() + amount); return key(value);
}
export function format(day: string, options: Intl.DateTimeFormatOptions) {
  const value = date(day).toLocaleDateString('nl-NL', options); return value[0].toUpperCase() + value.slice(1);
}
export function minutes(time: string) { const [h, m] = time.split(':').map(Number); return h * 60 + m; }
export function time(value: number) { return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0'); }
export const demo: Event[] = [
  ...Array.from({ length: 5 }, (_, i) => [
    { id: 'lesson-a' + i, title: 'Wiskunde', day: add('2025-01-13', i), start: '08:30', end: '10:15', calendar: 'school', location: 'Lokaal B12', note: 'Docent: Mevr. De Vries' },
    { id: 'lesson-b' + i, title: 'Nederlands', day: add('2025-01-13', i), start: '10:45', end: i === 4 ? '12:45' : '12:15', calendar: 'school', location: 'Lokaal A03' },
    ...(i === 4 ? [] : [{ id: 'lesson-c' + i, title: 'Geschiedenis', day: add('2025-01-13', i), start: '13:00', end: '15:00', calendar: 'school', location: 'Lokaal C04' }]),
  ]).flat(),
  { id: 'golf', title: 'Golf', day: '2025-01-13', start: '16:30', end: '18:00', calendar: 'sport' },
  { id: 'gym', title: 'Gym', day: '2025-01-15', start: '17:00', end: '18:00', calendar: 'personal' },
  { id: 'diner', title: 'Diner', day: '2025-01-16', start: '20:00', end: '22:00', calendar: 'personal' },
  { id: 'huiswerk', title: 'Huiswerk', day: '2025-01-17', start: '15:30', end: '17:00', calendar: 'study' },
];
export function freeBlocks(events: Event[], day: string, start: string, end: string, minimum: number, buffer: number) {
  let cursor = minutes(start);
  const finish = minutes(end);
  const slots: string[] = [];
  for (const event of events.filter(event => event.day === day).sort((a, b) => a.start.localeCompare(b.start))) {
    const busyStart = minutes(event.start) - buffer;
    const busyEnd = minutes(event.end) + buffer;
    if (busyEnd <= cursor || busyStart >= finish) continue;
    if (busyStart - cursor >= minimum) slots.push(time(cursor) + ' – ' + time(busyStart));
    cursor = Math.max(cursor, busyEnd);
  }
  if (finish - cursor >= minimum) slots.push(time(cursor) + ' – ' + time(finish));
  return slots;
}


export function eventNote(event: Event) {
  const note = event.note || '';
  return event.source === 'Magister · ICS'
    ? note.replace(/Check Magister voor huiswerk, proefwerken, overhoringen en roosterwijzigingen\.?/gi, '').trim()
    : note;
}

export function busyBlocks(events: Event[], day: string) {
  const intervals = events.filter(event => event.day === day)
    .map(event => ({ start: minutes(event.start), end: minutes(event.end) }))
    .filter(({ start, end }) => start >= 0 && end <= 1440 && end > start)
    .sort((a, b) => a.start - b.start);
  const merged: typeof intervals = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push(interval);
  }
  return merged.map(({ start, end }) => time(start) + ' – ' + time(end));
}
