import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGES,
  stageFromIdeaStatus,
  nextStage,
  previousStage,
  stepProgress,
  shotProgress,
  isOverdue,
  filterVideos,
  groupByStage,
  videoFrom,
  migrate,
  outlineMigrationList,
} from '../content-studio/video-model.mjs';

const idea = (over = {}) => ({
  id: 'i1',
  title: 'Soft flask video',
  notes: 'Talk about the opening',
  platform: 'TikTok',
  category: 'Gear',
  status: 'Developing',
  dueDate: '2026-11-20',
  docUrl: 'https://docs.google.com/document/d/abc/edit',
  sourceId: 'abc',
  checklist: [
    { text: 'Script', done: true },
    { text: 'Filmed', done: false },
  ],
  archived: false,
  updatedAt: 100,
  ...over,
});

const project = (over = {}) => ({
  id: 'idea:i1',
  title: 'Soft flask video',
  stage: 'Film',
  outline: '- Talking point: opening',
  outlineUrl: '',
  footageUrl: 'https://example.com/footage',
  thumbnailUrl: '',
  publishedUrl: '',
  filmDate: '2026-11-10',
  publishDate: '',
  items: [
    {
      id: 's1',
      kind: 'B-roll',
      text: 'Pour water',
      notes: '',
      status: 'captured',
      source: 'B-roll:Pour water',
    },
  ],
  attachments: [{ id: 'a1', tool: 'Asset Animator', name: 'Snapshot' }],
  driveAssets: [],
  deleted: false,
  updated: 300,
  ...over,
});

test('idea statuses map onto pipeline stages', () => {
  assert.equal(stageFromIdeaStatus('Inbox'), 'Idea');
  assert.equal(stageFromIdeaStatus('Developing'), 'Outline');
  assert.equal(stageFromIdeaStatus('Published'), 'Published');
  assert.equal(stageFromIdeaStatus('Unknown'), 'Idea');
});

test('stage navigation stops at the ends', () => {
  assert.equal(nextStage('Idea'), 'Outline');
  assert.equal(nextStage('Published'), null);
  assert.equal(previousStage('Idea'), null);
  assert.equal(previousStage('Film'), 'Outline');
  assert.deepEqual(STAGES, [
    'Idea',
    'Outline',
    'Film',
    'Edit',
    'Scheduled',
    'Published',
  ]);
});

test('progress counts steps and captured shots', () => {
  const v = videoFrom({ idea: idea(), project: project() });
  assert.deepEqual(stepProgress(v), { done: 1, total: 2 });
  assert.deepEqual(shotProgress(v), { done: 1, total: 1 });
});

test('overdue ignores published and archived videos', () => {
  const v = videoFrom({ idea: idea({ dueDate: '2026-11-01' }) });
  assert.equal(isOverdue(v, '2026-11-05'), true);
  assert.equal(isOverdue({ ...v, stage: 'Published' }, '2026-11-05'), false);
  assert.equal(isOverdue({ ...v, archived: true }, '2026-11-05'), false);
  assert.equal(isOverdue({ ...v, dueDate: '' }, '2026-11-05'), false);
});

test('videoFrom merges the linked project into the idea', () => {
  const v = videoFrom({ idea: idea(), project: project() });
  assert.equal(v.id, 'i1');
  assert.equal(v.stage, 'Film', 'project stage wins');
  assert.equal(v.notes, 'Talk about the opening', 'idea notes kept');
  assert.equal(v.dueDate, '2026-11-20', 'due date comes from the idea');
  assert.equal(v.filmDate, '2026-11-10', 'film date comes from the project');
  assert.equal(v.outlineUrl, '', 'Drive doc links are not carried over');
  assert.equal(v.shots.length, 1);
  assert.equal(v.steps.length, 2);
  assert.equal(v.attachments.length, 1);
});

test('videoFrom uses the idea status when there is no project', () => {
  const v = videoFrom({ idea: idea({ status: 'Inbox' }) });
  assert.equal(v.stage, 'Idea');
  assert.deepEqual(v.shots, []);
});

