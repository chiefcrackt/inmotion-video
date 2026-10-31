// Text overflow warnings and Fit text, run in Node with a stand-in canvas.
// The stand-in measures every character as 0.55 × font size, which is close
// enough to Barlow Condensed bold to exercise wrapping, line limits and fit.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakeContext() {
  const ctx = {
    font: '10px x',
    measureText(t) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] || 10);
      return { width: String(t).length * size * 0.55 };
    },
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(ctx, {
    get: (o, k) => (k in o ? o[k] : () => {}),
    set: (o, k, v) => ((o[k] = v), true),
  });
}
function fakeCanvas() {
  const ctx = fakeContext();
  return { getContext: () => ctx };
}
globalThis.document = { createElement: () => fakeCanvas() };
globalThis.window = {};

const { render, fitText, textSizes, textLimits } = await import(
  '../render.mjs'
);
const state = {
  palette: ['#0e1a2e', '#f6f4ef', '#e8c96a'],
  font: 'Barlow Condensed',
  height: 1350,
  handle: '@tristan.inmotion',
};
const slide = (extra) => ({
  layout: 'text',
  kicker: 'FIELD NOTES',
  title: 'Easy means easy.',
  body: 'Let your easy days support your hard days.',
  stat: '',
  photo: '',
  ...extra,
});
const issuesFor = (s, st = state) => {
  const c = fakeCanvas();
  render(c, s, 0, 1, st, null);
  return c.overflow;
};
const areas = (issues) => [...new Set(issues.map((i) => i.area))].sort();

test('short text has no warnings and old slides keep default sizes', () => {
  assert.deepEqual(issuesFor(slide()), []);
  assert.deepEqual(textSizes(slide()), { title: 78, body: 32 });
  assert.deepEqual(textSizes(slide({ layout: 'cover' })), {
    title: 102,
    body: 32,
  });
  assert.deepEqual(textSizes(slide({ layout: 'list' })), {
    title: 78,
    body: 39,
  });
  // Out-of-range or junk values are clamped, never trusted.
  assert.equal(textSizes(slide({ titleSize: 5 })).title, 56);
  assert.equal(textSizes(slide({ bodySize: 999 })).body, 48);
  assert.equal(textSizes(slide({ titleSize: 'x' })).title, 78);
  assert.equal(textSizes(slide({ titleSize: null })).title, 78);
});

test('flags hidden headline lines, wide words and long description', () => {
  const longTitle = 'One two three\nfour\nfive\nsix\nseven\neight';
  assert.deepEqual(areas(issuesFor(slide({ title: longTitle }))), [
    'headline',
  ]);
  const wide = issuesFor(slide({ title: 'Ultramarathonerextraordinaire!!' }));
  assert.match(wide[0].message, /too wide/);
  const body = Array(9).fill('A line of body text').join('\n');
  assert.deepEqual(areas(issuesFor(slide({ body }))), ['content']);
});

test('flags character limits on heading, stat, tables and handle', () => {
  assert.deepEqual(areas(issuesFor(slide({ kicker: 'K'.repeat(60) }))), [
    'eyebrow',
  ]);
  assert.deepEqual(
    areas(issuesFor(slide({ layout: 'stats', stat: 'S'.repeat(30) }))),
    ['highlight'],
  );
  const table = Array(11).fill('A | B').join('\n');
  assert.deepEqual(
    areas(issuesFor(slide({ layout: 'comparison', body: table }))),
    ['table'],
  );
  assert.deepEqual(
    areas(issuesFor(slide(), { ...state, handle: '@'.repeat(50) })),
    ['footer'],
  );
});

test('flags text boxes that run past their bottom', () => {
  const el = {
    id: 'e1',
    type: 'text',
    x: 0,
    y: 0,
    w: 300,
    h: 60,
    size: 48,
    spacing: 1.1,
    text: 'This sentence is far too long for a small box',
    align: 'left',
    color: '#ffffff',
    fill: '#000000',
    opacity: 1,
    radius: 0,
    border: 0,
    font: 'inherit',
  };
  assert.deepEqual(areas(issuesFor(slide({ elements: [el] }))), [
    'element:e1',
  ]);
  // Hidden elements aren't drawn, so they aren't flagged.
  assert.deepEqual(
    issuesFor(slide({ elements: [{ ...el, hidden: true }] })),
    [],
  );
});

test('Fit text shrinks to fit without mutating the original slide', () => {
  // 23 short words wrap to 6 lines at 78px (5 show), 5 lines when smaller.
  const original = slide({ title: Array(23).fill('Word').join(' ') });
  const before = JSON.stringify(original);
  assert.deepEqual(areas(issuesFor(original)), ['headline']);
  const { slide: out, changed, remaining } = fitText(original, state);
  assert.equal(JSON.stringify(original), before);
  assert.ok(changed);
  assert.ok(out.titleSize < 78 && out.titleSize >= textLimits.headline.min);
  assert.deepEqual(remaining, []);
});

test('Fit text stops at the readable minimum and reports what is left', () => {
  const huge = slide({ title: Array(40).fill('Word').join(' ') });
  const { slide: out, remaining } = fitText(huge, state);
  assert.equal(out.titleSize, textLimits.headline.min);
  assert.ok(remaining.some((i) => i.area === 'headline'));
});

test('Fit text leaves size alone when shrinking cannot help', () => {
  // Eight separate lines never fit in a 7-line description at any size.
  const lines = slide({ body: Array(8).fill('Short line').join('\n') });
  const { slide: out, changed, remaining } = fitText(lines, state);
  assert.equal(changed, false);
  assert.equal(out.bodySize, undefined);
  assert.ok(remaining.some((i) => i.area === 'content'));
});

test('Fit text shrinks a crowded description, leaves fitting slides alone', () => {
  const crowded = slide({
    stat: 'NEW PB',
    body: [
      'Four lines here',
      'that run long',
      'into the highlight',
      'box below them',
      'and one more',
    ].join('\n'),
  });
  assert.ok(issuesFor(crowded).some((i) => /highlight box/.test(i.message)));
  const { slide: out } = fitText(crowded, state);
  assert.ok(out.bodySize < 32);
  assert.ok(!issuesFor(out).some((i) => /highlight box/.test(i.message)));
  const fine = fitText(slide(), state);
  assert.equal(fine.changed, false);
});

test('Fit text shrinks text boxes but never below 26px', () => {
  const el = {
    id: 'e1',
    type: 'text',
    x: 0,
    y: 0,
    w: 400,
    h: 120,
    size: 60,
    spacing: 1.1,
    text: 'Three words fit',
    align: 'left',
    color: '#ffffff',
    fill: '#000000',
    opacity: 1,
    radius: 0,
    border: 0,
    font: 'inherit',
  };
  const { slide: out } = fitText(
    slide({ elements: [{ ...el, text: 'Some longer text in here' }] }),
    state,
  );
  assert.ok(out.elements[0].size < 60 && out.elements[0].size >= 26);
  const tiny = fitText(
    slide({ elements: [{ ...el, size: 20, h: 10, text: 'Way too much' }] }),
    state,
  );
  assert.equal(tiny.slide.elements[0].size, 20);
});
