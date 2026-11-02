import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, validateBackup } from '../content-planner/model.mjs';
import {
  stamp,
  mergeProjects,
  dominates,
  stable,
} from '../shared/project-sync.mjs';
const clone = (x) => structuredClone(x);
test('older device snapshots cannot roll back edits or resurrect deletions', () => {
  const old = newProject('Race');
  stamp([], [old], 'a');
  const fresh = clone(old);
  fresh.title = 'Race recap';
  stamp([old], [fresh], 'a');
  assert(dominates(fresh.clock, old.clock));
  assert.equal(mergeProjects([old], [fresh])[0].title, 'Race recap');
  const deleted = clone(fresh);
  deleted.deleted = true;
  stamp([fresh], [deleted], 'b');
  assert.equal(mergeProjects([deleted], [old], [fresh]).length, 1);
  assert.equal(mergeProjects([deleted], [old], [fresh])[0].deleted, true);
});
test('concurrent edits converge and preserve both versions exactly once', () => {
  const base = newProject('Base');
  stamp([], [base], 'a');
  const a = clone(base),
    b = clone(base);
  a.title = 'Desktop';
  b.title = 'Phone';
  stamp([base], [a], 'a');
  stamp([base], [b], 'b');
  const ab = mergeProjects([a], [b]);
  assert.equal(ab.length, 2);
  assert.deepEqual(
    new Set(ab.map((p) => p.title)),
    new Set(['Desktop', 'Phone']),
  );
  assert.equal(ab.filter((p) => p.conflictOf).length, 1);
  assert.equal(stable(ab), stable(mergeProjects([b], [a])));
  assert.equal(stable(ab), stable(mergeProjects(ab, [a], [b])));
  const copy = clone(ab.find((p) => p.conflictOf));
  const removed = clone(copy);
  removed.deleted = true;
  stamp([copy], [removed], 'a');
  assert.equal(
    mergeProjects(ab, [a], [b], [removed]).filter((p) => !p.deleted).length,
    1,
  );
});
test('Drive links, clocks and deletion markers survive backup validation', () => {
  const p = newProject();
  p.driveFolder = { id: 'folder', name: 'Video', account: 'account' };
  p.driveAssets = [
    {
      id: 'asset',
      name: 'cover.png',
      account: 'account',
      url: 'https://drive.google.com/file/d/asset/view',
      mimeType: 'image/png',
      tool: 'cover-maker',
      updated: 4,
    },
  ];
  p.deleted = true;
  stamp([], [p], 'device');
  const result = validateBackup({ version: 1, projects: [p] })[0];
  assert.equal(result.deleted, true);
  assert.equal(result.driveFolder.id, 'folder');
  assert.equal(result.driveAssets[0].id, 'asset');
  assert.deepEqual(result.clock, p.clock);
  assert.equal(result.updated, p.updated);
});
