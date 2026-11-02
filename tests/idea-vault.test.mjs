// Unit tests for the Idea Vault data-integrity rules (idea-vault/vault-core.mjs).
// Run: node --test tests/idea-vault.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSPACE_FILE,
  isWorkspace,
  sameVersion,
  workspaceListQuery,
  pickWorkspaceFile,
  mergeIdeas,
  isGoogleDoc,
  folderIdFrom,
  planImport,
} from '../idea-vault/vault-core.mjs';

const idea = (id, extra = {}) => ({
  id,
  title: 'Idea ' + id,
  notes: '',
  status: 'Inbox',
  archived: false,
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...extra,
});

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

test('workspace list query filters by the exact file name and escapes quotes', () => {
  assert.equal(
    workspaceListQuery(WORKSPACE_FILE),
    "name = 'tim-idea-vault-v1.json'",
  );
  assert.equal(workspaceListQuery("a'b"), "name = 'a\\'b'");
});

test('pickWorkspaceFile returns null when absent and the single match when present', () => {
  assert.equal(pickWorkspaceFile([]), null);
  assert.equal(pickWorkspaceFile([{ name: 'other.json', id: 'x' }]), null);
  const only = { name: WORKSPACE_FILE, id: 'a', version: '3' };
  assert.equal(
    pickWorkspaceFile([{ name: 'other.json', id: 'x' }, only]),
    only,
  );
});

test('pickWorkspaceFile refuses duplicate workspace files instead of hiding one', () => {
  const files = [
    { name: WORKSPACE_FILE, id: 'a', version: '3' },
    { name: WORKSPACE_FILE, id: 'b', version: '1' },
  ];
  assert.throws(
    () => pickWorkspaceFile(files),
    /Multiple Idea Vault cloud files/,
  );
});

// ---- Merge: round trips, no false conflicts, no silent overwrites ----------

test('identical local and cloud data merges to no change and no upload', () => {
  const data = [idea('1'), idea('2')];
  const result = mergeIdeas(data, structuredClone(data));
  assert.equal(result.changed, false);
  assert.equal(result.needsUpload, false);
  assert.deepEqual(result.ideas, data);
});

test('save, sync, reload, reconnect keeps the test idea identical', () => {
  const saved = [idea('test', { title: 'Idea Vault Sync Test' })];
  const cloud = structuredClone(saved);
  const afterReconnect = mergeIdeas(structuredClone(saved), cloud);
  assert.deepEqual(afterReconnect.ideas, saved);
  assert.equal(afterReconnect.changed, false);
});

test('local-only idea is kept and flagged for upload, never dropped', () => {
  const local = [
    idea('1'),
    idea('local-only', { updatedAt: '2026-10-02T00:00:00.000Z' }),
  ];
  const cloud = [idea('1')];
  const result = mergeIdeas(local, cloud);
  assert.deepEqual(result.ideas.map((i) => i.id).sort(), ['1', 'local-only']);
  assert.equal(result.changed, false, 'merge did not alter local data');
  assert.equal(result.needsUpload, true, 'but the cloud is missing it');
});

test('cloud-only idea from another device is added locally', () => {
  const result = mergeIdeas(
    [idea('1')],
    [idea('1'), idea('phone', { title: 'From phone' })],
  );
  assert.ok(
    result.ideas.some((i) => i.id === 'phone' && i.title === 'From phone'),
  );
  assert.equal(result.changed, true);
  assert.equal(result.needsUpload, false);
});

test('same id: newer cloud copy wins', () => {
  const local = [
    idea('1', { title: 'old', updatedAt: '2026-10-01T10:00:00.000Z' }),
  ];
  const cloud = [
    idea('1', {
      title: 'edited on phone',
      updatedAt: '2026-10-03T10:00:00.000Z',
    }),
  ];
  const [merged] = mergeIdeas(local, cloud).ideas;
  assert.equal(merged.title, 'edited on phone');
});

test('same id: newer local edit is NOT overwritten by an older cloud copy', () => {
  const local = [
    idea('1', {
      title: 'fresh desktop edit',
      updatedAt: '2026-10-05T10:00:00.000Z',
    }),
  ];
  const cloud = [
    idea('1', {
      title: 'stale cloud copy',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }),
  ];
  const result = mergeIdeas(local, cloud);
  assert.equal(result.ideas[0].title, 'fresh desktop edit');
  assert.equal(result.needsUpload, true, 'local edit must be uploaded');
});

test('timestamp tie keeps the local copy', () => {
  const local = [idea('1', { title: 'local' })];
  const cloud = [idea('1', { title: 'cloud' })];
  assert.equal(mergeIdeas(local, cloud).ideas[0].title, 'local');
});

test('different ideas edited concurrently are both preserved', () => {
  const local = [
    idea('a', {
      title: 'A edited here',
      updatedAt: '2026-10-04T00:00:00.000Z',
    }),
    idea('b'),
  ];
  const cloud = [
    idea('a'),
    idea('b', {
      title: 'B edited there',
      updatedAt: '2026-10-04T00:00:00.000Z',
    }),
  ];
  const byId = Object.fromEntries(
    mergeIdeas(local, cloud).ideas.map((i) => [i.id, i]),
  );
  assert.equal(byId.a.title, 'A edited here');
  assert.equal(byId.b.title, 'B edited there');
});

