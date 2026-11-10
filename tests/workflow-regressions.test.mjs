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

