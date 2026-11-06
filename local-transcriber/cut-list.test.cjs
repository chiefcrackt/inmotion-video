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

// "The brown fox jumped uhh I think over the rock", with a long pause after "jumped".
const { cleanWords, pauses, selectionCuts, selectionFromCuts } = require('./cut-list.js');
const fox = cleanWords(
  [
    [0.5, 0.7, ' The'],
    [0.75, 1.0, ' brown'],
    [1.05, 1.3, ' fox'],
    [1.35, 1.8, ' jumped'],
    [2.8, 3.1, ' uhh'],
    [3.2, 3.3, ' I'],
    [3.35, 3.6, ' think'],
    [3.8, 4.0, ' over'],
    [4.05, 4.2, ' the'],
    [4.25, 4.6, ' rock.'],
  ].map(([start, end, word]) => ({ start, end, word })),
);

test('removing "uhh I think" cuts from mid-pause before to mid-pause after', () => {
  const cuts = selectionCuts(fox, 6, new Set([4, 5, 6]), new Set());
  assert.deepEqual(cuts, [{ start: 2.3, end: 3.7, reason: 'removed: uhh I think' }]);
  // "jumped" now runs into "over" with half of each pause left: 0.5 s + 0.1 s.
  assert.ok(Math.abs(2.3 - 1.8 + (3.8 - 3.7) - 0.6) < 1e-9);
});

test('first and last words cut to the very start and end; pauses keep a little breath', () => {
  assert.deepEqual(selectionCuts(fox, 6, new Set([0, 9]), new Set()), [
    { start: 0, end: 0.725, reason: 'removed: The' },
    { start: 4.225, end: 6, reason: 'removed: rock.' },
  ]);
  assert.deepEqual(selectionCuts(fox, 6, new Set(), new Set([0, 4, 10])), [
    { start: 0, end: 0.35, reason: 'lead-in' },
    { start: 1.95, end: 2.65, reason: 'shortened pause' },
    { start: 4.75, end: 6, reason: 'tail' },
  ]);
});

test('a removed pause next to removed words merges into one cut', () => {
  assert.deepEqual(selectionCuts(fox, 6, new Set([4, 5, 6]), new Set([4])), [
    { start: 1.95, end: 3.7, reason: 'shortened pause; removed: uhh I think' },
  ]);
});

test('pauses lists gaps of half a second or more, including lead-in and tail', () => {
  assert.deepEqual(
    pauses(fox, 6).map((p) => p.gap),
    [0, 4, 10],
  );
});

test('an edit plan cut list shows on the words it covers', () => {
  const { removedWords, removedGaps } = selectionFromCuts(fox, 6, [
    { start: 0, end: 1.32 },
    { start: 4.7, end: 6 },
  ]);
  assert.deepEqual([...removedWords], [0, 1, 2]);
  assert.deepEqual([...removedGaps], [0, 10]);
  // Words removed by clicks take half of a neighbouring pause; that pause is not shown as removed.
  const cuts = selectionCuts(fox, 6, new Set([4, 5, 6]), new Set());
  assert.deepEqual([...selectionFromCuts(fox, 6, cuts).removedGaps], []);
});
