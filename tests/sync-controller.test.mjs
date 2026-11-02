// Unit tests for the Idea Vault sync scheduler (idea-vault/sync-controller.mjs).
// Run: node --test tests/sync-controller.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSyncController,
  SyncError,
} from '../idea-vault/sync-controller.mjs';

// A fake clock: timers run only when the test advances time.
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map(); // id -> { at, fn }
  return {
    setTimer(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    pending: () => timers.size,
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at);
        if (!due.length) break;
        const [id, t] = due[0];
        timers.delete(id);
        now = t.at;
        t.fn();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}

// Lets pending promise callbacks run.
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function harness(runImpl) {
  const clock = fakeClock();
  const states = [];
  const calls = [];
  const controller = createSyncController({
    delayMs: 4000,
    retryMs: [1000, 2000],
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onState: (s) => states.push(s.state),
    run: async () => {
      calls.push(calls.length + 1);
      return runImpl(calls.length);
    },
  });
  return { clock, controller, states, calls };
}

test('a burst of edits collapses into one upload after the quiet period', async () => {
  const h = harness(async () => 'ok');
  h.controller.requestSync();
  await h.clock.advance(1000);
  h.controller.requestSync();
  await h.clock.advance(1000);
  h.controller.requestSync();
  await h.clock.advance(3999);
  assert.equal(h.calls.length, 0, 'still inside the debounce window');
  await h.clock.advance(1);
  assert.equal(h.calls.length, 1, 'one run after 4s of quiet');
  assert.equal(h.controller.getStatus().state, 'idle');
});

test('uploads never overlap: an edit during a run causes exactly one follow-up run', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const gate = deferred();
  const h = harness(async (n) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (n === 1) await gate.promise;
    inFlight--;
    return 'ok';
  });
  h.controller.requestSync({ immediate: true });
  await flush();
  h.controller.requestSync();
  h.controller.requestSync();
  h.controller.requestSync();
  gate.resolve();
  await flush();
  await h.clock.advance(4000);
  assert.equal(h.calls.length, 2, 'one follow-up run, not three');
  assert.equal(maxInFlight, 1, 'never two runs at once');
});

test('offline: no timer runs; the edit syncs when the browser comes back online', async () => {
  let online = false;
  const h = harness(async () => {
    if (!online) throw new SyncError('offline', 'no network');
    return 'ok';
  });
  h.controller.requestSync({ immediate: true });
  await flush();
  assert.equal(h.controller.getStatus().state, 'offline');
  h.controller.requestSync();
  await h.clock.advance(60000);
  assert.equal(h.calls.length, 1, 'no retry loop while offline');

  online = true;
  h.controller.notifyOnline();
  await flush();
  assert.equal(h.calls.length, 2);
  assert.equal(h.controller.getStatus().state, 'idle');
});

test('transient failures retry with backoff, then stop and ask for attention', async () => {
  const h = harness(async () => {
    throw new SyncError('transient', 'Cloud save failed: 503');
  });
  h.controller.requestSync({ immediate: true });
  await flush();
  assert.equal(h.controller.getStatus().state, 'retrying');
  await h.clock.advance(999);
  assert.equal(h.calls.length, 1);
  await h.clock.advance(1);
  assert.equal(h.calls.length, 2, 'first retry after 1s');
  await h.clock.advance(2000);
  assert.equal(h.calls.length, 3, 'second retry after 2s');
  await h.clock.advance(600000);
  assert.equal(h.calls.length, 3, 'no more automatic retries after the limit');
  assert.equal(h.controller.getStatus().state, 'needs-attention');
});

test('auth failures never retry automatically; a manual request tries again', async () => {
  let signedIn = false;
  const h = harness(async () => {
    if (!signedIn) throw new SyncError('auth', 'Google sign-in needed.');
    return 'ok';
  });
  h.controller.requestSync({ immediate: true });
  await flush();
  assert.equal(h.controller.getStatus().state, 'needs-attention');
  await h.clock.advance(600000);
  assert.equal(h.calls.length, 1, 'no automatic retry for auth');

  signedIn = true;
  const result = await h.controller.requestSync({ manual: true });
  assert.equal(result, 'ok');
  assert.equal(h.controller.getStatus().state, 'idle');
});

test('failed runs keep the pending edit: the next successful run uploads it', async () => {
  let fail = true;
  const h = harness(async () => {
    if (fail) throw new SyncError('fatal', 'boom');
    return 'ok';
  });
  h.controller.requestSync({ immediate: true });
  await flush();
  assert.equal(h.controller.getStatus().state, 'needs-attention');
  fail = false;
  await h.controller.requestSync({ manual: true });
  assert.equal(h.calls.length, 2);
  assert.equal(h.controller.getStatus().state, 'idle');
});

test('manual requests resolve only once the queue is at rest', async () => {
  const gate = deferred();
  const h = harness(async () => {
    await gate.promise;
    return 'done';
  });
  let settled = false;
  const pending = h.controller.requestSync({ manual: true }).then((r) => {
    settled = true;
    return r;
  });
  await flush();
  assert.equal(settled, false);
  gate.resolve();
  assert.equal(await pending, 'done');
});

test('status moves through queued → syncing → idle and reports reasons', async () => {
  const h = harness(async () => 'ok');
  h.controller.requestSync();
  assert.equal(h.controller.getStatus().state, 'queued');
  await h.clock.advance(4000);
  assert.deepEqual(h.states.slice(0, 3), ['queued', 'syncing', 'idle']);
});

test('dispose clears timers and settles waiting callers', async () => {
  const h = harness(async () => 'ok');
  const waiting = h.controller.requestSync();
  h.controller.dispose();
  assert.equal(h.clock.pending(), 0);
  assert.ok(await waiting, 'waiter resolves instead of hanging');
});

test('a manual request that fails resolves with the status at once, not after the retry', async () => {
  const h = harness(async () => {
    throw new SyncError('transient', 'Cloud save failed (500)');
  });
  const outcome = await h.controller.requestSync({ manual: true });
  assert.equal(outcome.state, 'retrying', 'returns the status with its reason');
  assert.match(outcome.reason, /500/);
  assert.equal(h.calls.length, 1, 'the automatic retry has not run yet');
});
