// Unit tests for the Idea Vault data-integrity rules (idea-vault/vault-core.mjs).
// Run: node --test tests/idea-vault.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkspace,
  sameVersion,
  mergeIdeas,
  baseOf,
  touch,
  useCopyAsOriginal,
  discardCopy,
  stableStringify,
} from '../idea-vault/vault-core.mjs';

const T0 = '2026-10-01T10:00:00.000Z';
const T1 = '2026-10-02T10:00:00.000Z';

const idea = (id, extra = {}) => ({
  id,
  title: 'Idea ' + id,
  notes: '',
  status: 'Inbox',
  archived: false,
  updatedAt: T0,
  revision: 'r1',
  ...extra,
});

let counter = 0;
const makeId = () => 'copy-' + ++counter;
const clone = (x) => structuredClone(x);

// ---- Workspace shape and versions -----------------------------------------

test('isWorkspace accepts only version 1 workspaces with an ideas array', () => {
  assert.equal(isWorkspace({ version: 1, ideas: [] }), true);
  assert.equal(isWorkspace({ version: 2, ideas: [] }), false);
  assert.equal(isWorkspace({ version: 1, ideas: 'nope' }), false);
  assert.equal(isWorkspace(null), false);
});

test('sameVersion treats numeric and string versions as equal (no false conflicts)', () => {
  assert.equal(sameVersion(7, '7'), true);
  assert.equal(sameVersion('7', '8'), false);
  assert.equal(sameVersion(undefined, '7'), false);
  assert.equal(sameVersion(null, null), false);
});

test('touch bumps the revision and timestamp of an edit', () => {
  const x = idea('1');
  touch(x, T1);
  assert.notEqual(x.revision, 'r1');
  assert.equal(typeof x.revision, 'string');
  assert.equal(x.updatedAt, T1);
});

test('baseOf records each idea at its current revision', () => {
  assert.deepEqual(
    baseOf([idea('a', { revision: 'r3' }), { title: 'legacy' }, idea('b')]),
    { a: 'r3', b: 'r1' },
  );
});

test('stableStringify is independent of key order', () => {
  assert.equal(
    stableStringify({ b: 1, a: { d: 2, c: 3 } }),
    stableStringify({ a: { c: 3, d: 2 }, b: 1 }),
  );
});

// ---- Merge: round trips and no false conflicts -----------------------------

test('identical local and cloud data merges to no change and no upload', () => {
  const data = [idea('1'), idea('2')];
  const result = mergeIdeas(data, clone(data), { 1: 'r1', 2: 'r1' });
  assert.equal(result.changed, false);
  assert.equal(result.needsUpload, false);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.ideas, data);
});

test('save, sync, reload, reconnect keeps the test idea identical with no conflict', () => {
  const saved = [idea('test', { title: 'Idea Vault Sync Test' })];
  const result = mergeIdeas(clone(saved), clone(saved), baseOf(saved));
  assert.deepEqual(result.ideas, saved);
  assert.equal(result.conflicts.length, 0);
});

test('local-only idea is kept and flagged for upload, never dropped', () => {
  const local = [idea('1'), idea('local-only')];
  const result = mergeIdeas(local, [idea('1')], { 1: 'r1' });
  assert.deepEqual(result.ideas.map((i) => i.id).sort(), ['1', 'local-only']);
  assert.equal(result.changed, false, 'the merge did not alter local data');
  assert.equal(result.needsUpload, true, 'but the cloud is missing it');
});

test('cloud-only idea from another device is added and marked synced', () => {
  const result = mergeIdeas(
    [idea('1')],
    [idea('1'), idea('phone', { title: 'From phone' })],
    { 1: 'r1' },
  );
  assert.ok(
    result.ideas.some((i) => i.id === 'phone' && i.title === 'From phone'),
  );
  assert.equal(result.changed, true);
  assert.equal(result.needsUpload, false);
  assert.equal(result.synced.phone, 'r1');
});

// ---- Merge: one side changed ----------------------------------------------

test('only the cloud changed since base: the cloud edit is taken', () => {
  const local = [idea('1')];
  const cloud = [
    idea('1', { title: 'edited on phone', revision: 'r2', updatedAt: T1 }),
  ];
  const result = mergeIdeas(local, cloud, { 1: 'r1' });
  assert.equal(result.ideas[0].title, 'edited on phone');
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.synced['1'], 'r2');
});

test('only the local side changed since base: the local edit is kept', () => {
  const local = [
    idea('1', { title: 'desktop edit', revision: 'r2', updatedAt: T1 }),
  ];
  const cloud = [idea('1')];
  const result = mergeIdeas(local, cloud, { 1: 'r1' });
  assert.equal(result.ideas[0].title, 'desktop edit');
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.needsUpload, true);
});

