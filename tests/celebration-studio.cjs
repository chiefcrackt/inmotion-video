const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  server,
  launchBrowser,
  artifactDirectory,
} = require('./browser-utils.cjs');

(async () => {
  const http = server();
  await new Promise((r) => (http.listening ? r() : http.once('listening', r)));
  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    const base = `http://127.0.0.1:${http.address().port}`;
    const artifacts = artifactDirectory('celebration-studio');
    await page.goto(
      base + '/celebration-studio/?videoProject=test-project#cards',
    );
    assert.match(
      await page.locator('iframe').getAttribute('src'),
      /celebrate\/\?videoProject=test-project/,
    );
    await page.goto(base + '/celebration-studio/#cards');
    for (const mode of ['cards', 'runners']) {
      await page.locator(`[data-mode="${mode}"]`).first().click();
      const frame = page.frameLocator(`iframe[data-mode="${mode}"]`);
      await frame.locator('#tim-projects').waitFor();
      await frame.locator('#name').fill('Studio ' + mode);
      await frame.locator('#name').dispatchEvent('input');
      await frame.locator('#tim-projects').evaluate((el) => (el.open = true));
      await frame.locator('#tim-project-name').fill('Studio saved ' + mode);
      await frame.locator('#tim-project-save').click();
      await frame
        .locator('#tim-project-status')
        .filter({ hasText: 'Saved a new' })
        .waitFor();
      for (const [button, extension] of [
        ['#still', /\.png$/],
        ['#wav', /\.wav$/],
      ]) {
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          frame.locator(button).click(),
        ]);
        assert.match(download.suggestedFilename(), extension);
        const target = path.join(
          artifacts,
          mode + '-' + download.suggestedFilename(),
        );
        await download.saveAs(target);
        assert.ok((await fs.stat(target)).size > 100);
      }
      await frame.locator('#rec').click();
      const other = mode === 'cards' ? 'runners' : 'cards';
      await page.locator(`a[data-mode="${other}"]`).click();
      assert.match(
        await page.locator('#status').textContent(),
        /Finish recording/,
      );
      assert.equal(
        await page.locator(`iframe[data-mode="${mode}"]`).isVisible(),
        true,
      );
      await frame
        .locator('#result')
        .waitFor({ state: 'visible', timeout: 60000 });
      const [video] = await Promise.all([
        page.waitForEvent('download'),
        frame.locator('#save').click(),
      ]);
      const target = path.join(
        artifacts,
        mode + '-' + video.suggestedFilename(),
      );
      await video.saveAs(target);
      assert.ok((await fs.stat(target)).size > 1000);
      const media = await frame.locator('#vid').evaluate(async (el) => {
        if (el.readyState < 1)
          await new Promise((resolve) =>
            el.addEventListener('loadedmetadata', resolve, { once: true }),
          );
        return {
          width: el.videoWidth,
          height: el.videoHeight,
          duration: el.duration,
        };
      });
      assert.ok(media.width > 0 && media.height > 0 && media.duration > 0);
    }
    // Hidden editors stay mounted: drafts, saved setups and generated videos survive mode changes.
    await page.locator('a[data-mode="cards"]').click();
    const cards = page.frameLocator('iframe[data-mode="cards"]');
    assert.equal(await cards.locator('#name').inputValue(), 'Studio cards');
    assert.equal(await cards.locator('#result').isVisible(), true);
    await cards.locator('#play').click();
    await page.locator('a[data-mode="runners"]').click();
    assert.match(
      await page.locator('#status').textContent(),
      /stop the preview/,
    );
    await cards.locator('#play').click();
    await page.locator('a[data-mode="cards"]').click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => {
        const frame = document.querySelector('iframe:not([hidden])');
        return (
          frame.clientHeight >=
          frame.contentDocument.body.getBoundingClientRect().height
        );
      });
      assert.ok(
        await cards
          .locator('#cv')
          .evaluate((el) => el.getBoundingClientRect().height <= 559),
        'Preview fits the browser viewport',
      );
      await page.screenshot({
        path: path.join(artifacts, `studio-${width}.png`),
        fullPage: true,
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        'No horizontal overflow',
      );
    }
    await page.reload();
    const restored = page.frameLocator('iframe[data-mode="cards"]');
    await restored.locator('#tim-projects').waitFor();
    assert.equal(await restored.locator('#name').inputValue(), 'Studio cards');
    await restored.locator('#tim-projects').evaluate((el) => (el.open = true));
    assert.ok(
      (await restored.locator('#tim-project-list option').count()) >= 2,
    );
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const fallback = await noJs.newPage();
    await fallback.goto(base + '/celebration-studio/');
    await fallback.locator('a[data-mode="cards"]').click();
    assert.match(fallback.url(), /\/celebrate\/$/);
    await noJs.close();
    assert.deepEqual(errors, []);
    console.log(
      'Celebration Studio: both modes, recordings, PNG/WAV, saved projects, switching guards, mobile and no-JS fallback passed.',
    );
  } finally {
    await browser?.close();
    http.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
