// Unit tests for the Content Studio data layer (content-studio/store.mjs).
// Run: node --test tests/content-studio-store.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureIdea,
  loadVideos,
  setStage,
  setPublishDate,
  setFilmDate,
  setDetails,
  setArchived,
  setSteps,
  generateShots,
  addShot,
  updateShot,
  removeShot,
  attachSnapshot,
  detachSnapshot,
  exportBackup,
  importBackup,
} from '../content-studio/store.mjs';
import { reconcileLinked, IDEA_KEY, PLANNER_KEY } from '../shared/pipeline-link.mjs';

class Memory {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

const read = (s, key) => JSON.parse(s.getItem(key));
const ideas = (s) => read(s, IDEA_KEY).ideas;
const projects = (s) => read(s, PLANNER_KEY).projects;

test('capture creates an idea in the Idea stage', () => {
  const s = new Memory();
  const idea = captureIdea({ title: 'Soft flask', notes: 'Opening', platform: 'TikTok' }, s);
  const videos = loadVideos(s).videos;
  assert.equal(videos.length, 1);
  assert.equal(videos[0].id, idea.id);
  assert.equal(videos[0].stage, 'Idea');
  assert.equal(videos[0].platform, 'TikTok');
  assert.equal(idea.status, 'Inbox');
});

test('capture refuses a blank title', () => {
  assert.throws(() => captureIdea({ title: '   ' }, new Memory()), /title/);
});

test('moving a video to Outline creates its project and keeps both sides in step', () => {
  const s = new Memory();
  const idea = captureIdea({ title: 'Soft flask', notes: 'Talk about the opening' }, s);
  setStage(idea.id, 'Outline', s);
  const i = ideas(s)[0];
  const p = projects(s)[0];
  assert.equal(i.status, 'Developing');
  assert.equal(p.id, 'idea:' + idea.id);
  assert.equal(p.stage, 'Outline');
  assert.equal(p.outline, 'Talk about the opening', 'outline starts from the idea notes');
  assert.equal(reconcileLinked(projects(s), ideas(s)), false, 'the two sides agree');
});

test('moving back to Idea clears the stage on both sides', () => {
  const s = new Memory();
  const idea = captureIdea({ title: 'Back again' }, s);
  setStage(idea.id, 'Film', s);
  setStage(idea.id, 'Idea', s);
  assert.equal(ideas(s)[0].status, 'Inbox');
  assert.equal(projects(s)[0].stage, 'Idea');
});

test('one publish date is written to both the idea and the project', () => {
  const s = new Memory();
  const idea = captureIdea({ title: 'Dated' }, s);
  setPublishDate(idea.id, '2026-11-30', s);
  assert.equal(ideas(s)[0].dueDate, '2026-11-30');
  setStage(idea.id, 'Scheduled', s);
  assert.equal(projects(s)[0].publishDate, '2026-11-30');
  assert.throws(() => setPublishDate(idea.id, '2026-13-40', s), /real date/);
  assert.equal(ideas(s)[0].dueDate, '2026-11-30', 'a bad date changes nothing');
});

test('film date is kept on the project', () => {
  const s = new Memory();
  const idea = captureIdea({ title: 'Filmed' }, s);
  setFilmDate(idea.id, '2026-11-10', s);
  assert.equal(loadVideos(s).videos[0].filmDate, '2026-11-10');
});

test('an unchanged save causes no edit to the record', () => {
  const s = new Memory();
  const idea = captureIdea({ title: 'Stable' }, s);
  const before = ideas(s)[0].revision;
  setDetails(idea.id, { title: 'Stable', notes: '' }, s);
  assert.equal(ideas(s)[0].revision, before);
});

test('details save to the idea, and the title also updates the project', () => {
  const s = new Memory();
  const idea = captureIdea({ title: 'Old' }, s);
  setStage(idea.id, 'Outline', s);
  setDetails(idea.id, { title: 'New title', notes: 'Notes', platform: 'YouTube' }, s);
  assert.equal(ideas(s)[0].title, 'New title');
  assert.equal(ideas(s)[0].platform, 'YouTube');
  assert.equal(projects(s)[0].title, 'New title');
  assert.throws(() => setDetails(idea.id, { title: '  ' }, s), /needs a title/);
});

test('only http and https links are kept', () => {
  const s = new Memory();
  const idea = captureIdea({ title: 'Links' }, s);
  setDetails(idea.id, { outlineUrl: 'javascript:alert(1)', publishedUrl: 'https://example.com/v' }, s);
  const p = projects(s)[0];
  assert.equal(p.outlineUrl, '');
  assert.equal(p.publishedUrl, 'https://example.com/v');
});

test('shots are generated from the outline once, then added and edited by hand', () => {
  const s = new Memory();
  const idea = captureIdea({ title: 'Shots' }, s);
  setDetails(idea.id, { outline: '- Hook line\nB-roll: Shoes\nGear: Microphone' }, s);
  assert.equal(generateShots(idea.id, s), 3);
  assert.equal(generateShots(idea.id, s), 0, 'generation is additive');
  addShot(idea.id, { kind: 'Location', text: 'Track' }, s);
  const shot = projects(s)[0].items.find((x) => x.text === 'Track');
  updateShot(idea.id, shot.id, { status: 'captured', notes: 'Take 2' }, s);
  assert.equal(projects(s)[0].items.find((x) => x.id === shot.id).status, 'captured');
  removeShot(idea.id, shot.id, s);
  assert.equal(projects(s)[0].items.length, 3);
});

test('a shot needs text', () => {
  const s = new Memory();
  const idea = captureIdea({ title: 'Empty shot' }, s);
  assert.throws(() => addShot(idea.id, { kind: 'B-roll', text: ' ' }, s), /shot is/);
});

test('steps save to the idea checklist', () => {
  const s = new Memory();
  const idea = captureIdea({ title: 'Steps' }, s);
  setSteps(idea.id, [{ text: 'Script', done: true }, { text: '  ', done: false }], s);
  assert.deepEqual(ideas(s)[0].checklist, [{ text: 'Script', done: true }]);
});

test('archiving hides a video from the board list', () => {
  const s = new Memory();
  const idea = captureIdea({ title: 'Archive me' }, s);
  setArchived(idea.id, true, s);
  assert.equal(ideas(s)[0].archived, true);
});

test('snapshots attach once and detach cleanly', () => {
  const s = new Memory();
  const idea = captureIdea({ title: 'Snaps' }, s);
  attachSnapshot(idea.id, { id: 'snap1', tool: 'Asset Animator', name: 'Logo' }, s);
  attachSnapshot(idea.id, { id: 'snap1', tool: 'Asset Animator', name: 'Logo' }, s);
  assert.equal(projects(s)[0].attachments.length, 1);
  detachSnapshot(idea.id, 'snap1', s);
  assert.equal(projects(s)[0].attachments.length, 0);
});

test('a backup round-trips into an empty device', () => {
  const a = new Memory();
  const idea = captureIdea({ title: 'Travels' }, a);
  setStage(idea.id, 'Outline', a);
  const backup = exportBackup(a);
  const b = new Memory();
  importBackup(backup, b);
  const videos = loadVideos(b).videos;
  assert.equal(videos.length, 1);
  assert.equal(videos[0].title, 'Travels');
  assert.equal(videos[0].stage, 'Outline');
});

test('importing the same backup twice does not duplicate videos', () => {
  const a = new Memory();
  captureIdea({ title: 'Once' }, a);
  const backup = exportBackup(a);
  const b = new Memory();
  importBackup(backup, b);
  importBackup(backup, b);
  assert.equal(loadVideos(b).videos.length, 1);
});

test('a single-store Idea Vault backup imports', () => {
  const s = new Memory();
  importBackup(JSON.stringify({ version: 1, ideas: [{ id: 'x1', title: 'Legacy', status: 'Inbox', notes: '', platform: 'YouTube', category: '', dueDate: '', checklist: [], archived: false, updatedAt: new Date().toISOString(), revision: 'r1' }] }), s);
  assert.equal(loadVideos(s).videos[0].title, 'Legacy');
});

test('a file that is not a backup is refused and changes nothing', () => {
  const s = new Memory();
  captureIdea({ title: 'Keep me' }, s);
  const before = s.getItem(IDEA_KEY);
  assert.throws(() => importBackup('{"hello":1}', s), /not a Content Studio/);
  assert.equal(s.getItem(IDEA_KEY), before);
});

test('unreadable local data is refused, never overwritten', () => {
  const s = new Memory();
  s.setItem(IDEA_KEY, '{broken');
  assert.throws(() => loadVideos(s));
  assert.equal(s.getItem(IDEA_KEY), '{broken');
  assert.throws(() => captureIdea({ title: 'x' }, s));
  assert.equal(s.getItem(IDEA_KEY), '{broken');
});
