// Browser tests for the read-only Google Docs viewer (idea-vault/app.js).
// Google Docs API, Google Identity Services and Google Picker are replaced by
// in-memory fakes. No real account, token or network access is used.
// Viewport is iPhone-sized (390x844) for every case.
//
// Run: node tests/idea-vault-docs-browser.cjs
const assert = require('node:assert/strict');
const { launchBrowser, server } = require('./browser-utils.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IDEAS_KEY = 'tim-idea-vault-v1';
const DOC_ID = 'doc-race-plan_1';
const VIEWPORT = { width: 390, height: 844 };
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
};

// ---- Fixtures -------------------------------------------------------------

const LISTS = {
  L1: {
    listProperties: {
      nestingLevels: [{ glyphSymbol: '●' }, { glyphSymbol: '○' }],
    },
  },
  N1: {
    listProperties: {
      nestingLevels: [{ glyphType: 'DECIMAL' }, { glyphType: 'ALPHA' }],
    },
  },
  C1: { listProperties: { nestingLevels: [{ glyphSymbol: '☐' }] } },
};
const t = (content, style = {}) => ({ textRun: { content, textStyle: style } });
const para = (elements, named, bullet) => ({
  paragraph: {
    elements,
    paragraphStyle: { namedStyleType: named || 'NORMAL_TEXT' },
    ...(bullet ? { bullet } : {}),
  },
});
const cell = (text) => ({ content: [para([t(text + '\n')])] });
const row = (...cells) => ({ tableCells: cells.map(cell) });

function fixtureDoc(weekHeading = 'Week one') {
  return {
    title: 'Race plan',
    lists: LISTS,
    body: {
      content: [
        para([t(weekHeading + '\n')], 'HEADING_2'),
        para([
          t('Easy runs at '),
          t('conversational', { bold: true }),
          t(' pace.\n'),
        ]),
        para([t('Gels\n')], null, { listId: 'L1', nestingLevel: 0 }),
        para([t('Water\n')], null, { listId: 'L1', nestingLevel: 0 }),
        para([t('Warm up\n')], null, { listId: 'N1', nestingLevel: 0 }),
        para([t('Main set\n')], null, { listId: 'N1', nestingLevel: 0 }),
        para([t('Pack gels\n')], null, { listId: 'C1', nestingLevel: 0 }),
        { table: { tableRows: [row('Split', 'Pace'), row('Mile 1', '8:02')] } },
        para([t('<img src=x onerror="window.__pwned=1">\n')]),
      ],
    },
  };
}

function ideaFixture(extra = {}) {
  return {
    id: 'idea-1',
    title: 'Race plan video',
    notes: 'My production notes',
    platform: 'YouTube',
    category: 'General',
    kind: 'project',
    status: 'Inbox',
    priority: 'Normal',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    revision: 'r1',
    archived: false,
    sourceId: DOC_ID,
    docUrl: 'https://docs.google.com/document/d/' + DOC_ID + '/edit',
    ...extra,
  };
}

// ---- Fakes ----------------------------------------------------------------

function createFakeDocs() {
  return {
    docs: new Map([[DOC_ID, { content: fixtureDoc() }]]),
    granted: new Set(), // ids the Picker has granted to the app (drive.file)
    requests: [], // { method, id, auth }
    driveAttempts: [], // any call to www.googleapis.com (should stay empty)
    faults: [], // queued: { status } or { network: true }, consumed in order
  };
}

