const {
  launchBrowser,
  server: startServer,
  artifactDirectory,
} = require('../../tests/browser-utils.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const server = startServer();
  await new Promise((resolve) => server.on('listening', resolve));
  const browser = await launchBrowser();
  const artifacts = artifactDirectory('carousel-ux');
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `http://127.0.0.1:${server.address().port}/carousel-maker/`,
    );
    await page.waitForSelector('.controlGroup');
    assert.equal(await page.locator('#title').isVisible(), true);
    assert.equal(await page.locator('#templateX').isVisible(), false);
    await page.locator('#title').fill('A clearer carousel');
    await page.locator('#nextSlide').click();
    assert.equal(
      await page.locator('#previewSlide').textContent(),
      'Slide 2 of 5',
    );
    await page.locator('#previousSlide').click();
    assert.equal(
      await page.locator('#title').inputValue(),
      'A clearer carousel',
    );
    assert.equal(await page.locator('#previousSlide').isDisabled(), true);
    await page
      .getByText('Move template text', { exact: true })
      .filter({ visible: true })
      .click();
    await page.locator('#templateX').fill('40');
    await page
      .getByText('Carousel style · all slides', { exact: true })
      .click();
    await page.locator('#handle').fill('@test.runner');
    await page.locator('#overviewTab').click();
    assert.equal(await page.locator('#stage').isVisible(), false);
    await page.locator('#overview button').nth(1).click();
    assert.equal(await page.locator('#stage').isVisible(), true);
    await page.locator('#duplicate').click();
    await page.waitForFunction(
      () => document.querySelectorAll('.thumb').length === 6,
    );
    await page.locator('#export').click();
    const pending = page.waitForEvent('download');
    await page.locator('#zip').click();
    assert.ok((await pending).suggestedFilename().endsWith('.zip'));
    await page.locator('#closeDialog').click();
    await page.screenshot({
      path: path.join(artifacts, 'desktop.png'),
      fullPage: true,
    });
    await page.reload();
    await page.waitForSelector('.controlGroup');
    assert.equal(await page.locator('#handle').inputValue(), '@test.runner');
    for (const width of [390, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Overflow at ${width}px`,
      );
      await page.screenshot({
        path: path.join(artifacts, `${width}.png`),
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    console.log(
      'Carousel UX: navigation, disclosure controls, editing, drafts, ZIP and responsive layouts passed.',
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
