import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assets, svg } from '../product-spotlight/assets.mjs';
import { templates, templateScene } from '../product-spotlight/templates.mjs';
import { validate } from '../asset-studio/model.mjs';
import { byId } from '../asset-studio/catalog.mjs';
test('18 designs have blank artwork, editable wording and trusted aligned parts', () => {
  assert.equal(assets.length, 18);
  assert.equal(templates.size, 28);
  assert.equal(new Set(assets.map((a) => a.id)).size, 18);
  assert.equal(
    assets.reduce((n, a) => n + a.layers.length, 0),
    46,
  );
  for (const category of ['product', 'features', 'experience'])
    assert.equal(assets.filter((a) => a.category === category).length, 6);
  for (const a of assets) {
    assert.doesNotMatch(svg(a), /<(?:text|script|image|foreignObject)\b/);
    const doc = JSON.parse(
      readFileSync(
        new URL(
          '../product-spotlight/files/templates/' + a.id + '.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    assert.equal(doc.tool, 'asset-studio');
    assert.equal(doc.version, 1);
    const scene = validate(doc.payload.scene);
    assert.deepEqual(scene, validate(templateScene('spotlight:' + a.id)));
    assert.equal(scene.format, 'portrait');
    assert.equal(
      scene.layers.filter((l) => l.kind === 'text').length,
      a.texts.length,
    );
    const item = byId.get('spotlight:' + a.id);
    assert.equal(item.parts.length, a.layers.length);
    for (const text of a.texts)
      assert(
        text.x >= 0 &&
          text.x <= a.width &&
          text.y >= 0 &&
          text.y <= a.height &&
          text.width <= a.width,
      );
  }
  assert.throws(() => templateScene('https://example.com/template.json'));
});
