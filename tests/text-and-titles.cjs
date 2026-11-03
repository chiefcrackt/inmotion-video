const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  server,
  launchBrowser,
  artifactDirectory,
} = require('./browser-utils.cjs');

async function bytes(download) {
  return fs.readFile(await download.path());
}

(async () => {
  const http = server();
  await new Promise((r) => (http.listening ? r() : http.once('listening', r)));
  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    const base = `http://127.0.0.1:${http.address().port}`;
    const artifacts = artifactDirectory('text-and-titles');
    await page.goto(base + '/text-and-titles/?videoProject=example#titles');
    assert.match(
      await page.locator('iframe').getAttribute('src'),
      /title-maker\/\?videoProject=example/,
    );
    await page.goto(base + '/text-and-titles/');
    const text = page.frameLocator('iframe[data-mode="text"]');
    await text.locator('#tim-projects').waitFor();
    await text.locator('#headline').fill('SAFE TO MOVE');
    await text.locator('#duration').selectOption('2');
    await text.locator('#scrub').fill('500');
    const canvasBefore = await text
      .locator('#canvas')
      .evaluate((c) => c.toDataURL());
    // An autoplaying text loop can be left; switching pauses it without resetting.
    await text.locator('#play').click();
    await page.locator('a[data-mode="titles"]').click();
    assert.equal(await text.locator('#play').textContent(), 'Play');
    const titles = page.frameLocator('iframe[data-mode="titles"]');
    await titles.locator('#tim-projects').waitFor();
    await titles.locator('#ti_head').fill('KEEP THE ORIGINAL');
    for (const tab of ['title', 'lower', 'tag', 'chapter']) {
      await titles.locator('#t_' + tab).click();
      assert.equal(
        await titles.locator('#t_' + tab).getAttribute('aria-selected'),
        'true',
      );
      const [png] = await Promise.all([
        page.waitForEvent('download'),
        titles.locator('#png').click(),
      ]);
      const data = await bytes(png);
      assert.equal(data.subarray(1, 4).toString(), 'PNG');
    }
    await titles.locator('#t_title').click();
    // The title renderer has a finite sound preview, with no Stop control.
    await titles.locator('#play').click();
    await page.locator('a[data-mode="text"]').click();
    assert.match(await page.locator('#status').textContent(), /title preview/);
    await titles.locator('#play').evaluate(async (button) => {
      while (window.TimStudioEditor.isBusy())
        await new Promise((r) => setTimeout(r, 50));
    });
    const videoReady = page.waitForEvent('download', { timeout: 60000 });
    await titles.locator('#rec').click();
    await page.locator('a[data-mode="text"]').click();
    assert.equal(
      await page.locator('iframe[data-mode="titles"]').isVisible(),
      true,
    );
    await titles
      .locator('#result')
      .waitFor({ state: 'visible', timeout: 60000 });
    await titles.locator('#save').click();
    const titleVideo = await videoReady;
    await titleVideo.saveAs(
      path.join(artifacts, titleVideo.suggestedFilename()),
    );
    assert.ok((await bytes(titleVideo)).length > 1000);
    await page.locator('a[data-mode="text"]').click();
    assert.equal(await text.locator('#headline').inputValue(), 'SAFE TO MOVE');
    await text.locator('#scrub').fill('500');
    assert.equal(
      await text.locator('#canvas').evaluate((c) => c.toDataURL()),
      canvasBefore,
    );

    // Solid video must finish exporting before mode changes can proceed.
    const solidDownload = page.waitForEvent('download', { timeout: 60000 });
    await text.locator('#video').click();
    await text.locator('#video').evaluate(async (button) => {
      while (!window.TimStudioEditor.isBusy())
        await new Promise((r) => setTimeout(r, 10));
    });
    await page.locator('a[data-mode="titles"]').click();
    assert.equal(
      await page.locator('iframe[data-mode="text"]').isVisible(),
      true,
    );
    assert.match(
      await page.locator('#status').textContent(),
      /Finish exporting/,
    );
    const solid = await solidDownload;
    assert.ok((await bytes(solid)).length > 1000);

    await text.locator('#transparent').check();
    await text.locator('#scrub').fill('500');
    assert.equal(
      await text
        .locator('#canvas')
        .evaluate((c) => c.getContext('2d').getImageData(0, 0, 1, 1).data[3]),
      0,
    );
    const [transparentPNG] = await Promise.all([
      page.waitForEvent('download'),
      text.locator('#png').click(),
    ]);
    await transparentPNG.saveAs(path.join(artifacts, 'transparent.png'));
    const alphaDownload = page.waitForEvent('download', { timeout: 120000 });
    await text.locator('#video').click();
    await text.locator('#video').evaluate(async () => {
      while (!window.TimStudioEditor.isBusy())
        await new Promise((r) => setTimeout(r, 10));
    });
    await page.locator('a[data-mode="titles"]').click();
    assert.match(
      await page.locator('#status').textContent(),
      /Finish exporting/,
    );
    const alpha = await alphaDownload;
    assert.match(alpha.suggestedFilename(), /transparent\.webm$/);
    await alpha.saveAs(path.join(artifacts, alpha.suggestedFilename()));
    const decoded = await text.locator('#canvas').evaluate(
      async (_, b64) => {
        const video = document.createElement('video');
        video.muted = true;
        video.src = 'data:video/webm;base64,' + b64;
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = () =>
            reject(new Error('Cannot decode transparent video'));
        });
        await new Promise((resolve) => {
          video.onseeked = resolve;
          video.currentTime = 1;
        });
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let visible = false;
        for (let i = 3; i < pixels.length; i += 4)
          if (pixels[i] > 240) {
            visible = true;
            break;
          }
        return { corner: pixels[3], visible };
      },
      (await bytes(alpha)).toString('base64'),
    );
    assert.deepEqual(decoded, { corner: 0, visible: true });

    // Named projects use the original tool IDs. JSON remains portable to the originals.
    for (const [mode, frame, tool, field, value] of [
      ['text', text, 'text-motion', '#headline', 'SAFE TO MOVE'],
      ['titles', titles, 'title-maker', '#ti_head', 'KEEP THE ORIGINAL'],
    ]) {
      await page.locator(`a[data-mode="${mode}"]`).click();
      await frame.locator('#tim-projects').evaluate((el) => (el.open = true));
      await frame.locator('#tim-project-name').fill('Combined ' + mode);
      await frame.locator('#tim-project-save').click();
      await frame
        .locator('#tim-project-status')
        .filter({ hasText: 'Saved a new' })
        .waitFor();
      const [json] = await Promise.all([
        page.waitForEvent('download'),
        frame.locator('#tim-project-export').click(),
      ]);
      const content = await bytes(json);
      assert.equal(JSON.parse(content).tool, tool);
      const original = await context.newPage();
      original.on('dialog', (d) => d.accept());
      await original.goto(base + '/' + tool + '/');
      await original
        .locator('#tim-projects')
        .evaluate((el) => (el.open = true));
      await original
        .locator('#tim-project-import')
        .setInputFiles({
          name: 'old-format.json',
          mimeType: 'application/json',
          buffer: content,
        });
      await original
        .locator('#tim-project-status')
        .filter({ hasText: 'Imported.' })
        .waitFor();
      assert.equal(await original.locator(field).inputValue(), value);
      await original.close();
      await frame.locator(field).fill('Changed');
      await frame
        .locator('#tim-project-import')
        .setInputFiles({
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
    // Both mode layouts fit a phone, and the parent frame does not clip controls.
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ['text', 'titles']) {
        await page.locator(`a[data-mode="${mode}"]`).click();
        await page.waitForFunction(() => {
          const f = document.querySelector('iframe:not([hidden])');
          return (
            f.clientHeight >=
            f.contentDocument.body.getBoundingClientRect().height
          );
        });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        assert.ok(
          await page
            .locator(`iframe[data-mode="${mode}"]`)
            .evaluate(
              (f) =>
                f.contentDocument.documentElement.scrollWidth <= f.clientWidth,
            ),
        );
        await page.screenshot({
          path: path.join(artifacts, `${mode}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await page.reload();
    const restored = page.frameLocator('iframe[data-mode="titles"]');
    await restored.locator('#tim-projects').waitFor();
    assert.equal(
      await restored.locator('#ti_head').inputValue(),
      'KEEP THE ORIGINAL',
    );
    const fallbackContext = await browser.newContext({
      javaScriptEnabled: false,
    });
    const fallback = await fallbackContext.newPage();
    await fallback.goto(base + '/text-and-titles/');
    await fallback.locator('a[data-mode="text"]').click();
    assert.match(fallback.url(), /\/text-motion\/$/);
    await fallbackContext.close();
    assert.deepEqual(errors, []);
    console.log(
      'Text & Titles passed: both modes, four title styles, PNG/video, decoded WebM alpha, export guards, original-format JSON round trips, persistence, mobile and fallback.',
    );
  } finally {
    await browser?.close();
    http.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
