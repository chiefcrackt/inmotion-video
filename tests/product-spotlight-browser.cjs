const assert = require('node:assert/strict'),
  path = require('node:path');
const { readFile } = require('node:fs/promises');
const {
  server,
  launchBrowser,
  artifactDirectory,
} = require('./browser-utils.cjs');
(async () => {
  const { assets } = await import('../product-spotlight/assets.mjs');
  const srv = server();
  await new Promise((r) => (srv.listening ? r() : srv.once('listening', r)));
  const browser = await launchBrowser(),
    base = 'http://127.0.0.1:' + srv.address().port,
    out = artifactDirectory('product-spotlight');
  try {
    const page = await browser.newPage({
        acceptDownloads: true,
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    await page.goto(base);
    await page.locator('#q').fill('affiliate');
    await page.locator('a[href="product-spotlight/"]').click();
    assert.equal(await page.locator('.card').count(), 18);
    for (const a of assets) {
      const result = await page.evaluate(async (a) => {
        const im = new Image();
        im.src = 'files/png/' + a.id + '.png';
        await im.decode();
        const c = document.createElement('canvas');
        c.width = im.width;
        c.height = im.height;
        const x = c.getContext('2d');
        x.drawImage(im, 0, 0);
        const p = x.getImageData(0, 0, c.width, c.height).data;
        let edge = 0,
          filled = 0;
        for (let y = 0; y < c.height; y++)
          for (let xx = 0; xx < c.width; xx++) {
            if (p[(y * c.width + xx) * 4 + 3]) {
              filled++;
              if (!y || !xx || y === c.height - 1 || xx === c.width - 1) edge++;
            }
          }
        return { w: c.width, h: c.height, edge, filled };
      }, a);
      assert.equal(result.w, a.width * 2);
      assert.equal(result.h, a.height * 2);
      assert.equal(result.edge, 0, a.id + ' has no clipped edges');
      assert(
        result.filled > 1000 && result.filled < result.w * result.h * 0.95,
        a.id + ' has visible art and transparency',
      );
    }
    for (const name of [
      'Product labels',
      'Feature callouts',
      'Your experience',
    ]) {
      await page.getByRole('button', { name, exact: true }).click();
      assert.equal(await page.locator('.card:visible').count(), 6);
    }
    await page
      .getByRole('button', { name: 'All designs', exact: true })
      .click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        width + ' has no overflow',
      );
    }
    await page.screenshot({
      path: path.join(out, 'catalog.png'),
      fullPage: true,
    });
    for (const selector of [
      '.download',
      'a[href="files/png/why-use.png"]',
      'a[href="files/templates/why-use.json"]',
    ]) {
      const [dl] = await Promise.all([
        page.waitForEvent('download'),
        page.locator(selector).click(),
      ]);
      const chunks = [];
      for await (const c of await dl.createReadStream()) chunks.push(c);
      const expected = await readFile(
        path.join(
          __dirname,
          '../product-spotlight',
          await page.locator(selector).getAttribute('href'),
        ),
      );
      assert(Buffer.concat(chunks).equals(expected));
    }
    await page
      .locator('a[href="../asset-studio/?template=spotlight:why-use"]')
      .click();
    await page.waitForFunction(
      () =>
        window.__assetStudio?.ready() &&
        window.__assetStudio.get().layers.length === 3,
    );
    assert.equal(await page.locator('#format').inputValue(), 'portrait');
    assert.equal(await page.locator('#text').inputValue(), 'WHY I USE IT');
    await page.locator('#text').fill('WHY I RUN WITH IT');
    const textId = (await page.evaluate(() => window.__assetStudio.get()))
      .layers[2].id;
    await page.locator('#layers').selectOption(textId);
    await page.locator('#text').fill('Fits in my running vest');
    let scene = await page.evaluate(() => window.__assetStudio.get());
    assert.equal(scene.layers[1].text, 'WHY I RUN WITH IT');
    assert.equal(scene.layers[2].text, 'Fits in my running vest');
    await page.reload();
    await page.waitForFunction(() => window.__assetStudio?.ready());
    assert.deepEqual(
      await page.evaluate(() => window.__assetStudio.get()),
      scene,
      'editable wording survives reload without relaunching template',
    );
    // Every shipped template loads through the real selector, with all text separate.
    for (const a of assets) {
      await page.locator('#template').selectOption('spotlight:' + a.id);
      await page.waitForFunction(
        (id) =>
          window.__assetStudio.ready() &&
          window.__assetStudio.get().layers[0].asset === 'spotlight:' + id,
        a.id,
      );
      const current = await page.evaluate(() => window.__assetStudio.get());
      assert.equal(
        current.layers.filter((l) => l.kind === 'text').length,
        a.texts.length,
      );
    }
    await page.locator('#template').selectOption('spotlight:product-name');
    await page.waitForFunction(
      () =>
        window.__assetStudio.ready() &&
        window.__assetStudio.get().layers[0].asset === 'spotlight:product-name',
    );
    await page.locator('#text').fill('MY TRAIL HEADLAMP');
    await page.locator('#browse').evaluate((e) => (e.open = false));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(out, 'edited-template.png'),
      fullPage: true,
    });
    const [png] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#png').click(),
    ]);
    let pngBytes = [];
    for await (const c of await png.createReadStream()) pngBytes.push(c);
    assert(Buffer.concat(pngBytes).length > 5000);
    await page.locator('#tim-projects').evaluate((e) => (e.open = true));
    const [project] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#tim-project-export').click(),
    ]);
    let json = '';
    for await (const c of await project.createReadStream()) json += c;
    const exported = JSON.parse(json);
    assert.equal(exported.payload.scene.layers[1].text, 'MY TRAIL HEADLAMP');
    await page.locator('#layers').selectOption('product-name-graphic');
    await page.locator('#split').click();
    await page.waitForFunction(
      () =>
        window.__assetStudio.ready() &&
        window.__assetStudio
          .get()
          .layers.some((l) => l.asset?.startsWith('spotlight-part:')),
    );
    await page.goto(base + '/downloads/');
    await page.locator('#product-spotlight a[aria-label]').click();
    assert.equal(new URL(page.url()).pathname, '/product-spotlight/');
    const noJS = await browser.newContext({ javaScriptEnabled: false });
    const p = await noJS.newPage();
    await p.goto(base + '/product-spotlight/');
    assert.equal(await p.locator('.card').count(), 18);
    await noJS.close();
    assert.deepEqual(errors, []);
    console.log(
      'Product Spotlight passed: 18 alpha assets, all editable templates, actual text edits/export/JSON, splitting, downloads, library entry and mobile/static access.',
    );
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
