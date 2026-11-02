import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASPECTS,
  clamp,
  coverRects,
  timelineTimes,
  splitAt,
  labelSize,
} from '../before-after/model.mjs';

test('frames are exact sizes for the common social formats', () => {
  assert.deepEqual([ASPECTS['9:16'].width, ASPECTS['9:16'].height], [1080, 1920]);
  assert.deepEqual([ASPECTS['16:9'].width, ASPECTS['16:9'].height], [1920, 1080]);
  assert.equal(ASPECTS['1:1'].width, ASPECTS['1:1'].height);
});

test('a photo covers the frame and is cropped evenly from the centre', () => {
  // A 2000x1000 landscape photo into a 1000x1000 square: scale to 1000 high, crop 500 wide from the middle.
  const r = coverRects(2000, 1000, 1000, 1000);
  assert.deepEqual(r.src, { x: 500, y: 0, w: 1000, h: 1000 });
  assert.deepEqual(r.dst, { x: 0, y: 0, w: 1000, h: 1000 });
});

test('bad image sizes do not throw', () => {
  assert.equal(coverRects(0, 0, 100, 100).src.w, 0);
});

test('the timeline holds, sweeps, then holds, and matches the chosen length', () => {
  const t = timelineTimes(5);
  assert.equal(t.total, 5);
  assert.ok(Math.abs(t.holdBefore + t.sweep + t.holdAfter - 5) < 1e-9);
  assert.equal(timelineTimes(1).total, 3, 'short lengths are raised to the minimum');
  assert.equal(timelineTimes(99).total, 10, 'long lengths are capped');
});

test('the divider starts on Before, ends on After, and moves in between', () => {
  const total = 5;
  const { holdBefore, sweep } = timelineTimes(total);
  assert.equal(splitAt(0, total), 1);
  assert.equal(splitAt(holdBefore, total), 1);
  assert.equal(splitAt(holdBefore + sweep, total), 0);
  assert.equal(splitAt(total, total), 0);
  const mid = splitAt(holdBefore + sweep / 2, total);
  assert.ok(Math.abs(mid - 0.5) < 1e-9, 'eased sweep passes the middle at the halfway point');
});

test('label text scales with the frame width', () => {
  assert.ok(labelSize(1920).font > labelSize(1080).font);
  assert.equal(clamp(2, 0, 1), 1);
});