test('an archived cloud copy is taken when only the cloud changed', () => {
  const cloud = [idea('1', { archived: true, revision: 'r2' })];
  assert.equal(
    mergeIdeas([idea('1')], cloud, { 1: 'r1' }).ideas[0].archived,
    true,
  );
});

// ---- Merge: concurrent edits are never silently discarded ------------------

test('two devices edit different fields of the same idea: both edits are preserved as a conflict', () => {
  // Phone changed the title and synced (cloud is revision 2). Desktop changed
  // the notes from the same base (revision 1), so its local copy is revision 2.
  const base = { 1: 'r1' };
  const cloud = [
    idea('1', { title: 'Phone title', revision: 'phone-r2', updatedAt: T1 }),
  ];
  const local = [
    idea('1', { notes: 'Desktop notes', revision: 'desk-r2', updatedAt: T1 }),
  ];
  const result = mergeIdeas(local, cloud, base, makeId);

  const original = result.ideas.find((i) => i.id === '1');
  const copy = result.ideas.find((i) => i.conflictOf === '1');
  assert.equal(
    original.notes,
    'Desktop notes',
    'desktop edit kept on the original',
  );
  assert.ok(copy, 'the phone edit is kept as a conflict copy');
  assert.equal(copy.title, 'Phone title');
  assert.deepEqual(result.conflicts, [{ id: '1', copyId: 'copy-' + counter }]);
  assert.equal(result.needsUpload, true);
});

test('revisions are compared by identity, so independent devices cannot look unchanged', () => {
  // Both devices moved from r1 to a different token. Equal-looking counters would
  // hide this; distinct tokens must register as two changes.
  const result = mergeIdeas(
    [idea('1', { title: 'A', revision: 'dev-b-token' })],
    [idea('1', { title: 'B', revision: 'dev-a-token' })],
    { 1: 'r1' },
    makeId,
  );
  assert.equal(result.conflicts.length, 1);
});

test('clock skew cannot silently pick a winner: a newer cloud timestamp with both sides changed still conflicts', () => {
  const base = { 1: 'r1' };
  const local = [idea('1', { title: 'local', revision: 'r2', updatedAt: T0 })];
  const cloud = [
    idea('1', {
      title: 'cloud',
      revision: 'r2',
      updatedAt: '2099-01-01T00:00:00.000Z',
    }),
  ];
  const result = mergeIdeas(local, cloud, base, makeId);
  assert.equal(result.ideas.find((i) => i.id === '1').title, 'local');
  assert.equal(result.ideas.find((i) => i.conflictOf === '1').title, 'cloud');
});

test('an older-looking cloud copy is never preferred over an unsynced local edit by timestamp alone', () => {
  const base = { 1: 'r1' };
  const local = [idea('1', { title: 'fresh', revision: 'r2', updatedAt: T0 })];
  const cloud = [idea('1', { title: 'stale', revision: 'r2', updatedAt: T1 })];
  const result = mergeIdeas(local, cloud, base, makeId);
  assert.ok(result.ideas.some((i) => i.title === 'fresh'));
  assert.ok(result.ideas.some((i) => i.title === 'stale'));
});

test('an unknown base with differing copies keeps both copies rather than guessing', () => {
  const result = mergeIdeas(
    [idea('1', { title: 'A' })],
    [idea('1', { title: 'B' })],
    {},
    makeId,
  );
  assert.deepEqual(result.ideas.map((i) => i.title).sort(), ['A', 'B']);
  assert.equal(result.conflicts.length, 1);
});

test('identical copies with an unknown base are not a conflict', () => {
  const result = mergeIdeas([idea('1')], [idea('1')], {}, makeId);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.ideas.length, 1);
});

test('repeated merges do not create duplicate conflict copies', () => {
  const base = { 1: 'r1' };
  const cloud = [idea('1', { title: 'phone', revision: 'r2' })];
  const local = [idea('1', { notes: 'desktop', revision: 'r2' })];
  const first = mergeIdeas(local, cloud, base, makeId);
  assert.equal(first.conflicts.length, 1);
  // Sync again before any upload: the same conflict must not be re-created.
  const second = mergeIdeas(first.ideas, cloud, base, makeId);
  assert.equal(second.conflicts.length, 0);
  assert.equal(second.ideas.length, first.ideas.length);
  const third = mergeIdeas(second.ideas, cloud, base, makeId);
  assert.equal(third.ideas.length, first.ideas.length);
});

