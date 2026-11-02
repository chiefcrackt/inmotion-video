// Unit tests for due dates, checklists and the due-date CSV export.
// Run: node --test tests/idea-vault-due.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checklistProgress,
  csvCell,
  defaultChecklist,
  dueDateCsv,
  dueDateRows,
  isOverdue,
  localDay,
  normalizeChecklist,
  validDueDate,
} from '../idea-vault/vault-core.mjs';

test('due dates accept only real calendar days', () => {
  assert.equal(validDueDate('2026-11-14'), '2026-11-14');
  assert.equal(validDueDate('2026-02-30'), '', 'no such day');
  assert.equal(validDueDate('2026-13-01'), '', 'no such month');
  assert.equal(validDueDate('2026-11-14T10:00'), '', 'date only, no time');
  assert.equal(validDueDate(''), '');
  assert.equal(validDueDate(undefined), '');
  assert.equal(validDueDate(20261114), '');
});

test('localDay gives the local calendar day, zero-padded', () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
  assert.equal(localDay(new Date(2026, 10, 1)), '2026-11-01');
});

test('overdue only after the day has passed, and not when published or archived', () => {
  const today = '2026-11-02';
  assert.equal(
    isOverdue({ dueDate: '2026-11-01', status: 'Filmed' }, today),
    true,
  );
  assert.equal(
    isOverdue({ dueDate: '2026-11-02', status: 'Filmed' }, today),
    false,
    'due today is not overdue',
  );
  assert.equal(
    isOverdue({ dueDate: '2026-11-03', status: 'Filmed' }, today),
    false,
  );
  assert.equal(
    isOverdue({ dueDate: '2026-11-01', status: 'Published' }, today),
    false,
  );
  assert.equal(
    isOverdue(
      { dueDate: '2026-11-01', status: 'Filmed', archived: true },
      today,
    ),
    false,
  );
  assert.equal(isOverdue({ status: 'Filmed' }, today), false, 'no due date');
});

test('a default checklist has the five steps, all open', () => {
  assert.deepEqual(
    defaultChecklist().map((s) => s.text),
    ['Script', 'Shot list', 'Filmed', 'Edited', 'Posted'],
  );
  assert.ok(defaultChecklist().every((s) => s.done === false));
});

test('checklist normalising drops empty steps and trims long text', () => {
  const list = normalizeChecklist([
    { text: '  Script  ', done: true },
    { text: '   ', done: false },
    { text: 'x'.repeat(300), done: 'yes' },
    null,
    'plain string',
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[0].text, 'Script');
  assert.equal(list[0].done, true);
  assert.equal(list[1].text.length, 120);
  assert.equal(list[1].done, false, 'done is only true when exactly true');
  assert.deepEqual(normalizeChecklist('nope'), []);
});

test('checklist progress counts done steps', () => {
  assert.deepEqual(
    checklistProgress({
      checklist: [
        { text: 'a', done: true },
        { text: 'b', done: false },
        { text: 'c', done: true },
      ],
    }),
    { done: 2, total: 3 },
  );
  assert.deepEqual(checklistProgress({}), { done: 0, total: 0 });
});

test('CSV cells are quoted when needed and neutralise spreadsheet formulas', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a, b'), '"a, b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-5 tips'), "'-5 tips");
  assert.equal(csvCell('@sum'), "'@sum");
  assert.equal(csvCell(null), '');
});

test('due-date rows: earliest first, undated last, archived and conflict copies left out', () => {
  const ideas = [
    { id: '1', title: 'Undated', status: 'Inbox' },
    { id: '2', title: 'Later', dueDate: '2026-12-01', status: 'Filmed' },
    { id: '3', title: 'Sooner', dueDate: '2026-11-10', status: 'Editing' },
    { id: '4', title: 'Gone', dueDate: '2026-11-05', archived: true },
    { id: '5', title: 'Copy', dueDate: '2026-11-06', conflictOf: '3' },
    { id: '6', title: 'Bad date', dueDate: '2026-02-30' },
  ];
  // "Bad date" has no valid due date, so it sorts with the undated ideas, by title.
  assert.deepEqual(
    dueDateRows(ideas).map((r) => r.title),
    ['Sooner', 'Later', 'Bad date', 'Undated'],
  );
});

test('the CSV has a header, the expected columns, and a BOM for Excel', () => {
  const csv = dueDateCsv([
    {
      id: '1',
      title: 'Oil Creek, finale',
      dueDate: '2026-11-14',
      status: 'Editing',
      platform: 'YouTube',
      checklist: [
        { text: 'Script', done: true },
        { text: 'Filmed', done: false },
      ],
    },
    { id: '2', title: 'No plan', status: 'Inbox', platform: 'TikTok' },
  ]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const lines = csv.slice(1).trim().split('\r\n');
  assert.equal(lines[0], 'Title,Due date,Status,Platform,Checklist');
  assert.equal(lines[1], '"Oil Creek, finale",2026-11-14,Editing,YouTube,1/2');
  assert.equal(lines[2], 'No plan,,Inbox,TikTok,');
});
