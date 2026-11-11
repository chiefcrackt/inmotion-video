// shared/save.js: downloads capability → phone share sheet → download link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../shared/save.js', import.meta.url), 'utf8');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0.0.0 Safari/537.36';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';

function harness({ ua = WINDOWS, touch = 0, canShare = true, share, claude } = {}) {
  const log = { shared: [], links: [], revoked: [], revokeMs: [] };
  const context = {
    Blob,
    File,
    Promise,
    navigator: {
      userAgent: ua,
      maxTouchPoints: touch,
      canShare: canShare === null ? undefined : () => canShare,
      share: (payload) => {
        log.shared.push(payload);
        return share ? share() : Promise.resolve();
      },
    },
    URL: { createObjectURL: () => 'blob:x' + log.links.length, revokeObjectURL: (u) => log.revoked.push(u) },
    document: {
      body: { appendChild() {} },
      createElement: () => ({
        click() {
          log.links.push(this.download);
        },
        remove() {},
      }),
    },
    setTimeout: (fn, ms) => {
      log.revokeMs.push(ms);
      fn();
    },
  };
  if (claude) context.claude = claude;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return { S: context.TimSave, log };
}
const blob = () => new Blob(['x'], { type: 'video/mp4' });

test('file types by extension', () => {
  const { S } = harness();
  assert.deepEqual(['a.png', 'a.WAV', 'a.zip', 'a.mp4', 'a.webm', 'a.bin'].map(S.typeFor), ['image/png', 'audio/wav', 'application/zip', 'video/mp4', 'video/webm', 'application/octet-stream']);
});

test('iPhone: the share sheet gets a typed File, straight from the tap', async () => {
  const { S, log } = harness({ ua: IPHONE });
  const pending = S.save('clip.mp4', blob());
  assert.equal(log.shared.length, 1, 'share is called before anything is awaited');
  assert.equal(log.shared[0].files[0].name, 'clip.mp4');
  assert.equal(log.shared[0].files[0].type, 'video/mp4');
  assert.equal('title' in log.shared[0], false);
  assert.deepEqual({ ...(await pending) }, { via: 'share', status: 'shared' });
  assert.deepEqual(log.links, []);
});

test('iPad that reports itself as a Mac still shares; a real computer downloads', async () => {
  let h = harness({ ua: IPAD, touch: 5 });
  assert.equal((await h.S.save('a.png', new Blob(['x']))).via, 'share');
  assert.equal(h.log.shared[0].files[0].type, 'image/png', 'untyped data gets its type from the name');
  h = harness({ ua: IPAD, touch: 0 });
  assert.equal((await h.S.save('a.png', new Blob(['x']))).via, 'download');
  h = harness({ ua: WINDOWS });
  assert.deepEqual({ ...(await h.S.save('clip.mp4', blob())) }, { via: 'download', status: 'downloaded' });
  assert.deepEqual(h.log.links, ['clip.mp4']);
  assert.deepEqual(h.log.revoked, ['blob:x0'], 'object URL is released');
  assert.deepEqual(h.log.revokeMs, [5000]);
});

test('share options: any device, never, title, custom release delay', async () => {
  let h = harness({ ua: WINDOWS });
  assert.equal((await h.S.save('a.mp4', blob(), { share: 'any', shareTitle: 'a.mp4' })).via, 'share');
  assert.equal(h.log.shared[0].title, 'a.mp4');
  h = harness({ ua: IPHONE });
  assert.equal((await h.S.save('a.mp4', blob(), { share: 'never', revokeMs: 60000 })).via, 'download');
  assert.deepEqual(h.log.revokeMs, [60000]);
});

test('closing the share sheet is "aborted"; any other share failure falls back to a download', async () => {
  let h = harness({ ua: IPHONE, share: () => Promise.reject(Object.assign(Error('x'), { name: 'AbortError' })) });
  assert.deepEqual({ ...(await h.S.save('a.mp4', blob())) }, { via: 'share', status: 'aborted' });
  assert.deepEqual(h.log.links, []);
  h = harness({ ua: IPHONE, share: () => Promise.reject(Object.assign(Error('x'), { name: 'NotAllowedError' })) });
  assert.equal((await h.S.save('a.mp4', blob())).via, 'download');
  h = harness({
    ua: IPHONE,
    share: () => {
      throw Error('sync');
    },
  });
  assert.equal((await h.S.save('a.mp4', blob())).via, 'download');
  h = harness({ ua: IPHONE, canShare: false });
  assert.equal((await h.S.save('a.mp4', blob())).via, 'download');
  h = harness({ ua: IPHONE, canShare: null });
  assert.equal((await h.S.save('a.mp4', blob())).via, 'download');
});

