import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initial,
  validate,
  newLayer,
  entranceProgress,
  motionOptions,
  suggestedMotion,
  splitLayer,
} from '../asset-studio/model.mjs';
test('entrances use seconds, start after their delay and hold their final frame', () => {
  const l = { delay: 0.4, entrance: 1.2 };
  assert.equal(entranceProgress(l, 0, 4), 0);
  assert.equal(entranceProgress(l, 0.4, 4), 0);
  assert(Math.abs(entranceProgress(l, 1, 4) - 0.5) < 1e-9);
  assert.equal(entranceProgress(l, 3.9, 4), 1);
  assert.equal(entranceProgress(l, 4, 4), 1);
});
test('motion choices fit the selected asset and text has type-on', () => {
  const choice = (asset) =>
    new Set(motionOptions(newLayer('asset', asset)).map((m) => m.value));
  assert(choice('motion:route-pin').has('drop'));
  assert(choice('motion:finish-tape').has('break'));
  assert(choice('motion:confetti').has('burst'));
  assert(choice('spotlight:feature-left').has('trace'));
  assert(!choice('icon:camera').has('break'));
  assert(!choice('motion:route-pin').has('type'));
  assert(motionOptions(newLayer('text')).some((m) => m.value === 'type'));
  assert.equal(
    suggestedMotion(newLayer('asset', 'motion:route-trail')),
    'trace',
  );
  assert.equal(suggestedMotion(newLayer('asset', 'motion:confetti')), 'burst');
  assert.equal(suggestedMotion(newLayer('text')), 'type');
});
test('old projects gain safe timing defaults, new timing and motion are validated', () => {
  const legacy = { ...newLayer('asset', 'icon:camera') };
  delete legacy.delay;
  delete legacy.entrance;
  const restored = validate({ ...initial(), layers: [legacy] });
  assert.equal(restored.layers[0].delay, 0);
  assert.equal(restored.layers[0].entrance, 1.4);
  for (const patch of [
    { motion: 'type' },
    { delay: -1 },
    { delay: 4 },
    { entrance: 0 },
    { delay: 3, entrance: 2 },
  ])
    assert.throws(() =>
      validate({ ...initial(), layers: [{ ...legacy, ...patch }] }),
    );
  assert.equal(
    validate({
      ...initial(),
      layers: [{ ...legacy, motion: 'draw', delay: 0.3, entrance: 1 }],
    }).layers[0].motion,
    'draw',
  );
  const pin = { ...newLayer('asset', 'motion:route-pin'), motion: 'drop' };
  const parts = splitLayer({ ...initial(), layers: [pin] }, pin.id);
  assert(parts.every((l) => l.motion === 'draw'));
  assert.equal(validate({ ...initial(), layers: parts }).layers.length, 3);
});
