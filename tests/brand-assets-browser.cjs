const { launchBrowser, server } = require('./browser-utils.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const http = server();
  await new Promise((r) => http.on('listening', r));
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({
        acceptDownloads: true,
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    const base = `http://127.0.0.1:${http.address().port}`;
    await page.goto(base + '/brand-assets/');
    await page.waitForFunction(() => window.__brandAssets?.ready());
    for (const [id, w, h] of [
      ['moving', 1080, 1920],
      ['flow', 1080, 1920],
      ['banner', 2560, 1440],
    ]) {
      await page.selectOption('#preset', id);
      await page.click('#apply');
      assert.deepEqual(
        await page.locator('canvas').evaluate((c) => [c.width, c.height]),
        [w, h],
      );
      const dl = page.waitForEvent('download');
      await page.click('#png');
      const file = await (await dl).path();
      const bytes = await fs.readFile(file);
      assert.equal(bytes.readUInt32BE(16), w);
      assert.equal(bytes.readUInt32BE(20), h);
    }
    await page.selectOption('#preset', 'flow');
    await page.click('#apply');
    await page.fill('#headline', 'CHASE\nTHE\nWAVES');
    await page.locator('#headline').dispatchEvent('change');
    await page.uncheck('#layer-hud');
    await page.selectOption('#motion', 'glitch');
    await page.selectOption('#sound', 'pulse');
    await page.fill('#duration', '2');
    await page.locator('#duration').dispatchEvent('change');
    const edited = await page.evaluate(() => window.__brandAssets.get());
    await page.reload();
    await page.waitForFunction(() => window.__brandAssets?.ready());
    assert.deepEqual(
      await page.evaluate(() => window.__brandAssets.get()),
      edited,
    );
    await page.click('#play');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#play').textContent(), 'Stop motion');
    await page.click('#play');
    assert.equal(await page.locator('#play').textContent(), 'Play motion');
    const snd = await page.evaluate(async () => {
      const { soundtrack } = await import('/brand-assets/audio.mjs');
      const b = await soundtrack(window.__brandAssets.get());
      let energy = 0;
      for (const v of b.getChannelData(0)) energy += v * v;
      return { energy, duration: b.duration };
    });
    assert.ok(snd.energy > 0);
    assert.equal(snd.duration, 2);
    const video = page.waitForEvent('download', { timeout: 30000 });
    await page.click('#record');
    const videoFile = await (await video).path();
    assert.ok((await fs.stat(videoFile)).size > 10000);
    await page.waitForFunction(
      () => !document.getElementById('record').disabled,
    );
    await page.locator('#result').evaluate(
      (v) =>
        new Promise((resolve, reject) => {
          v.onloadedmetadata = resolve;
          v.onerror = reject;
          if (v.readyState) resolve();
        }),
    );
    assert.deepEqual(
      await page
        .locator('#result')
        .evaluate((v) => [v.videoWidth, v.videoHeight]),
      [1080, 1920],
    );
    await page.click('#record');
    await page.waitForSelector('#cancel:not([hidden])');
    await page.click('#cancel');
    await page.waitForFunction(
      () => !document.getElementById('record').disabled,
    );
    assert.match(await page.locator('#status').textContent(), /cancelled/);
    await page.locator('#tim-projects summary').click();
    const json = page.waitForEvent('download');
    await page.click('#tim-project-export');
    const jsonFile = await (await json).path();
    const snapshot = JSON.parse(await fs.readFile(jsonFile, 'utf8'));
    assert.deepEqual(snapshot.payload.state, edited);
    await page.selectOption('#preset', 'moving');
    await page.click('#apply');
    await page.locator('#tim-project-import').setInputFiles(jsonFile);
    await page.waitForFunction(
      () => window.__brandAssets.get().headline === 'CHASE\nTHE\nWAVES',
    );
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Overflow at ${width}`,
      );
    }
    await fs.mkdir('artifacts/brand-assets', { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.click('#still');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: 'artifacts/brand-assets/editor.png',
      fullPage: true,
    });
    await page.goto(base);
    await page.locator('a.tool[href="brand-assets/"]').first().waitFor();
    await page.goto(base + '/cover-maker/');
    await page.locator('a[href="../brand-assets/?template=banner"]').waitFor();
    await page.goto(base + '/title-maker/');
    await page.locator('a[href="../brand-assets/?template=moving"]').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'Brand Assets: templates, PNG sizes, video, sound, cancellation, saved JSON, reload, hub links and responsive layout passed.',
    );
  } finally {
    await browser?.close();
    http.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
