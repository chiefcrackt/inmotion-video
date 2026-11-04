// Start the server first, then: node local-voice/check-browser.cjs
// Needs data/test/noisy.mp4 (local-voice/tests/make_samples.py writes it).
const assert = require('node:assert/strict');
const path = require('node:path');
const { launchBrowser } = require('../tests/browser-utils.cjs');
(async () => {
  const browser = await launchBrowser();
  try {
    const base = process.env.CLEAN_VOICE_BASE || 'http://127.0.0.1:8766';
    const sample = path.join(
      __dirname,
      process.env.CLEAN_VOICE_SAMPLE || 'data/test/noisy.mp4',
    );
    for (const width of [400, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base);
      await page.setInputFiles('#file', sample);
      await page.selectOption('#mode', width === 400 ? 'isolate' : 'denoise');
      await page.selectOption(
        '#device',
        process.env.CLEAN_VOICE_DEVICE || 'auto',
      );
      await page.click('#start');
      await page.waitForFunction(
        () =>
          document.querySelectorAll('#downloads a').length > 0 ||
          document
            .querySelector('#status')
            .textContent.startsWith('Cleaning failed'),
        {},
        { timeout: 600000 },
      );
      const status = await page.locator('#status').textContent();
      assert.ok(!status.startsWith('Cleaning failed'), status);
      console.log(`${width}px:`, status);
      const links = await page
        .locator('#downloads a')
        .evaluateAll((a) => a.map((l) => l.getAttribute('href')));
      assert.equal(links.length, 2, 'video and WAV downloads');
      for (const href of links) {
        const response = await page.request.get(base + href);
        assert.equal(response.status(), 200, href);
        assert.match(
          response.headers()['content-disposition'],
          /attachment; filename=".*\(clean voice\)\.(mp4|wav)"/,
        );
        assert.ok(
          (await response.body()).length > 50000,
          href + ' has content',
        );
      }
      assert.equal(
        await page.locator('#ab-clean').getAttribute('aria-pressed'),
        'true',
      );
      await page.click('#ab-original');
      assert.equal(
        await page.locator('#video').evaluate((v) => v.muted),
        false,
      );
      await page.click('#ab-clean');
      assert.equal(await page.locator('#video').evaluate((v) => v.muted), true);
      const missingToken = await page.request.post(base + '/api/clean', {
        data: 'x',
      });
      assert.equal(missingToken.status(), 403, 'writes need the page token');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflow, false, `no sideways scrolling at ${width}px`);
      await page.screenshot({
        path: path.join(__dirname, `data/check-${width}.png`),
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(
      'Clean Voice browser check passed. Screenshots are in local-voice/data.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
