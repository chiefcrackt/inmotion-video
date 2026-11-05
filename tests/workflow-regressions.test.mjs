import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { reconcileLinked } from '../shared/pipeline-link.mjs';
import { baseOf } from '../idea-vault/vault-core.mjs';

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
// Run the production event handlers with controlled browser/network events.
function between(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, 'Production handler exists');
  return text.slice(from, to);
}
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

test('planner writes durably mark linked ideas pending without losing sync preferences', () => {
  const localStorage = storage({
    'tim-idea-vault-sync-v1': JSON.stringify({ connected: true, pending: false, base: { a: 'r1' } }),
  });
  const context = { localStorage, IDEA_KEY: 'tim-idea-vault-v1' };
  vm.createContext(context);
  vm.runInContext(between(source('content-planner/app.mjs'), 'function writeIdeas(', '\nfunction save()'), context);
  vm.runInContext('writeIdeas([{id:"a",status:"Ready to Film"}])', context);
  const sync = JSON.parse(localStorage.getItem('tim-idea-vault-sync-v1'));
  assert.equal(sync.pending, true);
  assert.equal(sync.connected, true);
  assert.deepEqual(sync.base, { a: 'r1' });
  assert.equal(JSON.parse(localStorage.getItem('tim-idea-vault-v1')).ideas[0].status, 'Ready to Film');
});

test('dragging a linked project advances its stage after a newer notes-only idea edit', () => {
  const project = { id: 'idea:a', stage: 'Outline', publishDate: '', updated: 1000 };
  const idea = { id: 'a', status: 'Developing', dueDate: '', updatedAt: new Date(2000).toISOString() };
  const col = {};
  const context = {
    col, projects: [project], stage: 'Film', current: null,
    save: () => reconcileLinked([project], [idea]), renderBoard() {},
  };
  vm.createContext(context);
  vm.runInContext(between(source('content-planner/app.mjs'), '    col.ondrop =', '\n    for (const p of list)'), context);
  col.ondrop({ preventDefault() {}, dataTransfer: { getData: () => project.id } });
  assert.equal(project.stage, 'Film');
  assert.equal(idea.status, 'Ready to Film');
});

function recordingHarness({ startFails = false, constructFails = false } = {}) {
  const elements = new Map(), queued = new Map(), listeners = {}, recorders = [];
  let next = 0, stoppedTracks = 0, draws = 0, delivered = 0, now = 0;
  const $ = (id) => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); };
  class MediaRecorder {
    constructor() {
      if (constructFails) throw Error('constructor failed');
      this.state = 'inactive'; this.mimeType = 'video/mp4'; recorders.push(this);
    }
    start() { if (startFails) throw Error('start failed'); this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  const context = {
    $, photos: { before: {}, after: {} }, pickType: () => 'video/mp4', MediaRecorder,
    canvas: { captureStream: () => ({ getTracks: () => [{ stop: () => stoppedTracks++ }] }) },
    say() {}, syncControls() {}, refresh() {}, timelineTimes: () => ({ total: 5 }), opt: { length: 5 },
    recording: false, performance: { now: () => now }, animationFrame: () => draws++,
    requestAnimationFrame: (fn) => { queued.set(++next, fn); return next; },
    cancelAnimationFrame: (id) => queued.delete(id),
    document: { hidden: false, addEventListener: (key, fn) => { listeners[key] = fn; } },
    Blob, deliver: async () => { delivered++; return ''; }, stem: () => 'test',
  };
  vm.createContext(context);
  vm.runInContext(between(source('before-after/index.html'), "      $('clip').onclick =", '\n      refresh();\n    </script>'), context);
  return {
    start: () => $('clip').onclick(), context, recorders, queued,
    hide: () => { context.document.hidden = true; listeners.visibilitychange(); },
    advance: (ms) => { now = ms; const callbacks = [...queued.values()]; queued.clear(); callbacks.forEach((fn) => fn()); },
    stoppedTracks: () => stoppedTracks, draws: () => draws, delivered: () => delivered,
  };
}

test('backgrounding a recording cancels its frames and releases its capture stream', () => {
  const h = recordingHarness(); h.start();
  const staleFrame = [...h.queued.values()][0];
  h.hide();
  assert.equal(h.context.recording, false);
  assert.equal(h.queued.size, 0);
  assert.equal(h.stoppedTracks(), 1);
  const draws = h.draws(); staleFrame();
  assert.equal(h.draws(), draws, 'A dispatched old frame must not paint over a new recording');
  assert.equal(h.queued.size, 0);
});

test('a completed recording releases resources and delivers its video once', async () => {
  const h = recordingHarness(); h.start();
  h.recorders[0].ondataavailable({ data: new Blob(['video']) });
  h.advance(5001);
  await Promise.resolve();
  assert.equal(h.context.recording, false);
  assert.equal(h.queued.size, 0);
  assert.equal(h.stoppedTracks(), 1);
  assert.equal(h.delivered(), 1);
});

test('constructor, startup and runtime recorder failures release resources and unlock controls', () => {
  for (const options of [{ constructFails: true }, { startFails: true }, {}]) {
    const h = recordingHarness(options); h.start();
    if (!options.constructFails && !options.startFails) h.recorders[0].onerror();
    assert.equal(h.context.recording, false);
    assert.equal(h.queued.size, 0);
    assert.equal(h.stoppedTracks(), 1);
  }
});

test('Content Studio cloud sync tells the open planner to reload merged plans', () => {
  const events = [];
  const frame = (editor) => ({
    editor,
    contentWindow: { dispatchEvent: (e) => events.push(editor + ':' + e.type) },
  });
  const frames = [frame('ideas'), frame('planner')];
  const document = {
    querySelectorAll: (selector) =>
      frames.filter((f) => selector.includes(`data-editor="${f.editor}"`)),
  };
  const context = { document, Event: class { constructor(type) { this.type = type; } } };
  vm.createContext(context);
  vm.runInContext(
    between(source('content-studio/supabase-sync.mjs'), 'function notifyPlanner(', '\nfunction validate(') +
      '\nnotifyPlanner();',
    context,
  );
  assert.deepEqual(events, ['planner:tim-projects-merged']);
  assert.match(
    source('content-studio/supabase-sync.mjs'),
    /localStorage\.setItem\(key, JSON\.stringify\(merged\)\);\s*if \(dataset === 'projects'\) notifyPlanner\(\);/,
    'The notice follows the merged planner write',
  );
  assert.match(
    source('content-planner/app.mjs'),
    /e\.key === KEY && e\.newValue !== lastSaved/,
    'A merge the planner already reloaded is not reported as another tab',
  );
});
