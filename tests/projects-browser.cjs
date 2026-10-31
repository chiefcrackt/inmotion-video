const assert = require('node:assert/strict');
const { server, launchBrowser } = require('./browser-utils.cjs');
(async () => {
  const srv = server();
  await new Promise((r) => (srv.listening ? r() : srv.once('listening', r)));
  const browser = await launchBrowser();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const base = 'http://127.0.0.1:' + srv.address().port;
  try {
    for (const tool of [
      'title-maker',
      'promo-maker',
      'cover-maker',
      'start-line',
      'river-run',
      'mile-marker',
      'special-post',
      'celebrate',
    ]) {
      await page.goto(base + '/' + tool + '/');
      await page.locator('#tim-projects').waitFor();
      await page.locator('#tim-projects').evaluate((e) => (e.open = true));
      await page.evaluate(() => document.fonts.ready);
      assert(
        await page.evaluate(() =>
          document.fonts.check('700 20px "Barlow Condensed"'),
        ),
      );
      await page.locator('#tim-text-font').selectOption('Georgia');
      await page.locator('#tim-output-theme').selectOption('minimal');
      await page.locator('#tim-project-name').fill('Test ' + tool);
      await page.locator('#tim-project-save').click();
      await page.waitForFunction(() =>
        document
          .querySelector('#tim-project-status')
          .textContent.includes('Saved a new'),
      );
      const id = await page
        .locator('#tim-project-list option')
        .nth(1)
        .getAttribute('value');
      await page.locator('#tim-text-font').selectOption('Arial');
      await page.locator('#tim-output-theme').selectOption('broadcast');
      await page.locator('#tim-project-list').selectOption(id);
      await page.locator('#tim-project-load').click();
      await page.waitForFunction(() =>
        document
          .querySelector('#tim-project-status')
          .textContent.startsWith('Loaded'),
      );
      assert.equal(
        await page.locator('#tim-text-font').inputValue(),
        'Georgia',
      );
      assert.equal(
        await page.locator('#tim-output-theme').inputValue(),
        'minimal',
      );
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('#tim-project-export').click(),
      ]);
      const content = await new Promise(async (resolve, reject) => {
        const stream = await download.createReadStream();
        let s = '';
        stream.on('data', (b) => (s += b));
        stream.on('end', () => resolve(s));
        stream.on('error', reject);
      });
      const doc = JSON.parse(content);
      assert.equal(doc.payload.state.textFont, 'Georgia');
      assert.equal(doc.payload.state.theme, 'minimal');
      await page.locator('#tim-text-font').selectOption('Arial');
      await page.locator('#tim-project-import').setInputFiles({
        name: 'restore.json',
        mimeType: 'application/json',
        buffer: Buffer.from(content),
      });
      await page.waitForFunction(() =>
        document
          .querySelector('#tim-project-status')
          .textContent.startsWith('Imported.'),
      );
      assert.equal(
        await page.locator('#tim-text-font').inputValue(),
        'Georgia',
      );
      await page.locator('#tim-project-import').setInputFiles({
        name: 'wrong.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ ...doc, tool: 'wrong' })),
      });
      await page.waitForFunction(() =>
        document
          .querySelector('#tim-project-status')
          .textContent.includes('version 1 project'),
      );
      assert.equal(
        await page.locator('#tim-text-font').inputValue(),
        'Georgia',
      );
      await page.reload();
      await page.locator('#tim-projects').evaluate((e) => (e.open = true));
      await page.waitForFunction(
        () => document.querySelector('#tim-project-list').options.length > 1,
      );
      assert.equal(
        await page.locator('#tim-text-font').inputValue(),
        'Georgia',
      );
      await page.setViewportSize({ width: 390, height: 844 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      console.log(
        tool + ': saved/reloaded/imported style and portable project OK',
      );
    }
    // Framer backgrounds exceed the short-text limit and survive both storage paths.
    await page.goto(base + '/video-framer/');
    const framerPhoto = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d'), pixels = ctx.createImageData(256, 256);
      let seed = 42;
      for (let i = 0; i < pixels.data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels.data[i] = i % 4 === 3 ? 255 : seed >>> 24;
      }
      ctx.putImageData(pixels, 0, 0);
      return c.toDataURL().split(',')[1];
    });
    await page.locator('#bgFile').setInputFiles({
      name: 'background.png', mimeType: 'image/png', buffer: Buffer.from(framerPhoto, 'base64'),
    });
    await page.waitForFunction(() => window.__framer.state().bgUpload.length > 10000);
    const embedded = await page.evaluate(() => window.__framer.state().bgUpload);
    await page.locator('#tim-projects').evaluate(e => e.open = true);
    await page.locator('#tim-project-save').click();
    await page.waitForFunction(() => document.querySelector('#tim-project-status').textContent.startsWith('Saved a new'));
    const framerId = await page.locator('#tim-project-list option').nth(1).getAttribute('value');
    const [framerDownload] = await Promise.all([
      page.waitForEvent('download'), page.locator('#tim-project-export').click(),
    ]);
    let framerJSON = '';
    for await (const chunk of await framerDownload.createReadStream()) framerJSON += chunk;
    await page.reload();
    await page.locator('#tim-projects').evaluate(e => e.open = true);
    await page.waitForFunction(() => document.querySelector('#tim-project-list').options.length > 1);
    await page.locator('#tim-project-list').selectOption(framerId);
    await page.locator('#tim-project-load').click();
    await page.waitForFunction(() => document.querySelector('#tim-project-status').textContent.startsWith('Loaded'));
    assert.equal(await page.evaluate(() => window.__framer.state().bgUpload), embedded);
    await page.evaluate(() => window.__framer.set({ bgUpload: '', bg: 'solid' }));
    await page.locator('#tim-project-import').setInputFiles({ name: 'framer.json', mimeType: 'application/json', buffer: Buffer.from(framerJSON) });
    await page.waitForFunction(() => document.querySelector('#tim-project-status').textContent.startsWith('Imported.'));
    assert.equal(await page.evaluate(() => window.__framer.state().bgUpload), embedded);
    const invalid = JSON.parse(framerJSON);
    invalid.payload.state.bgUpload = 'data:image/png;base64,broken';
    await page.locator('#tim-project-import').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
    await page.waitForFunction(() => document.querySelector('#tim-project-status').textContent.includes('Cannot read the project photo'));
    assert.equal(await page.evaluate(() => window.__framer.state().bgUpload), embedded);

    // Photo projects preserve actual pixels across a page reload.
    for (const tool of ['cover-maker', 'promo-maker']) {
      await page.goto(base + '/' + tool + '/');
      await page.locator('#tim-projects').evaluate((e) => (e.open = true));
      const photo = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 100;
        c.height = 60;
        c.getContext('2d').fillStyle = '#ff00ff';
        c.getContext('2d').fillRect(0, 0, 100, 60);
        return c.toDataURL().split(',')[1];
      });
      await page.locator('#file').setInputFiles({
        name: 'photo.png',
        mimeType: 'image/png',
        buffer: Buffer.from(photo, 'base64'),
      });
      await page.waitForTimeout(200);
      await page.locator('#tim-project-name').fill('Photo');
      await page.locator('#tim-project-save').click();
      await page.waitForFunction(() =>
        document
          .querySelector('#tim-project-status')
          .textContent.includes('Saved a new'),
      );
      const id = await page
        .locator('#tim-project-list option')
        .nth(1)
        .getAttribute('value');
      await page.reload();
      await page.locator('#tim-projects').evaluate((e) => (e.open = true));
      await page.waitForFunction(
        () => document.querySelector('#tim-project-list').options.length > 1,
      );
      await page.locator('#tim-project-list').selectOption(id);
      await page.locator('#tim-project-load').click();
      await page.waitForFunction(() =>
        document
          .querySelector('#tim-project-status')
          .textContent.startsWith('Loaded'),
      );
      const [d] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('#tim-project-export').click(),
      ]);
      const stream = await d.createReadStream();
      let str = '';
      for await (const chunk of stream) str += chunk;
      assert(
        JSON.parse(str).payload.photo.startsWith('data:image/png;base64,'),
      );
    }
    await page.goto(base + '/text-motion/');
    await page.locator('#tim-projects').evaluate((e) => (e.open = true));
    await page.locator('#tim-text-font').selectOption('Georgia');
    await page.locator('#tim-output-theme').selectOption('minimal');
    await page.locator('#tim-project-name').fill('Text setup');
    await page.locator('#tim-project-save').click();
    await page.waitForFunction(() =>
      document
        .querySelector('#tim-project-status')
        .textContent.includes('Saved a new'),
    );
    await page.screenshot({
      path: require('node:path').join(
        require('node:os').tmpdir(),
        'tim-text-projects.png',
      ),
      fullPage: true,
    });
    await page.goto(base + '/activity-studio/');
    await page.locator('#tim-projects').evaluate((e) => (e.open = true));
    await page.locator('#tim-project-name').fill('Design only');
    await page.locator('#tim-project-save').click();
    await page.waitForFunction(() =>
      document
        .querySelector('#tim-project-status')
        .textContent.includes('Saved a new'),
    );
    const id = await page
      .locator('#tim-project-list option')
      .nth(1)
      .getAttribute('value');
    await page.locator('#tim-project-list').selectOption(id);
    await page.locator('#tim-project-load').click();
    await page.waitForFunction(() =>
      document
        .querySelector('#tim-project-status')
        .textContent.startsWith('Loaded'),
    );
    // Presets restore a real loaded design while excluding the activity records.
    const { gpx } = await import('../activity-studio/tests/fixtures.mjs');
    await page.locator('#file').setInputFiles({
      name: 'test.gpx',
      mimeType: 'application/xml',
      buffer: Buffer.from(gpx),
    });
    await page.waitForFunction(() =>
      document.querySelector('#importStatus').textContent.startsWith('Loaded'),
    );
    await page.locator('#title').fill('Saved run design');
    await page.locator('#font').selectOption('serif');
    await page.locator('#preset').selectOption('minimal');
    await page.locator('#tim-project-name').fill('Run design');
    await page.locator('#tim-project-save').click();
    await page.waitForFunction(() =>
      document
        .querySelector('#tim-project-status')
        .textContent.includes('Saved a new'),
    );
    const runId = await page
      .locator('#tim-project-list option')
      .nth(1)
      .getAttribute('value');
    await page.locator('#title').fill('Changed');
    await page.locator('#font').selectOption('sans');
    await page.locator('#tim-project-list').selectOption(runId);
    await page.locator('#tim-project-load').click();
    await page.waitForFunction(() =>
      document
        .querySelector('#tim-project-status')
        .textContent.startsWith('Loaded'),
    );
    assert.equal(await page.locator('#title').inputValue(), 'Saved run design');
    assert.equal(await page.locator('#font').inputValue(), 'serif');
    const [presetFile] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#tim-project-export').click(),
    ]);
    const presetStream = await presetFile.createReadStream();
    let presetText = '';
    for await (const chunk of presetStream) presetText += chunk;
    const presetDoc = JSON.parse(presetText);
    assert.deepEqual(Object.keys(presetDoc.payload).sort(), [
      'seconds',
      'settings',
      'size',
      'style',
    ]);
    assert(!presetText.includes('latDeg'));
    await page.goto(base + '/carousel-maker/');
    assert.equal(await page.locator('#font').inputValue(), 'Barlow Condensed');
    assert(await page.locator('#font option[value="Arial"]').count());
    assert.deepEqual(errors, []);
    console.log('Project browser checks passed');
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
