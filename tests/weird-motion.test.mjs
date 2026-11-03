import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toys, commands, svg } from '../weird-motion/artwork.mjs';

test('twenty toys with unique ids, two named actions and a label each', () => {
  assert.equal(toys.length, 20);
  assert.equal(new Set(toys.map((t) => t.id)).size, 20);
  for (const t of toys) {
    assert.equal(t.actions.length, 2, t.id);
    assert.ok(t.name && t.label, t.id);
  }
});

test('every toy produces finite vector commands in both actions and at every progress value', () => {
  for (const t of toys)
    for (const remix of [false, true])
      for (const p of [0.01, 0.2, 0.45, 0.6, 0.8, 1]) {
        const out = JSON.stringify(commands(t.id, p, remix));
        assert.ok(!/NaN|Infinity|undefined/.test(out), `${t.id} ${remix} ${p}`);
      }
});

test('each toy holds a final pose: the last frame equals the frame after it', () => {
  for (const t of toys)
    for (const remix of [false, true])
      assert.equal(
        JSON.stringify(commands(t.id, 1, remix)),
        JSON.stringify(commands(t.id, 1.2, remix)),
        `${t.id} ${remix}`,
      );
});

test('SVG markup is balanced and matches the generated files', () => {
  for (const t of toys)
    for (const id of [t.id, t.id + '-solo']) {
      const markup = svg(id);
      assert.equal(
        (markup.match(/<g[ >]/g) || []).length,
        (markup.match(/<\/g>/g) || []).length,
        id,
      );
      assert.equal(
        readFileSync(new URL(`../weird-motion/files/${id}.svg`, import.meta.url), 'utf8'),
        markup,
        id,
      );
    }
});
