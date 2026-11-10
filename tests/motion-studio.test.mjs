// Tests for Motion Studio 2's spec model.
// Run: node --test tests/motion-studio.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSpec,
  frameState,
  specToJson,
  PIECE_TYPES,
  BRAND,
} from '../motion-studio/model.mjs';

test('defaults to a 16:9 title card with the T.im brand on', () => {
  const spec = buildSpec({ headline: 'Hill Legs' });
  assert.equal(spec.type, 'title-card');
  assert.equal(spec.aspect, '16:9');
  assert.equal(spec.width, 1920);
  assert.equal(spec.height, 1080);
  assert.equal(spec.duration, PIECE_TYPES['title-card'].duration);
  assert.equal(spec.frames, 150);
  assert.equal(spec.brand.enabled, true);
  assert.equal(spec.brand.navy, BRAND.navy);
});

test('title card keeps the kit timings and drops events past a shorter length', () => {
  const full = buildSpec({ headline: 'A' });
  assert.deepEqual(
    full.events.map((e) => e.type),
    ['hit', 'glitch', 'crt-off'],
  );
  const short = buildSpec({ headline: 'A', duration: 3 });
  // 3s ends before the 3.7s glitch, so only the hit survives.
  assert.deepEqual(short.events.map((e) => e.type), ['hit']);
});

test('lower thirds support vertical 9:16 with the kit safe zone', () => {
  const spec = buildSpec({ type: 'lower-third', aspect: '9:16', headline: 'Sets' });
  assert.equal(spec.width, 1080);
  assert.equal(spec.height, 1920);
  assert.deepEqual(spec.brand.safeZone, { top: 250, bottom: 400 });
});

test('the safe zone is cleared when the brand layer is off', () => {
  const spec = buildSpec({
    type: 'custom',
    aspect: '9:16',
    headline: 'Plain',
    brand: false,
  });
  assert.equal(spec.brand.enabled, false);
  assert.deepEqual(spec.brand.safeZone, { top: 0, bottom: 0 });
});

test('rejects unsupported combinations and bad input', () => {
  assert.throws(
    () => buildSpec({ type: 'title-card', aspect: '9:16', headline: 'x' }),
    /does not support 9:16/,
  );
  assert.throws(() => buildSpec({ type: 'nope', headline: 'x' }), /Unknown piece type/);
  assert.throws(() => buildSpec({ headline: '   ' }), /headline is required/);
  assert.throws(() => buildSpec({ headline: 'x', background: 'pink' }), /Unknown background/);
});

test('clamps duration and BPM, and trims text to its limits', () => {
  const spec = buildSpec({
    headline: 'x'.repeat(200),
    sub: '  spaced   out  ',
    duration: 999,
    bpm: 5,
  });
  assert.equal(spec.duration, 30);
  assert.equal(spec.bpm, 60);
  assert.equal(spec.scene.headline.length, 60);
  assert.equal(spec.scene.sub, 'spaced out');
});

test('falls back to defaults when numbers are not numbers', () => {
  const spec = buildSpec({ headline: 'x', duration: 'soon', bpm: 'fast' });
  assert.equal(spec.duration, PIECE_TYPES['title-card'].duration);
  assert.equal(spec.bpm, 120);
});

test('frameState ramps elements in order and flags the glitch and CRT off', () => {
  const spec = buildSpec({ headline: 'Title' });
  const start = frameState(spec, 0);
  assert.equal(start.headlineProgress, 0);
  assert.equal(start.crtOff, false);

  const mid = frameState(spec, 30); // 1.0s
  assert.ok(mid.headlineProgress > 0 && mid.headlineProgress <= 1);
  assert.ok(mid.eyebrowOpacity === 1);

  const glitch = frameState(spec, Math.round(3.7 * spec.fps));
  assert.equal(glitch.glitch, true);

  const end = frameState(spec, spec.frames);
  assert.equal(end.crtOff, true);
  assert.equal(end.subOpacity, 1);
});

test('frameState clamps frames outside the piece', () => {
  const spec = buildSpec({ headline: 'x' });
  assert.equal(frameState(spec, -10).t, 0);
  assert.equal(frameState(spec, 99999).t, spec.duration);
});

test('specToJson round-trips and ends with a newline', () => {
  const spec = buildSpec({ headline: 'Round trip' });
  const json = specToJson(spec);
  assert.ok(json.endsWith('\n'));
  assert.deepEqual(JSON.parse(json), spec);
});
