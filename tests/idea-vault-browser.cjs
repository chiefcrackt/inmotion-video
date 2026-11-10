// Browser tests for Idea Vault (idea-vault/app.js), which saves on this device.
// Cross-device sync is Content Studio's Workspace cloud sync (Supabase), tested
// in tests/content-studio.cjs. Google Drive was removed in November 2026; these
// checks also make sure no Google request is ever made.
//
// Run: node tests/idea-vault-browser.cjs
const assert = require('node:assert/strict');
const { launchBrowser, server } = require('./browser-utils.cjs');

const KEY = 'tim-idea-vault-v1';
const cases = [];
const test = (name, fn) => cases.push({ name, fn });

async function openVault(browser, base, seed) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const google = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  page.on('request', (r) => {
    if (/googleapis\.com|accounts\.google\.com|apis\.google\.com/.test(r.url()) && !/fonts\./.test(r.url()))
      google.push(r.url());
  });
  if (seed) {
    await page.addInitScript((data) => {
      if (!sessionStorage.getItem('seeded')) {
        for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
        sessionStorage.setItem('seeded', '1');
      }
    }, seed);
  }
  await page.goto(base + '/idea-vault/');
  await page.locator('#cloudstatus').waitFor();
  return { context, page, errors, google };
}

const stored = (page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{"ideas":[]}').ideas, KEY);
const liveTitles = async (page) =>
  (await stored(page)).filter((i) => !i.archived).map((i) => i.title).sort();

async function addIdea(page, title) {
  await page.fill('#capture input[name=title]', title);
  await page.click('#capture button[type=submit]');
}

test('the page has no Google Drive controls and makes no Google requests', async ({ browser, base }) => {
  const v = await openVault(browser, base);
  await addIdea(v.page, 'No cloud needed');
  const text = await v.page.locator('body').innerText();
  assert.doesNotMatch(text, /google drive|connect google|sync now/i);
  assert.equal(await v.page.locator('#connect, #sync, #import-drive, #doc-section').count(), 0);
  assert.match(await v.page.locator('#cloudstatus').innerText(), /Saved on this device/);
  assert.deepEqual(v.google, []);
  assert.deepEqual(v.errors, []);
  await v.context.close();
});

test('a captured idea and an edit survive a reload', async ({ browser, base }) => {
  const v = await openVault(browser, base);
  await addIdea(v.page, 'Trail shoe review');
  assert.match(await v.page.locator('#message').innerText(), /saved on this device/i);
  await v.page.locator('#results article', { hasText: 'Trail shoe review' }).locator('button').click();
  await v.page.fill('#e-notes', 'Film at the river');
  await v.page.click('#save');
  await v.page.reload();
  assert.deepEqual(await liveTitles(v.page), ['Trail shoe review']);
  assert.equal((await stored(v.page))[0].notes, 'Film at the river');
  assert.deepEqual(v.errors, []);
  await v.context.close();
});

test('unreadable local data is preserved rather than erased by the next save', async ({ browser, base }) => {
  const broken = '{"version":1,"ideas":[oops';
  const v = await openVault(browser, base, { [KEY]: broken });
  const kept = () => v.page.evaluate(() => localStorage.getItem('tim-idea-vault-unreadable-v1'));
  assert.equal(await kept(), broken);
  await addIdea(v.page, 'New after corruption');
  assert.equal(await kept(), broken, 'the raw copy survives further saves');
  await v.context.close();
});

test('a full browser storage is reported instead of failing silently', async ({ browser, base }) => {
  const v = await openVault(browser, base);
  await v.page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
  });
  await addIdea(v.page, 'Will not fit');
  assert.match(await v.page.locator('#message').innerText(), /could not save/i);
  assert.deepEqual(v.errors, []);
  await v.context.close();
});

function conflictSeed() {
  const original = { id: 'a', title: 'Original title', notes: '', platform: 'YouTube', category: 'General', status: 'Inbox', priority: 'Normal', revision: 'r1', updatedAt: '2026-11-01T00:00:00Z', archived: false };
  const copy = { ...original, id: 'b', title: 'Copy title', revision: 'r2', conflictOf: 'a' };
  return { [KEY]: JSON.stringify({ version: 1, ideas: [original, copy] }) };
}

test('"Use this version" replaces the original with the conflict copy', async ({ browser, base }) => {
  const v = await openVault(browser, base, conflictSeed());
  await v.page.locator('#results article', { hasText: 'Conflict copy' }).locator('button').click();
  await v.page.click('#resolve-use');
  assert.deepEqual(await liveTitles(v.page), ['Copy title']);
  assert.equal(await v.page.locator('#results article').count(), 1);
  await v.context.close();
});

test('"Keep original" archives the conflict copy', async ({ browser, base }) => {
  const v = await openVault(browser, base, conflictSeed());
  await v.page.locator('#results article', { hasText: 'Conflict copy' }).locator('button').click();
  await v.page.click('#resolve-discard');
  assert.deepEqual(await liveTitles(v.page), ['Original title']);
  await v.context.close();
});

test('backup import is additive and export downloads every idea', async ({ browser, base }) => {
  const v = await openVault(browser, base);
  await addIdea(v.page, 'Already here');
  const backup = { version: 1, ideas: [{ id: 'x', title: 'From backup', revision: 'r1' }] };
  await v.page.setInputFiles('#importfile', {
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await v.page.waitForFunction(() => /Imported/.test(document.getElementById('message').textContent));
  assert.deepEqual(await liveTitles(v.page), ['Already here', 'From backup']);
  const [download] = await Promise.all([v.page.waitForEvent('download'), v.page.click('#export')]);
  const text = await require('node:fs/promises').readFile(await download.path(), 'utf8');
  assert.equal(JSON.parse(text).ideas.length, 2);
  await v.context.close();
});

(async () => {
  const srv = server(0);
  await new Promise((resolve) => (srv.listening ? resolve() : srv.once('listening', resolve)));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await launchBrowser();
  let failed = 0;
  try {
    for (const { name, fn } of cases) {
      try {
        await fn({ browser, base });
        console.log('ok   - ' + name);
      } catch (error) {
        failed++;
        console.log('FAIL - ' + name + '\n       ' + error.message.split('\n').slice(0, 6).join('\n       '));
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n${cases.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
