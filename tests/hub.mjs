import { launchBrowser, server, artifactDirectory } from './browser-utils.cjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  TOOLS,
  WORKSPACES,
  DASHBOARD_GROUPS,
  dashboardEntries,
  searchDashboard,
} from '../shared/tool-registry.mjs';

// Homepage (studio dashboard) checks. Every expected count comes from the
// registry, so adding a tool or studio cannot silently break or bypass this test.
const artifacts = artifactDirectory('hub');

// Pages that are deliberately not linked from the homepage.
const UNLISTED = new Set(['dashboard-preview/', 'spot-it/']);

const pageDirs = readdirSync('.', { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
  .filter((d) => existsSync(`${d.name}/index.html`) && /<title\b/i.test(readFileSync(`${d.name}/index.html`, 'utf8')))
  .map((d) => d.name + '/');

const entries = dashboardEntries();
const reachable = new Set([
  ...TOOLS.map((t) => t.href),
  ...DASHBOARD_GROUPS.map((g) => g.href),
]);
const unreachable = pageDirs.filter((d) => !reachable.has(d) && !UNLISTED.has(d));
assert.deepEqual(unreachable, [], 'Every tool page is registered or explicitly unlisted');

const http = server(0);
await new Promise((r) => http.on('listening', r));
const base = `http://127.0.0.1:${http.address().port}/`;
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(base);

  const cards = page.locator('[data-entry]');
  const visibleCards = page.locator('[data-entry]:visible');
  assert.equal(await cards.count(), entries.length);
  assert.equal(await visibleCards.count(), entries.length);

  // Every studio card and every original tool link opens a page with one h1.
  const hrefs = [
    ...(await page.locator('[data-entry] a.primary').evaluateAll((a) => a.map((x) => x.getAttribute('href')))),
    ...(await page.locator('#originals a').evaluateAll((a) => a.map((x) => x.getAttribute('href')))),
  ];
  assert.deepEqual(new Set(hrefs), reachable);
  const probe = await browser.newPage();
  probe.on('pageerror', (e) => errors.push(`${e.message}`));
  await probe.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  for (const href of reachable) {
    await probe.goto(base + href, { waitUntil: 'domcontentloaded' });
    await probe.locator('h1').first().waitFor({ state: 'attached' });
    assert.equal(await probe.locator('h1').count(), 1, `${href} has one h1`);
  }
  await probe.close();

  // Workspace filters match the registry search.
  for (const workspace of WORKSPACES) {
    await page.locator(`[data-workspace="${workspace.id}"]`).click();
    assert.equal(
      await visibleCards.count(),
      searchDashboard('', { workspace: workspace.id }).length,
      `${workspace.name} filter`,
    );
  }
  await page.locator('#reset').click();
  for (const query of ['GPS route', 'birthday', 'thumbnail']) {
    await page.locator('#query').fill(query);
    assert.equal(await visibleCards.count(), searchDashboard(query).length, `search "${query}"`);
    assert.ok((await visibleCards.count()) > 0, `search "${query}" finds something`);
  }
  await page.locator('#query').fill('no such tool');
  assert.equal(await page.locator('#empty').isVisible(), true);
  await page.locator('#reset').click();
  assert.equal(await visibleCards.count(), entries.length);
  await page.screenshot({ path: path.join(artifacts, 'hub-desktop.png'), fullPage: true });

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll at ${width}px`);
    // A studio card starts on the first phone screen.
    const top = await page.locator('[data-entry]').first().evaluate((el) => el.getBoundingClientRect().top);
    assert.ok(top < 640, `first studio card visible without scrolling at ${width}px (top ${Math.round(top)})`);
    await page.locator('[data-workspace="running"]').click();
    assert.equal(await visibleCards.count(), searchDashboard('', { workspace: 'running' }).length);
    await page.locator('#reset').click();
  }
  await page.screenshot({ path: path.join(artifacts, 'hub-mobile.png'), fullPage: true });

  const plain = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await plain.newPage();
  await fallback.goto(base);
  assert.equal(await fallback.locator('[data-entry]:visible').count(), entries.length);
  assert.equal(await fallback.locator('.finder').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(
    `Hub passed: ${entries.length} studio cards, ${reachable.size} pages reachable, filters, search, phone widths and no-JavaScript access.`,
  );
} finally {
  await browser?.close();
  http.close();
}
