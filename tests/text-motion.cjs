const assert = require('node:assert/strict');
const {
  launchBrowser,
  server,
  artifactDirectory,
} = require('./browser-utils.cjs');
const path = require('node:path');
(async () => {
  const http = server(0);
  await new Promise((r) => http.on('listening', r));
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({
      viewport: { width: 1400, height: 1000 },
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${http.address().port}/text-motion/`);
    await page.locator('#play').click();
    await page.locator('#headline').fill('A fresh start\nEvery day');
    for (const effect of ['rise', 'type', 'pop', 'slide', 'fade', 'wipe']) {
      await page.selectOption('#effect', effect);
      await page.locator('#scrub').fill('500');
      assert.match(await page.locator('#time').textContent(), /2.0/);
    }
    await page.selectOption('#effect', 'rise');
    await page.locator('#scrub').fill('80');
    const frame = () => page.locator('canvas').evaluate((c) => c.toDataURL());
    const clean = await frame();
    await page.locator('#glitch').check();
    const glitched = await frame();
    assert.notEqual(glitched, clean, 'Glitch changes the rendered pixels');
    await page.locator('#scrub').fill('500');
    await page.locator('#scrub').fill('80');
    assert.equal(
      await frame(),
      glitched,
      'Glitch is deterministic when scrubbing',
    );
    await page.selectOption('#palette', 'teal');
    assert.equal(await page.locator('#background').inputValue(), '#10383f');
    await page.selectOption('#align', 'left');
    await page.selectOption('#placement', 'bottom');
    await page.selectOption('#speed', '1.6');
    await page.reload();
    await page.locator('#scrub').fill('80');
    assert.equal(await page.locator('#glitch').isChecked(), true);
    assert.equal(await page.locator('#align').inputValue(), 'left');
    assert.equal(await page.locator('#background').inputValue(), '#10383f');
    await page.selectOption('#glitchTiming', 'bursts');
    for (const [format, w, h] of [
      ['portrait', 1080, 1920],
      ['square', 1080, 1080],
      ['landscape', 1920, 1080],
    ]) {
      await page.selectOption('#format', format);
      assert.deepEqual(
        await page.locator('canvas').evaluate((c) => [c.width, c.height]),
        [w, h],
      );
    }
    await page.locator('#scrub').fill('500');
    const pngPromise = page.waitForEvent('download');
    await page.locator('#png').click();
    const png = await pngPromise;
    assert.equal(png.suggestedFilename(), 'tim-text-motion.png');
    await page.selectOption('#duration', '2');
    const videoPromise = page.waitForEvent('download');
    await page.locator('#video').click();
    const video = await videoPromise;
    assert.match(video.suggestedFilename(), /\.(webm|mp4)$/);
    const file = await video.path();
    assert.ok(require('node:fs').statSync(file).size > 1000);
    await page.locator('#scrub').fill('500');
    const artifacts = artifactDirectory('text-motion');
    await page.screenshot({
      path: path.join(artifacts, 'desktop.png'),
      fullPage: true,
    });
    await page.locator('#reset').click();
    assert.equal(await page.locator('#glitch').isChecked(), false);
    assert.equal(await page.locator('#headline').inputValue(), 'KEEP\nMOVING.');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await page.screenshot({
      path: path.join(artifacts, 'mobile.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      'Text Motion passed: effects, formats, scrub, PNG and video downloads, mobile layout.',
    );
  } finally {
    await browser?.close();
    http.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
