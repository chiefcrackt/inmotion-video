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
    page.setDefaultTimeout(30000);
    page.on('dialog', (d) => d.accept());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const base = `http://127.0.0.1:${http.address().port}`;
    const artifacts = artifactDirectory('runner-animator');
    const select = (mode) => page.locator(`a[data-mode="${mode}"]`).click();
    await page.goto(base + '/runner-animator/?videoProject=example#run');
    assert.match(
      await page.locator('iframe').getAttribute('src'),
      /river-run\/\?videoProject=example/,
    );
    await page.goto(base + '/runner-animator/');
    const frames = {};
    async function ready(frame) {
      await frame.locator('#rec').evaluate(async () => {
        while (!window.TimRunnerEditor || window.TimRunnerEditor.isBusy())
          await new Promise((r) => setTimeout(r, 20));
      });
    }
    for (const [mode, tool] of [
      ['start', 'start-line'],
      ['run', 'river-run'],
    ]) {
      await select(mode);
      const frame = (frames[mode] = page.frameLocator(
        `iframe[data-mode="${mode}"]`,
      ));
      await frame.locator('#tim-projects').waitFor();
      await ready(frame);
      if (mode === 'start') {
        await frame.locator('#lineLabel').fill('RACE DAY');
        await frame.locator('#numbers').check();
        await frame.locator('[data-g="end"][data-v="cut"]').click();
        await frame.locator('[data-g="pause"][data-v="0.6"]').click();
      } else {
        await frame.locator('[data-g="len"][data-v="5"]').click();
        await frame.locator('[data-g="jumps"][data-v="one"]').click();
        for (const scene of ['riverside', 'cyberpunk', 'mountain', 'night']) {
          await frame.locator(`[data-g="bg"][data-v="${scene}"]`).click();
          await ready(frame);
          assert.equal(
            await frame
              .locator('#cv')
              .evaluate((c) => c.toDataURL().length > 1000),
            true,
          );
        }
        await frame.locator('[data-g="bg"][data-v="riverside"]').click();
        await ready(frame);
      }
      await frame.locator('#play').click();
      await select(mode === 'start' ? 'run' : 'start');
      assert.match(
        await page.locator('#status').textContent(),
        /Wait for the preview/,
      );
      assert.equal(
        await page.locator(`iframe[data-mode="${mode}"]`).isVisible(),
        true,
      );
      await ready(frame);
      // Both formats still render at the original production dimensions.
      for (const [fmt, width, height] of [
        ['h', 1920, 1080],
        ['v', 1080, 1920],
      ]) {
        await frame.locator(`[data-g="fmt"][data-v="${fmt}"]`).click();
        assert.deepEqual(
          await frame.locator('#cv').evaluate((c) => [c.width, c.height]),
          [width, height],
        );
      }
      if (mode === 'start') {
        await frame.locator('[data-g="fmt"][data-v="h"]').click();
        await frame.locator('[data-g="bg"][data-v="green"]').click();
      }
      await frame.locator('#rec').click();
      await select(mode === 'start' ? 'run' : 'start');
      assert.match(await page.locator('#status').textContent(), /recording/);
      await frame
        .locator('#result')
        .waitFor({ state: 'visible', timeout: 60000 });
      await ready(frame);
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        frame.locator('#save').click(),
      ]);
      assert.match(download.suggestedFilename(), /\.(mp4|webm)$/);
      assert.ok((await fs.stat(await download.path())).size > 1000);
      await download.saveAs(
        path.join(artifacts, mode + '-' + download.suggestedFilename()),
      );
      const media = await frame.locator('#vid').evaluate(async (video) => {
        if (video.readyState < 1)
          await new Promise((r) =>
            video.addEventListener('loadedmetadata', r, { once: true }),
          );
        return {
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
        };
      });
      assert.equal(media.width, mode === 'start' ? 1920 : 1080);
      assert.equal(media.height, mode === 'start' ? 1080 : 1920);
      assert.ok(media.duration > 0);
      await frame.locator('#tim-projects').evaluate((el) => (el.open = true));
      await frame.locator('#tim-project-name').fill('Runner ' + mode);
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
      const doc = JSON.parse(content);
      assert.equal(doc.tool, tool);
      const original = await context.newPage();
      original.on('dialog', (d) => d.accept());
      await original.goto(base + '/' + tool + '/');
      await original
        .locator('#tim-projects')
        .evaluate((el) => (el.open = true));
      await original
        .locator('#tim-project-import')
        .setInputFiles({
          name: 'runner.json',
          mimeType: 'application/json',
          buffer: content,
        });
      await original
        .locator('#tim-project-status')
        .filter({ hasText: 'Imported.' })
        .waitFor();
      const snapshot = await original.evaluate(() =>
        window.TimProjectSnapshot(),
      );
      assert.deepEqual(snapshot.payload, doc.payload);
      await original.close();
      await frame
        .locator('#tim-project-import')
        .setInputFiles({
          name: 'round-trip.json',
          mimeType: 'application/json',
          buffer: content,
        });
      await frame
        .locator('#tim-project-status')
        .filter({ hasText: 'Imported.' })
        .waitFor();
      await ready(frame);
    }
    await select('start');
    assert.equal(
      await frames.start.locator('#lineLabel').inputValue(),
      'RACE DAY',
    );
    assert.equal(await frames.start.locator('#result').isVisible(), true);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ['start', 'run']) {
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
    await select('start');
    await page.reload();
    const restored = page.frameLocator('iframe[data-mode="start"]');
    await restored.locator('#tim-projects').waitFor();
    assert.equal(await restored.locator('#lineLabel').inputValue(), 'RACE DAY');
    await restored.locator('#tim-projects').evaluate((el) => (el.open = true));
    assert.ok((await restored.locator('#tim-project-list option').count()) > 1);
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const fallback = await noJs.newPage();
    await fallback.goto(base + '/runner-animator/');
    await fallback.locator('a[data-mode="run"]').click();
    assert.match(fallback.url(), /\/river-run\/$/);
    await noJs.close();
    assert.deepEqual(errors, []);
    console.log(
      'Runner Animator passed: both modes/formats, four moving scenes, video export, preview/recording guards, legacy project round trips, persistence, mobile and fallback.',
    );
  } finally {
    await browser?.close();
    http.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