async function installFakes(context, docs, { configured = true } = {}) {
  await context.route('https://accounts.google.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  await context.route('https://apis.google.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  {
    const keys = configured
      ? "pickerApiKey: 'test-key', cloudProjectNumber: '123456'"
      : "pickerApiKey: '', cloudProjectNumber: ''";
    await context.route('**/idea-vault/config.js', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body:
          "window.TIM_IDEA_VAULT_CONFIG = { googleClientId: 'test-client', " +
          keys +
          ' };',
      }),
    );
  }
  await context.route('https://www.googleapis.com/**', (route) => {
    docs.driveAttempts.push(
      route.request().method() + ' ' + route.request().url(),
    );
    return route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: '{}',
    });
  });
  await context.route('https://fake-picker.test/**', (route) => {
    const id = new URL(route.request().url()).searchParams.get('id');
    docs.granted.add(id);
    return route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'text/plain',
      body: 'ok',
    });
  });
  await context.route('https://docs.googleapis.com/**', (route) => {
    const request = route.request();
    const id = decodeURIComponent(
      new URL(request.url()).pathname.replace('/v1/documents/', ''),
    );
    docs.requests.push({
      method: request.method(),
      id,
      auth: request.headers().authorization || '',
    });
    const json = (status, body) =>
      route.fulfill({
        status,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    const fault = docs.faults.shift();
    if (fault?.network) return route.abort('failed');
    if (fault)
      return json(fault.status, {
        error: { message: 'injected ' + fault.status },
      });
    if (!docs.docs.has(id) || !docs.granted.has(id))
      return json(404, {
        error: { message: 'Requested entity was not found.' },
      });
    const doc = docs.docs.get(id).content;
    return json(200, { documentId: id, ...doc });
  });
  await context.addInitScript(() => {
    window.google = window.google || {};
    window.google.accounts = {
      oauth2: {
        initTokenClient(options) {
          return {
            requestAccessToken() {
              setTimeout(
                () =>
                  options.callback({
                    access_token: 'docs-token-' + Date.now(),
                    expires_in: 3600,
                  }),
                0,
              );
            },
          };
        },
      },
    };
    window.gapi = {
      load(_name, options) {
        setTimeout(() => options.callback(), 0);
      },
    };
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
      setTitle() {
        return this;
      }
      setCallback(cb) {
        this._cb = cb;
        return this;
      }
      build() {
        const cb = this._cb;
        return {
          setVisible() {
            window.__pickerOpens = (window.__pickerOpens || 0) + 1;
            if ((window.__pickerMode || 'pick') === 'cancel') {
              cb({ action: 'cancel' });
              return;
            }
            fetch(
              'https://fake-picker.test/grant?id=' +
                encodeURIComponent(window.__pickerFileId),
            ).then(() =>
              cb({
                action: 'picked',
                documents: [{ id: window.__pickerFileId }],
              }),
            );
          },
        };
      }
    }
    class DocsView {
      setFileIds(ids) {
        window.__pickerFileId = ids[0];
        return this;
      }
    }
    window.google.picker = {
      PickerBuilder,
      DocsView,
      ViewId: { DOCUMENTS: 'documents' },
      Action: { PICKED: 'picked', CANCEL: 'cancel' },
      Response: { ACTION: 'action', DOCUMENTS: 'documents' },
    };
  });
}

// ---- Harness --------------------------------------------------------------

async function openDevice(
  browser,
  base,
  docs,
  { idea = ideaFixture(), configured = true } = {},
) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    hasTouch: true,
  });
  await installFakes(context, docs, { configured });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const seed = {
    [IDEAS_KEY]: JSON.stringify({ version: 1, ideas: idea ? [idea] : [] }),
  };
  await page.addInitScript((data) => {
    if (!sessionStorage.getItem('seeded')) {
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
      sessionStorage.setItem('seeded', '1');
    }
  }, seed);
  await page.goto(base + '/idea-vault/index.html');
  await page.waitForFunction(
    () => document.getElementById('cloudstatus') !== null,
  );
  return { context, page, errors };
}

async function openWorkspace(page) {
  await page
    .locator('#results article button', { hasText: 'Open workspace' })
    .first()
    .click();
  await page.waitForFunction(() =>
    document.getElementById('editor').classList.contains('open'),
  );
}

