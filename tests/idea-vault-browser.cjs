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
  await sync(a.page);
  assert.match(
    await message(a.page),
    /Cloud sync complete/,
    'second sync must not report a conflict',
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
  assert.match(
    await a.page.locator('#cloudstatus').textContent(),
    /upload|Sync now/,
    'unsynced state must be reported',
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
    /Synced to Google Drive/,
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
    /Synced to Google Drive/,
    'status must not show the old success time',
  );
  assert.match(status, /failed/);
  assert.match(status, /local changes kept/);
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
