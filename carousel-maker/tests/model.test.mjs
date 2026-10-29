import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templates, clone, move, crc32, zipStore } from '../model.mjs';
test('six distinct template decks and independent slide copies', () => {
  assert.equal(templates.length, 6);
  const slides = clone(templates[0].slides);
  slides[0].title = 'Changed';
  assert.notEqual(templates[0].slides[0].title, 'Changed');
  const original = slides[0];
  move(slides, 0, 3);
  assert.equal(slides[3], original);
});
test('ZIP headers, offsets and checksums match contents', async () => {
  const data = new TextEncoder().encode('123456789');
  assert.equal(crc32(data), 0xcbf43926);
  const bytes = new Uint8Array(
      await zipStore([{ name: 'slide-01.png', data }]).arrayBuffer(),
    ),
    v = new DataView(bytes.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint32(14, true), crc32(data));
  const offset = 30 + 12 + data.length;
  assert.equal(v.getUint32(offset, true), 0x02014b50);
  assert.equal(v.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(v.getUint32(bytes.length - 6, true), offset);
});

import { defaults, photoSettings, photoGeometry } from '../photo.mjs';
test('photo geometry fills/fits, positions crop, handles rotation and old drafts', () => {
  assert.deepEqual(photoSettings({}), defaults);
  let g = photoGeometry(200, 100, 100, 100, defaults);
  assert.equal(g.scale, 1);
  assert.equal(g.x, 50);
  g = photoGeometry(200, 100, 100, 100, { ...defaults, x: 100 });
  assert.equal(g.x, 100);
  g = photoGeometry(200, 100, 100, 100, { ...defaults, fit: 'contain' });
  assert.equal(g.scale, 0.5);
  g = photoGeometry(200, 100, 100, 200, { ...defaults, rotation: 90 });
  assert.equal(g.scale, 1);
  g = photoGeometry(200, 100, 100, 100, { ...defaults, zoom: 2 });
  assert.equal(g.scale, 2);
});
import { makeElement, validProject } from '../elements.mjs';
test('editor elements and project import validation', () => {
  const s = {
    slides: clone(templates[0].slides),
    height: 1350,
    palette: palettesForTest(),
    font: 'Arial',
    handle: '@test',
    project: 'Test',
  };
  s.slides[0].elements = [
    makeElement('text', s.palette),
    makeElement('chart', s.palette),
  ];
  assert.equal(validProject(s), true);
  const duplicate = clone(s.slides[0].elements[0]);
  duplicate.x = 500;
  assert.notEqual(s.slides[0].elements[0].x, 500);
  s.slides[0].elements[0].src = 'https://external/image.png';
  assert.equal(validProject(s), false);
});
function palettesForTest() {
  return ['#0e1a2e', '#f6f4ef', '#e8c96a'];
}