test('an archived cloud copy with newer timestamp archives the idea (no resurrection)', () => {
  const local = [idea('1')];
  const cloud = [
    idea('1', { archived: true, updatedAt: '2026-10-09T00:00:00.000Z' }),
  ];
  assert.equal(mergeIdeas(local, cloud).ideas[0].archived, true);
});

test('entries without a usable id are passed through so an upload never drops them', () => {
  const broken = { title: 'no id from an older build' };
  const result = mergeIdeas([idea('1'), broken], [idea('1')]);
  assert.ok(result.ideas.includes(broken));
});

test('the same Google Doc imported on two devices under different ids leaves one card', () => {
  const local = [
    idea('phone-uuid', {
      sourceId: 'doc1',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }),
  ];
  const cloud = [
    idea('desktop-uuid', {
      sourceId: 'doc1',
      updatedAt: '2026-10-02T10:00:00.000Z',
    }),
  ];
  const result = mergeIdeas(local, cloud).ideas;
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'desktop-uuid');
});

test('merge never mutates its inputs', () => {
  const local = [
    idea('1', { title: 'L', updatedAt: '2026-10-05T00:00:00.000Z' }),
  ];
  const cloud = [idea('2')];
  const before = JSON.stringify([local, cloud]);
  mergeIdeas(local, cloud);
  assert.equal(JSON.stringify([local, cloud]), before);
});

// ---- Google Docs import (PR #29 behavior) ----------------------------------

test('isGoogleDoc keeps only Google Docs and ignores PDFs and folders', () => {
  assert.equal(
    isGoogleDoc({ mimeType: 'application/vnd.google-apps.document' }),
    true,
  );
  assert.equal(isGoogleDoc({ mimeType: 'application/pdf' }), false);
  assert.equal(
    isGoogleDoc({ mimeType: 'application/vnd.google-apps.folder' }),
    false,
  );
});

test('folderIdFrom accepts a folder URL or bare ID and rejects other input', () => {
  assert.equal(
    folderIdFrom(
      'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing',
    ),
    '1AbCdEfGhIjKlMnOp',
  );
  assert.equal(folderIdFrom('1AbCdEfGhIjKlMnOp'), '1AbCdEfGhIjKlMnOp');
  assert.throws(() => folderIdFrom('not a folder'));
});

const at = '2026-11-01T00:00:00.000Z';
let n = 0;
const makeId = () => 'new-' + ++n;

test('planImport adds new Docs with metadata only and original docUrl', () => {
  const plan = planImport(
    [],
    [
      {
        id: 'docA_1234567890',
        name: 'Oil Creek race recap',
        webViewLink: 'https://docs.google.com/document/d/docA_1234567890/edit',
      },
    ],
    makeId,
    at,
  );
  assert.equal(plan.additions.length, 1);
  assert.equal(plan.additions[0].sourceId, 'docA_1234567890');
  assert.equal(plan.additions[0].category, 'Running');
  assert.equal(plan.additions[0].notes, '');
});

test('re-importing the same folder is idempotent (no duplicates)', () => {
  const docs = [{ id: 'docA_1234567890', name: 'Gear review' }];
  const first = planImport([], docs, makeId, at);
  const existing = first.additions;
  const second = planImport(existing, docs, makeId, at);
  assert.equal(second.additions.length, 0);
  assert.equal(second.existingCount, 1);
});

test('an archived linked idea is not resurrected by a re-import', () => {
  const existing = [{ id: 'x', sourceId: 'docA_1234567890', archived: true }];
  const plan = planImport(
    existing,
    [{ id: 'docA_1234567890', name: 'Vlog week' }],
    makeId,
    at,
  );
  assert.equal(plan.additions.length, 0);
});

test('duplicates within one Drive scan (pagination repeat) are imported once', () => {
  const docs = [
    { id: 'docB_1234567890', name: 'A' },
    { id: 'docB_1234567890', name: 'A' },
  ];
  assert.equal(planImport([], docs, makeId, at).additions.length, 1);
});

test('reference documents are categorized separately and invalid ids are skipped', () => {
  const docs = [
    { id: 'refDoc_1234567890', name: 'Segment idea bank' },
    { id: 'bad id!', name: 'Bad' },
  ];
  const plan = planImport([], docs, makeId, at);
  assert.equal(plan.additions[0].kind, 'reference');
  assert.equal(plan.additions[0].category, 'Reference');
  assert.equal(plan.invalid, 1);
});

test('planImport never returns or mutates existing ideas', () => {
  const existing = [{ id: 'keep', title: 'Keep me', sourceId: 'z' }];
  const before = JSON.stringify(existing);
  planImport(existing, [{ id: 'docC_1234567890', name: 'New' }], makeId, at);
  assert.equal(JSON.stringify(existing), before);
});