test('videoFrom sanitises bad values instead of trusting them', () => {
  const v = videoFrom({
    idea: idea({ platform: 'MySpace', dueDate: '2026-13-40' }),
    project: project({ stage: 'Nope', items: [{ text: 1 }] }),
  });
  assert.equal(v.platform, 'Other');
  assert.equal(v.dueDate, '');
  assert.equal(v.stage, 'Idea');
  assert.deepEqual(v.shots, []);
});

test('migrate merges linked records and keeps projects without ideas', () => {
  const ideas = [idea(), idea({ id: 'i2', title: 'Second', sourceId: 'def' })];
  const projects = [
    project(),
    project({ id: 'p-solo', title: 'Solo project', stage: 'Edit' }),
  ];
  const { videos, report } = migrate({ ideas, projects });
  assert.equal(videos.length, 3);
  assert.equal(report.imported, 2);
  assert.equal(report.fromProjectsOnly, 1);
  assert.equal(videos.find((v) => v.id === 'p-solo').stage, 'Edit');
  assert.equal(videos.find((v) => v.id === 'i1').stage, 'Film');
});

test('migrate reports conflict copies and does not import them', () => {
  const ideas = [
    idea(),
    idea({ id: 'c1', title: 'Soft flask video', conflictOf: 'i1' }),
  ];
  const { videos, report } = migrate({ ideas, projects: [] });
  assert.equal(videos.length, 1);
  assert.deepEqual(report.conflictCopies, [
    { id: 'c1', title: 'Soft flask video' },
  ]);
});

test('migrate skips deleted projects and invalid records', () => {
  const { videos, report } = migrate({
    ideas: [null, { title: 'no id' }, idea()],
    projects: [project({ deleted: true, id: 'idea:i1' })],
  });
  assert.equal(videos.length, 1);
  assert.equal(report.skippedInvalid, 2);
  assert.equal(videos[0].stage, 'Outline', 'deleted project ignored');
});

test('migrate does not mutate its inputs', () => {
  const ideas = [idea()];
  const projects = [project()];
  const before = JSON.stringify({ ideas, projects });
  migrate({ ideas, projects });
  assert.equal(JSON.stringify({ ideas, projects }), before);
});

test('filterVideos hides archived videos unless asked and matches text', () => {
  const videos = migrate({
    ideas: [idea(), idea({ id: 'i2', title: 'Other', archived: true })],
    projects: [],
  }).videos;
  assert.equal(filterVideos(videos).length, 1);
  assert.equal(filterVideos(videos, { includeArchived: true }).length, 2);
  assert.equal(filterVideos(videos, { query: 'OPENING' }).length, 1);
  assert.equal(filterVideos(videos, { platform: 'YouTube' }).length, 0);
});

test('groupByStage keeps pipeline order and every stage key', () => {
  const videos = migrate({ ideas: [idea()], projects: [project()] }).videos;
  const groups = groupByStage(videos);
  assert.deepEqual(Object.keys(groups), STAGES);
  assert.equal(groups.Film.length, 1);
  assert.equal(groups.Idea.length, 0);
});

test('the unified record has no Google Drive fields', () => {
  const { videos } = migrate({ ideas: [idea()], projects: [project()] });
  const v = videos[0];
  for (const key of [
    'sourceId',
    'driveAssets',
    'driveFolder',
    'footageUrl',
    'thumbnailUrl',
  ]) {
    assert.equal(key in v, false, key + ' must not be stored');
  }
});

test('attachments keep only text fields', () => {
  const v = videoFrom({
    project: project({
      attachments: [
        { id: 'a1', tool: 'Asset Animator', name: 'Snap', url: 'javascript:x' },
        { id: 7, tool: 'x' },
        null,
      ],
    }),
  });
  assert.deepEqual(v.attachments, [
    { id: 'a1', tool: 'Asset Animator', name: 'Snap' },
  ]);
});

test('outlineMigrationList lists live Drive-linked ideas only', () => {
  const list = outlineMigrationList([
    idea(),
    idea({ id: 'i2', sourceId: 'def', archived: true }),
    idea({ id: 'i3', sourceId: undefined }),
    idea({ id: 'i4', sourceId: 'ghi', conflictOf: 'i1' }),
  ]);
  assert.deepEqual(list, [{ id: 'i1', docId: 'abc', title: 'Soft flask video' }]);
});
