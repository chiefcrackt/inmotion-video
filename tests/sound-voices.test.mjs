// Smoke tests for the banjo and harmonica voices. A stubbed AudioContext
// records node creation, so this checks wiring and event dispatch, not sound.
// Run: node --test tests/sound-voices.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeKit, playEvents } from '../shared/sound/beat.mjs';

// Any property is a chainable stub node; `connect` returns the node.
function stubNode() {
  const target = function () {};
  return new Proxy(target, {
    get(t, p) {
      if (p === 'connect') return () => stubNode();
      if (p === 'start' || p === 'stop') return () => {};
      if (p in t) return t[p];
      t[p] = stubNode();
      return t[p];
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
    apply() {
      return stubNode();
    },
  });
}

function stubContext() {
  const calls = { oscillators: 0 };
  const ctx = new Proxy(
    { sampleRate: 44100 },
    {
      get(t, p) {
        if (p in t) return t[p];
        if (p === 'createOscillator') return () => (calls.oscillators++, stubNode());
        if (p === 'createBuffer')
          return (ch, len) => ({ getChannelData: () => new Float32Array(len) });
        if (typeof p === 'string' && p.startsWith('create')) return () => stubNode();
        return undefined;
      },
    },
  );
  return { ctx, calls };
}

test('banjo and harmonica voices exist and run without throwing', () => {
  const { ctx, calls } = stubContext();
  const kit = makeKit(ctx, stubNode());
  assert.equal(typeof kit.banjo, 'function');
  assert.equal(typeof kit.harmonica, 'function');
  const before = calls.oscillators;
  kit.banjo(0, 220, 0.03);
  kit.harmonica(0, 440, 0.5, 0.04);
  assert.ok(calls.oscillators > before, 'both voices create oscillators');
});

test('playEvents dispatches banjo and harmonica events to their voices', () => {
  const { ctx } = stubContext();
  const kit = makeKit(ctx, stubNode());
  const seen = [];
  const realBanjo = kit.banjo;
  const realHarm = kit.harmonica;
  kit.banjo = (...a) => (seen.push(['banjo', ...a]), realBanjo(...a));
  kit.harmonica = (...a) => (seen.push(['harmonica', ...a]), realHarm(...a));
  playEvents(kit, 0, {
    events: [
      { t: 0.5, kind: 'banjo', part: 'chords', f: 220, v: 0.03 },
      { t: 1.0, kind: 'harmonica', part: 'chords', f: 440, d: 0.5, v: 0.04 },
    ],
  });
  assert.equal(seen.length, 2);
  assert.equal(seen[0][0], 'banjo');
  assert.equal(seen[1][0], 'harmonica');
});
