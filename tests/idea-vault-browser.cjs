// Browser integration tests for the Idea Vault sync and import (idea-vault/app.js).
// The Google Drive API and Google Identity Services are replaced by an in-memory
// fake, so no real Google account, token or network access is used.
// Each "device" is a separate browser context with its own localStorage.
//
// Run: node tests/idea-vault-browser.cjs
const assert = require('node:assert/strict');
const { launchBrowser, server } = require('./browser-utils.cjs');

const WORKSPACE = 'tim-idea-vault-v1.json';
const DOC_TYPE = 'application/vnd.google-apps.document';

// ---- Fake Drive -----------------------------------------------------------

function createFakeDrive() {
  const drive = {
    files: new Map(), // id -> { id, name, version (number), content }
    folderDocs: [],
    nextId: 1,
    requests: [],
    listRepeatPage: false,
    faults: { lostCreateReplies: 0 },
  };
  drive.workspaceFiles = () =>
    [...drive.files.values()].filter((f) => f.name === WORKSPACE);
  drive.workspace = () => {
    const [file] = drive.workspaceFiles();
    return file ? JSON.parse(file.content) : null;
  };
  return drive;
}

function parseMultipartPayload(body, boundary) {
  const parts = body.split('--' + boundary);
  const payloadPart = parts[2].replace(/^\r\n/, '');
  const headerEnd = payloadPart.indexOf('\r\n\r\n');
  return payloadPart.slice(headerEnd + 4).replace(/\r\n$/, '');
}

async function installFakeGoogle(context) {
  await context.route('https://accounts.google.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  await context.addInitScript(() => {
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient(options) {
            return {
              requestAccessToken() {
                setTimeout(
                  () =>
                    options.callback({
                      access_token: 'test-token-' + options.scope.length,
                    }),
                  0,
                );
              },
            };
          },
        },
      },
    };
  });
}

async function installFakeDrive(context, drive) {
  await context.route('https://www.googleapis.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    drive.requests.push(method + ' ' + url.pathname);

    const json = (status, body) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') || '';
      if (q.includes('in parents')) {
        return json(200, { files: drive.folderDocs });
      }
      const nameMatch = q.match(/name = '((?:[^'\\]|\\.)*)'/);
      const wanted = nameMatch ? nameMatch[1].replace(/\\'/g, "'") : null;
      const files = drive.files.values();
      const list = [...files]
        .filter((f) => !wanted || f.name === wanted)
        .map((f) => ({ id: f.id, name: f.name, version: String(f.version) }));
      return json(200, { files: list });
    }

    const download = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (
      download &&
      method === 'GET' &&
      url.searchParams.get('alt') === 'media'
    ) {
      const file = drive.files.get(decodeURIComponent(download[1]));
      if (!file) return json(404, { error: 'not found' });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: file.content,
      });
    }

    if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const boundary = request.headers()['content-type'].split('boundary=')[1];
      const meta = JSON.parse(
        request
          .postData()
          .split('--' + boundary)[1]
          .split('\r\n\r\n')[1]
          .trim(),
      );
      const id = 'file-' + drive.nextId++;
      const payload = parseMultipartPayload(request.postData(), boundary);
      drive.files.set(id, {
        id,
        name: meta.name,
        version: 1,
        content: payload,
      });
      if (drive.faults.lostCreateReplies > 0) {
        drive.faults.lostCreateReplies--;
        return json(500, { error: 'reply lost after the file was stored' });
      }
      return json(200, { id, name: meta.name, version: '1' });
    }

    const upload = url.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
    if (upload && method === 'PATCH') {
      const file = drive.files.get(decodeURIComponent(upload[1]));
      if (!file) return json(404, { error: 'not found' });
      file.version += 1;
      file.content = request.postData();
      return json(200, {
        id: file.id,
        name: file.name,
        version: String(file.version),
      });
    }

    return json(400, { error: 'unhandled ' + method + ' ' + url.pathname });
  });
}

// ---- Harness --------------------------------------------------------------

function deviceUrl(base) {
  return base + '/idea-vault/index.html';
}

