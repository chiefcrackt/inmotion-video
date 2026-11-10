// Storage failure handling for shared/project-store.mjs (Content Planner plans).
// Run: node --test tests/project-store.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const data = new Map();
let mode = 'ok'; // ok | full | blocked
globalThis.window = { dispatchEvent() {} };
globalThis.Event = class {
  constructor(type) {
    this.type = type;
  }
};
globalThis.localStorage = {
  getItem(key) {
    if (mode === 'blocked') throw new DOMException('denied', 'SecurityError');
    return data.has(key) ? data.get(key) : null;
  },
  setItem(key, value) {
    if (mode === 'blocked') throw new DOMException('denied', 'SecurityError');
    if (mode === 'full') throw new DOMException('full', 'QuotaExceededError');
    data.set(key, String(value));
  },
};
const store = await import('../shared/project-store.mjs');

beforeEach(() => {
  data.clear();
  mode = 'ok';
});

test('unreadable plans give a clear error and keep a raw copy that later reads do not overwrite', () => {
  data.set(store.KEY, '{"version":1,"projects":[oops');
  assert.throws(() => store.readProjects(), /could not be read/);
  assert.equal(data.get(store.UNREADABLE_KEY), '{"version":1,"projects":[oops');
  data.set(store.KEY, 'still broken');
  assert.throws(() => store.readProjects(), /could not be read/);
  assert.equal(data.get(store.UNREADABLE_KEY), '{"version":1,"projects":[oops');
});

test('saving over unreadable plans is refused, so they are never erased', () => {
  data.set(store.KEY, 'not json');
  assert.throws(() => store.saveProjects([]), /could not be read/);
  assert.equal(data.get(store.KEY), 'not json');
});

test('a full storage reports that the change was not saved', () => {
  mode = 'full';
  assert.throws(() => store.saveProjects([]), /storage is full/);
});

test('blocked storage reports plainly and still gives a stable device id for the page', () => {
  mode = 'blocked';
  assert.throws(() => store.readProjects(), /blocks saved data/);
  const id = store.deviceId();
  assert.equal(store.deviceId(), id);
});

test('normal saves round-trip and detect another tab’s edit', () => {
  const first = store.saveProjects([]);
  assert.deepEqual(store.readProjects(), []);
  data.set(store.KEY, JSON.stringify({ version: 1, projects: [] }) + ' ');
  assert.throws(() => store.saveProjects([], first), /another tab/);
});
