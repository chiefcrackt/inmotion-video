// Browser tests for the T.IM Studio homepage (index.html).
// Checks rendering, derived counts, search, workspace filters and layout at
// iPhone and desktop widths. Optional screenshots go to STUDIO_SHOTS if set.
//
// Run: node tests/studio-home-browser.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { launchBrowser, server } = require('./browser-utils.cjs');

const SHOTS = process.env.STUDIO_SHOTS || '';
const VIEWPORTS = [
  { name: 'iPhone 390', width: 390, height: 844, mobile: true },
  { name: 'desktop 1280', width: 1280, height: 800, mobile: false },
];

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

async function open(browser, base, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(base + '/index.html');
  await page.waitForFunction(() => document.querySelectorAll('#tool-list .tool').length > 0);
  return { context, page, errors };
}

for (const vp of VIEWPORTS) {
  test(`${vp.name}: renders every tool, counts match the registry, and nothing overflows`, async ({ browser, base }) => {
    const { context, page, errors } = await open(browser, base, vp);
    assert.equal(await page.locator('#tool-list .tool').count(), 17);
    assert.equal(await page.locator('#ws-list .ws').count(), 6);
    assert.equal(await page.locator('#quick a').count(), 6);
    assert.equal(await page.locator('#result-count').textContent(), 'Showing all 17 tools');
    assert.equal(await page.locator('#total-count').textContent(), '17 tools in 6 workspaces');
    assert.equal(await page.locator('#feature').getAttribute('href'), 'idea-vault/');

    const counts = await page.locator('#ws-list .ws .count').allTextContents();
    assert.deepEqual(counts, ['1 tool', '10 tools', '4 tools', '2 tools', '4 tools', '1 tool']);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, 'no horizontal scroll (overflow ' + overflow + ')');
    assert.deepEqual(errors, [], 'no console or page errors');
    await context.close();
  });

  test(`${vp.name}: every tool card links to a canonical page`, async ({ browser, base }) => {
    const { context, page } = await open(browser, base, vp);
    const hrefs = await page.locator('#tool-list .tool').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    assert.equal(new Set(hrefs).size, hrefs.length, 'no duplicate tool links');
    for (const href of hrefs) {
      const status = await page.evaluate(async (u) => (await fetch(u)).status, base + '/' + href + 'index.html');
      assert.equal(status, 200, href + ' loads');
    }
    await context.close();
  });
}

test('search narrows results and reports the count, case-insensitively', async ({ browser, base }) => {
  const { context, page } = await open(browser, base, VIEWPORTS[0]);
  await page.fill('#q', 'CAPCUT');
  assert.equal(await page.locator('#tool-list .tool').count(), 2);
  assert.equal(await page.locator('#result-count').textContent(), 'Showing 2 of 17 tools');
  await page.fill('#q', 'zzqqx');
  assert.equal(await page.locator('#empty').isVisible(), true);
  await page.click('#reset');
  assert.equal(await page.locator('#tool-list .tool').count(), 17);
  assert.equal(await page.locator('#empty').isHidden(), true);
  await context.close();
});

test('workspace chips filter the list and report aria-pressed state', async ({ browser, base }) => {
  const { context, page } = await open(browser, base, VIEWPORTS[0]);
  await page.click('[data-chip="audio"]');
  const names = await page.locator('#tool-list .tool h3').allTextContents();
  assert.deepEqual(names.sort(), ['Beat Bed', 'Sound Forge']);
  assert.equal(await page.getAttribute('[data-chip="audio"]', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('[data-chip="all"]', 'aria-pressed'), 'false');
  await page.click('[data-chip="all"]');
  assert.equal(await page.locator('#tool-list .tool').count(), 17);
  await context.close();
});

test('tapping a workspace card filters All tools to that workspace', async ({ browser, base }) => {
  const { context, page } = await open(browser, base, VIEWPORTS[0]);
  await page.click('#ws-running');
  const names = await page.locator('#tool-list .tool h3').allTextContents();
  assert.deepEqual(names.sort(), ['Activity Studio', 'Mile Marker Maker', 'River Run Recorder', 'Start Line Recorder']);
  await context.close();
});

test('keyboard: chips and search are reachable and labelled', async ({ browser, base }) => {
  const { context, page } = await open(browser, base, VIEWPORTS[1]);
  assert.equal(await page.getAttribute('#q', 'type'), 'search');
  const labelled = await page.evaluate(() => !!document.querySelector('label.search .sr-only'));
  assert.ok(labelled, 'search input has an accessible label');
  await page.focus('[data-chip="graphics"]');
  await page.keyboard.press('Enter');
  assert.equal(await page.getAttribute('[data-chip="graphics"]', 'aria-pressed'), 'true');
  await context.close();
});

test('mobile: bottom navigation is visible with 44px+ touch targets; desktop hides it', async ({ browser, base }) => {
  const mobile = await open(browser, base, VIEWPORTS[0]);
  assert.equal(await mobile.page.locator('nav.bottom').isVisible(), true);
  const heights = await mobile.page.locator('nav.bottom a').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  assert.ok(heights.every((h) => h >= 44), 'touch targets ≥ 44px: ' + heights.join(','));
  await mobile.context.close();

  const desktop = await open(browser, base, VIEWPORTS[1]);
  assert.equal(await desktop.page.locator('nav.bottom').isVisible(), false);
  assert.equal(await desktop.page.locator('.desk-nav').isVisible(), true);
  await desktop.context.close();
});

test('screenshots for the PR (only when STUDIO_SHOTS is set)', async ({ browser, base }) => {
  if (!SHOTS) return;
  for (const vp of VIEWPORTS) {
    const { context, page } = await open(browser, base, vp);
    const file = path.join(SHOTS, 'home-' + (vp.mobile ? 'mobile' : 'desktop') + '.png');
    await page.screenshot({ path: file, fullPage: true });
    await context.close();
  }
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
