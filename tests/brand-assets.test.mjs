import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  create,
  validate,
  dimensions,
  headlineAt,
  cueTimes,
} from '../brand-assets/model.mjs';
test('templates round-trip as independent editable projects at production sizes', () => {
  for (const id of ['moving', 'flow', 'banner']) {
    const s = create(id);
    assert.deepEqual(validate(JSON.parse(JSON.stringify(s))), s);
    assert.deepEqual(
      dimensions(s),
      id === 'banner' ? [2560, 1440] : [1080, 1920],
    );
  }
  const a = create(),
    b = create();
  a.layers.waves = false;
  assert.equal(b.layers.waves, true);
});
test('video presents one headline line per beat and sound follows those beats', () => {
  const s = create('flow');
  assert.equal(headlineAt(s, 0), 'FIND');
  assert.equal(headlineAt(s, 2.1), 'YOUR');
  assert.equal(headlineAt(s, 4.1), 'FLOW');
  assert.equal(headlineAt(s, 6), 'FLOW');
  assert.deepEqual(cueTimes(s), [0.05, 2.05, 4.05]);
});
test('reject malformed imports before altering the editor', () => {
  for (const patch of [
    { preset: 'bad' },
    { duration: NaN },
    { volume: 101 },
    { motion: 'bad' },
    { layers: {} },
    { headline: { html: 'bad' } },
    { theme: '#FAB627' },
  ])
    assert.throws(() => validate({ ...create(), ...patch }));
});
