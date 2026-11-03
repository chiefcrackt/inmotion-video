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
    page.setDefaultTimeout(25000);
    page.on('dialog', (d) => d.accept());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const base = `http://127.0.0.1:${http.address().port}`;
    const artifacts = artifactDirectory('publishing-studio');
    const select = (mode) => page.locator(`a[data-mode="${mode}"]`).click();
    await page.goto(base + '/publishing-studio/?videoProject=test#promos');
    assert.match(
      await page.locator('iframe').getAttribute('src'),
      /promo-maker\/\?videoProject=test/,
    );
    await page.goto(base + '/publishing-studio/');
    const frames = {};
    for (const [mode, tool, field, value] of [
      ['covers', 'cover-maker', '#head', 'MY NEXT VIDEO'],
      ['promos', 'promo-maker', '#pr_title', 'OUT NOW'],
      ['brand', 'brand-assets', '#headline', 'KEEP CREATING'],
    ]) {
      await select(mode);
      const frame = (frames[mode] = page.frameLocator(
        `iframe[data-mode="${mode}"]`,
      ));
      await frame.locator('#tim-projects').waitFor();
      await frame
        .locator(field)
        .evaluate((el) => el.closest('details')?.setAttribute('open', ''));
      await frame.locator(field).fill(value);
      await frame.locator(field).dispatchEvent('input');
      await frame.locator(field).dispatchEvent('change');
      if (mode !== 'brand') {
        const png = await page.evaluate(() => {
          const c = document.createElement('canvas');
          c.width = 120;
          c.height = 80;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ff00ff';
          ctx.fillRect(0, 0, 120, 80);
          return c.toDataURL().split(',')[1];
        });
        await frame.locator('#file').setInputFiles({
          name: 'photo.png',
          mimeType: 'image/png',
          buffer: Buffer.from(png, 'base64'),
        });
        await frame.locator('#clear').waitFor({ state: 'visible' });
      }
      const [png] = await Promise.all([
        page.waitForEvent('download'),
        frame.locator('#png').click(),
      ]);
      const data = await fs.readFile(await png.path());
      assert.equal(data.subarray(1, 4).toString(), 'PNG');
      assert.ok(data.readUInt32BE(16) >= 1000);
      await png.saveAs(path.join(artifacts, mode + '.png'));
      await frame.locator('#tim-projects').evaluate((el) => (el.open = true));
      await frame.locator('#tim-project-name').fill('Publishing ' + mode);
      await frame.locator('#tim-project-save').click();
      await frame
        .locator('#tim-project-status')
        .filter({ hasText: 'Saved a new' })
        .waitFor();
      const [json] = await Promise.all([
        page.waitForEvent('download'),
        frame.locator('#tim-project-export').click(),
      ]);
      const content = await fs.readFile(await json.path());
      assert.equal(JSON.parse(content).tool, tool);
      const original = await context.newPage();
      original.on('dialog', (d) => d.accept());
      await original.goto(base + '/' + tool + '/');
      await original
        .locator('#tim-projects')
        .evaluate((el) => (el.open = true));
      await original.locator('#tim-project-import').setInputFiles({
        name: 'portable.json',
        mimeType: 'application/json',
        buffer: content,
      });
      await original
        .locator('#tim-project-status')
        .filter({ hasText: 'Imported.' })
        .waitFor();
      assert.equal(await original.locator(field).inputValue(), value);
      if (mode !== 'brand')
        assert.equal(await original.locator('#clear').isVisible(), true);
      await original.close();
      await frame.locator(field).fill('Changed');
      await frame.locator('#tim-project-import').setInputFiles({
        name: 'restore.json',
        mimeType: 'application/json',
        buffer: content,
      });
      await frame
        .locator('#tim-project-status')
        .filter({ hasText: 'Imported.' })
        .waitFor();
      assert.equal(await frame.locator(field).inputValue(), value);
    }
    const brand = frames.brand;
    await brand.locator('#duration').fill('2');
    await brand.locator('#duration').dispatchEvent('change');
    await brand.locator('#sound').selectOption('pulse');
    await brand.locator('#play').click();
    await brand.locator('#play').filter({ hasText: 'Stop motion' }).waitFor();
    await select('covers');
    assert.equal(
      await brand.locator('#play').textContent(),
      'Play motion',
      'Looping sound and animation stop on mode change',
    );
    assert.equal(
      await frames.covers.locator('#head').inputValue(),
      'MY NEXT VIDEO',
    );
    await select('brand');
    await brand.locator('#record').click();
    await brand.locator('#record').evaluate(async () => {
      while (!window.TimPublishingEditor.isBusy())
        await new Promise((r) => setTimeout(r, 10));
    });
    await select('covers');
    assert.match(
      await page.locator('#status').textContent(),
      /Finish exporting/,
    );
    await brand
      .locator('#result')
      .waitFor({ state: 'visible', timeout: 60000 });
    const brandVideo = await brand.locator('#result').evaluate(async (v) => {
      if (v.readyState < 1)
        await new Promise((r) =>
          v.addEventListener('loadedmetadata', r, { once: true }),
        );
      return {
        width: v.videoWidth,
        height: v.videoHeight,
        duration: v.duration,
      };
    });
    assert.ok(
      brandVideo.width > 0 && brandVideo.height > 0 && brandVideo.duration > 0,
    );
    await select('promos');
    const promo = frames.promos;
    await promo.locator('#play').click();
    await select('covers');
    assert.match(await page.locator('#status').textContent(), /promo preview/);
    await promo.locator('#play').evaluate(async () => {
      while (window.TimPublishingEditor.isBusy())
        await new Promise((r) => setTimeout(r, 20));
    });
    await promo.locator('#rec').click();
    await select('covers');
    assert.equal(
      await page.locator('iframe[data-mode="promos"]').isVisible(),
      true,
    );
    await promo
      .locator('#result')
      .waitFor({ state: 'visible', timeout: 60000 });
    const [video] = await Promise.all([
      page.waitForEvent('download'),
      promo.locator('#save').click(),
    ]);
    assert.ok((await fs.stat(await video.path())).size > 1000);
    await video.saveAs(path.join(artifacts, video.suggestedFilename()));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ['covers', 'promos', 'brand']) {
        await select(mode);
        assert.ok((await page.locator('body > header').boundingBox()).y >= 0);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        assert.ok(
          await frames[mode]
            .locator('body')
            .evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        );
        await page.screenshot({
          path: path.join(artifacts, `${mode}-${width}.png`),
        });
      }
    }
    await select('covers');
    await page.reload();
    const reloaded = page.frameLocator('iframe[data-mode="covers"]');
    await reloaded.locator('#tim-projects').waitFor();
    assert.equal(await reloaded.locator('#head').inputValue(), 'MY NEXT VIDEO');
    await reloaded.locator('#tim-projects').evaluate((el) => (el.open = true));
    assert.ok((await reloaded.locator('#tim-project-list option').count()) > 1);
    const fallbackContext = await browser.newContext({
      javaScriptEnabled: false,
    });
    const fallback = await fallbackContext.newPage();
    await fallback.goto(base + '/publishing-studio/');
    await fallback.locator('a[data-mode="brand"]').click();
    assert.match(fallback.url(), /\/brand-assets\/$/);
    await fallbackContext.close();
    assert.deepEqual(errors, []);
    console.log(
      'Publishing Studio passed: three modes, photo/project compatibility, PNGs, promo/brand video, busy guards, audio stop, persistence, mobile and fallback.',
    );
  } finally {
    await browser?.close();
    http.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
