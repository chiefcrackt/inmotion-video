// Debounced, serialized sync scheduler for Idea Vault. Pure logic: timers and the
// sync operation are injected, so it is unit-tested without a browser.
//
// Guarantees:
//  - Edits collapse into one run after `delayMs` of quiet (debounce).
//  - At most one run is in flight at any time (serialized).
//  - Edits made during a run trigger one follow-up run afterwards.
//  - Offline waits for notifyOnline(); nothing retries in a loop while offline.
//  - Transient failures retry with backoff, then stop and ask for attention.
//  - Auth failures never retry automatically; they need a user tap (Sync now).

export const DEFAULT_RETRY_MS = [5000, 15000, 60000, 300000];

/** Errors thrown by the sync operation carry a kind that decides what happens next. */
export class SyncError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'SyncError';
    this.kind = kind; // 'offline' | 'auth' | 'transient' | 'fatal'
  }
}

/**
 * @param {object} options
 * @param {() => Promise<any>} options.run  one sync; resolves with a result or throws SyncError
 * @param {(status: {state: string, reason: string, at: number|null}) => void} [options.onState]
 */
export function createSyncController({
  run,
  delayMs = 4000,
  retryMs = DEFAULT_RETRY_MS,
  onState = () => {},
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  let running = false;
  let dirty = false;
  let timer = null;
  let failures = 0;
  let status = { state: 'idle', reason: '', at: null };
  let lastResult = null;
  let lastOk = false;
  let waiters = [];

  function setState(state, reason = '') {
    status = { state, reason, at: Date.now() };
    onState(status);
  }

  function clearScheduled() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  function schedule(ms, state, reason) {
    clearScheduled();
    timer = setTimer(() => {
      timer = null;
      fire();
    }, ms);
    setState(state, reason);
  }

  // Called when a run ends, whatever its outcome. Callers waiting on a request
  // get the run's result on success, or the status (with its reason) on failure,
  // so a manual sync never hangs waiting for an automatic retry.
  function settleWaiters() {
    if (running) return;
    const waiting = waiters;
    waiters = [];
    const value = lastOk ? lastResult : status;
    waiting.forEach((w) => w(value));
  }

  async function fire() {
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    dirty = false;
    clearScheduled();
    setState('syncing');
    try {
      lastResult = await run();
      lastOk = true;
      failures = 0;
      running = false;
      if (dirty) {
        schedule(delayMs, 'queued', 'Changes saved, uploading shortly');
      } else {
        setState('idle');
      }
    } catch (error) {
      lastOk = false;
      running = false;
      handleFailure(error);
    }
    settleWaiters();
  }

  function handleFailure(error) {
    const kind = error?.kind || 'fatal';
    const message = error?.message || 'Sync failed';
    // Pending edits stay pending in every failure case.
    dirty = true;
    if (kind === 'offline') {
      setState(
        'offline',
        'Offline. Edits are saved on this device and will sync when you are back online.',
      );
      return;
    }
    if (kind === 'auth') {
      setState('needs-attention', message);
      return;
    }
    if (kind === 'transient' && failures < retryMs.length) {
      const wait = retryMs[failures];
      failures++;
      schedule(
        wait,
        'retrying',
        'Sync failed, retrying automatically: ' + message,
      );
      return;
    }
    setState('needs-attention', message);
  }

  /**
   * Ask for a sync. Debounced by default; `immediate` runs now. `manual` (a user tap)
   * also clears the retry counter and retries even after an offline or auth stop.
   * Resolves with the last result when the queue reaches rest, or with the status when
   * it stops offline or needs attention.
   */
  function requestSync({ immediate = false, manual = false } = {}) {
    if (manual) failures = 0;
    dirty = true;
    const done = new Promise((resolve) => waiters.push(resolve));
    if (running) {
      // The follow-up run starts when the current one finishes.
      return done;
    }
    if (status.state === 'offline' && !manual) {
      // Wait for notifyOnline(); no timer while offline.
      settleWaiters();
      return done;
    }
    if (immediate || manual) {
      fire();
    } else {
      schedule(delayMs, 'queued', 'Changes saved, uploading shortly');
    }
    return done;
  }

  /** Call when the browser reports it is back online. */
  function notifyOnline() {
    if (status.state === 'offline' || status.state === 'retrying') {
      failures = 0;
      dirty = true;
      fire();
    }
  }

  function getStatus() {
    return status;
  }

  function dispose() {
    clearScheduled();
    const waiting = waiters;
    waiters = [];
    waiting.forEach((w) => w(status));
  }

  return { requestSync, notifyOnline, getStatus, dispose };
}
