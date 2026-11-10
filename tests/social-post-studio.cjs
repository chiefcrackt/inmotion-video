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
    const artifacts = artifactDirectory('social-post-studio');
    const select = (mode) => page.locator(`a[data-mode="${mode}"]`).click();
    const reveal = (locator) =>
      locator.evaluate((el) => {
        for (let p = el.parentElement; p; p = p.parentElement)
          if (p.tagName === 'DETAILS') p.open = true;
      });
    const download = async (frame, button, ext) => {
      const [d] = await Promise.all([
        page.waitForEvent('download', { timeout: 90000 }),
        frame.locator(button).click(),
      ]);
      assert.match(d.suggestedFilename(), ext);
      const data = await fs.readFile(await d.path());
      assert.ok(data.length > 100);
      await d.saveAs(path.join(artifacts, d.suggestedFilename()));
      return data;
    };
    await page.goto(
      base + '/social-post-studio/?videoProject=example#rankings',
    );
    assert.match(
      await page.locator('iframe').getAttribute('src'),
      /tier-list\/\?videoProject=example/,
    );
    const rankInitial = page.frameLocator('iframe[data-mode="rankings"]');
    await rankInitial.locator('#title').waitFor();
    // A small legacy ranking draft keeps the real-time video test bounded.
    // Tier List saves its draft 250 ms after loading; wait for it.
    await page.waitForFunction(() => localStorage.getItem('tim_tier_list'));
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('tim_tier_list'));
      s.items = s.items.slice(0, 1);
      s.read = 3;
      localStorage.setItem('tim_tier_list', JSON.stringify(s));
    });
    await page.goto(base + '/social-post-studio/');
    const carousel = page.frameLocator('iframe[data-mode="carousel"]');
    await carousel.locator('#project').evaluate(async () => {
      while (!window.TimSocialEditor)
        await new Promise((r) => setTimeout(r, 20));
    });
    await carousel.locator('#project').fill('Social test deck');
    await carousel.locator('#title').fill('EVERY STEP COUNTS');
    await carousel.locator('#duplicate').click();
    const slides = await carousel.locator('#film button').count();
    await reveal(carousel.locator('#saveProject'));
    await carousel.locator('#saveProject').click();
    const project = await download(carousel, '#exportProject', /\.json$/);
    assert.equal(JSON.parse(project).project, 'Social test deck');
    const original = await context.newPage();
    original.on('dialog', (d) => d.accept());
    await original.goto(base + '/carousel-maker/');
    await original.locator('#importProject').setInputFiles({
      name: 'carousel.json',
      mimeType: 'application/json',
      buffer: project,
    });
    await original.locator('#project').evaluate(async (el) => {
      while (el.value !== 'Social test deck')
        await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(
      await original.locator('#title').inputValue(),
      'EVERY STEP COUNTS',
    );
    await original.close();
    await carousel.locator('#export').click();
    await select('rankings');
    assert.match(
      await page.locator('#status').textContent(),
      /Close the export dialog/,
    );
    const png = await download(carousel, '#png', /\.png$/);
    assert.equal(png.readUInt32BE(16), 1080);
    const zip = await download(carousel, '#zip', /\.zip$/);
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    await carousel.locator('#closeDialog').click();
    await select('rankings');
    const rankings = page.frameLocator('iframe[data-mode="rankings"]');
    await rankings.locator('#title').evaluate(async () => {
      while (!window.TimSocialEditor)
        await new Promise((r) => setTimeout(r, 20));
    });
    await rankings.locator('#title').fill('MY TOP PICKS');
    const rankPNG = await download(rankings, '#pngOne', /\.png$/);
    assert.equal(rankPNG.readUInt32BE(20), 1350);
    const rankZIP = await download(rankings, '#zipAll', /\.zip$/);
    assert.equal(rankZIP.readUInt32LE(0), 0x04034b50);
    await rankings.locator('#mVid').click();
    await rankings.locator('#rec').click();
    await select('compare');
    assert.match(
      await page.locator('#status').textContent(),
      /wait for the preview or export/,
    );
    await rankings
      .locator('#result')
      .waitFor({ state: 'visible', timeout: 90000 });
    await download(rankings, '#save', /\.(mp4|webm)$/);
    await select('compare');
    const compare = page.frameLocator('iframe[data-mode="compare"]');
    for (const [slot, color] of [
      ['before', '#ff0000'],
      ['after', '#0000ff'],
    ]) {
      const data = await page.evaluate((color) => {
        const c = document.createElement('canvas');
        c.width = c.height = 200;
        const ctx = c.getContext('2d');
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 200, 200);
        return c.toDataURL().split(',')[1];
      }, color);
      await compare.locator('#file-' + slot).setInputFiles({
        name: slot + '.png',
        mimeType: 'image/png',
        buffer: Buffer.from(data, 'base64'),
      });
    }
    await compare.locator('#png').evaluate(async (el) => {
      while (el.disabled) await new Promise((r) => setTimeout(r, 20));
    });
    await compare.locator('#caption').fill('A little progress');
    await compare.locator('#length').fill('3');
    const beforeFrame = await compare
      .locator('#canvas')
      .evaluate((c) => c.toDataURL());
    await download(compare, '#png', /\.png$/);
    await compare.locator('#preview').click();
    await select('carousel');
    assert.match(
      await page.locator('#status').textContent(),
      /wait for the preview or export/,
    );
    await compare.locator('#png').evaluate(async (el) => {
      while (el.disabled) await new Promise((r) => setTimeout(r, 20));
    });
    const clip = page.waitForEvent('download', { timeout: 60000 });
    await compare.locator('#clip').click();
    await select('carousel');
    assert.equal(
      await page.locator('iframe[data-mode="compare"]').isVisible(),
      true,
    );
    const video = await clip;
    assert.match(video.suggestedFilename(), /\.(mp4|webm)$/);
    assert.ok((await fs.stat(await video.path())).size > 1000);
    await select('carousel');
    assert.equal(
      await carousel.locator('#project').inputValue(),
      'Social test deck',
    );
    assert.equal(await carousel.locator('#film button').count(), slides);
    await select('compare');
    assert.equal(
      await compare.locator('#caption').inputValue(),
      'A little progress',
    );
    assert.equal(
      await compare.locator('#canvas').evaluate((c) => c.toDataURL()),
      beforeFrame,
      'Comparison photos and framing survive mode changes',
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [mode, frame] of [
        ['carousel', carousel],
        ['rankings', rankings],
        ['compare', compare],
      ]) {
        await select(mode);
        assert.ok((await page.locator('body > header').boundingBox()).y >= 0);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        assert.ok(
          await frame
            .locator('body')
            .evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        );
        await page.screenshot({
          path: path.join(artifacts, `${mode}-${width}.png`),
        });
      }
    }
    await select('rankings');
    await page.reload();
    const restored = page.frameLocator('iframe[data-mode="rankings"]');
    await restored.locator('#title').waitFor();
    await restored.locator('#title').evaluate(async () => {
      while (!window.TimSocialEditor)
        await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(await restored.locator('#title').inputValue(), 'MY TOP PICKS');
    const fallbackContext = await browser.newContext({
      javaScriptEnabled: false,
    });
    const fallback = await fallbackContext.newPage();
    await fallback.goto(base + '/social-post-studio/');
    await fallback.locator('a[data-mode="compare"]').click();
    assert.match(fallback.url(), /\/before-after\/$/);
    await fallbackContext.close();
    assert.deepEqual(errors, []);
    console.log(
      'Social Post Studio passed: three modes, carousel project compatibility, PNG/ZIP/video, preview/export guards, photo retention, legacy drafts, mobile and fallback.',
    );
  } finally {
    await browser?.close();
    http.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
