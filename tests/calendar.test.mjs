import assert from 'node:assert/strict';
import test from 'node:test';
import { busyBlocks, changeMonth, demo, freeBlocks, monday, nextEvents } from '../lib/calendar.ts';

test('school breaks stay free even when the school day is shown as one block', () => {
  assert.deepEqual(freeBlocks(demo, '2025-01-13', '08:30', '15:00', 30, 0), ['10:15 – 10:45', '12:15 – 13:00']);
});

test('buffers and the minimum duration are applied to individual lessons', () => {
  assert.deepEqual(freeBlocks(demo, '2025-01-13', '08:30', '15:00', 25, 10), ['12:25 – 12:50']);
});

test('navigation works across month and year boundaries', () => {
  assert.equal(monday('2025-01-01'), '2024-12-30');
  assert.equal(changeMonth('2025-01-31', 1), '2025-02-01');
});

test('shared calendar merges overlapping times and preserves gaps without event details', () => {
  const day = '2025-01-13';
  const events = [...demo, { ...demo[0], start: '09:00', end: '10:30', title: 'Private' }];
  assert.deepEqual(busyBlocks(events, day), [
    '08:30 – 10:30', '10:45 – 12:15', '13:00 – 15:00', '16:30 – 18:00',
  ]);
});

test('upcoming appointments use the current date and exclude completed events', () => {
  assert.deepEqual(nextEvents(demo, '2025-01-16', '12:15').slice(0, 2).map(event => event.id), ['lesson-c3', 'diner']);
});
