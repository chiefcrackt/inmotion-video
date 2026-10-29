import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTORY } from '../shared/sound/presets.mjs';
import {
  preset,
  layer,
  random,
  quickEdit,
  activeLayers,
  duration,
} from '../shared/sound/model.mjs';
import { dryData, protect } from '../shared/sound/engine.mjs';
import { encodeWav } from '../shared/sound/wav.mjs';
test('30 varied factory presets round trip with versioned schema', () => {
  assert.equal(FACTORY.length, 30);
  assert.equal(new Set(FACTORY.map((p) => JSON.stringify(p.layers))).size, 30);
  for (const p of FACTORY)
    assert.deepEqual(preset(JSON.parse(JSON.stringify(p))), p);
  assert.throws(() => preset({ version: 2, layers: [] }));
});
test('seed reproduces noise and modulation audio', () => {
  const l = layer({ source: 'noise', duration: 0.1 });
  assert.deepEqual(dryData(l, 44100, 123), dryData(l, 44100, 123));
  assert.notDeepEqual(dryData(l, 44100, 123), dryData(l, 44100, 124));
  assert.equal(random(2)(), random(2)());
});
test('quick controls modify actual generated audio', () => {
  const p = FACTORY[0],
    q = quickEdit(p, { duration: 2, pitch: 12, intensity: 0.5, texture: 0.5 });
  assert.equal(q.layers[0].duration, p.layers[0].duration * 2);
  assert.equal(q.layers[0].volume, p.layers[0].volume * 0.5);
  assert.notDeepEqual(
    dryData(q.layers[0], 44100, 1)[0].slice(0, 100),
    dryData(p.layers[0], 44100, 1)[0].slice(0, 100),
  );
});
test('solo/mute and timing include effects tails', () => {
  const p = preset(FACTORY[0]);
  p.layers[0] = layer({
    start: 2,
    duration: 1,
    reverb: 1,
    reverbTime: 2,
    solo: true,
  });
  p.layers[1].mute = true;
  assert.equal(activeLayers(p).length, 1);
  assert.equal(duration(p), 5);
  p.layers[0].mute = true;
  assert.equal(activeLayers(p).length, 0);
});
test('sample trim, rate and reverse use source frames correctly', () => {
  const data = Float32Array.from({ length: 100 }, (_, i) => i / 100),
    sample = {
      numberOfChannels: 1,
      sampleRate: 100,
      getChannelData: () => data,
    };
  const l = layer({
    source: 'sample',
    duration: 0.1,
    trim: 0.2,
    pitch: 12,
    fadeIn: 0,
    fadeOut: 0,
  });
  const d = dryData(l, 100, 1, sample)[0];
  assert.ok(Math.abs(d[0] - 0.2) < 1e-6);
  assert.ok(Math.abs(d[1] - 0.22) < 1e-6);
  assert.deepEqual(
    dryData({ ...l, reverse: true }, 100, 1, sample)[0],
    d.slice().reverse(),
  );
});
test('peak protection preserves stereo ratios and finite silence', () => {
  const a = [new Float32Array([2, -2]), new Float32Array([1, -1])],
    r = protect(a);
  assert.equal(r.peak, 2);
  assert.ok(Math.abs(a[0][0] - 0.98) < 1e-6);
  assert.ok(Math.abs(a[1][0] - 0.49) < 1e-6);
  assert.deepEqual(protect([new Float32Array(2)], true), { peak: 0, gain: 1 });
});
test('WAV is interleaved stereo 16 bit PCM with exact header', () => {
  const b = {
      numberOfChannels: 2,
      sampleRate: 48000,
      length: 2,
      getChannelData: (c) =>
        c ? new Float32Array([0.5, -0.5]) : new Float32Array([1, -1]),
    },
    data = encodeWav(b),
    v = new DataView(data);
  assert.equal(data.byteLength, 52);
  assert.equal(v.getUint32(24, true), 48000);
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getInt16(44, true), 32767);
  assert.equal(v.getInt16(46, true), 16384);
  assert.equal(v.getInt16(48, true), -32768);
  assert.equal(v.getUint32(40, true), 8);
});
