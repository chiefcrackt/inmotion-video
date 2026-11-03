import { test } from 'node:test';
import assert from 'node:assert/strict';
import { create, beatAt } from '../brand-assets/model.mjs';
import { render, textLayout } from '../brand-assets/render.mjs';

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
    shadowBlur: 0,
    ty: 0,
    save() {
      stack.push({ a: this.globalAlpha, f: this.fillStyle, ty: this.ty });
    },
    restore() {
      const s = stack.pop();
      if (s) {
        this.globalAlpha = s.a;
        this.fillStyle = s.f;
        this.ty = s.ty;
      }
    },
    translate(x, y) {
      this.ty += y;
    },
    transform() {},
    scale() {},
    beginPath() {},
    closePath() {},
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
      drawn.push({
        ch,
        y: y + this.ty,
        alpha: this.globalAlpha,
        color: this.fillStyle,
        blur: this.shadowBlur,
      });
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

// Same layout the renderer uses: the stub measures every line at 10px per char.
const layoutFor = (s, factor = 1) =>
  textLayout(
    s.headline.toUpperCase().split('\n').filter(Boolean),
    (l) => l.length * 10,
    factor,
  );
const lineY = (i) => layoutFor(create('flow')).baselines[i];
const SUB_Y = () => layoutFor(create('flow')).subY;
const headlineYs = (drawn) => {
  const ys = new Set(layoutFor(create('flow')).baselines);
  return [...new Set(drawn.filter((d) => ys.has(d.y)).map((d) => d.y))].sort(
    (a, b) => a - b,
  );
};

test('the eyebrow stays solid while headline words build up and reveal', () => {
  const s = create('flow');
  s.motion = 'reveal';
  for (const t of [0.05, 0.2, 2.1, 3.9]) {
    const eyebrow = at(frame(s, t), 370);
    assert.ok(eyebrow.length > 0);
    assert.ok(eyebrow.every((d) => d.alpha === 1), `eyebrow faded at t=${t}`);
  }
});

test('headline builds up: each line stays on screen once it arrives', () => {
  const s = create('flow');
  assert.deepEqual(headlineYs(frame(s, 0.5)), [lineY(0)]);
  assert.deepEqual(
    headlineYs(frame(s, 2.5)),
    [lineY(0), lineY(1)],
  );
  assert.deepEqual(
    headlineYs(frame(s, 4.5)),
    [0, 1, 2].map((i) => lineY(i)),
  );
});

test('reveal eases only the newest headline line in from invisible', () => {
  const s = create('flow');
  s.motion = 'reveal';
  const newest = at(frame(s, 2.0), lineY(1) + 40); // reveal starts 40px low
  assert.ok(newest.length > 0 && newest.every((d) => d.alpha === 0));
  const earlier = at(frame(s, 2.0), lineY(0));
  assert.ok(earlier.every((d) => d.alpha === 1));
  assert.ok(at(frame(s, 2.6), lineY(1)).every((d) => d.alpha === 1));
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
  assert.equal(at(frame(s, 3.0), SUB_Y()).length, 0);
  const fading = at(frame(s, 5.0), SUB_Y());
  assert.ok(fading.length > 0 && fading.every((d) => d.alpha > 0 && d.alpha < 1));
  assert.ok(at(frame(s, 5.8), SUB_Y()).every((d) => d.alpha === 1));
});

test('cyber style adds a teal grid floor and a glow on the headline', () => {
  const classic = create('moving');
  const cyber = { ...create('moving'), style: 'cyber' };
  const glowAt = (drawn) => drawn.filter((d) => d.blur > 0).length;
  assert.equal(glowAt(frame(classic, 1)), 0);
  assert.ok(glowAt(frame(cyber, 1)) > 0);
  assert.ok(frame(cyber, 1).some((d) => d.color === '#E8C96A' && d.blur > 0));
});
