import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = (path) =>
  readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function routine(path, start, end) {
  const text = source(path);
  const from = text.indexOf(start),
    to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return text
    .slice(from, to)
    .replace('export async function', 'async function');
}
function harness(response) {
  const seen = { roots: [], validated: [], syncs: 0 };
  class PickerBuilder {
    addView() {
      return this;
    }
    setOAuthToken() {
      return this;
    }
    setDeveloperKey() {
      return this;
    }
    setAppId() {
      return this;
    }
    setOrigin(origin) {
      seen.origin = origin;
      return this;
    }
    setTitle() {
      return this;
    }
    setCallback(callback) {
      this.callback = callback;
      return this;
    }
    build() {
      assert.equal(seen.origin, 'https://chiefcrackt.github.io');
      return { setVisible: () => this.callback(response) };
    }
  }
  class DocsView {
    setIncludeFolders() {
      return this;
    }
    setSelectFolderEnabled() {
      return this;
    }
  }
  const context = {
    window: {
      // Every studio and embedded editor uses this same HTTPS origin.
      location: { origin: 'https://chiefcrackt.github.io' },
      TIM_IDEA_VAULT_CONFIG: {
        pickerApiKey: 'public-test-key',
        cloudProjectNumber: 'test-project',
      },
    },
    google: {
      picker: {
        PickerBuilder,
        DocsView,
        ViewId: { FOLDERS: 'folders', DOCUMENTS: 'documents' },
        Action: { PICKED: 'picked', CANCEL: 'cancel' },
        Response: { ACTION: 'action', DOCUMENTS: 'docs' },
      },
    },
    gapi: { load: (_, callbacks) => callbacks.callback() },
    connect: async () => {},
    script: async () => {},
    loadPicker: async () => {},
    token: 'fake',
    folderValid: async (id) => {
      seen.validated.push(id);
      return { id, name: 'Test folder' };
    },
    setPrefs: (prefs) => seen.roots.push(prefs),
    syncNow: async () => seen.syncs++,
    DocsError: class extends Error {},
    PICKER_NOT_CONFIGURED: 'Missing configuration',
  };
  vm.createContext(context);
  vm.runInContext(
    routine(
      'shared/project-drive.mjs',
      'export async function chooseRoot()',
      '\nconst locks =',
    ),
    context,
  );
  vm.runInContext(
    routine(
      'idea-vault/app.js',
      'async function grantDocumentAccess(',
      '\n// Reuses the drive.file token',
    ),
    context,
  );
  return { context, seen };
}

test('embedded folder Picker receives the published origin and validates before saving', async () => {
  const { context, seen } = harness({
    action: 'picked',
    docs: [{ id: 'folder' }],
  });
  await context.chooseRoot();
  assert.equal(seen.origin, 'https://chiefcrackt.github.io');
  assert.deepEqual(seen.validated, ['folder']);
  assert.equal(seen.roots[0].root.id, 'folder');
  assert.equal(seen.syncs, 1);
});
test('cancelling folder Picker does not change the remembered folder or sync', async () => {
  const { context, seen } = harness({ action: 'cancel' });
  await assert.rejects(context.chooseRoot(), /cancelled/);
  assert.deepEqual(seen.roots, []);
  assert.equal(seen.syncs, 0);
});
test('embedded document Picker keeps its exact linked-document access check', async () => {
  const accepted = harness({ action: 'picked', docs: [{ id: 'linked-doc' }] });
  await accepted.context.grantDocumentAccess('linked-doc', 'fake');
  assert.equal(accepted.seen.origin, 'https://chiefcrackt.github.io');
  const wrong = harness({ action: 'picked', docs: [{ id: 'other-doc' }] });
  await assert.rejects(
    wrong.context.grantDocumentAccess('linked-doc', 'fake'),
    /not the document/,
  );
  const cancelled = harness({ action: 'cancel' });
  await assert.rejects(
    cancelled.context.grantDocumentAccess('linked-doc', 'fake'),
    /not granted/,
  );
});