// Press the document button and wait until the load has finished (success or error).
async function pressDocButton(page) {
  await page.click('#doc-refresh');
  await page.waitForFunction(
    () =>
      document.getElementById('doc-viewer').getAttribute('aria-busy') ===
        'false' &&
      document.getElementById('doc-status').textContent.length > 0 &&
      !/^(Loading|Refreshing)/.test(
        document.getElementById('doc-status').textContent,
      ),
  );
}

async function docStatus(page) {
  return page.locator('#doc-status').textContent();
}
async function viewerText(page) {
  return page.locator('#doc-viewer').textContent();
}
async function storedIdeas(page) {
  return page.evaluate((key) => localStorage.getItem(key), IDEAS_KEY);
}

// ---- Cases ----------------------------------------------------------------

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test('the viewer loads through the Picker grant, renders structure, and fits an iPhone screen', async ({
  browser,
  base,
  docs,
}) => {
  const { context, page, errors } = await openDevice(browser, base, docs);
  await openWorkspace(page);
  assert.equal(
    await page.locator('#doc-section').isHidden(),
    false,
    'section shows for a linked doc',
  );

  await pressDocButton(page);
  assert.match(await docStatus(page), /Loaded .*Read-only copy/);
  assert.equal(
    await page.evaluate(() => window.__pickerOpens || 0),
    1,
    'Picker opened once for the grant',
  );
  assert.deepEqual(
    docs.requests.map((r) => r.method),
    ['GET', 'GET'],
    'first request is refused, then retried after the grant',
  );
  assert.ok(
    docs.requests.every((r) => r.auth.startsWith('Bearer ')),
    'requests carry the drive.file token',
  );

  assert.equal(await page.locator('.doc-heading').count(), 1);
  assert.equal(await page.locator('.doc-p').count(), 2);
  assert.equal(await page.locator('.doc-item').count(), 5);
  assert.equal(await page.locator('.doc-table td').count(), 4);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert.ok(
    overflow <= 1,
    'no horizontal page scroll at 390px (overflow ' + overflow + ')',
  );
  const buttonHeight = await page
    .locator('#doc-refresh')
    .evaluate((b) => b.getBoundingClientRect().height);
  assert.ok(
    buttonHeight >= 44,
    'touch target is at least 44px tall (' + buttonHeight + ')',
  );
  assert.deepEqual(errors, [], 'no page errors');
  await context.close();
});

test('lists and formatting: bullets, numbers, checkboxes and bold text are shown as such', async ({
  browser,
  base,
  docs,
}) => {
  const { context, page } = await openDevice(browser, base, docs);
  await openWorkspace(page);
  await pressDocButton(page);
  const markers = await page.locator('.doc-item .doc-marker').allTextContents();
  assert.deepEqual(markers, ['•', '•', '1.', '2.', '☐']);
  assert.equal(
    await page
      .locator('.doc-viewer strong', { hasText: 'conversational' })
      .count(),
    1,
  );
  assert.equal(
    await page.locator('.doc-list[role=list] .doc-item[role=listitem]').count(),
    5,
  );
  assert.equal(
    await page.locator('.doc-marker').first().getAttribute('aria-hidden'),
    'true',
  );
  await context.close();
});

test('document text is shown as plain text and never runs as markup', async ({
  browser,
  base,
  docs,
}) => {
  const { context, page } = await openDevice(browser, base, docs);
  await openWorkspace(page);
  await pressDocButton(page);
  assert.equal(
    await page.locator('#doc-viewer img').count(),
    0,
    'no image element created',
  );
  assert.equal(
    await page.evaluate(() => window.__pwned),
    undefined,
    'injected handler did not run',
  );
  assert.match(
    await viewerText(page),
    /<img src=x onerror="window\.__pwned=1">/,
  );
  await context.close();
});

