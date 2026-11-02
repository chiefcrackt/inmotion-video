// Browser tests for Idea Vault auto-sync (idea-vault/app.js + sync-controller.mjs).
// Google Drive and Google sign-in are in-memory fakes; no real account is used.
// Each "device" is a separate browser context with its own localStorage.
//
// Run: NODE_PATH=... CHROME_PATH=/usr/bin/google-chrome node tests/idea-vault-auto-sync-browser.cjs
const assert = require('node:assert/strict');
const { launchBrowser, server } = require('./browser-utils.cjs');

const WORKSPACE = 'tim-idea-vault-v1.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Fakes ------------------------------------------------------------------

function createFakeDrive() {
  const drive = {
    files: new Map(),
    nextId: 1,
    writes: [], // every upload request (POST/PATCH)
    tokenRequests: 0, // sign-in requests from the page
    faults: [], // queued upload faults: { status } consumed in order
    unauthorizedOnce: false,
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

async function installFakes(
  context,
  drive,
  { autoSyncDelayMs = 300, autoCheckMs = 0 } = {},
) {
  await context.route('https://accounts.google.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  await context.route('https://apis.google.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  await context.route('**/idea-vault/config.js', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body:
        "window.TIM_IDEA_VAULT_CONFIG = { googleClientId: 'test-client', pickerApiKey: '', cloudProjectNumber: '', autoSyncDelayMs: " +
        autoSyncDelayMs +
        ', autoCheckMs: ' +
        autoCheckMs +
        ' };',
    }),
  );
  await context.addInitScript(() => {
    window.__silentFail = false;
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient(options) {
            return {
              requestAccessToken({ prompt }) {
                window.__tokenRequests = (window.__tokenRequests || 0) + 1;
                // A silent request (prompt '') fails when Google would need a popup.
                if (prompt === '' && window.__silentFail) {
                  setTimeout(
                    () =>
                      options.error_callback({ type: 'popup_failed_to_open' }),
                    0,
                  );
                  return;
                }
                setTimeout(
                  () =>
                    options.callback({
                      access_token: 'token-' + Date.now(),
                      expires_in: 3600,
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
  await context.route('https://www.googleapis.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (status, body) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (drive.unauthorizedOnce && method === 'GET') {
      drive.unauthorizedOnce = false;
      return json(401, { error: 'expired' });
    }
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const nameMatch = q.match(/name = '((?:[^'\\]|\\.)*)'/);
      const wanted = nameMatch ? nameMatch[1].replace(/\\'/g, "'") : null;
      const list = [...drive.files.values()]
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
      const createFault = drive.faults.shift();
      if (createFault) return json(createFault.status, { error: 'injected' });
      drive.writes.push('create');
      const boundary = request.headers()['content-type'].split('boundary=')[1];
      const meta = JSON.parse(
        request
          .postData()
          .split('--' + boundary)[1]
          .split('\r\n\r\n')[1]
          .trim(),
      );
      const id = 'file-' + drive.nextId++;
      drive.files.set(id, {
        id,
        name: meta.name,
        version: 1,
        content: parseMultipartPayload(request.postData(), boundary),
      });
      return json(200, { id, name: meta.name, version: '1' });
    }
    const upload = url.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
    if (upload && method === 'PATCH') {
      const fault = drive.faults.shift();
      if (fault) return json(fault.status, { error: 'injected' });
      drive.writes.push('update');
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

// ---- Harness ----------------------------------------------------------------

async function openDevice(browser, base, drive, opts = {}) {
  const context = await browser.newContext();
  await installFakes(context, drive, opts);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/idea-vault/index.html');
  await page.waitForFunction(
    () => document.getElementById('cloudstatus') !== null,
  );
  return { context, page, errors };
}

async function connect(page) {
  await page.click('#connect');
  await page.waitForFunction(
    () => document.getElementById('message').textContent.length > 0,
  );
}

async function addIdea(page, title) {
  await page.fill('#capture input[name=title]', title);
  await page.click('#capture button[type=submit]');
}

async function status(page) {
  return page.locator('#cloudstatus').textContent();
}

async function waitUntil(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(50);
  }
  return false;
}

async function titlesInCloud(drive) {
  return (drive.workspace()?.ideas || []).map((i) => i.title).sort();
}

async function localTitles(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('tim-idea-vault-v1') || '{"ideas":[]}')
      .ideas.map((i) => i.title)
      .sort(),
  );
}

async function focus(page) {
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
}

// ---- Cases ------------------------------------------------------------------

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test('before connecting, edits are saved locally and nothing tries to sign in', async ({
  browser,
  base,
}) => {
  const drive = createFakeDrive();
  const { context, page, errors } = await openDevice(browser, base, drive);
  await addIdea(page, 'Local only');
  await sleep(800);
  assert.match(await status(page), /Saved locally · not connected/);
  assert.equal(
    await page.evaluate(() => window.__tokenRequests || 0),
    0,
    'no sign-in attempted',
  );
  assert.equal(drive.writes.length, 0);
  assert.deepEqual(await localTitles(page), ['Local only']);
  assert.deepEqual(errors, []);
  await context.close();
});

test('after connecting, one edit uploads on its own after the quiet period', async ({
  browser,
  base,
}) => {
  const drive = createFakeDrive();
  const { context, page } = await openDevice(browser, base, drive);
  await connect(page);
  await addIdea(page, 'Auto uploaded');
  assert.ok(
    await waitUntil(async () =>
      (await titlesInCloud(drive)).includes('Auto uploaded'),
    ),
    'reached Drive without a tap',
  );
  assert.match(await status(page), /Synced · checked/);
  await context.close();
});

test('a burst of edits becomes one upload, not one per edit', async ({
  browser,
  base,
}) => {
  const drive = createFakeDrive();
  const { context, page } = await openDevice(browser, base, drive, {
    autoSyncDelayMs: 1200,
  });
  await connect(page);
  const before = drive.writes.length;
  for (const t of ['One', 'Two', 'Three', 'Four']) await addIdea(page, t);
  assert.ok(
    await waitUntil(async () => (await titlesInCloud(drive)).length === 4),
  );
  await sleep(300);
  assert.equal(
    drive.writes.length - before,
    1,
    'one upload for the whole burst',
  );
  await context.close();
});

test('nothing changed: returning to the tab uploads nothing and does not bump the version', async ({
  browser,
  base,
}) => {
  const drive = createFakeDrive();
  const { context, page } = await openDevice(browser, base, drive);
  await connect(page);
  await addIdea(page, 'Stable');
  assert.ok(
    await waitUntil(async () =>
      (await titlesInCloud(drive)).includes('Stable'),
    ),
  );
  const version = drive.workspaceFiles()[0].version;
  const writes = drive.writes.length;
  for (let k = 0; k < 3; k++) await focus(page);
  await sleep(600);
  assert.equal(drive.writes.length, writes, 'no uploads');
  assert.equal(
    drive.workspaceFiles()[0].version,
    version,
    'Drive version unchanged',
  );
  await context.close();
});

test('device switching: returning to the tab picks up a change made on another device', async ({
  browser,
  base,
}) => {
  const drive = createFakeDrive();
  const desktop = await openDevice(browser, base, drive);
  await connect(desktop.page);
  await addIdea(desktop.page, 'Desktop idea');
  assert.ok(
    await waitUntil(async () =>
      (await titlesInCloud(drive)).includes('Desktop idea'),
    ),
  );

  const phone = await openDevice(browser, base, drive);
  await connect(phone.page);
  await addIdea(phone.page, 'Phone idea');
  assert.ok(
    await waitUntil(async () =>
      (await titlesInCloud(drive)).includes('Phone idea'),
    ),
  );

  await focus(desktop.page);
  assert.ok(
    await waitUntil(async () =>
      (await localTitles(desktop.page)).includes('Phone idea'),
    ),
    'desktop merged the phone idea on focus',
  );
  assert.deepEqual(await titlesInCloud(drive), ['Desktop idea', 'Phone idea']);
  await desktop.context.close();
  await phone.context.close();
});

test('offline: edits stay on the device, show as offline, and upload when back online', async ({
  browser,
  base,
}) => {
  const drive = createFakeDrive();
  const { context, page } = await openDevice(browser, base, drive);
  await connect(page);
  await context.setOffline(true);
  await addIdea(page, 'Written offline');
  await sleep(800);
  assert.match(await status(page), /offline/);
  assert.deepEqual(
    await localTitles(page),
    ['Written offline'],
    'saved locally',
  );
  assert.equal((await titlesInCloud(drive)).includes('Written offline'), false);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  assert.ok(
    await waitUntil(async () =>
      (await titlesInCloud(drive)).includes('Written offline'),
    ),
    'uploaded after reconnecting',
  );
  await context.close();
});

test('a failed upload is retried automatically, and the edit is not lost', async ({
  browser,
  base,
}) => {
  const drive = createFakeDrive();
  const { context, page } = await openDevice(browser, base, drive);
  await connect(page);
  drive.faults.push({ status: 503 });
  await addIdea(page, 'Survives a 503');
  await sleep(600);
  assert.match(await status(page), /retrying/);
  assert.deepEqual(await localTitles(page), ['Survives a 503']);
  assert.ok(
    await waitUntil(
      async () => (await titlesInCloud(drive)).includes('Survives a 503'),
      9000,
    ),
    'retry uploaded it',
  );
  await context.close();
});

test('an expired sign-in asks for a tap, does not open a popup, and Sync now recovers', async ({
  browser,
  base,
}) => {
  const drive = createFakeDrive();
  const { context, page } = await openDevice(browser, base, drive);
  await connect(page);
  await addIdea(page, 'Before expiry');
  assert.ok(
    await waitUntil(async () =>
      (await titlesInCloud(drive)).includes('Before expiry'),
    ),
  );

  // Google now needs a user action for the silent sign-in, and the server says the token expired.
  await page.evaluate(() => {
    window.__silentFail = true;
  });
  drive.unauthorizedOnce = true;
  await addIdea(page, 'Needs a tap');
  assert.ok(
    await waitUntil(async () => /Needs attention/.test(await status(page))),
    'status asks for attention',
  );
  assert.match(await status(page), /Press Sync now to reconnect/);
  assert.equal(
    (await titlesInCloud(drive)).includes('Needs a tap'),
    false,
    'not uploaded yet',
  );
  assert.deepEqual(
    await localTitles(page),
    ['Before expiry', 'Needs a tap'],
    'edit kept locally',
  );

  await page.evaluate(() => {
    window.__silentFail = false;
  });
  await page.click('#sync');
  assert.ok(
    await waitUntil(async () =>
      (await titlesInCloud(drive)).includes('Needs a tap'),
    ),
    'Sync now uploads it',
  );
  assert.doesNotMatch(await status(page), /Needs attention/);
  await context.close();
});

test('pending edits survive a reload before they upload, and upload on the next connect', async ({
  browser,
  base,
}) => {
  const drive = createFakeDrive();
  const { context, page } = await openDevice(browser, base, drive, {
    autoSyncDelayMs: 60000,
  });
  await connect(page);
  await addIdea(page, 'Pending through reload');
  await sleep(200);
  assert.equal(
    (await titlesInCloud(drive)).includes('Pending through reload'),
    false,
    'not uploaded yet (long quiet period)',
  );
  await page.reload();
  await page.waitForFunction(
    () => document.getElementById('cloudstatus') !== null,
  );
  assert.deepEqual(
    await localTitles(page),
    ['Pending through reload'],
    'still on the device after reload',
  );
  await connect(page);
  assert.ok(
    await waitUntil(async () =>
      (await titlesInCloud(drive)).includes('Pending through reload'),
    ),
    'uploaded after reconnecting',
  );
  await context.close();
});

// ---- Runner -----------------------------------------------------------------

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
