const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCutList, mergeCuts, summarize } = require('./cut-list.js');

test('reads a fenced JSON block inside the edit plan reply', () => {
  const reply =
    'Here is the plan.\n\n```json\n{"cuts":[{"start":12.5,"end":20,"reason":"repeat take"}]}\n```\nAnything else?';
  assert.deepEqual(parseCutList(reply), [
    { start: 12.5, end: 20, reason: 'repeat take' },
  ]);
});

test('reads a bare array and rejects empty or broken input', () => {
  assert.equal(parseCutList('[{"start":1,"end":2}]')[0].end, 2);
  assert.throws(() => parseCutList('{"cuts":[]}'), /no cuts/);
  assert.throws(() => parseCutList('not json'), /Paste the JSON/);
});

test('overlapping cuts are merged and totals count each second once', () => {
  const cuts = [
    { start: 10, end: 20 },
    { start: 15, end: 25 },
    { start: 40, end: 42 },
  ];
  assert.deepEqual(mergeCuts(cuts), [
    { start: 10, end: 25 },
    { start: 40, end: 42 },
  ]);
  const summary = summarize(cuts, 100);
  assert.equal(summary.cuts, 2);
  assert.equal(summary.removed, 17);
  assert.equal(summary.kept, 83);
});
