const assert = require('node:assert/strict');
const {
  server,
  launchBrowser,
  artifactDirectory,
} = require('./browser-utils.cjs');
const path = require('node:path');
(async () => {
  const srv = server();
  await new Promise((r) => (srv.listening ? r() : srv.once('listening', r)));
  const browser = await launchBrowser(),
    base = 'http://127.0.0.1:' + srv.address().port,
    out = artifactDirectory('asset-studio');
  try {
    const page = await browser.newPage({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    const input = async (id, value) =>
      page.locator('#' + id).evaluate((el, v) => {
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, String(value));
    const ready = () =>
      page.waitForFunction(() => window.__assetStudio?.ready());
    await page.goto(base);
    await page.locator('#q').fill('standalone');
    await page.locator('a[href="asset-studio/"]').click();
    await ready();
    assert.equal(await page.locator('#catalog button').count(), 67);
    await page.locator('#search').fill('stat card');
    assert.equal(await page.locator('#catalog button:visible').count(), 1);
    await page
      .getByRole('button', { name: 'Add Stat card', exact: true })
      .click();
    await ready();
    await page.locator('#addText').click();
    await page.locator('#text').fill('5K FINISH');
    await input('fontSize', 100);
    const before = await page.locator('#canvas').evaluate((c) => c.toDataURL());
    await page.locator('#backward').click();
    const behind = await page.locator('#canvas').evaluate((c) => c.toDataURL());
    assert.notEqual(before, behind, 'layer order changes the actual composite');
    await page.locator('#forward').click();
    await page.locator('#duplicate').click();
    assert.equal(
      (await page.evaluate(() => window.__assetStudio.get())).layers.length,
      3,
    );
    await page.locator('#remove').click();
    await page.locator('#visible').uncheck();
    assert.notEqual(
      await page.locator('#canvas').evaluate((c) => c.toDataURL()),
      before,
    );
    await page.locator('#visible').check();
    await page.locator('#search').fill('running shoe');
    await page
      .getByRole('button', { name: 'Add Running shoe', exact: true })
      .click();
    await ready();
    await input('x', 25);
    await input('y', 25);
    await input('size', 24);
    const rect = await page.locator('#canvas').boundingBox();
    await page.mouse.move(
      rect.x + rect.width * 0.25,
      rect.y + rect.height * 0.25,
    );
    await page.mouse.down();
    await page.mouse.move(
      rect.x + rect.width * 0.35,
      rect.y + rect.height * 0.3,
      { steps: 5 },
    );
    await page.mouse.up();
    let scene = await page.evaluate(() => window.__assetStudio.get());
    assert(Math.abs(scene.layers[2].x - 35) < 1);
    assert(Math.abs(scene.layers[2].y - 30) < 1);
    await page.reload();
    await ready();
    assert.deepEqual(
      await page.evaluate(() => window.__assetStudio.get()),
      scene,
      'browser draft round trip',
    );
    await page.locator('#tim-projects').evaluate((e) => (e.open = true));
    await page.locator('#tim-project-name').fill('Standalone finish graphic');
    await page.locator('#tim-project-save').click();
    await page.waitForFunction(() =>
      document
        .querySelector('#tim-project-status')
        .textContent.startsWith('Saved a new'),
    );
    const id = await page
      .locator('#tim-project-list option')
      .nth(1)
      .getAttribute('value');
    const [project] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#tim-project-export').click(),
    ]);
    let json = '';
    for await (const chunk of await project.createReadStream()) json += chunk;
    const doc = JSON.parse(json);
    assert.equal(doc.tool, 'asset-studio');
    assert.equal(doc.payload.scene.layers.length, 3);
    await input('opacity', 20);
    await page.locator('#tim-project-list').selectOption(id);
    await page.locator('#tim-project-load').click();
    await page.waitForFunction(() =>
      document
        .querySelector('#tim-project-status')
        .textContent.startsWith('Loaded'),
    );
    assert.deepEqual(
      await page.evaluate(() => window.__assetStudio.get()),
      scene,
    );
    await page.locator('#tim-project-import').setInputFiles({
      name: 'graphic.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
    await page.waitForFunction(() =>
      document
        .querySelector('#tim-project-status')
        .textContent.startsWith('Imported.'),
    );
    const invalid = JSON.parse(json);
    invalid.payload.scene.layers[0].asset = 'https://example.com/unsafe.svg';
    await page.locator('#tim-project-import').setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(invalid)),
    });
    await page.waitForFunction(() =>
      document
        .querySelector('#tim-project-status')
        .textContent.includes('Unknown library asset'),
    );
    assert.deepEqual(
      await page.evaluate(() => window.__assetStudio.get()),
      scene,
      'invalid import preserves current project',
    );
    await page.route('**/svg/medal.svg', (route) => route.abort());
    await page.locator('#search').fill('medal');
    await page.getByRole('button', { name: 'Add Medal', exact: true }).click();
    await page.waitForFunction(() =>
      document
        .querySelector('#status')
        .textContent.includes('Could not load Medal'),
    );
    assert.deepEqual(
      await page.evaluate(() => window.__assetStudio.get()),
      scene,
      'a failed asset load preserves the current composition',
    );
    await page.unroute('**/svg/medal.svg');
    const expectedPNG = await page
      .locator('#canvas')
      .evaluate((c) => c.toDataURL().split(',')[1]);
    const [png] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#png').click(),
    ]);
    const pngParts = [];
    for await (const part of await png.createReadStream()) pngParts.push(part);
    const pngBytes = Buffer.concat(pngParts);
    assert(
      pngBytes.equals(Buffer.from(expectedPNG, 'base64')),
      'PNG equals content canvas without selection guides',
    );
    const corner = await page
      .locator('#canvas')
      .evaluate((c) => [...c.getContext('2d').getImageData(0, 0, 1, 1).data]);
    assert.equal(corner[3], 0, 'PNG background is transparent');
    await page.locator('#motion').selectOption('pulse');
    const atZero = await page.locator('#canvas').evaluate((c) => {
      const off = document.createElement('canvas');
      window.__assetStudio.render(off, 0);
      return off.toDataURL();
    });
    const atPeak = await page.locator('#canvas').evaluate((c) => {
      const off = document.createElement('canvas');
      window.__assetStudio.render(off, 1);
      return off.toDataURL();
    });
    assert.notEqual(atZero, atPeak, 'motion changes actual rendered pixels');
    await page.locator('#search').fill('');
    await page.locator('#browse').evaluate((e) => (e.open = false));
    await page.locator('#tim-projects').evaluate((e) => (e.open = false));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(out, 'desktop.png'),
      fullPage: true,
    });
    for (const format of ['portrait', 'landscape', 'square']) {
      await page.locator('#format').selectOption(format);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          format + '/' + width + ' no overflow',
        );
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(out, 'mobile.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#duration').selectOption('2');
    await page.locator('#mode').selectOption('green');
    await page.locator('#export').click();
    assert(await page.locator('#x').isDisabled());
    await page.locator('#result').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(
      () => document.querySelector('#videoPreview').readyState >= 2,
    );
    const green = await page.locator('#videoPreview').evaluate((v) => {
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      return {
        w: c.width,
        h: c.height,
        p: [...c.getContext('2d').getImageData(0, 0, 1, 1).data],
      };
    });
    assert.equal(green.w, 1080);
    assert.equal(green.h, 1080);
    assert(
      green.p[1] > 230 && green.p[0] < 25 && green.p[2] < 25,
      'video has chroma green background',
    );
    const [video] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#saveVideo').click(),
    ]);
    const videoParts = [];
    for await (const chunk of await video.createReadStream())
      videoParts.push(chunk);
    assert(Buffer.concat(videoParts).length > 5000);
    assert.match(video.suggestedFilename(), /\.(mp4|webm)$/);
    await page.locator('#export').click();
    await page.locator('#cancel').waitFor({ state: 'visible' });
    await page.locator('#cancel').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#status').textContent === 'Recording canceled.',
    );
    assert.equal(await page.locator('#x').isDisabled(), false);
    await page.locator('#mode').selectOption('transparent');
    await page.locator('#export').click();
    await page
      .locator('#result')
      .waitFor({ state: 'visible', timeout: 180000 });
    assert.match(await page.locator('#videoInfo').textContent(), /\.webm/);
    const [alpha] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#saveVideo').click(),
    ]);
    await alpha.saveAs(path.join(out, 'transparent-example.webm'));
    assert.equal(
      (await page.locator('#status').textContent()).startsWith('Video ready'),
      true,
    );
    await page.goto(base + '/icon-pack/');
    await page
      .locator('a[href="../asset-studio/?asset=icon:running-shoe"]')
      .click();
    await ready();
    await page.waitForFunction(() =>
      window.__assetStudio
        .get()
        .layers.some((l) => l.asset === 'icon:running-shoe'),
    );
    const splitPage = await browser.newPage();
    await splitPage.goto(base + '/asset-studio/?asset=motion:route-pin');
    await splitPage.waitForFunction(
      () =>
        window.__assetStudio?.ready() &&
        window.__assetStudio.get().layers.length === 1,
    );
    const composed = await splitPage
      .locator('#canvas')
      .evaluate((c) => c.toDataURL());
    await splitPage.locator('#split').click();
    await splitPage.waitForFunction(
      () => window.__assetStudio.get().layers.length === 3,
    );
    const parts = await splitPage.evaluate(() => window.__assetStudio.get());
    assert(parts.layers.every((l) => l.asset.startsWith('part:route-pin:')));
    assert.equal(
      await splitPage.locator('#canvas').evaluate((c) => c.toDataURL()),
      composed,
      'split parts retain exact visual alignment',
    );
    await splitPage.locator('#motion').selectOption('float');
    await splitPage.reload();
    await splitPage.waitForFunction(() => window.__assetStudio?.ready());
    assert.equal(
      (await splitPage.evaluate(() => window.__assetStudio.get())).layers[0]
        .motion,
      'float',
    );
    await splitPage.close();
    assert.deepEqual(errors, []);
    console.log(
      'Asset Animator passed: layers/drag/text, aligned part splitting, project safety, PNG alpha, real green video + transparent WebM, responsive layouts and standalone library entry.',
    );
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
