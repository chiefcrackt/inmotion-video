const {
  launchBrowser,
  server: startServer,
  artifactDirectory,
} = require('../../tests/browser-utils.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const artifacts = artifactDirectory('carousel-background');
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
    await page.goto(base + '/carousel-maker/');
    await page.waitForSelector('.controlGroup');
    await page
      .locator('.controlGroup')
      .evaluateAll((groups) => groups.forEach((group) => (group.open = true)));
    await page.waitForFunction(() => document.querySelector('#photoMode'));
    await page.locator('#photo').setInputFiles({
      name: 'background.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="red"/></svg>',
      ),
    });
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem('tim-carousel-v1'))?.slides[0]?.photo,
    );
    await page.locator('#photoMode').selectOption('background');
    await page.locator('#hideTemplateText').check();
    await page.locator('#hideFooter').check();
    await page.waitForFunction(() => {
      const c = document.querySelector('#canvas'),
        ctx = c.getContext('2d');
      return (
        ctx.getImageData(0, 0, 1, 1).data[0] > 240 &&
        ctx.getImageData(1079, 1349, 1, 1).data[0] > 240
      );
    });
    assert.equal(await page.locator('#photoFit').isDisabled(), true);
    const pixels = () =>
      page.evaluate(() => {
        const c = document.querySelector('#canvas'),
          x = c.getContext('2d');
        return [
          Array.from(x.getImageData(0, 0, 1, 1).data),
          Array.from(x.getImageData(500, c.height - 1, 1, 1).data),
        ];
      });
    let p = await pixels();
    assert.ok(p.every((v) => v[0] > 240 && v[1] < 10 && v[2] < 10));
    await page.locator('#photoTint').fill('50');
    await page.waitForFunction(
      () =>
        document
          .querySelector('#canvas')
          .getContext('2d')
          .getImageData(0, 0, 1, 1).data[0] < 150,
    );
    p = await pixels();
    assert.ok(p[0][0] > 110 && p[0][0] < 145);
    await page.locator('#photoTint').fill('0');
    await page.locator('#photoGradient').selectOption('bottom');
    await page.locator('#photoGradientStrength').fill('80');
    await page.waitForFunction(
      () =>
        document
          .querySelector('#canvas')
          .getContext('2d')
          .getImageData(500, 1349, 1, 1).data[0] < 80,
    );
    p = await pixels();
    assert.ok(p[0][0] > 240 && p[1][0] < 80);
    await page.locator('#photoTextColor').selectOption('#ffffff');
    await page.locator('#photoZoom').fill('1.5');
    await page.locator('#photoX').fill('70');
    await page.reload();
    await page.waitForSelector('.controlGroup');
    await page
      .locator('.controlGroup')
      .evaluateAll((groups) => groups.forEach((group) => (group.open = true)));
    await page.waitForFunction(
      () => document.querySelector('#photoMode')?.value === 'background',
    );
    assert.equal(await page.locator('#photoTint').inputValue(), '0');
    assert.equal(await page.locator('#photoGradient').inputValue(), 'bottom');
    assert.equal(await page.locator('#photoTextColor').inputValue(), '#ffffff');
    assert.equal(await page.locator('#hideFooter').isChecked(), true);
    await page.locator('#layout').selectOption('blank');
    await page.waitForFunction(
      () =>
        document
          .querySelector('#canvas')
          .getContext('2d')
          .getImageData(0, 0, 1, 1).data[0] > 240,
    );
    await page.locator('#ratio').selectOption('1080');
    await page.waitForFunction(
      () => document.querySelector('#canvas').height === 1080,
    );
    await page.locator('#export').click();
    let pending = page.waitForEvent('download');
    await page.locator('#png').click();
    await (await pending).saveAs(path.join(artifacts, 'background-export.png'));
    await page.locator('#closeDialog').click();
    await page.locator('#photoReset').click();
    assert.equal(await page.locator('#photoMode').inputValue(), 'frame');
    assert.equal(await page.locator('#photoZoom').inputValue(), '1');
    assert.deepEqual(errors, []);
    console.log(
      'Passed: full-bleed pixel coverage, tint/gradient pixel output, crop settings, persistence, hidden template/footer, blank and square backgrounds, PNG export and reset.',
    );
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
