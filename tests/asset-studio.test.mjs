import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initial,
  validate,
  transform,
  motions,
  splitLayer,
  entranceMotions,
} from '../asset-studio/model.mjs';
import { catalog } from '../asset-studio/catalog.mjs';
const layer = () => ({
  id: 'test',
  kind: 'asset',
  asset: 'icon:running-shoe',
  x: 50,
  y: 50,
  size: 45,
  rotation: 0,
  opacity: 100,
  motion: 'none',
  visible: true,
});
test('three packs expose 99 unique trusted assets', () => {
  assert.equal(catalog.length, 99);
  assert.equal(new Set(catalog.map((a) => a.id)).size, 99);
  assert(catalog.every((a) => a.src.startsWith('file:')));
});
test('saved scenes round trip without accepting URLs or unsafe settings', () => {
  const state = {
    ...initial(),
    layers: [
      layer(),
      {
        ...layer(),
        id: 'text',
        kind: 'text',
        text: '13.1 MI',
        fontSize: 80,
        color: '#e8c96a',
      },
    ],
  };
  const valid = validate(state);
  assert.equal(valid.layers.length, 2);
  assert.equal(valid.layers[1].text, '13.1 MI');
  for (const patch of [
    { asset: 'https://example.com/a.svg' },
    { x: NaN },
    { size: 0 },
    { opacity: 101 },
    { motion: 'url' },
    { rotation: 200 },
    { visible: 'yes' },
  ])
    assert.throws(() =>
      validate({ ...initial(), layers: [{ ...layer(), ...patch }] }),
    );
  assert.throws(() => validate({ ...initial(), format: 'constructor' }));
  assert.throws(() => validate({ ...initial(), duration: 3 }));
  assert.throws(() => validate({ ...initial(), layers: [layer(), layer()] }));
  assert.throws(() =>
    validate({
      ...initial(),
      layers: Array.from({ length: 13 }, (_, i) => ({
        ...layer(),
        id: 'layer-' + i,
      })),
    }),
  );
  assert.throws(() =>
    validate({
      ...state,
      layers: [{ ...state.layers[1], text: 'x'.repeat(241) }],
    }),
  );
  assert.throws(() =>
    validate({ ...state, layers: [{ ...state.layers[1], color: 'red' }] }),
  );
});
test('looping transforms close their loop and still PNGs ignore motion', () => {
  for (const motion of motions.filter((m) => !entranceMotions.includes(m))) {
    const l = { ...layer(), motion };
    assert.deepEqual(transform(l, 0, 4), transform(l, 4, 4));
    assert.deepEqual(transform(l, 1, 4, true), transform(layer(), 0, 4));
  }
  assert.equal(transform({ ...layer(), motion: 'pulse' }, 1, 4).scale, 1.08);
  assert.equal(
    transform({ ...layer(), motion: 'spin' }, 2, 4).rotation,
    Math.PI,
  );
  assert.equal(transform({ ...layer(), motion: 'pop' }, 0, 4).alpha, 0);
  assert.equal(transform({ ...layer(), motion: 'pop' }, 2, 4).alpha, 1);
});
test('modular graphics split into trusted aligned parts and enforce the layer limit', () => {
  const source = { ...layer(), asset: 'motion:route-pin', rotation: 25, x: 42 };
  const layers = splitLayer({ ...initial(), layers: [source] }, source.id);
  assert.equal(layers.length, 3);
  assert.equal(new Set(layers.map((l) => l.id)).size, 3);
  assert(
    layers.every(
      (l) =>
        l.asset.startsWith('part:route-pin:') &&
        l.x === 42 &&
        l.rotation === 25 &&
        l.size === source.size,
    ),
  );
  assert.equal(validate({ ...initial(), layers }).layers.length, 3);
  assert.throws(() =>
    splitLayer(
      {
        ...initial(),
        layers: Array.from({ length: 12 }, (_, i) => ({
          ...source,
          id: 'id-' + i,
        })),
      },
      'id-0',
    ),
  );
});