test('resolving a conflict does not re-create it on the next merge', () => {
  const base = { 1: 'r1' };
  const cloud = [idea('1', { title: 'phone', revision: 'r2' })];
  const local = [idea('1', { notes: 'desktop', revision: 'r2' })];
  const first = mergeIdeas(local, cloud, base, makeId);
  useCopyAsOriginal(first.ideas, first.conflicts[0].copyId, T1);
  const after = mergeIdeas(first.ideas, cloud, base, makeId);
  assert.equal(
    after.conflicts.length,
    0,
    'the archived copy still blocks a new one',
  );
  assert.equal(after.ideas.filter((i) => i.conflictOf).length, 1);
});

test('a duplicate id in the cloud is kept as a conflict copy, not dropped', () => {
  const cloud = [idea('1', { title: 'first' }), idea('1', { title: 'second' })];
  const result = mergeIdeas(
    [idea('1', { title: 'first' })],
    cloud,
    { 1: 'r1' },
    makeId,
  );
  assert.ok(result.ideas.some((i) => i.title === 'second'));
  assert.equal(result.conflicts.length, 1);
});

test('unparseable entries pass through so an upload never drops them', () => {
  const broken = { title: 'no id from an older build' };
  const result = mergeIdeas([idea('1'), broken], [idea('1')], { 1: 'r1' });
  assert.ok(result.ideas.includes(broken));
});

test('legacy: the same Google Doc under two ids with identical content collapses to one card', () => {
  const local = [idea('phone-uuid', { sourceId: 'doc1', title: 'Same doc' })];
  const cloud = [idea('desktop-uuid', { sourceId: 'doc1', title: 'Same doc' })];
  const result = mergeIdeas(local, cloud, {}, makeId).ideas.filter(
    (i) => i.sourceId === 'doc1',
  );
  assert.equal(result.length, 1);
});

test('legacy: the same Google Doc under two ids with different edits keeps both as a conflict copy', () => {
  const local = [
    idea('phone-uuid', {
      sourceId: 'doc1',
      notes: 'phone notes',
      revision: 'r2',
    }),
  ];
  const cloud = [
    idea('desktop-uuid', {
      sourceId: 'doc1',
      notes: 'desktop notes',
      revision: 'r2',
    }),
  ];
  const result = mergeIdeas(local, cloud, {}, makeId);
  const docs = result.ideas.filter((i) => i.sourceId === 'doc1');
  assert.equal(docs.length, 2, 'no edit is dropped');
  assert.ok(
    docs.some(
      (i) => i.conflictOf === 'phone-uuid' || i.conflictOf === 'desktop-uuid',
    ),
  );
});

test('merge never mutates its inputs', () => {
  const local = [idea('1', { title: 'L', revision: 'r2' })];
  const cloud = [idea('2')];
  const before = JSON.stringify([local, cloud]);
  mergeIdeas(local, cloud, { 1: 'r1' }, makeId);
  assert.equal(JSON.stringify([local, cloud]), before);
});

// ---- Conflict resolution ---------------------------------------------------

test('useCopyAsOriginal replaces the original with the copy and archives the copy', () => {
  const ideas = [
    idea('1', { title: 'original', notes: 'mine', revision: 'r2' }),
    idea('c', {
      conflictOf: '1',
      conflictRevision: 2,
      title: 'theirs',
      notes: 'their notes',
      revision: 'r2',
    }),
  ];
  useCopyAsOriginal(ideas, 'c', T1);
  const original = ideas.find((i) => i.id === '1');
  const copy = ideas.find((i) => i.id === 'c');
  assert.equal(original.title, 'theirs');
  assert.equal(original.notes, 'their notes');
  assert.equal(original.id, '1');
  assert.notEqual(original.revision, 'r2');
  assert.equal(copy.archived, true, 'the copy is archived, not deleted');
});

test('discardCopy keeps the original and archives the copy', () => {
  const ideas = [
    idea('1', { title: 'original', revision: 'r2' }),
    idea('c', {
      conflictOf: '1',
      conflictRevision: 2,
      title: 'theirs',
      revision: 'r2',
    }),
  ];
  discardCopy(ideas, 'c', T1);
  assert.equal(ideas.find((i) => i.id === '1').title, 'original');
  assert.equal(ideas.find((i) => i.id === 'c').archived, true);
});

test('resolution refuses to act on an ordinary idea', () => {
  const ideas = [idea('1')];
  assert.throws(() => useCopyAsOriginal(ideas, '1', T1), /not a conflict copy/);
  assert.throws(() => discardCopy(ideas, '1', T1), /not a conflict copy/);
});
