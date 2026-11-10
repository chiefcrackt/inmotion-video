import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../model.mjs';
import {
  computeSplits,
  typedValue,
  scaleText,
  recapLayout,
  recapDefaults,
  recapStats,
  recapInputs,
  photoGeometry,
} from '../recap.mjs';

// 5 km at a steady 3 m/s (one record every 10 s), climbing 1 m per record.
const steady = normalize({
  format: 'test',
  records: Array.from({ length: 168 }, (_, i) => ({
    time: i * 10000,
    distance: i * 30,
    lat: 40 + i * 0.00027,
    lon: -79,
    elevation: 300 + i,
  })),
});

test('splits per km and per mile, with a partial last split', () => {
  const km = computeSplits(steady, false);
  assert.equal(km.length, 5); // 5010 m: five full km; the last 10 m is too short to show
  const full = km.filter((s) => !s.partial);
  assert.equal(full.length, 5);
  for (const s of full) assert.ok(Math.abs(s.pace - 1000 / 3) < 0.5);
  const mi = computeSplits(steady, true);
  assert.equal(mi.length, 3); // 3.11 mi: the last 0.11 mi is under 15% of a mile
  const longer = normalize({
    format: 'test',
    records: Array.from({ length: 188 }, (_, i) => ({ time: i * 10000, distance: i * 30 })),
  });
  const last = computeSplits(longer, false).at(-1); // 5610 m
  assert.equal(last.partial, true);
  assert.ok(Math.abs(last.distance - 610) < 0.01);
  assert.ok(Math.abs(last.pace - 1000 / 3) < 0.5);
});

test('typed values get units, and counting keeps the format', () => {
  assert.equal(typedValue('temp', '48', true), '48°F');
  assert.equal(typedValue('temp', '9', false), '9°C');
  assert.equal(typedValue('distance', '13.1', true), '13.1 MI');
  assert.equal(typedValue('pace', '8:45', true), '8:45 /MI');
  assert.equal(typedValue('heartRate', '152', true), '152 BPM');
  assert.equal(typedValue('moving', '1:54:40', true), '1:54:40');
  assert.equal(typedValue('ascent', '  ', true), '');
  assert.equal(scaleText('13.10 MI', 0.5), '6.55 MI');
  assert.equal(scaleText('1:54:40', 0.5), '0:57:20');
  assert.equal(scaleText('1,440 FT', 0.5), '720 FT');
  assert.equal(scaleText('42:10', 1), '42:10');
});

test('defaults and overrides', () => {
  const settings = { imperial: false, recapStats: ['distance', 'pace', 'temp'] };
  const d = recapDefaults(steady, settings);
  assert.equal(d.distance, '5.01 KM');
  assert.equal(d.pace, '5:33 /KM');
  recapInputs.overrides = { temp: '12' };
  const list = recapStats(steady, settings);
  assert.deepEqual(
    list.map((s) => s.value),
    ['5.01 KM', '5:33 /KM', '12°C'],
  );
  recapInputs.overrides = {};
  assert.equal(recapStats(steady, settings).length, 2); // no temperature without a typed value
});

test('layout stays on the canvas and clear of the 9:16 app zones', () => {
  for (const [W, H] of [
    [1080, 1920],
    [1080, 1350],
    [1080, 1080],
    [1920, 1080],
  ]) {
    for (const opts of [
      { stats: 6, elevation: true, splits: true, route: true },
      { stats: 4, elevation: false, splits: true, route: false },
      { stats: 2, elevation: false, splits: false, route: true },
    ]) {
      const L = recapLayout(W, H, opts);
      const boxes = [L.header, L.stats, L.handle, L.route, ...(L.charts || [])].filter(Boolean);
      for (const b of boxes) {
        assert.ok(b.x >= 0 && b.y >= 0, `${W}x${H} box starts on canvas`);
        assert.ok(b.x + b.w <= W + 0.5 && b.y + b.h <= H + 0.5, `${W}x${H} box ends on canvas`);
        if (H === 1920) {
          assert.ok(b.y >= 250 - 0.5, 'clear of the top 250 px');
          assert.ok(b.y + b.h <= 1520 + 0.5, 'clear of the bottom 400 px');
        }
      }
      if (opts.route && W === 1080 && H === 1920) assert.ok(L.route.h > 300);
    }
  }
});

test('photo position: fill slides across the overflow, whole fits inside', () => {
  const im = { width: 1600, height: 900 };
  const at = (o) => photoGeometry(im, 1080, 1920, { recapPhotoFit: 'fill', recapPhotoZoom: 1, ...o });
  const mid = at({});
  assert.ok(Math.abs(mid.h - 1920) < 0.01);
  assert.ok(Math.abs(mid.x - (1080 - mid.w) / 2) < 0.01);
  assert.ok(Math.abs(at({ recapPhotoX: 100 }).x) < 0.01); // left edge on the card's left edge
  const right = at({ recapPhotoX: -100 });
  assert.ok(Math.abs(right.x + right.w - 1080) < 0.01); // right edge on the card's right edge
  assert.ok(at({ recapPhotoZoom: 2 }).w > mid.w * 1.99);
  const whole = photoGeometry(im, 1080, 1920, { recapPhotoFit: 'whole', recapPhotoZoom: 1 });
  assert.ok(Math.abs(whole.w - 1080) < 0.01 && whole.h < 1920);
});
