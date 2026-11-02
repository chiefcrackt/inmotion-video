import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASPECTS,
  clamp,
  placeImage,
  panRange,
  timelineTimes,
  splitAt,
  fadeAt,
  labelSize,
} from '../before-after/model.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test('frames are exact sizes for the common social formats', () => {
  assert.deepEqual([ASPECTS['9:16'].width, ASPECTS['9:16'].height], [1080, 1920]);
  assert.deepEqual([ASPECTS['16:9'].width, ASPECTS['16:9'].height], [1920, 1080]);
  assert.equal(ASPECTS['1:1'].width, ASPECTS['1:1'].height);
});

test('fill covers the frame and centres the overflow', () => {
  // 2000x1000 into 1000x1000: scale to 2000x1000, so the middle 1000 px is shown.
  const r = placeImage(2000, 1000, 1000, 1000);
  close(r.h, 1000);
  close(r.w, 2000);
  close(r.x, -500);
  close(r.y, 0);
});

test('fit shows the whole photo with bars where it does not reach the edges', () => {
  const r = placeImage(2000, 1000, 1000, 1000, { fit: 'fit' });
  close(r.w, 1000);
  close(r.h, 500);
  close(r.x, 0);
  close(r.y, 250);
});

test('pan moves the photo only as far as its overflow', () => {
  const adj = { panX: 1 };
  const r = placeImage(2000, 1000, 1000, 1000, adj);
  close(r.x, 0); // moved to the left edge of the overflow, so the image's left edge sits at the frame edge
  close(placeImage(2000, 1000, 1000, 1000, { panX: -1 }).x, -1000);
  close(placeImage(2000, 1000, 1000, 1000, { panX: 9 }).x, 0, 'pan is clamped');
});

test('zoom enlarges the photo and is limited to the allowed range', () => {
  const base = placeImage(1000, 1000, 1000, 1000);
  const zoomed = placeImage(1000, 1000, 1000, 1000, { zoom: 2 });
  close(zoomed.w, base.w * 2);
  close(placeImage(1000, 1000, 1000, 1000, { zoom: 50 }).w, base.w * 3);
});

test('rotation swaps width and height for quarter turns', () => {
  const r = placeImage(2000, 1000, 1000, 1000, { rotation: 90, fit: 'fit' });
  assert.equal(r.rotation, 90);
  // Turned, the photo is 1000 wide and 2000 tall; fitted into the square it becomes 500 by 1000.
  close(r.w, 500);
  close(r.h, 1000);
  assert.equal(placeImage(10, 10, 10, 10, { rotation: 360 }).rotation, 0);
});

test('bad photo sizes return an empty rectangle instead of throwing', () => {
  assert.equal(placeImage(0, 0, 100, 100).w, 0);
});

test('pan range tells a drag how far the photo can move', () => {
  const range = panRange(2000, 1000, 1000, 1000);
  close(range.x, 500);
  close(range.y, 0);
});

test('the timeline holds, changes, then holds, and matches the chosen length', () => {
  const t = timelineTimes(5);
  assert.equal(t.total, 5);
  close(t.holdBefore + t.sweep + t.holdAfter, 5);
  assert.equal(timelineTimes(1).total, 3, 'short lengths are raised to the minimum');
  assert.equal(timelineTimes(99).total, 10, 'long lengths are capped');
});

test('the wipe starts on Before, ends on After, and passes the middle halfway', () => {
  const total = 5;
  const { holdBefore, sweep } = timelineTimes(total);
  assert.equal(splitAt(0, total), 1);
  assert.equal(splitAt(holdBefore, total), 1);
  assert.equal(splitAt(holdBefore + sweep, total), 0);
  assert.equal(splitAt(total, total), 0);
  close(splitAt(holdBefore + sweep / 2, total), 0.5);
});

test('the fade moves from Before to After over the same timing', () => {
  const total = 5;
  const { holdBefore, sweep } = timelineTimes(total);
  assert.equal(fadeAt(0, total), 0);
  assert.equal(fadeAt(total, total), 1);
  close(fadeAt(holdBefore + sweep / 2, total), 0.5);
  assert.ok(fadeAt(holdBefore + sweep * 0.25, total) < 0.25, 'eases in');
});

test('label text scales with the frame, not its width alone', () => {
  assert.ok(labelSize(1920, 1080).font > labelSize(1080, 1920).font - 1);
  assert.equal(labelSize(1080, 1920).font, labelSize(1080, 1080).font);
  assert.equal(clamp(2, 0, 1), 1);
});
