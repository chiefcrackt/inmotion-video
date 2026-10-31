import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bedEvents,
  bars,
  barLength,
  STYLES,
  KEYS,
} from '../shared/sound/beat.mjs';

test('length snaps to whole bars', () => {
  assert.equal(barLength(120), 2);
  assert.equal(bars(31, 120), 16);
  assert.equal(bars(0.4, 120), 1);
  const b = bedEvents({ style: 'cyber', bpm: 120, seconds: 31, ending: 'loop' });
  assert.equal(b.bars, 16);
  assert.equal(b.body, 32);
  assert.equal(b.total, 32);
});

test('endings add the right tail and hits', () => {
  const hit = bedEvents({ seconds: 8, ending: 'hit' });
  assert.ok(hit.total > hit.body);
  assert.ok(hit.events.some((e) => e.kind === 'stab' && e.t === hit.body));
  const loop = bedEvents({ seconds: 8, ending: 'loop' });
  assert.equal(loop.total, loop.body);
  assert.ok(loop.events.every((e) => e.t < loop.body));
  const fade = bedEvents({ seconds: 8, ending: 'fade' });
  assert.ok(fade.events.some((e) => e.kind === 'fadeOut'));
  const sweep = bedEvents({ seconds: 8, ending: 'sweep' });
  assert.ok(sweep.events.some((e) => e.kind === 'sweep'));
});

test('every style and key produces a full, sorted timeline', () => {
  for (const style of Object.keys(STYLES))
    for (const key of Object.keys(KEYS)) {
      const b = bedEvents({ style, key, seconds: 16 });
      assert.equal(b.bpm, STYLES[style].bpm);
      assert.ok(b.events.length > 20, style + key);
      for (let i = 1; i < b.events.length; i++)
        assert.ok(b.events[i].t >= b.events[i - 1].t);
      assert.ok(b.events.some((e) => e.kind === 'kick'));
    }
});

test('layers can be switched off and the riser intro holds the drums', () => {
  const b = bedEvents({
    seconds: 8,
    ending: 'loop',
    layers: { drums: false, hats: false, chords: false },
  });
  assert.ok(b.events.every((e) => e.kind === 'bass'));
  const r = bedEvents({ seconds: 8, intro: 'riser', ending: 'loop' });
  assert.ok(r.events.some((e) => e.kind === 'riser' && e.t === 0));
  assert.ok(
    r.events.filter((e) => e.kind === 'kick').every((e) => e.t >= r.bar),
  );
});

test('same settings give the same timeline', () => {
  const o = { style: 'drive', key: 'A', bpm: 140, seconds: 20 };
  assert.deepEqual(bedEvents(o), bedEvents(o));
});

test('arrangements set the length, accents and parts per section', async () => {
  const { makeSections, fitSections } = await import('../shared/sound/beat.mjs');
  const secs = makeSections('story');
  const b = bedEvents({ style: 'cyber', bpm: 120, sections: secs, ending: 'loop' });
  assert.equal(b.bars, 32);
  assert.equal(b.sections.length, 6);
  assert.equal(b.sections[2].start, 16);
  // build ends with a riser into the drop, and the drop opens with a sub
  assert.ok(b.events.some((e) => e.kind === 'riser' && e.t === 14));
  assert.ok(b.events.some((e) => e.kind === 'sub' && e.t === 16));
  // the intro has no drums and the breakdown has no kick
  assert.ok(!b.events.some((e) => e.part === 'drums' && e.t < 8));
  const bd = b.sections[3];
  assert.ok(!b.events.some((e) => e.kind === 'kick' && e.t >= bd.start && e.t < bd.end));
  const fit = fitSections(secs, 30, 120);
  assert.equal(fit.reduce((n, s) => n + s.bars, 0), 15);
  assert.ok(fit.every((s) => s.bars >= 1));
});

test('swing delays the off-beats and every event has a part', () => {
  const straight = bedEvents({ style: 'cyber', seconds: 4, swing: 0, ending: 'loop' });
  const swung = bedEvents({ style: 'cyber', seconds: 4, swing: 0.6, ending: 'loop' });
  const hat = (b) => b.events.find((e) => e.kind === 'hat').t;
  assert.ok(hat(swung) > hat(straight));
  for (const e of swung.events) assert.ok(e.part, e.kind);
});