test('read-only: viewing sends only GET requests and changes neither ideas nor notes', async ({
  browser,
  base,
  docs,
}) => {
  const { context, page } = await openDevice(browser, base, docs);
  await openWorkspace(page);
  const before = await storedIdeas(page);
  const keysBefore = await page.evaluate(() =>
    Object.keys(localStorage).sort(),
  );
  await pressDocButton(page);
  await pressDocButton(page);

  assert.ok(docs.requests.length > 0);
  assert.ok(
    docs.requests.every((r) => r.method === 'GET'),
    'only GET requests to Google Docs',
  );
  assert.deepEqual(docs.driveAttempts, [], 'no Drive calls from viewing');
  assert.equal(await storedIdeas(page), before, 'stored ideas are unchanged');
  assert.deepEqual(
    await page.evaluate(() => Object.keys(localStorage).sort()),
    keysBefore,
    'no new storage keys (no token or content saved)',
  );
  assert.equal(
    await page.inputValue('#e-notes'),
    'My production notes',
    'production notes unchanged',
  );
  await context.close();
});

test('Refresh document loads the latest version of the document', async ({
  browser,
  base,
  docs,
}) => {
  const { context, page } = await openDevice(browser, base, docs);
  await openWorkspace(page);
  await pressDocButton(page);
  assert.match(await viewerText(page), /Week one/);
  assert.equal(
    await page.locator('#doc-refresh').textContent(),
    'Refresh document',
  );

  docs.docs.set(DOC_ID, { content: fixtureDoc('Week two') });
  await pressDocButton(page);
  assert.match(await viewerText(page), /Week two/);
  assert.doesNotMatch(await viewerText(page), /Week one/);
  assert.match(await docStatus(page), /Loaded/);
  await context.close();
});

test('a failed refresh keeps the last content on screen and says why it is not current', async ({
  browser,
  base,
  docs,
}) => {
  const { context, page } = await openDevice(browser, base, docs);
  await openWorkspace(page);
  await pressDocButton(page);
  docs.faults.push({ status: 503 });
  await pressDocButton(page);
  assert.match(
    await viewerText(page),
    /Week one/,
    'last good content still shown',
  );
  assert.match(
    await docStatus(page),
    /temporarily unavailable.*Showing the version loaded at/,
  );
  await context.close();
});

test('expired authorization asks for sign-in, and pressing again recovers', async ({
  browser,
  base,
  docs,
}) => {
  const { context, page } = await openDevice(browser, base, docs);
  await openWorkspace(page);
  docs.faults.push({ status: 401 });
  await pressDocButton(page);
  assert.match(
    await docStatus(page),
    /authorization expired\. Press Refresh document to sign in again/,
  );
  assert.equal(
    await page.locator('#doc-viewer .doc-heading').count(),
    0,
    'no content shown after expiry',
  );

  await pressDocButton(page);
  assert.match(await docStatus(page), /Loaded/);
  assert.match(await viewerText(page), /Week one/);
  await context.close();
});

test('a Picker the user closes without choosing shows a clear message, then recovers', async ({
  browser,
  base,
  docs,
}) => {
  const { context, page } = await openDevice(browser, base, docs);
  await openWorkspace(page);
  await page.evaluate(() => {
    window.__pickerMode = 'cancel';
  });
  await pressDocButton(page);
  assert.match(await docStatus(page), /Document access was not granted/);
  assert.equal(
    await page.locator('#doc-viewer .doc-heading').count(),
    0,
    'no content without a grant',
  );
  assert.equal(docs.granted.has(DOC_ID), false);

  await page.evaluate(() => {
    window.__pickerMode = 'pick';
  });
  await pressDocButton(page);
  assert.match(await docStatus(page), /Loaded/);
  assert.equal(docs.granted.has(DOC_ID), true);
  await context.close();
});

test('a network failure shows a clear message, and retry works', async ({
  browser,
  base,
  docs,
}) => {
  const { context, page } = await openDevice(browser, base, docs);
  await openWorkspace(page);
  docs.faults.push({ network: true });
  await pressDocButton(page);
  assert.match(
    await docStatus(page),
    /Could not reach Google Docs\. Check your connection/,
  );
  await pressDocButton(page);
  assert.match(await docStatus(page), /Loaded/);
  await context.close();
});

