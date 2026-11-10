import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newProject,
  addOutline,
  validateBackup,
  safeUrl,
} from '../content-planner/model.mjs';
test('outline conversion is additive and preserves filming work', () => {
  const p = newProject('Race');
  p.outline =
    '- Opening hook\nB-roll: Shoes\nGear: Microphone\nLocation: Track';
  assert.equal(addOutline(p), 4);
  p.items[0].status = 'captured';
  p.items[0].notes = 'Take 2';
  p.outline += '\nFinal thoughts';
  assert.equal(addOutline(p), 1);
  assert.equal(p.items[0].notes, 'Take 2');
  assert.equal(p.items[0].status, 'captured');
  assert.equal(addOutline(p), 0);
  assert.deepEqual(
    p.items.map((i) => i.kind),
    ['Talking point', 'B-roll', 'Gear', 'Location', 'Talking point'],
  );
});
test('backups preserve plans and reject invalid or duplicate identities', () => {
  const p = newProject();
  p.outline = 'Hook';
  addOutline(p);
  const doc = { version: 1, projects: [p] };
  assert.equal(validateBackup(doc)[0].items[0].text, 'Hook');
  assert.throws(() => validateBackup({ version: 1, projects: [p, p] }));
  assert.throws(() =>
    validateBackup({ version: 1, projects: [{ ...p, stage: 'Invalid' }] }),
  );
  assert.throws(() => validateBackup({ version: 2, projects: [] }));
});
test('only web URLs are opened as external assets', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('file:///tmp/a'), '');
  assert.equal(
    safeUrl('https://example.com/footage'),
    'https://example.com/footage',
  );
});

test('links the page no longer shows are kept, so a save never erases them', () => {
  const project = {
    id: 'p1', stage: 'Idea', title: 'T', outline: '', outlineUrl: '', publishedUrl: '',
    filmDate: '', publishDate: '', items: [], attachments: [],
    footageUrl: 'https://example.com/footage', thumbnailUrl: 'https://example.com/thumb',
    driveFolder: { id: 'folder1' }, driveAssets: [{ name: 'cut.mp4', url: 'https://drive.google.com/x' }],
  };
  const [out] = validateBackup({ version: 1, projects: [project] });
  assert.equal(out.footageUrl, project.footageUrl);
  assert.equal(out.thumbnailUrl, project.thumbnailUrl);
  assert.deepEqual(out.driveFolder, { id: 'folder1' });
  assert.deepEqual(out.driveAssets, project.driveAssets);
  const [bare] = validateBackup({ version: 1, projects: [{ ...project, footageUrl: '', thumbnailUrl: undefined, driveFolder: undefined, driveAssets: [] }] });
  assert.equal('footageUrl' in bare || 'driveAssets' in bare || 'driveFolder' in bare, false);
});