test('the downloads capability is used when the host offers one', async () => {
  const saved = [];
  let outcome = () => Promise.resolve({ status: 'saved' });
  const claude = { use: (name) => Promise.resolve(name === 'downloads' ? { save: (x) => (saved.push(x), outcome()) } : null) };
  const h = harness({ ua: IPHONE, claude });
  const r = await h.S.ready();
  assert.equal(r.host, true);
  assert.ok(r.downloads);
  assert.equal(await h.S.ready(), r, 'asked for once');
  const data = blob();
  assert.deepEqual({ ...(await h.S.save('a.mp4', data)) }, { via: 'downloads', status: 'saved' });
  assert.equal(saved[0].filename, 'a.mp4');
  assert.equal(saved[0].data, data);
  assert.deepEqual(h.log.shared, []);
  outcome = () => Promise.resolve({ status: 'queued' });
  assert.equal((await h.S.save('a.mp4', data)).status, 'sent');
  for (const code of ['declined', 'rate_limited', 'too_large']) {
    outcome = () => Promise.reject({ code });
    assert.deepEqual({ ...(await h.S.save('a.mp4', data)) }, { via: 'downloads', status: 'error', code });
  }
  outcome = () => Promise.reject(Error('?'));
  assert.equal((await h.S.save('a.mp4', data)).code, 'failed');
});

test('ready() tells a missing capability from an ordinary page', async () => {
  assert.deepEqual({ ...(await harness().S.ready()) }, { host: false, downloads: null, failed: false });
  assert.deepEqual({ ...(await harness({ claude: { use: () => Promise.resolve(null) } }).S.ready()) }, { host: true, downloads: null, failed: false });
  assert.deepEqual({ ...(await harness({ claude: { use: () => Promise.reject(Error('x')) } }).S.ready()) }, { host: true, downloads: null, failed: true });
});

test('status wording, with per-tool overrides', async () => {
  const { S } = harness();
  assert.equal(S.describe({ via: 'downloads', status: 'saved' }, 'a.mp4'), 'Saved a.mp4.');
  assert.equal(S.describe({ via: 'downloads', status: 'sent' }, 'a.mp4'), 'Sent a.mp4.');
  assert.equal(S.describe({ via: 'downloads', status: 'error', code: 'declined' }, 'a.mp4'), 'Not saved.');
  assert.equal(S.describe({ via: 'downloads', status: 'error', code: 'rate_limited' }, 'a.mp4'), 'A save is already open. Finish that one first.');
  assert.equal(S.describe({ via: 'downloads', status: 'error', code: 'too_large' }, 'a.mp4'), 'That file is too large to save here.');
  assert.equal(S.describe({ via: 'downloads', status: 'error', code: 'failed' }, 'a.mp4'), 'Couldn’t save the file here.');
  assert.equal(S.describe({ via: 'share', status: 'shared' }, 'a.mp4'), 'Done. If you picked Save Video, it’s in Photos.');
  assert.equal(S.describe({ via: 'share', status: 'shared' }, 'a.png'), 'Done. If you picked Save Image, it’s in Photos.');
  assert.equal(S.describe({ via: 'share', status: 'shared' }, 'a.wav'), 'Done. If you picked Save to Files, it’s in Files.');
  assert.equal(S.describe({ via: 'share', status: 'aborted' }, 'a.mp4'), 'Not saved.');
  assert.equal(S.describe({ via: 'download', status: 'downloaded' }, 'a.mp4'), 'Downloaded a.mp4.');
  assert.equal(S.describe({ via: 'share', status: 'shared' }, 'a.mp4', { shared: 'Shared a.mp4.' }), 'Shared a.mp4.');
  const note = {};
  await S.saveTo('a.mp4', blob(), note);
  assert.equal(note.textContent, 'Downloaded a.mp4.');
});
