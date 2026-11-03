import { test } from 'node:test';
import assert from 'node:assert/strict';
import { create, beatAt } from '../brand-assets/model.mjs';
import { render } from '../brand-assets/render.mjs';

// Stub 2D context that records every glyph drawn with its alpha and colour.
function recorder() {
  const stack = [];
  const drawn = [];
  const ctx = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    save() {
      stack.push({ a: this.globalAlpha, f: this.fillStyle });
    },
    restore() {
      const s = stack.pop();
      if (s) {
        this.globalAlpha = s.a;
        this.fillStyle = s.f;
      }
    },
    translate() {},
    transform() {},
    scale() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    arc() {},
    fillRect() {},
    strokeRect() {},
    setLineDash() {},
    measureText: (str) => ({ width: String(str).length * 10 }),
    fillText(ch, x, y) {
      drawn.push({ ch, y, alpha: this.globalAlpha, color: this.fillStyle });
    },
  };
  return { ctx, drawn };
}

function frame(s, time) {
  const { ctx, drawn } = recorder();
  render(ctx, s, { time, video: true });
  return drawn;
}

// Glyphs drawn at a given baseline, so each text block can be checked alone.
const at = (drawn, y) => drawn.filter((d) => d.y === y);

test('beatAt splits the loop evenly and reports time since each word appeared', () => {
  const s = create('flow');
  assert.deepEqual(
    [beatAt(s, 0).line, beatAt(s, 2.0).line, beatAt(s, 4.0).line],
    ['FIND', 'YOUR', 'FLOW'],
  );
  assert.ok(Math.abs(beatAt(s, 2.5).elapsed - 0.5) < 1e-9);
  assert.equal(beatAt(s, 6).index, 2);
});

// Still-layout baseline for line i of an n-line headline (matches render.mjs).
const lineY = (i, n, factor = 1) => {
  const size = Math.min(265 * factor, 650 / Math.max(1, n));
  return 450 + size * 0.86 + i * size;
};
const headlineYs = (drawn) =>
  [...new Set(drawn.filter((d) => d.y < 1100 && d.y > 400).map((d) => d.y))]
    .map((y) => Math.round(y))
    .sort((a, b) => a - b);

test('the eyebrow stays solid while headline words build up and reveal', () => {
  const s = create('flow');
  s.motion = 'reveal';
  for (const t of [0.05, 0.2, 2.1, 3.9]) {
    const eyebrow = at(frame(s, t), 340);
    assert.ok(eyebrow.length > 0);
    assert.ok(eyebrow.every((d) => d.alpha === 1), `eyebrow faded at t=${t}`);
  }
});

test('headline builds up: each line stays on screen once it arrives', () => {
  const s = create('flow');
  assert.deepEqual(headlineYs(frame(s, 0.5)), [Math.round(lineY(0, 3))]);
  assert.deepEqual(
    headlineYs(frame(s, 2.5)),
    [Math.round(lineY(0, 3)), Math.round(lineY(1, 3))],
  );
  assert.deepEqual(
    headlineYs(frame(s, 4.5)),
    [0, 1, 2].map((i) => Math.round(lineY(i, 3))),
  );
});

test('reveal eases only the newest headline line in from invisible', () => {
  const s = create('flow');
  s.motion = 'reveal';
  const newest = at(frame(s, 2.0), lineY(1, 3));
  assert.ok(newest.length > 0 && newest.every((d) => d.alpha === 0));
  const earlier = at(frame(s, 2.0), lineY(0, 3));
  assert.ok(earlier.every((d) => d.alpha === 1));
  assert.ok(at(frame(s, 2.6), lineY(1, 3)).every((d) => d.alpha === 1));
});

test('glitch flashes the newest line once at the start of each word', () => {
  const s = create('flow');
  s.motion = 'glitch';
  const teal = (t) =>
    frame(s, t).some((d) => d.color === '#2E9BAD' && d.y > 400 && d.y < 1100);
  assert.ok(teal(2.05));
  assert.ok(!teal(2.5));
});

test('subline appears only in the last 20% of the loop and fades in', () => {
  const s = create('flow');
  assert.equal(at(frame(s, 3.0), 1130).length, 0);
  const fading = at(frame(s, 5.0), 1130);
  assert.ok(fading.length > 0 && fading.every((d) => d.alpha > 0 && d.alpha < 1));
  assert.ok(at(frame(s, 5.8), 1130).every((d) => d.alpha === 1));
});