async function openDevice(browser, base, drive, storageSeed) {
  const context = await browser.newContext();
  await installFakeGoogle(context);
  await installFakeDrive(context, drive);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (storageSeed) {
    await page.addInitScript((seed) => {
      if (!sessionStorage.getItem('seeded')) {
        for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
        sessionStorage.setItem('seeded', '1');
      }
    }, storageSeed);
  }
  await page.goto(deviceUrl(base));
  await page.waitForFunction(
    () => document.getElementById('cloudstatus') !== null,
  );
  return { context, page, errors };
}

async function message(page) {
  return page.locator('#message').textContent();
}

async function waitForMessage(page, pattern) {
  await page.waitForFunction(
    (source) =>
      new RegExp(source).test(document.getElementById('message').textContent),
    pattern.source,
  );
}

async function addIdea(page, title) {
  await page.fill('#capture input[name=title]', title);
  await page.click('#capture button[type=submit]');
}

async function localTitles(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('tim-idea-vault-v1') || '{"ideas":[]}')
      .ideas.map((i) => i.title)
      .sort(),
  );
}

async function clearMessage(page) {
  await page.evaluate(() => {
    document.getElementById('message').textContent = '';
  });
}

// Every action path in app.js ends by setting #message, so a non-empty message
// after clearing it means that action has finished.
async function liveTitles(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('tim-idea-vault-v1') || '{"ideas":[]}')
      .ideas.filter((i) => !i.archived)
      .map((i) => i.title)
      .sort(),
  );
}

async function connect(page) {
  await clearMessage(page);
  await page.click('#connect');
  await page.waitForFunction(
    () => document.getElementById('message').textContent.length > 0,
  );
}

async function sync(page) {
  await clearMessage(page);
  await page.click('#sync');
  await page.waitForFunction(
    () => document.getElementById('message').textContent.length > 0,
  );
}

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// ---- Cases ----------------------------------------------------------------

test('save → sync → reload → reconnect keeps the same data (no false conflict)', async ({
  browser,
  base,
  drive,
}) => {
  const a = await openDevice(browser, base, drive);
  await connect(a.page);
  await addIdea(a.page, 'Idea Vault Sync Test');
  await sync(a.page);
  assert.match(await message(a.page), /Cloud sync complete/);
  const beforeReload = await localTitles(a.page);

  await a.page.reload();
  await connect(a.page);
  const versionBeforeNoop = drive.workspaceFiles()[0].version;
  const writesBeforeNoop = writeCount(drive);
  await sync(a.page);
  assert.match(
    await message(a.page),
    /Already up to date/,
    'an unchanged workspace must not be re-uploaded',
  );
  assert.equal(
    writeCount(drive),
    writesBeforeNoop,
    'no upload request was sent',
  );
  assert.equal(
    drive.workspaceFiles()[0].version,
    versionBeforeNoop,
    'Drive version unchanged',
  );
  assert.deepEqual(await localTitles(a.page), beforeReload);
  assert.deepEqual(
    (drive.workspace().ideas || []).map((i) => i.title),
    ['Idea Vault Sync Test'],
  );
  assert.equal(drive.workspaceFiles().length, 1);
  await a.context.close();
});

