const {
  launchBrowser,
  server: startServer,
  artifactDirectory,
} = require('../../tests/browser-utils.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const artifacts = artifactDirectory('carousel-browser');
  const server = startServer();
  await new Promise((r) => server.on('listening', r));
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base);
    assert.equal(await page.locator('a.tool').count(), 12);
    await page.locator('#search').fill('carousel');
    assert.equal(await page.locator('a.tool:visible').count(), 1);
    await page.locator('a.tool:visible').click();
    await page.waitForFunction(
      () => document.querySelectorAll('.thumb').length === 5,
    );
    await page.locator('#title').fill('Test review');
    await page.locator('#duplicate').click();
    assert.equal(await page.locator('.thumb').count(), 6);
    await page
      .getByRole('button', { name: 'Move slide 2 right', exact: true })
      .click();
    assert.equal(await page.locator('#selectedLabel').textContent(), '03');
    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll('.thumb').length === 6,
    );
    assert.equal(await page.locator('#title').inputValue(), 'Test review');
    await page.locator('#photo').setInputFiles({
      name: 'test.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="red"/></svg>',
      ),
    });
    await page.waitForFunction(() =>
      JSON.parse(
        localStorage.getItem('tim-carousel-v1'),
      ).slides[2].photo.startsWith('data:image/'),
    );
    await page.locator('#photoZoom').fill('1.75');
    await page.locator('#photoX').fill('80');
    await page.locator('#photoY').fill('25');
    await page.locator('#photoFit').selectOption('contain');
    await page.locator('#photoRotate').click();
    await page.locator('#photoFlip').click();
    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll('.thumb').length === 6,
    );
    assert.equal(await page.locator('#photoZoom').inputValue(), '1.75');
    assert.equal(await page.locator('#photoX').inputValue(), '80');
    assert.equal(await page.locator('#photoY').inputValue(), '25');
    assert.equal(await page.locator('#photoFit').inputValue(), 'contain');
    assert.equal(
      await page.locator('#photoFlip').getAttribute('aria-pressed'),
      'true',
    );
    assert.ok(
      (await page.locator('#photoRotate').textContent()).includes('90°'),
    );
    await page.locator('#duplicate').click();
    assert.equal(await page.locator('#photoZoom').inputValue(), '1.75');
    page.once('dialog', (d) => d.accept());
    await page.locator('#delete').click();
    await page
      .getByRole('button', { name: 'Edit slide 3', exact: true })
      .first()
      .click();
    await page.locator('#photoReset').click();
    assert.equal(await page.locator('#photoZoom').inputValue(), '1');
    assert.equal(await page.locator('#photoFit').inputValue(), 'cover');
    await page.locator('#photoZoom').fill('1.5');
    await page.locator('#export').click();
    let pending = page.waitForEvent('download');
    await page.locator('#png').click();
    const png = await pending;
    await png.saveAs(path.join(artifacts, 'carousel-test.png'));
    const bytes = fs.readFileSync(path.join(artifacts, 'carousel-test.png'));
    assert.equal(bytes.readUInt32BE(16), 1080);
    assert.equal(bytes.readUInt32BE(20), 1350);
    pending = page.waitForEvent('download');
    await page.locator('#zip').click();
    await (await pending).saveAs(path.join(artifacts, 'carousel-test.zip'));
    await page.locator('#closeDialog').click();
    page.on('dialog', (d) => d.accept());
    for (const name of [
      'Race recap',
      'Training lessons',
      'Monthly mileage',
      'Product pros & cons',
      'What I use',
    ]) {
      await page.locator('.template').filter({ hasText: name }).click();
      await page.waitForTimeout(80);
      assert.ok((await page.locator('.thumb').count()) >= 3);
    }
    await page.locator('#ratio').selectOption('1080');
    await page.waitForFunction(
      () => document.querySelector('#canvas').height === 1080,
    );
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      'Passed: hub search/navigation, editing, duplicate, reorder, persistence, photo upload, all templates, ratio, PNG/ZIP downloads and mobile widths.',
    );
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
