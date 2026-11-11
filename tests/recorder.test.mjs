// shared/recorder.js: the recording lifecycle every tool shares. A fake
// MediaRecorder stands in for the browser so each outcome can be forced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../shared/recorder.js', import.meta.url), 'utf8');

function harness({ supported = ['video/mp4', 'video/webm'], constructFails = false, startFails = false, noRecorder = false } = {}) {
  const listeners = {};
  const recorders = [];
  const stopped = [];
  const timers = new Map();
  let nextTimer = 0;
  class MediaRecorder {
    static isTypeSupported(t) {
      return supported.includes(t);
    }
    constructor(stream, settings) {
      if (constructFails) throw Object.assign(Error('nope'), { name: 'NotSupportedError' });
      this.stream = stream;
      this.settings = settings;
      this.state = 'inactive';
      this.mimeType = settings.mimeType || 'video/webm;codecs=vp8';
      recorders.push(this);
    }
    start(timeslice) {
      if (startFails) throw Error('start failed');
      this.timeslice = timeslice;
      this.state = 'recording';
    }
    data(size = 10) {
      this.ondataavailable?.({ data: new Blob([new Uint8Array(size)]) });
    }
    stop() {
      if (this.state === 'inactive') throw Error('inactive');
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([new Uint8Array(this.pending ?? 10)]) });
      this.onstop?.();
    }
  }
  const track = (kind) => ({ kind, stop: () => stopped.push(kind) });
  const context = {
    document: {
      hidden: false,
      addEventListener: (k, fn) => (listeners[k] = fn),
      removeEventListener: (k, fn) => {
        if (listeners[k] === fn) delete listeners[k];
      },
    },
    MediaStream: class {
      constructor(tracks) {
        this.tracks = tracks;
      }
    },
    Blob,
    setTimeout: (fn, ms) => {
      timers.set(++nextTimer, { fn, ms });
      return nextTimer;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  if (!noRecorder) context.MediaRecorder = MediaRecorder;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  const video = track('video');
  const canvas = {
    captureStream: (fps) => {
      canvas.fps = fps;
      return {
        added: [],
        getVideoTracks: () => [video],
        getTracks() {
          return [video, ...this.added];
        },
        addTrack(t) {
          this.added.push(t);
        },
      };
    },
  };
  const events = [];
  const options = (extra = {}) => ({
    canvas,
    onDone: (r) => events.push(['done', r]),
    onCancel: (r) => events.push(['cancel', r]),
    onError: (e) => events.push(['error', e.code]),
    ...extra,
  });
  return {
    T: context.TimRecorder,
    context,
    canvas,
    options,
    events,
    recorders,
    stopped,
    timers,
    listeners,
    track,
    runTimers: () => {
      const due = [...timers.entries()];
      for (const [id, t] of due) if (timers.delete(id)) t.fn();
    },
    hide: () => {
      context.document.hidden = true;
      listeners.visibilitychange?.();
    },
  };
}

test('prefers MP4, then WebM, then the browser default; null when it cannot record', () => {
  assert.equal(harness().T.pickType(), 'video/mp4');
  assert.equal(harness({ supported: ['video/webm'] }).T.pickType(), 'video/webm');
  assert.equal(harness({ supported: [] }).T.pickType(), '');
  assert.equal(harness({ noRecorder: true }).T.pickType(), null);
  assert.equal(harness().T.pickType(['video/webm', 'video/mp4']), 'video/webm');
});

test('a finished recording delivers the file and releases everything', () => {
  const h = harness();
  let before = 0;
  const s = h.T.start(h.options({ videoBitsPerSecond: 12e6, audioBitsPerSecond: 192e3, audioTracks: () => [h.track('audio')], beforeStart: () => before++ }));
  assert.ok(s.active);
  assert.equal(before, 1);
  assert.equal(h.canvas.fps, 30);
  assert.deepEqual({ ...h.recorders[0].settings }, { videoBitsPerSecond: 12e6, mimeType: 'video/mp4', audioBitsPerSecond: 192e3 });
  assert.equal(h.recorders[0].stream.tracks.length, 2);
  assert.equal(h.recorders[0].timeslice, undefined);
  let fired = 0;
  s.after(250, () => fired++);
  h.runTimers();
  assert.equal(fired, 1);
  s.stop();
  assert.equal(h.events.length, 1);
  const [kind, r] = h.events[0];
  assert.equal(kind, 'done');
  assert.equal(r.mimeType, 'video/mp4');
  assert.equal(r.ext, 'mp4');
  assert.equal(r.blob.type, 'video/mp4');
  assert.equal(r.size, 10);
  assert.deepEqual(h.stopped, ['video'], 'video track stopped; the tool keeps its audio track');
  assert.equal(h.listeners.visibilitychange, undefined);
  assert.equal(s.active, false);
  s.stop();
  s.cancel();
  assert.equal(h.events.length, 1, 'ending twice does nothing');
});

test('the browser-default format sends no mimeType or audio bitrate, and names the file from what was recorded', () => {
  const h = harness({ supported: [] });
  const s = h.T.start(h.options({ videoBitsPerSecond: 12e6, audioBitsPerSecond: 192e3 }));
  assert.deepEqual({ ...h.recorders[0].settings }, { videoBitsPerSecond: 12e6 });
  s.stop();
  assert.equal(h.events[0][1].ext, 'webm');
  assert.equal(h.events[0][1].mimeType, 'video/webm');
});

test('unsupported browser, strict format list and constructor failure report an error and leave nothing running', () => {
  let h = harness({ noRecorder: true });
  assert.equal(h.T.start(h.options()), null);
  assert.deepEqual(h.events, [['error', 'unsupported']]);
  h = harness();
  assert.equal(h.T.start(h.options({ canvas: {} })), null);
  assert.deepEqual(h.events, [['error', 'unsupported']]);
  h = harness({ supported: [] });
  assert.equal(h.T.start(h.options({ allowDefaultType: false })), null);
  assert.deepEqual(h.events, [['error', 'no-format']]);
  h = harness({ constructFails: true });
  assert.equal(h.T.start(h.options()), null);
  assert.deepEqual(h.events, [['error', 'construct']]);
  assert.deepEqual(h.stopped, ['video']);
  assert.equal(h.listeners.visibilitychange, undefined);
});

test('a start failure cleans up and reports once', () => {
  const h = harness({ startFails: true });
  assert.equal(h.T.start(h.options()), null);
  assert.deepEqual(h.events, [['error', 'start']]);
  assert.deepEqual(h.stopped, ['video']);
  assert.equal(h.listeners.visibilitychange, undefined);
});

test('cancel discards the file, drops pending timers and reports the reason', () => {
  const h = harness();
  const s = h.T.start(h.options({ timeslice: 1000 }));
  assert.equal(h.recorders[0].timeslice, 1000);
  let fired = 0;
  s.after(250, () => fired++);
  s.cancel();
  h.runTimers();
  assert.equal(fired, 0);
  assert.deepEqual(h.events, [['cancel', 'user']]);
  assert.deepEqual(h.stopped, ['video']);
  assert.equal(s.after(1, () => fired++), 0);
});

test('a hidden tab cancels with reason "hidden" unless the tool opts out', () => {
  let h = harness();
  h.T.start(h.options());
  h.hide();
  assert.deepEqual(h.events, [['cancel', 'hidden']]);
  assert.equal(h.listeners.visibilitychange, undefined);
  h = harness();
  h.T.start(h.options({ hiddenTab: 'ignore' }));
  assert.equal(h.listeners.visibilitychange, undefined);
});

test('a recorder error reports "recorder" and still releases the stream', () => {
  const h = harness();
  h.T.start(h.options());
  h.recorders[0].onerror({ error: Error('boom') });
  assert.deepEqual(h.events, [['error', 'recorder']]);
  assert.deepEqual(h.stopped, ['video']);
});

test('size cap, watchdog and empty recordings', () => {
  let h = harness();
  h.T.start(h.options({ maxBytes: 15, timeslice: 1000 }));
  h.recorders[0].data(10);
  h.recorders[0].data(10);
  assert.deepEqual(h.events, [['cancel', 'too-large']]);
  h = harness();
  h.T.start(h.options({ watchdogMs: 5000 }));
  assert.deepEqual([...h.timers.values()].map((t) => t.ms), [5000]);
  h.runTimers();
  assert.deepEqual(h.events, [['cancel', 'watchdog']]);
  h = harness();
  const s = h.T.start(h.options({ rejectEmpty: true }));
  h.recorders[0].pending = 0;
  s.stop();
  assert.deepEqual(h.events, [['error', 'empty']]);
});

test('"capture" stream mode adds audio to the canvas stream and stops every track', () => {
  const h = harness();
  const s = h.T.start(h.options({ stream: 'capture', audioTracks: [h.track('audio')] }));
  assert.equal(h.recorders[0].stream.added.length, 1);
  s.stop();
  assert.deepEqual(h.stopped, ['video', 'audio']);
});

test('recording again works after every outcome', () => {
  const h = harness();
  h.T.start(h.options()).stop();
  h.T.start(h.options()).cancel();
  h.T.start(h.options());
  h.recorders[2].onerror({});
  h.T.start(h.options());
  h.hide();
  h.context.document.hidden = false;
  h.T.start(h.options()).stop();
  assert.deepEqual(h.events.map((e) => e[0]), ['done', 'cancel', 'error', 'cancel', 'done']);
  assert.equal(h.stopped.length, 5);
  assert.equal(h.listeners.visibilitychange, undefined);
  assert.equal(h.timers.size, 0);
});
