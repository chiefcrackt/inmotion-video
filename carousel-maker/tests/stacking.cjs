const {
  launchBrowser,
  server: startServer,
  artifactDirectory,
} = require('../../tests/browser-utils.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const artifacts = artifactDirectory('carousel-stacking');
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
    await page.waitForFunction(() => document.querySelector('#newBlank'));
    await page.locator('#title').fill('Visible headline');
    await page.locator('[data-add="shape"]').click();
    for (const [key, value] of [
      ['x', '0'],
      ['y', '0'],
      ['w', '1080'],
      ['h', '900'],
    ])
      await page.locator('#el_' + key).fill(value);
    await page.locator('#el_fill').fill('#ff0000');
    const whitePixels = () =>
      page.evaluate(() => {
        const c = document.querySelector('#canvas'),
          d = c.getContext('2d').getImageData(50, 140, 980, 360).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4)
          if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) n++;
        return n;
      });
    await page.waitForFunction(
      () =>
        document
          .querySelector('#canvas')
          .getContext('2d')
          .getImageData(50, 200, 1, 1).data[1] < 10,
    );
    assert.equal(await whitePixels(), 0);
    await page.locator('#el_placement').selectOption('below');
    await page.waitForFunction(() => {
      const c = document.querySelector('#canvas'),
        d = c.getContext('2d').getImageData(50, 140, 980, 360).data;
      return d.some((v, i) => i % 4 === 1 && v > 200);
    });
    assert.ok((await whitePixels()) > 100);
    await page.locator('#frontElement').click();
    assert.equal(await page.locator('#el_placement').inputValue(), 'above');
    await page.locator('#backElement').click();
    assert.equal(await page.locator('#el_placement').inputValue(), 'below');
    await page.locator('#copyElement').click();
    assert.equal(await page.locator('#el_placement').inputValue(), 'below');
    await page.reload();
    await page.waitForSelector('.controlGroup');
    await page
      .locator('.controlGroup')
      .evaluateAll((groups) => groups.forEach((group) => (group.open = true)));
    await page.waitForFunction(
      () => document.querySelectorAll('.layer').length === 2,
    );
    await page.locator('.layer button').first().click();
    assert.equal(await page.locator('#el_placement').inputValue(), 'below');
    assert.ok((await whitePixels()) > 100);
    await page.locator('#export').click();
    let pending = page.waitForEvent('download');
    await page.locator('#png').click();
    await (await pending).saveAs(path.join(artifacts, 'under-text.png'));
    await page.locator('#closeDialog').click();
    assert.deepEqual(errors, []);
    console.log(
      'Passed: template text pixels remain visible over below-text elements; forward/back cross template layer; duplicate/persistence/PNG export.',
    );
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
