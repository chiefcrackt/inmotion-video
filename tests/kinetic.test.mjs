// The shared kinetic text engine (shared/kinetic.js): timing, layout, morph
// pairing, determinism, green-screen safety, and that every style ends on the
// plain text. A fake canvas records what would be drawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const window = {};
vm.runInNewContext(readFileSync('shared/kinetic.js', 'utf8'), { window, Math, JSON, Map, Array, String, Float32Array });
const K = window.TimKinetic;
const STYLES = K.styles.map((s) => s[0]).filter((s) => s !== 'original');

// 20px per character; records each fillText with its effective position, scale and alpha.
function fakeCanvas() {
  const calls = [];
  let st = { tx: 0, ty: 0, s: 1, sy: 1, a: 1 };
  const stack = [];
  const c = {
    font: '900 40px Barlow',
    letterSpacing: '0px',
    fillStyle: '#fff',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    get globalAlpha() { return st.a; },
    set globalAlpha(v) { st.a = v; },
    save() { stack.push({ ...st }); },
    restore() { st = stack.pop(); },
    translate(x, y) { st.tx += x * st.s; st.ty += y * st.sy; },
    scale(x, y) { st.s *= x; st.sy *= y; },
    beginPath() {}, rect() {}, clip() {},
    measureText: (s) => ({ width: Array.from(s).length * 20 }),
    fillText(text, x, y) { calls.push({ text, x: st.tx + x * st.s, y: st.ty + y * st.sy, s: st.s, sy: st.sy, a: st.a }); },
  };
  return { c, calls };
}
const block = { lines: [{ text: 'ONE STEP', x: 0, y: 100 }, { text: 'AT A TIME', x: 0, y: 150 }], align: 'left', len: 1, seed: 3 };
// Every glyph position drawn, as "char@x,y". Slice and Split draw a line once per
// clipped band; the fake canvas doesn't clip, so each position is counted once.
function glyphs(calls) {
  const out = new Set();
  for (const k of calls) Array.from(k.text).forEach((ch, i) => { if (ch !== ' ') out.add(`${ch}@${Math.round(k.x + i * 20 * k.s)},${Math.round(k.y)}`); });
  return [...out].sort();
}
// Values from the engine's sandbox, as plain data.
const plainData = (v) => JSON.parse(JSON.stringify(v));

test('style lists in the engine, Text Motion and Title Maker agree', () => {
  const tm = readFileSync('text-motion/index.html', 'utf8');
  const tk = readFileSync('title-maker/index.html', 'utf8');
  for (const id of STYLES) {
    assert.match(tm, new RegExp(`<option value="${id}">`), `Text Motion offers ${id}`);
    assert.match(tk, new RegExp(`data-g="kin" data-v="${id}"`), `Title Maker offers ${id}`);
  }
  for (const [id] of K.morphs) {
    assert.match(tm, new RegExp(`id="morph"[\\s\\S]*<option value="${id}">`), `Text Motion morph ${id}`);
    assert.match(tk, new RegExp(`data-g="morph" data-v="${id}"`), `Title Maker morph ${id}`);
  }
});

test('staggered units start in order and the last lands at the entrance length', () => {
  const n = 8, len = 1.2;
  assert.equal(K._unitProgress(n - 1, n, len, len), 1);
  assert.ok(K._unitProgress(n - 1, n, len - 0.05, len) < 1);
  assert.equal(K._unitProgress(0, n, 0, len), 0);
  for (let i = 1; i < n; i++) assert.ok(K._unitProgress(i, n, 0.5, len) <= K._unitProgress(i - 1, n, 0.5, len));
  assert.equal(K._unitProgress(0, 1, len, len), 1, 'a single unit also lands on time');
});

test('layout keeps alignment and groups words', () => {
  const L = K._layoutWith((s) => s.length * 10, [{ text: 'AB CD', x: 100, y: 0 }], 'center', 40);
  assert.equal(L.lines[0].x0, 75);
  assert.equal(L.glyphs.length, 4);
  assert.deepEqual(plainData(L.words.map((w) => w.glyphs.map((g) => g.ch).join(''))), ['AB', 'CD']);
  const R = K._layoutWith((s) => s.length * 10, [{ text: 'AB', x: 100, y: 0 }], 'right', 40);
  assert.equal(R.lines[0].x1, 100);
});

test('word to word pairs shared letters nearest in reading order', () => {
  const A = K._layoutWith((s) => s.length * 10, [{ text: 'RUN', x: 0, y: 0 }], 'left', 40);
  const B = K._layoutWith((s) => s.length * 10, [{ text: 'RACE DAY', x: 0, y: 0 }], 'left', 40);
  const m = K._match(A.glyphs, B.glyphs);
  assert.equal(m.pairs[0], 0, 'R stays R');
  assert.equal(m.pairs.filter((p) => p >= 0).length, 1);
  const T = K._match(
    K._layoutWith((s) => s.length, [{ text: 'TRAILS', x: 0, y: 0 }], 'left', 1).glyphs,
    K._layoutWith((s) => s.length, [{ text: 'ROADS', x: 0, y: 0 }], 'left', 1).glyphs,
  );
  assert.deepEqual(plainData(T.pairs), [1, -1, 2, -1, 5], 'R, A and S travel; O and D are new');
});