test('without Picker setup the viewer explains what is missing instead of failing silently', async ({
  browser,
  base,
  docs,
}) => {
  const { context, page } = await openDevice(browser, base, docs, {
    configured: false,
  });
  await openWorkspace(page);
  // The repo ships with empty Picker keys, so a grant cannot be made.
  await pressDocButton(page);
  assert.match(await docStatus(page), /needs Google Picker setup/);
  await context.close();
});

test('an idea without a linked Google Doc hides the document section', async ({
  browser,
  base,
  docs,
}) => {
  const { context, page } = await openDevice(browser, base, docs, {
    idea: ideaFixture({ sourceId: undefined, docUrl: undefined }),
  });
  await openWorkspace(page);
  assert.equal(await page.locator('#doc-section').isHidden(), true);
  assert.equal(docs.requests.length, 0);
  await context.close();
});

test("the section for one idea does not show another idea's content", async ({
  browser,
  base,
  docs,
}) => {
  const { context, page } = await openDevice(browser, base, docs);
  await openWorkspace(page);
  await pressDocButton(page);
  await page.click('#close');
  await page.evaluate(
    (other) => {
      const data = JSON.parse(localStorage.getItem('tim-idea-vault-v1'));
      data.ideas.push(other);
      localStorage.setItem('tim-idea-vault-v1', JSON.stringify(data));
    },
    ideaFixture({
      id: 'idea-2',
      title: 'Second idea',
      sourceId: undefined,
      docUrl: undefined,
      revision: 'r2',
    }),
  );
  await page.reload();
  await page
    .locator('#results article', { hasText: 'Second idea' })
    .locator('button')
    .click();
  await page.waitForFunction(() =>
    document.getElementById('editor').classList.contains('open'),
  );
  assert.equal(await page.locator('#doc-section').isHidden(), true);
  assert.equal(await page.locator('#doc-viewer .doc-heading').count(), 0);
  await context.close().catch(() => {});
});

test('repeated refreshes and reopening the idea never stack requests or duplicate content', async ({
  browser,
  base,
  docs,
}) => {
  const { context, page } = await openDevice(browser, base, docs);
  await openWorkspace(page);
  await pressDocButton(page);
  const afterFirst = docs.requests.length;

  // Rapid presses while a load is running must not stack requests.
  for (let k = 0; k < 5; k++)
    await page.click('#doc-refresh', { force: true }).catch(() => {});
  await page.waitForFunction(
    () =>
      document.getElementById('doc-viewer').getAttribute('aria-busy') ===
        'false' &&
      !/^(Loading|Refreshing)/.test(
        document.getElementById('doc-status').textContent,
      ),
  );
  await sleep(300);
  assert.ok(
    docs.requests.length - afterFirst <= 5,
    'at most one request per press',
  );
  assert.equal(
    await page.locator('#doc-viewer .doc-heading').count(),
    1,
    'no duplicated headings',
  );
  assert.equal(
    await page.locator('#doc-viewer .doc-p').count(),
    2,
    'no duplicated paragraphs',
  );

  // Closing and reopening the idea refreshes once, silently, without a popup.
  for (let k = 0; k < 3; k++) {
    await page.click('#close');
    const before = docs.requests.length;
    await page
      .locator('#results article button', { hasText: 'Open workspace' })
      .first()
      .click();
    await page.waitForFunction(() =>
      document.getElementById('editor').classList.contains('open'),
    );
    await page.waitForFunction(
      () =>
        document.getElementById('doc-viewer').getAttribute('aria-busy') ===
        'false',
    );
    await sleep(300);
    assert.ok(docs.requests.length - before <= 1, 'one refresh per open');
    assert.equal(
      await page.locator('#doc-viewer .doc-heading').count(),
      1,
      'still one copy after reopen',
    );
  }
  assert.equal(
    await page.evaluate(() => window.__pickerOpens || 0),
    1,
    'no Picker popup on reopen',
  );
  await context.close();
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
      const docs = createFakeDocs();
      try {
        await fn({ browser, base, docs });
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
