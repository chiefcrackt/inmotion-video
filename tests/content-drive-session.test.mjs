import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../shared/project-drive.mjs', import.meta.url),
  'utf8',
);
const auth = source
  .slice(source.indexOf('const API'), source.indexOf('function requireToken'))
  .replace(/^export /gm, '')
  .replace('import.meta.url', JSON.stringify(import.meta.url));

function studio() {
  const parent = { TimContentDriveSession: new EventTarget() };
  const records = new Map();
  const prompts = [];
  let account = 'first';
  function editor() {
    const window = Object.assign(new EventTarget(), {
      parent,
      TIM_IDEA_VAULT_CONFIG: { googleClientId: 'test' },
    });
    const google = {
      accounts: {
        oauth2: {
          initTokenClient: ({ callback, scope }) => ({
            requestAccessToken() {
              prompts.push(scope);
              queueMicrotask(() =>
                callback({ access_token: 'fake-token', expires_in: 3600 }),
              );
            },
          }),
        },
      },
    };
    window.google = google;
    const context = vm.createContext({
      window,
      google,
      Event,
      URL,
      SyncError: class extends Error {
        constructor(kind, message) {
          super(message);
          this.kind = kind;
        }
      },
      localStorage: {
        getItem: (key) => records.get(key),
        setItem: (key, value) => records.set(key, value),
        removeItem: (key) => records.delete(key),
      },
      fetch: async () => ({
        ok: true,
        json: async () => ({ user: { permissionId: account } }),
      }),
    });
    return vm.runInContext(
      auth + '\n({ connect, disconnect, state, studioAccess })',
      context,
    );
  }
  return {
    editor,
    prompts,
    records,
    choose: (id) => {
      account = id;
    },
  };
}

test('Content Studio editors reuse one verified Drive grant, including lazy-loaded views', async () => {
  const { editor, prompts, records } = studio();
  const ideas = editor();
  const videos = editor();
  await videos.connect({ interactive: false });
  assert.equal(prompts.length, 0);
  await Promise.all([ideas.connect(), videos.connect()]);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /drive\.file.*drive\.appdata/);
  assert.equal(videos.state().authorized, true);
  const shoot = editor();
  await shoot.connect();
  assert.equal(shoot.studioAccess().token, ideas.studioAccess().token);
  assert.equal(prompts.length, 1);
  assert.ok(
    [...records.values()].every((value) => !value.includes('fake-token')),
  );
  videos.disconnect();
  assert.equal(ideas.studioAccess(), null);
  assert.equal(shoot.state().authorized, false);
});

test('a mismatched Google account cannot start syncing the existing Idea Vault', async () => {
  const { editor, records, choose } = studio();
  records.set(
    'tim-idea-vault-sync-v1',
    JSON.stringify({ account: 'first', pending: true }),
  );
  choose('second');
  const ideas = editor();
  await assert.rejects(ideas.connect(), /already linked to Idea Vault/);
  assert.equal(ideas.studioAccess(), null);
  assert.equal(ideas.state().connected, undefined);
});
