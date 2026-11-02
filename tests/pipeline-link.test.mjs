import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileLinked, statusForStage } from '../shared/pipeline-link.mjs';

const T0 = Date.parse('2026-11-01T10:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

function pair({ status = 'Developing', stage = 'Outline', dueDate = '', publishDate = '', ideaMs = T0, projectMs = T0 } = {}) {
  const idea = { id: 'a', title: 'Race', status, dueDate, updatedAt: iso(ideaMs), revision: 'r0' };
  const project = { id: 'idea:a', title: 'Race', stage, publishDate, updated: projectMs, deleted: false };
  return { idea, project };
}

test('a newer planner stage is written back to the idea', () => {
  const { idea, project } = pair({ stage: 'Film', projectMs: T0 + 1000 });
  assert.equal(reconcileLinked([project], [idea]), true);
  assert.equal(idea.status, 'Ready to Film');
  assert.equal(idea.updatedAt, iso(T0 + 1000));
  assert.notEqual(idea.revision, 'r0');
});

test('a newer idea status is copied into the planner', () => {
  const { idea, project } = pair({ status: 'Ready to Film', stage: 'Outline', ideaMs: T0 + 1000 });
  assert.equal(reconcileLinked([project], [idea]), true);
  assert.equal(project.stage, 'Film');
  assert.equal(project.updated, T0 + 1000);
});

test('filmed and editing ideas are not flattened when the planner already says Edit', () => {
  const { idea, project } = pair({ status: 'Filmed', stage: 'Edit', projectMs: T0 + 1000 });
  assert.equal(reconcileLinked([project], [idea]), false); // stage already matches, nothing to write
  assert.equal(idea.status, 'Filmed');
  assert.equal(statusForStage('Edit', 'Editing'), 'Editing');
});

test('dates follow whichever side changed last', () => {
  const planner = pair({ publishDate: '2026-12-01', projectMs: T0 + 2000, dueDate: '2026-11-20', ideaMs: T0 + 1000 });
  reconcileLinked([planner.project], [planner.idea]);
  assert.equal(planner.idea.dueDate, '2026-12-01');

  const vault = pair({ publishDate: '2026-12-01', projectMs: T0 + 1000, dueDate: '2026-11-20', ideaMs: T0 + 2000 });
  reconcileLinked([vault.project], [vault.idea]);
  assert.equal(vault.project.publishDate, '2026-11-20');
});

test('running twice changes nothing the second time', () => {
  const { idea, project } = pair({ stage: 'Edit', projectMs: T0 + 1000 });
  assert.equal(reconcileLinked([project], [idea]), true);
  const snapshot = JSON.stringify([idea, project]);
  assert.equal(reconcileLinked([project], [idea]), false);
  assert.equal(JSON.stringify([idea, project]), snapshot);
});

test('equal timestamps are left alone', () => {
  const { idea, project } = pair({ stage: 'Film', status: 'Developing' });
  assert.equal(reconcileLinked([project], [idea]), false);
  assert.equal(idea.status, 'Developing');
});

test('deleted projects, archived ideas, conflict copies and unlinked records are never touched', () => {
  const base = pair({ stage: 'Film', projectMs: T0 + 1000 });
  const deleted = { ...base.project, deleted: true };
  assert.equal(reconcileLinked([deleted], [base.idea]), false);

  const archived = { ...base.idea, archived: true };
  assert.equal(reconcileLinked([base.project], [archived]), false);

  const copy = { ...base.idea, conflictOf: 'x' };
  assert.equal(reconcileLinked([base.project], [copy]), false);

  const unlinked = { ...base.project, id: 'plain-project' };
  assert.equal(reconcileLinked([unlinked], [base.idea]), false);

  assert.equal(base.idea.status, 'Developing');
});

test('bad input is ignored rather than throwing', () => {
  assert.equal(reconcileLinked(null, []), false);
  assert.equal(reconcileLinked([null, { id: 3 }], [null, { id: 'a' }]), false);
});