test('an unsynced local edit survives a reload and is not overwritten by the cloud copy', async ({
  browser,
  base,
  drive,
}) => {
  // Another device already saved a different idea to the cloud.
  const other = await openDevice(browser, base, drive);
  await connect(other.page);
  await addIdea(other.page, 'Saved from phone');
  await sync(other.page);
  await other.context.close();

  // This device has an unsynced idea, then reloads before syncing.
  const a = await openDevice(browser, base, drive);
  await addIdea(a.page, 'Unsynced on desktop');
  await a.page.reload();
  await connect(a.page);
  await waitForMessage(a.page, /Connected/);

  assert.deepEqual(
    await localTitles(a.page),
    ['Saved from phone', 'Unsynced on desktop'].sort(),
    'both the cloud idea and the unsynced local idea must be present',
  );
  // Reconnecting uploads the unsynced idea automatically; poll the fake Drive until it arrives.
  const reached = () =>
    (drive.workspace()?.ideas || []).some(
      (i) => i.title === 'Unsynced on desktop',
    );
  for (let k = 0; k < 100 && !reached(); k++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(reached(), 'the unsynced idea reached Drive');
  assert.doesNotMatch(
    await a.page.locator('#cloudstatus').textContent(),
    /Needs attention/,
  );

  const backups = await a.page.evaluate(() =>
    JSON.parse(localStorage.getItem('tim-idea-vault-backups-v1') || '[]'),
  );
  assert.ok(
    backups.length >= 1,
    'a safety copy must be written before merging',
  );
  assert.ok(
    backups[0].ideas.some((i) => i.title === 'Unsynced on desktop'),
    'the safety copy holds the unsynced idea',
  );
  await a.context.close();
});

test('an unsynced edit to an already-synced idea is not reverted by reconnecting after reload', async ({
  browser,
  base,
  drive,
}) => {
  const a = await openDevice(browser, base, drive);
  await connect(a.page);
  await addIdea(a.page, 'Original title');
  await sync(a.page);

  // Edit the synced idea locally but do not sync, then reload the page.
  await a.page
    .locator('#results article', { hasText: 'Original title' })
    .locator('button')
    .click();
  await a.page.fill('#e-title', 'Edited locally');
  await a.page.click('#save');
  await a.page.reload();
  await connect(a.page);

  assert.deepEqual(
    await localTitles(a.page),
    ['Edited locally'],
    'the newer local edit must survive; the older cloud copy must not revert it',
  );
  await a.context.close();
});

test('stale device merges the other device’s change on sync instead of dead-ending', async ({
  browser,
  base,
  drive,
}) => {
  const phone = await openDevice(browser, base, drive);
  await connect(phone.page);
  await addIdea(phone.page, 'Phone idea');
  await sync(phone.page);

  const desktop = await openDevice(browser, base, drive);
  await connect(desktop.page);
  assert.deepEqual(await localTitles(desktop.page), ['Phone idea']);

  // Phone edits and syncs while desktop is still open with the older version.
  await addIdea(phone.page, 'Second phone idea');
  await sync(phone.page);

  await addIdea(desktop.page, 'Desktop idea');
  await sync(desktop.page);
  assert.match(
    await message(desktop.page),
    /Merged changes from another device|Cloud sync complete/,
  );
  assert.doesNotMatch(
    await message(desktop.page),
    /no overwrite performed|Export backup and reload/,
    'the old dead-end message must be gone',
  );
  const cloudTitles = (drive.workspace().ideas || [])
    .map((i) => i.title)
    .sort();
  assert.deepEqual(
    cloudTitles,
    ['Desktop idea', 'Phone idea', 'Second phone idea'],
    'nothing from either device may be lost',
  );
  await phone.context.close();
  await desktop.context.close();
});

test('the cloud status never claims a stale sync time after a failed sync', async ({
  browser,
  base,
  drive,
}) => {
  const a = await openDevice(browser, base, drive);
  await connect(a.page);
  await addIdea(a.page, 'Will fail');
  await sync(a.page);
  assert.match(
    await a.page.locator('#cloudstatus').textContent(),
    /Synced · checked/,
  );

  // Make the next upload fail.
  await a.context.route('https://www.googleapis.com/upload/**', (route) =>
    route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' }),
  );
  await addIdea(a.page, 'Second, will fail');
  await sync(a.page);
  const status = await a.page.locator('#cloudstatus').textContent();
  assert.doesNotMatch(
    status,
    /Synced/,
    'status must not claim success after a failure',
  );
  assert.match(status, /Saved locally/, 'local changes are reported as kept');
  assert.match(status, /retrying|Needs attention/, 'the failure is reported');
  assert.deepEqual(
    await localTitles(a.page),
    ['Second, will fail', 'Will fail'].sort(),
    'local data is intact',
  );
  await a.context.close();
});

test('duplicate cloud workspace files are refused and nothing is overwritten', async ({
  browser,
  base,
  drive,
}) => {
  const a = await openDevice(browser, base, drive);
  await connect(a.page);
  await addIdea(a.page, 'Local idea');
  await sync(a.page);
  // Simulate two devices having created the file concurrently.
  drive.files.set('dup', {
    id: 'dup',
    name: WORKSPACE,
    version: 1,
    content: JSON.stringify({ version: 1, ideas: [] }),
  });
  const before = JSON.stringify([...drive.files.values()]);
  await addIdea(a.page, 'Another local idea');
  await sync(a.page);
  assert.match(await message(a.page), /Multiple Idea Vault cloud files/);
  assert.equal(
    JSON.stringify([...drive.files.values()]),
    before,
    'no cloud file may be modified',
  );
  assert.equal(
    (await localTitles(a.page)).length,
    2,
    'local data is untouched',
  );
  await a.context.close();
});

test('unreadable local data is preserved rather than erased by the next save', async ({
  browser,
  base,
  drive,
}) => {
  const broken = '{"version":1,"ideas":[oops';
  const a = await openDevice(browser, base, drive, {
    'tim-idea-vault-v1': broken,
  });
  const kept = await a.page.evaluate(() =>
    localStorage.getItem('tim-idea-vault-unreadable-v1'),
  );
  assert.equal(kept, broken);
  await addIdea(a.page, 'New after corruption');
  assert.equal(
    await a.page.evaluate(() =>
      localStorage.getItem('tim-idea-vault-unreadable-v1'),
    ),
    broken,
    'the raw copy must survive further saves',
  );
  await a.context.close();
});

test('Drive import is additive, idempotent, and never resurrects an archived card', async ({
  browser,
  base,
  drive,
}) => {
  drive.folderDocs = [
    {
      id: 'docAAAAAAAAAAAAAAA1',
      name: 'Gear review flask',
      mimeType: DOC_TYPE,
      webViewLink:
        'https://docs.google.com/document/d/docAAAAAAAAAAAAAAA1/edit',
    },
    { id: 'docBBBBBBBBBBBBBBB2', name: 'Race recap 2026', mimeType: DOC_TYPE },
    { id: 'pdfCCCCCCCCCCCCCCC3', name: 'Scan', mimeType: 'application/pdf' },
  ];
  const a = await openDevice(browser, base, drive);
  await a.page.fill(
    '#folder-input',
    'https://drive.google.com/drive/folders/FOLDERIDFOLDERID1',
  );
  await a.page.click('#import-drive');
  await waitForMessage(a.page, /imported/);
  assert.equal(
    await a.page.locator('#results article').count(),
    2,
    'PDF is ignored, two Docs imported',
  );
  assert.match(await message(a.page), /Found 2 Google Docs: 2 imported/);

  await a.page.click('#import-drive');
  await waitForMessage(
    a.page,
    /Found 2 Google Docs: 0 imported, 2 already linked/,
  );
  assert.equal(
    await a.page.locator('#results article').count(),
    2,
    'second import adds nothing',
  );

  // Archive one, then re-import: it must stay archived, not reappear.
  await a.page
    .locator('#results article', { hasText: 'Gear review' })
    .locator('button')
    .click();
  a.page.once('dialog', (d) => d.accept());
  await a.page.click('#archive');
  await a.page.click('#import-drive');
  await waitForMessage(a.page, /Found 2 Google Docs: 0 imported/);
  assert.equal(
    await a.page.locator('#results article').count(),
    1,
    'archived card stays hidden',
  );
  await a.context.close();
});

function writeCount(drive) {
  return drive.requests.filter((r) => /^(POST|PATCH) \/upload\//.test(r))
    .length;
}

async function editIdea(page, currentTitle, changes) {
  await page
    .locator('#results article', { hasText: currentTitle })
    .locator('button')
    .click();
  if (changes.title !== undefined) await page.fill('#e-title', changes.title);
  if (changes.notes !== undefined) await page.fill('#e-notes', changes.notes);
  await page.click('#save');
}

async function cloudIdeas(drive) {
  return drive.workspace()?.ideas || [];
}

test('repeated syncs with no local changes never upload or bump the Drive version', async ({
  browser,
  base,
  drive,
}) => {
  const a = await openDevice(browser, base, drive);
  await connect(a.page);
  await addIdea(a.page, 'Stable idea');
  await sync(a.page);
  const version = drive.workspaceFiles()[0].version;
  const writes = writeCount(drive);
  for (let k = 0; k < 3; k++) {
    await sync(a.page);
    assert.match(await message(a.page), /Already up to date/);
  }
  await a.page.reload();
  await connect(a.page);
  await sync(a.page);
  assert.match(await message(a.page), /Already up to date/);
  assert.equal(
    writeCount(drive),
    writes,
    'no upload requests across repeated syncs',
  );
  assert.equal(
    drive.workspaceFiles()[0].version,
    version,
    'Drive version never bumped',
  );
  await a.context.close();
});

test('a no-op sync still detects a change made on another device, and uploads nothing', async ({
  browser,
  base,
  drive,
}) => {
  const a = await openDevice(browser, base, drive);
  await connect(a.page);
  await addIdea(a.page, 'Desktop idea');
  await sync(a.page);

  const other = await openDevice(browser, base, drive);
  await connect(other.page);
  await addIdea(other.page, 'Phone idea');
  await sync(other.page);
  await other.context.close();

  const writes = writeCount(drive);
  await sync(a.page);
  assert.match(await message(a.page), /Merged changes from another device/);
  assert.equal(
    writeCount(drive),
    writes,
    'desktop only pulled; it did not upload',
  );
  assert.deepEqual(
    await localTitles(a.page),
    ['Desktop idea', 'Phone idea'].sort(),
  );
  await a.context.close();
});

test('two devices edit different fields of the same idea: both edits are kept as a conflict copy', async ({
  browser,
  base,
  drive,
}) => {
  const phone = await openDevice(browser, base, drive);
  await connect(phone.page);
  await addIdea(phone.page, 'Shared idea');
  await sync(phone.page);

  const desktop = await openDevice(browser, base, drive);
  await connect(desktop.page);

  await editIdea(phone.page, 'Shared idea', { title: 'Phone title' });
  await sync(phone.page);

  await editIdea(desktop.page, 'Shared idea', { notes: 'Desktop notes' });
  await sync(desktop.page);
  assert.match(
    await message(desktop.page),
    /1 edit conflicted/,
    'the conflict is reported, not hidden',
  );

  const local = await desktop.page.evaluate(
    () => JSON.parse(localStorage.getItem('tim-idea-vault-v1')).ideas,
  );
  const original = local.find((i) => i.title === 'Shared idea');
  const copy = local.find((i) => i.conflictOf);
  assert.ok(original, 'the desktop copy stays on the original card');
  assert.equal(original.notes, 'Desktop notes', 'the desktop edit is kept');
  assert.ok(copy, 'the phone edit is kept as a conflict copy');
  assert.equal(copy.title, 'Phone title', 'the phone edit is not discarded');

  const cloud = await cloudIdeas(drive);
  assert.equal(cloud.length, 2, 'both versions reached Drive');
  assert.ok(cloud.some((i) => i.conflictOf === original.id));
  await phone.context.close();
  await desktop.context.close();
});

test('repeated syncs after a conflict do not create more conflict copies', async ({
  browser,
  base,
  drive,
}) => {
  const phone = await openDevice(browser, base, drive);
  await connect(phone.page);
  await addIdea(phone.page, 'Shared idea');
  await sync(phone.page);
  const desktop = await openDevice(browser, base, drive);
  await connect(desktop.page);
  await editIdea(phone.page, 'Shared idea', { title: 'Phone title' });
  await sync(phone.page);
  await editIdea(desktop.page, 'Shared idea', { notes: 'Desktop notes' });
  await sync(desktop.page);
  for (let k = 0; k < 3; k++) {
    await sync(desktop.page);
    await sync(phone.page);
  }
  const copies = (await localTitles(desktop.page)).length;
  assert.equal(copies, 2, 'still exactly one original and one conflict copy');
  assert.equal((await cloudIdeas(drive)).filter((i) => i.conflictOf).length, 1);
  await phone.context.close();
  await desktop.context.close();
});

test('resolving a conflict with "Use this version" leaves one live card and syncs cleanly', async ({
  browser,
  base,
  drive,
}) => {
  const phone = await openDevice(browser, base, drive);
  await connect(phone.page);
  await addIdea(phone.page, 'Shared idea');
  await sync(phone.page);
  const desktop = await openDevice(browser, base, drive);
  await connect(desktop.page);
  await editIdea(phone.page, 'Shared idea', { title: 'Phone title' });
  await sync(phone.page);
  await editIdea(desktop.page, 'Shared idea', { notes: 'Desktop notes' });
  await sync(desktop.page);

  await desktop.page
    .locator('#results article', { hasText: 'Conflict copy' })
    .locator('button')
    .click();
  await desktop.page.click('#resolve-use');
  await sync(desktop.page);
  assert.match(
    await message(desktop.page),
    /Cloud sync complete|Already up to date/,
  );

  const live = await desktop.page.locator('#results article').count();
  assert.equal(live, 1, 'the archived copy is hidden; one live card remains');
  assert.deepEqual(await liveTitles(desktop.page), ['Phone title']);
  // The phone sees the resolved card and must not invent a new conflict.
  await sync(phone.page);
  assert.deepEqual(
    await liveTitles(phone.page),
    ['Phone title'],
    'phone sees exactly one live card',
  );
  await phone.context.close();
  await desktop.context.close();
});

test('resolving a conflict with "Keep original" archives the copy and keeps the original', async ({
  browser,
  base,
  drive,
}) => {
  const phone = await openDevice(browser, base, drive);
  await connect(phone.page);
  await addIdea(phone.page, 'Shared idea');
  await sync(phone.page);
  const desktop = await openDevice(browser, base, drive);
  await connect(desktop.page);
  await editIdea(phone.page, 'Shared idea', { title: 'Phone title' });
  await sync(phone.page);
  await editIdea(desktop.page, 'Shared idea', { notes: 'Desktop notes' });
  await sync(desktop.page);

  await desktop.page
    .locator('#results article', { hasText: 'Conflict copy' })
    .locator('button')
    .click();
  await desktop.page.click('#resolve-discard');
  assert.deepEqual(await liveTitles(desktop.page), ['Shared idea']);
  assert.equal(await desktop.page.locator('#results article').count(), 1);
  await phone.context.close();
  await desktop.context.close();
});

test('a failed upload keeps local edits pending and the next sync recovers without duplicates', async ({
  browser,
  base,
  drive,
}) => {
  const a = await openDevice(browser, base, drive);
  await connect(a.page);
  await addIdea(a.page, 'Before failure');
  await sync(a.page);
  const versionBefore = drive.workspaceFiles()[0].version;

  await a.context.route('https://www.googleapis.com/upload/**', (route) =>
    route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' }),
  );
  await addIdea(a.page, 'Written during outage');
  await sync(a.page);
  assert.match(
    await a.page.locator('#cloudstatus').textContent(),
    /Saved locally.*(retrying|uploading)|Needs attention/,
  );
  assert.equal(
    drive.workspaceFiles()[0].version,
    versionBefore,
    'a failed upload changed nothing in Drive',
  );
  await a.context.unroute('https://www.googleapis.com/upload/**');

  await sync(a.page);
  assert.match(await message(a.page), /Cloud sync complete/);
  assert.equal(drive.workspaceFiles().length, 1, 'no duplicate workspace file');
  assert.deepEqual((await cloudIdeas(drive)).map((i) => i.title).sort(), [
    'Before failure',
    'Written during outage',
  ]);
  assert.equal(
    drive.workspaceFiles()[0].version,
    versionBefore + 1,
    'exactly one successful upload',
  );
  await a.context.close();
});

test('a lost create response does not create a second workspace file on retry', async ({
  browser,
  base,
  drive,
}) => {
  const a = await openDevice(browser, base, drive);
  await connect(a.page);
  await addIdea(a.page, 'Created then reply lost');
  drive.faults.lostCreateReplies = 1;
  await sync(a.page);
  assert.match(
    await a.page.locator('#cloudstatus').textContent(),
    /retrying|Needs attention/,
  );
  assert.equal(
    drive.workspaceFiles().length,
    1,
    'the file was stored before the reply was lost',
  );

  await sync(a.page);
  assert.equal(
    drive.workspaceFiles().length,
    1,
    'retry found the existing file; no duplicate',
  );
  assert.deepEqual(
    (await cloudIdeas(drive)).map((i) => i.title),
    ['Created then reply lost'],
  );
  await a.context.close();
});

// ---- Runner ---------------------------------------------------------------

(async () => {
  const srv = server(0);
  await new Promise((resolve) =>
    srv.listening ? resolve() : srv.once('listening', resolve),
  );
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await launchBrowser();
  let failed = 0;
  try {
    for (const { name, fn } of cases) {
      const drive = createFakeDrive();
      try {
        await fn({ browser, base, drive });
        console.log('ok   - ' + name);
      } catch (error) {
        failed++;
        console.log(
          'FAIL - ' +
            name +
            '\n       ' +
            error.message.split('\n').slice(0, 6).join('\n       '),
        );
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n${cases.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