test('Original returns false so the tool keeps its own entrance', () => {
  const { c } = fakeCanvas();
  assert.equal(K.draw(c, { ...block, t: 0.5, style: 'original' }), false);
  assert.equal(K.draw(c, { ...block, t: 0.5, style: 'rise' }), false, 'tool-specific styles are left to the tool');
});

test('every style ends on the plain text, in place, fully opaque', () => {
  const plain = fakeCanvas();
  plain.c.fillText('ONE STEP', 0, 100);
  plain.c.fillText('AT A TIME', 0, 150);
  const want = glyphs(plain.calls);
  for (const style of STYLES) {
    const { c, calls } = fakeCanvas();
    assert.equal(K.draw(c, { ...block, t: 1.5, style }), true, style);
    assert.deepEqual(glyphs(calls), want, `${style} final frame`);
    assert.ok(calls.every((k) => k.a === 1 && k.s === 1 && k.sy === 1), `${style} has no leftover fade or scale`);
  }
});

test('nothing is drawn before an entrance starts', () => {
  for (const style of STYLES) {
    const { c, calls } = fakeCanvas();
    K.draw(c, { ...block, t: -0.2, style });
    assert.equal(calls.length, 0, style);
  }
});

test('the same moment always draws the same frame (scrub, preview and export match)', () => {
  for (const style of STYLES) {
    const a = fakeCanvas(), b = fakeCanvas();
    K.draw(a.c, { ...block, t: 0.37, style });
    K.draw(b.c, { ...block, t: 0.37, style });
    assert.deepEqual(a.calls, b.calls, style);
  }
  assert.equal(K._noiseChar('A', 3, 2, 10), K._noiseChar('A', 3, 2, 10));
  assert.match(K._noiseChar('a', 3, 2, 10), /[a-z0-9#%&*+=/<>?]/);
});

test('green-screen mode never draws part-transparent text', () => {
  const morphs = ['glide', 'scramble'];
  for (const style of STYLES)
    for (const t of [0.05, 0.2, 0.4, 0.6, 0.8]) {
      const { c, calls } = fakeCanvas();
      K.draw(c, { ...block, t, style, opaque: true });
      assert.ok(calls.every((k) => k.a === 1), `${style} at ${t}`);
    }
  for (const morph of morphs)
    for (const k of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const { c, calls } = fakeCanvas();
      K.draw(c, { ...block, t: 3 + k, style: 'original', opaque: true, to: { lines: [{ text: 'ONE MILE', x: 0, y: 100 }] }, morph, morphAt: 3, morphLen: 1 });
      assert.ok(calls.every((x) => x.a === 1), `${morph} at ${k}`);
    }
});

test('morph phases: before, during and after, on its own clock', () => {
  const spec = { ...block, style: 'cascade', to: { lines: [{ text: 'GO', x: 0, y: 100 }] }, morph: 'glide', morphAt: 2, morphLen: 1 };
  assert.equal(K.phase({ ...spec, t: 1.9 }).state, 'from');
  assert.equal(K.phase({ ...spec, t: 2.5 }).state, 'morph');
  assert.equal(K.phase({ ...spec, t: 3.1 }).state, 'to');
  assert.equal(K.phase({ ...spec, t: 0.2, mt: 3.1 }).state, 'to', 'a Reverse exit replays t but the morph stays finished');
  assert.equal(K.whole({ ...spec, t: 2.5 }), true);
  assert.equal(K.phase({ ...spec, morph: 'none', t: 2.5 }).state, 'from');
  // After the morph, a replayed entrance runs on the new words.
  const { c, calls } = fakeCanvas();
  K.draw(c, { ...spec, t: 0.3, mt: 3.5 });
  assert.ok(calls.every((k) => 'GO'.includes(k.text)), 'replay uses the new text');
});

test('word punch shows one word at a time, then the full phrase', () => {
  const words = [0.05, 0.3, 0.55, 0.8].map((t) => {
    const { c, calls } = fakeCanvas();
    K.draw(c, { ...block, t, style: 'punch' });
    return calls.map((k) => k.text).join('');
  });
  // Five words share a 1s entrance: 0.2s each.
  assert.deepEqual(words, ['ONE', 'STEP', 'AT', 'TIME']);
  const end = fakeCanvas();
  K.draw(end.c, { ...block, t: 1.4, style: 'punch' });
  assert.deepEqual(plainData(end.calls.map((k) => k.text)), ['ONE STEP', 'AT A TIME']);
});
