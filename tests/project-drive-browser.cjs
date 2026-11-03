const assert = require('node:assert/strict');
const path = require('node:path');
const {
  server,
  launchBrowser,
  artifactDirectory,
} = require('./browser-utils.cjs');
const KEY = 'tim-content-planner-v1';
const cloud = {
  files: new Map(),
  sessions: new Map(),
  next: 1,
  failUpload: false,
  failSync: false,
  permission: 'account-1',
  uploads: 0,
  auth: [],
};
function create(meta, content = '') {
  const id = 'f' + cloud.next++;
  const f = {
    ...meta,
    id,
    content,
    size: String(Buffer.byteLength(content)),
    webViewLink: 'https://drive.google.com/file/d/' + id + '/view',
    capabilities: { canAddChildren: true },
  };
  cloud.files.set(id, f);
  return f;
}
const customRoot = create({
  name: 'Video Projects',
  mimeType: 'application/vnd.google-apps.folder',
  parents: [],
});
async function fakes(context) {
  await context.route('https://accounts.google.com/**', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: '' }),
  );
  await context.route('https://apis.google.com/**', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: '' }),
  );
  await context.route('**/idea-vault/config.js', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: "window.TIM_IDEA_VAULT_CONFIG={googleClientId:'test',pickerApiKey:'test',cloudProjectNumber:'test',autoSyncDelayMs:150};",
    }),
  );
  await context.addInitScript(
    ({ root }) => {
      window.__grants = [];
      window.__denyAuth = false;
      window.google = {
        accounts: {
          oauth2: {
            initTokenClient(options) {
              return {
                requestAccessToken(args) {
                  window.__grants.push({
                    prompt: args.prompt,
                    hint: options.hint,
                  });
                  setTimeout(
                    () =>
                      window.__denyAuth
                        ? options.error_callback({
                            type: 'popup_failed_to_open',
                          })
                        : options.callback({
                            access_token: 'FAKE-TOKEN',
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
      window.google.picker = {
        ViewId: { FOLDERS: 'folders' },
        Action: { PICKED: 'picked', CANCEL: 'cancel' },
        DocsView: class {
          setIncludeFolders() {
            return this;
          }
          setSelectFolderEnabled() {
            return this;
          }
        },
        PickerBuilder: class {
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
              if (origin !== window.location.origin) throw Error('Incorrect Picker origin');
              return this;
            }
          setTitle() {
            return this;
          }
          setCallback(cb) {
            this.cb = cb;
            return this;
          }
          build() {
            const cb = this.cb;
            return {
              setVisible() {
                cb({ action: 'picked', docs: [{ id: root }] });
              },
            };
          }
        },
      };
      window.gapi = { load: (name, opts) => opts.callback() };
    },
    { root: customRoot.id },
  );
  await context.route('https://www.googleapis.com/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      method = req.method();
    const json = (status, data, headers = {}) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'Access-Control-Expose-Headers': 'Location, Range',
          ...headers,
        },
        body: JSON.stringify(data),
      });
    if (url.pathname === '/drive/v3/about')
      return json(200, {
        user: {
          permissionId: cloud.permission,
          emailAddress: 'creator@example.com',
          displayName: 'Creator',
        },
      });
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') || '',
        space = url.searchParams.get('spaces');
      let rows = [...cloud.files.values()].filter((f) =>
        space === 'appDataFolder'
          ? f.parents?.includes('appDataFolder')
          : !f.parents?.includes('appDataFolder'),
      );
      for (const key of [
        'timContentWorkspace',
        'timStudioRoot',
        'timVideoProject',
      ]) {
        const match = q.match(
          new RegExp("key='" + key + "' and value='([^']*)'"),
        );
        if (match)
          rows = rows.filter((f) => f.appProperties?.[key] === match[1]);
      }
      const parent = q.match(/'([^']+)' in parents/);
      if (parent) rows = rows.filter((f) => f.parents?.includes(parent[1]));
      return json(200, { files: rows.map(({ content, ...f }) => f) });
    }
    const match = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (match && method === 'GET') {
      const f = cloud.files.get(match[1]);
      if (!f) return json(404, {});
      if (url.searchParams.get('alt') === 'media')
        return route.fulfill({
          contentType: 'application/json',
          body: f.content,
        });
      return json(200, { ...f, content: undefined });
    }
    if (url.pathname === '/drive/v3/files' && method === 'POST')
      return json(200, create(JSON.parse(req.postData())));
    if (url.pathname.startsWith('/upload/drive/v3/files')) {
      const type = url.searchParams.get('uploadType'),
        id = url.pathname.split('/')[5];
      if (type === 'multipart') {
        if (cloud.failSync) return json(503, {});
        const boundary = req.headers()['content-type'].split('boundary=')[1],
          parts = req
            .postDataBuffer()
            .toString()
            .split('--' + boundary),
          parse = (part) =>
            part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '');
        const meta = JSON.parse(parse(parts[1])),
          content = parse(parts[2]);
        return json(200, create(meta, content));
      }
      if (type === 'media') {
        if (cloud.failSync) return json(503, {});
        const f = cloud.files.get(id);
        if (!f) return json(404, {});
        f.content = req.postData();
        return json(200, { id: f.id });
      }
      if (type === 'resumable') {
        const meta = JSON.parse(req.postData());
        const session = 's' + cloud.next++;
        cloud.sessions.set(session, {
          meta,
          id: method === 'PATCH' ? id : null,
          bytes: [],
          accepted: 0,
        });
        return json(
          200,
          {},
          { Location: 'https://www.googleapis.com/upload/session/' + session },
        );
      }
    }
    if (url.pathname.startsWith('/upload/session/')) {
      if (cloud.failUpload) return json(503, {});
      const s = cloud.sessions.get(url.pathname.split('/').at(-1));
      const range = req.headers()['content-range'];
      if (
        cloud.failAfterFirst &&
        s.accepted > 0 &&
        !range.startsWith('bytes */')
      ) {
        cloud.failAfterFirst = false;
        return json(503, {});
      }
      if (range.startsWith('bytes */'))
        return json(
          308,
          {},
          s.accepted ? { Range: 'bytes=0-' + (s.accepted - 1) } : {},
        );
      const [, start, end, total] =
        range.match(/bytes (\d+)-(\d+)\/(\d+)/) || [];
      assert.equal(Number(start), s.accepted);
      const data = req.postDataBuffer();
      s.bytes.push(data);
      s.accepted += data.length;
      if (s.accepted < Number(total))
        return json(308, {}, { Range: 'bytes=0-' + (s.accepted - 1) });
      const content = Buffer.concat(s.bytes).toString();
      let f;
      if (s.id) {
        f = cloud.files.get(s.id);
        Object.assign(f, s.meta, { content, size: String(s.accepted) });
      } else f = create(s.meta, content);
      cloud.uploads++;
      return json(200, { id: f.id, name: f.name, webViewLink: f.webViewLink });
    }
    return json(400, { error: 'Unexpected ' + method + ' ' + url.pathname });
  });
}
(async () => {
  const srv = server();
  await new Promise((r) => (srv.listening ? r() : srv.once('listening', r)));
  const browser = await launchBrowser();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const artifacts = artifactDirectory('drive');
  const contexts = [];
  const errors = [];
  const device = async () => {
    const c = await browser.newContext({ acceptDownloads: true });
    contexts.push(c);
    await fakes(c);
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    await p.goto(base + '/content-planner/');
    return p;
  };
  const synced = async (p) => {
    await p.locator('#drive-sync').click();
    await p.waitForFunction(() => {
      const s = JSON.parse(
        localStorage.getItem('tim-content-drive-v1') || '{}',
      );
      return s.lastSynced && !document.querySelector('#drive-sync').disabled;
    });
  };
  try {
    const a = await device();
    await a.locator('#new').click();
    await a.locator('#title').fill('Marathon recap');
    await a.locator('#outline').fill('Hook\nB-roll: Finish line');
    const id = new URL(a.url()).hash.slice(1);
    await a.locator('#drive-connect').click();
    await a.waitForFunction(
      () =>
        !!JSON.parse(localStorage.getItem('tim-content-drive-v1') || '{}')
          .lastSynced,
    );
    await a.locator('#drive-choose-root').click();
    await a.waitForFunction(
      (root) =>
        JSON.parse(localStorage.getItem('tim-content-drive-v1') || '{}').root
          ?.id === root,
      customRoot.id,
    );
    await a.locator('[data-tab="assets"]').click();
    await a.locator('#drive-folder').click();
    await a
      .getByRole('link', { name: 'Open project folder', exact: true })
      .waitFor();
    const folder = await a.evaluate(
      () =>
        JSON.parse(localStorage.getItem('tim-content-planner-v1')).projects[0]
          .driveFolder.id,
    );
    assert.equal(cloud.files.get(folder).name, 'Marathon recap');
    assert.deepEqual(cloud.files.get(folder).parents, [customRoot.id]);
    await a.reload();
    await a.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem('tim-content-drive-v1') || '{}')
          .lastSynced,
    );
    await a.waitForFunction(() => window.__grants.length > 0);
    assert.equal(await a.evaluate(() => window.__grants[0].prompt), '');
    assert.equal(
      await a.evaluate(() => window.__grants[0].hint),
      'creator@example.com',
    );
    assert.equal(
      await a.evaluate(() =>
        JSON.stringify({ ...localStorage }).includes('FAKE-TOKEN'),
      ),
      false,
    );
    await a.locator('[data-tab="assets"]').click();
    await a
      .locator('#tools')
      .getByRole('link', { name: 'Cover Maker', exact: true })
      .click();
    await a.locator('#drive-export-destination').selectOption('drive');
    await a.waitForFunction(
      () => document.querySelector('#drive-connect').hidden,
    );
    await a.locator('#png').click();
    await a
      .waitForFunction(
        () =>
          document
            .querySelector('#drive-export-jobs')
            .textContent.includes('Saved '),
        null,
        { timeout: 12000 },
      )
      .catch(async (e) => {
        console.error(
          'Upload status:',
          await a.locator('#drive-export-jobs').innerText(),
        );
        throw e;
      });
    assert.equal(cloud.uploads, 1);
    assert(
      [...cloud.files.values()].some(
        (f) => f.mimeType === 'image/png' && f.parents?.includes(folder),
      ),
    );
    await a.locator('#drive-export-version').selectOption('replace');
    await a.locator('#png').click();
    await a.waitForFunction(
      () => document.querySelectorAll('#drive-export-jobs a').length === 2,
    );
    assert.equal(
      [...cloud.files.values()].filter((f) => f.mimeType === 'image/png')
        .length,
      1,
    );
    await a.locator('#drive-save-setup').click();
    await a.waitForFunction(
      () => document.querySelectorAll('#drive-export-jobs a').length === 3,
    );
    await a.reload();
    assert.equal(
      await a.locator('#drive-export-destination').inputValue(),
      'drive',
    );
    assert.equal(
      await a.locator('#drive-export-version').inputValue(),
      'replace',
    );
    await a.locator('#drive-sync').click();
    await a.waitForFunction(
      () => !document.querySelector('#drive-sync').disabled,
    );
    const b = await device();
    await b.locator('#drive-connect').click();
    await b.getByRole('button', { name: /Marathon recap/ }).click();
    assert.equal(
      await b.locator('#outline').inputValue(),
      'Hook\nB-roll: Finish line',
    );
    await b.locator('[data-tab="assets"]').click();
    await b.getByRole('link', { name: 'Edit saved setup' }).click();
    await b.getByRole('button', { name: 'Load Drive setup' }).click();
    await b.waitForFunction(() =>
      document
        .querySelector('#tim-project-status')
        .textContent.includes('from Drive'),
    );
    await b.goto(base + '/content-planner/#' + id);
    await b.locator('[data-tab="shoot"]').click();
    await b.locator('#generate').click();
    await b.locator('#film').click();
    await b.locator('#film-notes').fill('Take 3');
    await b.locator('[data-result="captured"]').click();
    await b.locator('#exit-film').click();
    await synced(b);
    await a.goto(base + '/content-planner/#' + id);
    await synced(a);
    await a.locator('[data-tab="shoot"]').click();
    assert.equal(
      await a.locator('.item').first().locator('textarea').inputValue(),
      'Take 3',
    );
    await a.locator('[data-tab="details"]').click();
    await a.locator('#title').fill('Renamed marathon');
    await a.locator('[data-tab="assets"]').click();
    await a.locator('#drive-folder').click();
    assert.equal(
      await a.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem('tim-content-planner-v1'),
          ).projects.find((p) => !p.deleted).driveFolder.id,
      ),
      folder,
    );
    assert.equal(
      [...cloud.files.values()].filter(
        (f) =>
          f.appProperties?.timVideoProject === id &&
          f.mimeType === 'application/vnd.google-apps.folder',
      ).length,
      1,
    );
    await a.goto(base + '/cover-maker/?videoProject=' + id);
    await a.waitForFunction(
      () => document.querySelector('#drive-connect').hidden,
    );
    cloud.failUpload = true;
    await a.locator('#png').click();
    await a
      .getByRole('button', { name: 'Retry upload', exact: true })
      .waitFor();
    const [download] = await Promise.all([
      a.waitForEvent('download'),
      a.getByRole('button', { name: 'Download instead', exact: true }).click(),
    ]);
    assert(download.suggestedFilename().endsWith('.png'));
    cloud.failUpload = false;
    await a.getByRole('button', { name: 'Retry upload', exact: true }).click();
    await a.getByRole('link', { name: 'Open asset', exact: true }).waitFor();
    cloud.failAfterFirst = true;
    const progress = await a.evaluate(async (id) => {
      const drive = await import('../shared/project-drive.mjs');
      const progress = [];
      await drive.uploadAsset(
        id,
        new Blob([new Uint8Array(9 * 1024 * 1024 + 37)], {
          type: 'video/webm',
        }),
        'large.webm',
        { tool: 'cover-maker', onProgress: (n) => progress.push(n) },
      );
      return progress;
    }, id);
    assert(progress.some((n) => n > 0 && n < 100));
    assert.equal(progress.at(-1), 100);
    cloud.permission = 'wrong-account';
    await a.reload();
    await a.waitForFunction(() =>
      document
        .querySelector('.tim-drive-controls')
        .textContent.includes('Choose creator@example.com'),
    );
    cloud.permission = 'account-1';
    await a.locator('#drive-connect').click();
    await a.waitForFunction(
      () => document.querySelector('#drive-connect').hidden,
    );
    await a.setViewportSize({ width: 390, height: 844 });
    await a.screenshot({
      path: path.join(artifacts, 'drive-export-phone.png'),
      fullPage: true,
    });
    assert(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await a.goto(base + '/carousel-maker/?videoProject=' + id);
    await a.locator('#drive-export-destination').selectOption('drive');
    await a.waitForFunction(
      () => document.querySelector('#drive-connect').hidden,
    );
    await a.locator('#export').click();
    await a.locator('#png').click();
    await a.waitForFunction(() =>
      document
        .querySelector('#drive-export-jobs')
        .textContent.includes('Saved '),
    );
    await a.goto(base + '/content-planner/#' + id);
    await synced(a);
    await a.locator('[data-tab="details"]').click();
    await a.locator('#delete').click();
    await synced(a);
    await synced(b);
    assert.equal(await b.locator('.card').count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      'Drive integration passed: remembered account/root/destination, project folders, PNG export/update, editable setup on a fresh device, checklist sync, rename, failure download/retry, mobile, deletion.',
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
