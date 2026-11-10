// Tests for recorded samples and the Acoustic Adventure style.
// Run: node --test tests/sound-samples.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { bedEvents, makeKit, playEvents, loadStyleSamples, STYLES } from '../shared/sound/beat.mjs';
import { loadSampleSet, pickNote, midiToFreq, resetSampleCache } from '../shared/sound/samples.mjs';

// fetch() stand-in that reads the repo's own files from disk.
const diskFetch = async (url) => {
  try {
    const buf = await readFile(fileURLToPath(url));
    return {
      ok: true,
      json: async () => JSON.parse(buf.toString('utf8')),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  } catch {
    return { ok: false };
  }
};

// Minimal audio context: records buffer sources and gain automation.
function fakeContext() {
  const log = { sources: [], chokes: 0, decoded: 0 };
  const param = (owner) => ({
    value: 1,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {},
    setTargetAtTime() {
      if (owner === 'gain') log.chokes++;
    },
  });
  const node = (extra = {}) => ({ connect: (n) => n, start() {}, stop() {}, ...extra });
  const ctx = {
    sampleRate: 48000,
    currentTime: 0,
    createGain: () => node({ gain: param('gain') }),
    createOscillator: () => node({ frequency: param(), detune: param(), type: '' }),
    createBiquadFilter: () => node({ frequency: param(), Q: param(), gain: param(), type: '' }),
    createBufferSource: () => {
      const s = node({ playbackRate: param(), buffer: null, start(t) { s.t = t; } });
      log.sources.push(s);
      return s;
    },
    createDynamicsCompressor: () => node({ threshold: param(), ratio: param(), knee: param(), attack: param(), release: param() }),
    createConvolver: () => node({ buffer: null }),
    createDelay: () => node({ delayTime: param() }),
    createWaveShaper: () => node({ curve: null, oversample: '' }),
    createStereoPanner: () => node({ pan: param() }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len), numberOfChannels: ch, length: len }),
    decodeAudioData: async (b) => (log.decoded++, { duration: 3.5, bytes: b.byteLength }),
    destination: node(),
  };
  return { ctx, log };
}

test('the steel guitar set loads from disk: 10 recorded notes covering the whole keyboard', async () => {
  const { ctx, log } = fakeContext();
  const set = await loadSampleSet(ctx, 'steel-guitar', diskFetch);
  assert.equal(set.notes.length, 10);
  assert.equal(log.decoded, 10);
  assert.ok(set.notes.every((n) => n.buffer.bytes > 10000), 'each note is a real MP3');
  for (let m = 0; m <= 108; m++) {
    const n = pickNote(set, midiToFreq(m));
    assert.ok(m >= n.lo && m <= n.hi, `midi ${m} has a zone`);
  }
  assert.equal(pickNote(set, 82.41).root, 40); // low E plays the E2 recording
});

test('Acoustic Adventure plays six-string voicings in guitar range, with no synth overlay', () => {
  assert.equal(STYLES.acoustic.samples, 'steel-guitar');
  for (const [groove] of STYLES.acoustic.grooves) {
    const bed = bedEvents({ style: 'acoustic', groove, seconds: 16, ending: 'loop' });
    const gtr = bed.events.filter((e) => e.kind === 'acoustic');
    assert.ok(gtr.length > 20, groove);
    assert.ok(gtr.every((e) => e.s >= 0 && e.s <= 5 && e.f >= 70 && e.f <= 700), groove);
    assert.equal(bed.events.filter((e) => e.kind === 'guitar').length, 0, 'no synth guitar on top');
    assert.equal(bed.mood, 'adventure');
  }
});

test('the human feel is repeatable: same settings give the same timeline', () => {
  const a = bedEvents({ style: 'acoustic', groove: 'strum', seconds: 12, ending: 'loop' });
  const b = bedEvents({ style: 'acoustic', groove: 'strum', seconds: 12, ending: 'loop' });
  assert.deepEqual(a.events, b.events);
  const downbeats = a.events.filter((e) => e.kind === 'acoustic' && e.s === 0).map((e) => e.t % 2.4);
  assert.ok(downbeats.some((t) => t > 0.0005), 'notes are nudged off the grid');
});

test('with samples, each string chokes its last note; without, the synth guitar stands in', async () => {
  const { ctx, log } = fakeContext();
  const samples = await loadStyleSamples(ctx, 'acoustic', diskFetch);
  assert.ok(samples['steel-guitar']);
  const kit = makeKit(ctx, ctx.destination, { samples });
  const bed = bedEvents({ style: 'acoustic', groove: 'strum', seconds: 6, ending: 'loop' });
  playEvents(kit, 0, bed);
  const plucks = bed.events.filter((e) => e.kind === 'acoustic').length;
  const gtr = log.sources.filter((s) => s.buffer && s.buffer.bytes); // shakers use noise buffers
  assert.equal(gtr.length, plucks);
  assert.ok(gtr.every((s) => s.playbackRate.value > 0.5 && s.playbackRate.value < 2.2));
  assert.ok(log.chokes > 0, 'restruck strings are damped');

  const plain = fakeContext();
  const synth = makeKit(plain.ctx, plain.ctx.destination);
  let fallback = 0;
  synth.guitar = () => fallback++;
  synth.acoustic(0, 110, 0.03);
  assert.equal(fallback, 1);
  assert.equal(plain.log.sources.filter((s) => s.buffer && s.buffer.bytes).length, 0);
});

test('styles without samples, and failed loads, resolve to the synth fallback', async () => {
  const { ctx } = fakeContext();
  assert.deepEqual(await loadStyleSamples(ctx, 'cyber', diskFetch), {});
  resetSampleCache();
  assert.deepEqual(await loadStyleSamples(ctx, 'acoustic', async () => ({ ok: false })), {});
});

test('Campfire and Folk Anthem play the real guitar in every groove', () => {
  for (const style of ['campfire', 'folk']) {
    assert.equal(STYLES[style].samples, 'steel-guitar');
    for (const [groove] of STYLES[style].grooves) {
      const bed = bedEvents({ style, groove, seconds: 16, ending: 'loop' });
      const gtr = bed.events.filter((e) => e.kind === 'acoustic');
      assert.ok(gtr.length > 20, style + groove);
      assert.ok(gtr.every((e) => e.s >= 0 && e.s <= 5 && e.f >= 70 && e.f <= 700), style + groove);
      assert.equal(bed.events.filter((e) => e.kind === 'guitar').length, 0, style + ' has no synth overlay');
    }
  }
});

test('older guitar styles and the adventure mood switch to the real guitar when loaded', async () => {
  for (const style of ['trail', 'sunny', 'mountain', 'openroad']) assert.equal(STYLES[style].samples, 'steel-guitar', style);
  const { ctx, log } = fakeContext();
  assert.ok((await loadStyleSamples(ctx, 'cyber', diskFetch, 'adventure'))['steel-guitar'], 'adventure mood loads guitar');
  const samples = await loadStyleSamples(ctx, 'trail', diskFetch);
  const kit = makeKit(ctx, ctx.destination, { samples });
  const bed = bedEvents({ style: 'trail', groove: 'strum', seconds: 6, ending: 'loop' });
  playEvents(kit, 0, bed);
  const gtr = log.sources.filter((s) => s.buffer && s.buffer.bytes);
  assert.equal(gtr.length, bed.events.filter((e) => e.kind === 'guitar').length);
  assert.ok(log.chokes > 0, 'same-register notes damp each other');
});
