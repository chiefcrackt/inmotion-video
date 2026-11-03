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

test('the eyebrow stays solid while headline words change and reveal', () => {
  const s = create('flow');
  s.motion = 'reveal';
  for (const t of [0.05, 0.2, 2.1, 3.9]) {
    const eyebrow = at(frame(s, t), 340);
    assert.ok(eyebrow.length > 0);
    assert.ok(eyebrow.every((d) => d.alpha === 1), `eyebrow faded at t=${t}`);
  }
});

test('reveal eases each headline word in from invisible as it arrives', () => {
  const s = create('flow');
  s.motion = 'reveal';
  const arriving = at(frame(s, 2.0), 780); // 'YOUR' has just appeared
  assert.ok(arriving.every((d) => d.alpha === 0));
  const settled = at(frame(s, 2.6), 780);
  assert.ok(settled.every((d) => d.alpha === 1));
});

test('glitch flashes once at the start of each word, not on a 1-second strobe', () => {
  const s = create('flow');
  s.motion = 'glitch';
  const colours = (t) => new Set(at(frame(s, t), 780).map((d) => d.color));
  assert.ok(colours(2.05).has('#2E9BAD')); // teal offset copy during the burst
  assert.ok(!colours(2.5).has('#2E9BAD')); // settled word is plain
  assert.ok(!colours(3.05).has('#2E9BAD') || beatAt(s, 3.05).elapsed < 0.18);
});

test('subline appears only in the last 20% of the loop and fades in', () => {
  const s = create('flow');
  assert.equal(at(frame(s, 3.0), 1130).length, 0);
  const fading = at(frame(s, 5.0), 1130);
  assert.ok(fading.length > 0 && fading.every((d) => d.alpha > 0 && d.alpha < 1));
  assert.ok(at(frame(s, 5.8), 1130).every((d) => d.alpha === 1));
});
