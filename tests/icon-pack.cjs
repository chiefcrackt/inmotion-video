const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { launchBrowser, server, artifactDirectory } = require('./browser-utils.cjs');
(async () => {
  const { icons } = await import('../icon-pack/icons.mjs');
  const { getTool, toolsInWorkspace, searchTools } = await import('../shared/tool-registry.mjs');
  assert.equal(icons.length, 24);
  assert.equal(new Set(icons.map(i => i.id)).size, 24);
  assert.equal(icons.filter(i => i.category === 'running').length, 12);
  assert.equal(icons.filter(i => i.category === 'creator').length, 12);
  assert.equal(getTool('icon-pack').href, 'icon-pack/');
  assert(toolsInWorkspace('library').some(t => t.id === 'icon-pack'));
  assert(searchTools('svg').some(t => t.id === 'icon-pack'));
  const srv = server(); await new Promise(r => srv.listening ? r() : srv.once('listening', r));
  const browser = await launchBrowser(), base = 'http://127.0.0.1:' + srv.address().port;
  const out = artifactDirectory('icon-pack');
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // Homepage navigation is covered by tests/hub.mjs.
    await page.goto(base + '/icon-pack/');
    await page.locator('.card').last().waitFor();
    assert.equal(await page.locator('.card').count(), 24);
    for (const icon of icons) {
      const svgResponse = await page.request.get(base + `/icon-pack/files/svg/${icon.id}.svg`);
      assert.equal(svgResponse.status(), 200);
      const source = await svgResponse.text();
      assert(!source.includes('fill="G"') && !source.includes('stroke="T"'));
      assert(!/<(?:script|image|foreignObject)\b/.test(source));
      const pixels = await page.evaluate(async id => {
        const im = new Image(); im.src = `files/png/${id}.png`; await im.decode();
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const p = x.getImageData(0, 0, c.width, c.height).data;
        let filled = 0, edge = 0;
        for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) {
          const alpha = p[(y * c.width + xx) * 4 + 3];
          if (alpha) { filled++; if (y === 0 || xx === 0 || y === c.height - 1 || xx === c.width - 1) edge++; }
        }
        return { width: c.width, height: c.height, filled, edge };
      }, icon.id);
      assert.equal(pixels.width, 1024); assert.equal(pixels.height, 1024);
      assert(pixels.filled > 30000 && pixels.filled < 900000, icon.id + ' has visible art and transparency');
      assert.equal(pixels.edge, 0, icon.id + ' has no clipped artwork');
    }
    await page.getByRole('button', { name: 'Running', exact: true }).click();
    assert.equal(await page.locator('.card:visible').count(), 12);
    await page.getByRole('button', { name: 'Creator', exact: true }).click();
    assert.equal(await page.locator('.card:visible').count(), 12);
    await page.getByRole('button', { name: 'All icons', exact: true }).click();
    await page.getByRole('button', { name: 'Dark preview' }).click();
    assert.equal(await page.locator('#backdrop').getAttribute('aria-pressed'), 'true');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ' has no horizontal overflow');
    }
    await page.getByRole('button', { name: 'Dark preview' }).click();
    await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
    for (const selector of ['.download', '.files a[href$="running-shoe.png"]', '.files a[href$="running-shoe.svg"]']) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
      const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const expected = await readFile(path.join(__dirname, '..', 'icon-pack', await page.locator(selector).getAttribute('href')));
      assert(bytes.equals(expected), selector + ' downloads the exact generated asset');
    }
    await page.goto(base + '/downloads/');
    await page.locator('#icon-pack a[aria-label]').click();
    assert.equal(new URL(page.url()).pathname, '/icon-pack/');
    assert.deepEqual(errors, []);
    const noJS = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await noJS.newPage(); await staticPage.goto(base + '/icon-pack/');
    assert.equal(await staticPage.locator('.card').count(), 24);
    assert.equal(await staticPage.locator('a[download]').count(), 49);
    await noJS.close();
    console.log('Icon pack passed: all assets, alpha, bounds, downloads, filters, library navigation, phone/desktop layout and no-JS access.');
  } finally { await browser.close(); srv.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
