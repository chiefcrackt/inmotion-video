const {
  launchBrowser,
  artifactDirectory,
} = require('../../tests/browser-utils.cjs');
const fs = require('fs');
const assert = require('assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const artifacts = artifactDirectory('cover-check');
let baseline;
try {
  baseline = execFileSync(
    'git',
    ['show', 'origin/main:cover-maker/index.html'],
    { cwd: root, encoding: 'utf8' },
  );
} catch (e) {
  console.log('Baseline comparison skipped: fetch origin/main first.');
}
(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
        viewport: { width: 1360, height: 1000 },
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const source = fs.readFileSync(
      path.join(__dirname, '../index.html'),
      'utf8',
    );
    const hook =
      'window.testEditor={get S(){return S},get layouts(){return layouts},get photo(){return PHOTO},set photo(v){PHOTO=v},get bounds(){return bounds},render,paint,sync,refresh,checkpoint,element,layout,dims,set selected(v){selected=v},set editing(v){editing=v}};';
    await page.route('**/*', (r) =>
      r.request().url() === 'http://cover.test/'
        ? r.fulfill({
            body: source.replace(
              /\}\)\(\);\s*<\/script>/,
              hook + '})();</script>',
            ),
            contentType: 'text/html',
          })
        : new URL(r.request().url()).pathname.startsWith('/shared/')
          ? r.fulfill({
              body: fs.readFileSync(
                path.join(root, new URL(r.request().url()).pathname.slice(1)),
              ),
              contentType: new URL(r.request().url()).pathname.endsWith('.js')
                ? 'text/javascript'
                : new URL(r.request().url()).pathname.endsWith('.css')
                  ? 'text/css'
                  : 'font/ttf',
            })
          : r.abort(),
    );
    await page.goto('http://cover.test/');
    await page.waitForFunction(() => window.testEditor);
    await page.evaluate(async () => {
      await document.fonts.ready;
      testEditor.editing = false;
      testEditor.paint();
    });
    // Render each format, with all editing aids disabled, against the original renderer.
    if (baseline) {
      const old = await browser.newPage();
      await old.route('**/*', (r) =>
        r.request().url() === 'http://original.test/'
          ? r.fulfill({
              body: baseline.replace(
                /<\/head\s*>/i,
                '<link rel="stylesheet" href="/shared/fonts.css"></head>',
              ),
              contentType: 'text/html',
            })
          : new URL(r.request().url()).pathname.startsWith('/shared/')
            ? r.fulfill({
                body: fs.readFileSync(
                  path.join(root, new URL(r.request().url()).pathname.slice(1)),
                ),
                contentType: new URL(r.request().url()).pathname.endsWith('.js')
                  ? 'text/javascript'
                  : new URL(r.request().url()).pathname.endsWith('.css')
                    ? 'text/css'
                    : 'font/ttf',
              })
            : r.abort(),
      );
      await old.goto('http://original.test/');
      await old.evaluate(() => document.fonts.ready);
      await old.locator('#editing').uncheck();
      for (const mode of ['thumb', 'reel', 'hl']) {
        const actual = await page.evaluate((mode) => {
          testEditor.S.mode = mode;
          testEditor.S.guide = false;
          testEditor.S.hlguide = false;
          testEditor.sync();
          testEditor.refresh(false);
          return document.querySelector('#cv').toDataURL();
        }, mode);
        await old.locator('[data-mode="' + mode + '"]').click();
        for (const id of ['guide', 'hlguide'])
          await old.locator('#' + id).evaluate((el) => {
            el.checked = false;
            el.onchange();
          });
        const expected = await old
          .locator('#cv')
          .evaluate((c) => c.toDataURL());
        assert.equal(
          require('node:crypto')
            .createHash('sha256')
            .update(actual)
            .digest('hex'),
          require('node:crypto')
            .createHash('sha256')
            .update(expected)
            .digest('hex'),
          'original defaults preserved for ' + mode,
        );
      }
      await old.close();
    }
    await page.locator('[data-mode="thumb"]').click();
    await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 300;
      c.height = 200;
      const x = c.getContext('2d');
      x.fillStyle = '#ff0000';
      x.fillRect(0, 0, 150, 200);
      x.fillStyle = '#00ff00';
      x.fillRect(150, 0, 150, 200);
      window.fixture = c.toDataURL();
    });
    const data = await page.evaluate(() => fixture);
    await page.locator('#file').setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(data.split(',')[1], 'base64'),
    });
    await page.waitForFunction(() => testEditor.photo);
    await page.locator('#photo-rotation').fill('45');
    await page.locator('#photo-rotation').dispatchEvent('change');
    await page.locator('#photo-brightness').fill('135');
    await page.locator('#photo-brightness').dispatchEvent('change');
    await page.locator('#fit').selectOption('fit');
    const before = await page.locator('#cv').evaluate((c) => c.toDataURL());
    await page.locator('#flipX').check();
    assert.notEqual(
      await page.locator('#cv').evaluate((c) => c.toDataURL()),
      before,
      'flip changes pixels',
    );
    const rect = await page.locator('#cv').boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      rect.x + rect.width / 2 + 45,
      rect.y + rect.height / 2 + 20,
    );
    await page.mouse.up();
    assert.ok(
      (await page.evaluate(() => testEditor.layout().photo.x)) > 0,
      'mouse drag moves photo',
    );
    const composition = await page.evaluate(() =>
      JSON.stringify(testEditor.layout()),
    );
    await page.locator('[data-mode="reel"]').click();
    await page.locator('[data-mode="thumb"]').click();
    assert.equal(
      await page.evaluate(() => JSON.stringify(testEditor.layout())),
      composition,
      'format preserves composition',
    );
    await page.getByRole('button', { name: 'Headline', exact: true }).click();
    await page.locator('#element-x').fill('12');
    await page.locator('#element-x').dispatchEvent('change');
    await page.locator('#element-rotation').fill('-30');
    await page.locator('#element-rotation').dispatchEvent('change');
    await page.locator('#text-effect').selectOption('outline');
    await page
      .getByRole('button', { name: 'Lock Headline', exact: true })
      .click();
    await page.locator('#cv').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(
      await page.evaluate(() => testEditor.element('head').x),
      12,
      'locked element rejects movement',
    );
    await page
      .getByRole('button', { name: 'Unlock Headline', exact: true })
      .click();
    await page.locator('#cv').focus();
    await page.keyboard.press('ArrowRight');
    assert.ok(await page.evaluate(() => testEditor.element('head').x > 12));
    await page.locator('#undo').click();
    assert.equal(await page.evaluate(() => testEditor.element('head').x), 12);
    await page.locator('#redo').click();
    assert.ok(await page.evaluate(() => testEditor.element('head').x > 12));
    // Intercept the download blob to compare exported PNG pixels without a native save dialog.
    await page.locator('#safe').check();
    await page.locator('#editing').check();
    const expected = await page.evaluate(() => {
      const c = document.createElement('canvas'),
        d = testEditor.dims();
      c.width = d.W;
      c.height = d.H;
      testEditor.render(c.getContext('2d'), d.W, d.H);
      return c.toDataURL();
    });
    await page.evaluate(() => {
      URL.createObjectURL = function (blob) {
        window.savedBlob = blob;
        return 'blob:test';
      };
      HTMLAnchorElement.prototype.click = function () {};
    });
    await page.locator('#png').click();
    await page.waitForFunction(() => window.savedBlob);
    const encoded = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.readAsDataURL(savedBlob);
        }),
    );
    const exported = Buffer.from(encoded.split(',')[1], 'base64');
    assert.equal(
      exported.toString('base64'),
      expected.split(',')[1],
      'PNG matches shared renderer without guides or selection',
    );
    assert.equal(exported.readUInt32BE(16), 1280);
    assert.equal(exported.readUInt32BE(20), 720);
    for (const mode of ['reel', 'hl']) {
      await page.locator('[data-mode="' + mode + '"]').click();
      await page.evaluate(() => {
        window.savedBlob = null;
        testEditor.S.guide = true;
        testEditor.S.hlguide = true;
        testEditor.paint();
      });
      const expected = await page.evaluate(() => {
        const c = document.createElement('canvas'),
          d = testEditor.dims();
        c.width = d.W;
        c.height = d.H;
        testEditor.render(c.getContext('2d'), d.W, d.H);
        return c.toDataURL();
      });
      await page.locator('#png').click();
      await page.waitForFunction(() => window.savedBlob);
      const result = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.readAsDataURL(savedBlob);
          }),
      );
      assert.equal(result, expected, mode + ' export excludes guides');
      const png = Buffer.from(result.split(',')[1], 'base64');
      assert.equal(png.readUInt32BE(16), 1080);
      assert.equal(png.readUInt32BE(20), 1920);
    }
    // Every photo adjustment and mode must alter real rendered pixels, then reset cleanly.
    await page.evaluate(() => {
      testEditor.S.mode = 'reel';
      testEditor.refresh(false);
    });
    const checks = await page.evaluate(() => {
      const t = testEditor,
        p = t.layout().photo,
        defaults = JSON.parse(JSON.stringify(p));
      function image() {
        const c = document.createElement('canvas'),
          d = t.dims();
        c.width = d.W;
        c.height = d.H;
        t.render(c.getContext('2d'), d.W, d.H);
        return c.toDataURL();
      }
      const base = image(),
        result = {};
      for (const [key, value] of Object.entries({
        zoom: 40,
        x: 25,
        y: 20,
        rotation: 90,
        brightness: 50,
        contrast: 25,
        saturation: 0,
        exposure: -2,
        blur: 15,
        opacity: 25,
        flipX: true,
        flipY: true,
        fit: 'original',
      })) {
        Object.assign(p, defaults);
        p[key] = value;
        result[key] = image() !== base;
      }
      Object.assign(p, defaults);
      return result;
    });
    // Fixture is vertically symmetric, so vertical flip is checked geometrically instead of by pixels.
    for (const [key, changed] of Object.entries(checks))
      if (key !== 'flipY')
        assert.equal(changed, true, key + ' affects final pixels');
    await page.evaluate(() => {
      testEditor.layout().photo.flipY = true;
      testEditor.paint();
    });
    assert.ok(
      await page.evaluate(() => testEditor.bounds.photo.matrix.d < 0),
      'vertical flip transform',
    );
    await page.locator('[data-mode="thumb"]').click();
    // Text can be dragged directly and hiding/reordering alters the final composition.
    await page.getByRole('button', { name: 'Headline', exact: true }).click();
    const pos = await page.evaluate(() => {
      const b = testEditor.bounds.head,
        r = document.querySelector('#cv').getBoundingClientRect(),
        p = b.matrix.transformPoint({
          x: b.box[0] + b.box[2] / 2,
          y: b.box[1] + b.box[3] / 2,
        });
      return {
        x: r.x + (p.x / 1280) * r.width,
        y: r.y + (p.y / 720) * r.height,
        offset: testEditor.element('head').x,
      };
    });
    await page.mouse.move(pos.x, pos.y);
    await page.mouse.down();
    await page.mouse.move(pos.x + 20, pos.y);
    await page.mouse.up();
    assert.ok(
      await page.evaluate((x) => testEditor.element('head').x > x, pos.offset),
      'drag headline',
    );
    const visible = await page.locator('#cv').evaluate((c) => c.toDataURL());
    await page
      .getByRole('button', { name: 'Hide Headline', exact: true })
      .click();
    assert.notEqual(
      await page.locator('#cv').evaluate((c) => c.toDataURL()),
      visible,
    );
    await page
      .getByRole('button', { name: 'Show Headline', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Bring forward Photo', exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => testEditor.layout().order[1]),
      'photo',
    );
    await page.screenshot({
      path: path.join(artifacts, 'desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(artifacts, 'mobile.png'),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      'mobile has no horizontal overflow',
    );
    // Real touch pointer events exercise the same captured-pointer path.
    await page.getByRole('button', { name: 'Photo', exact: true }).click();
    await page.locator('#cv').scrollIntoViewIfNeeded();
    const prior = await page.evaluate(() => testEditor.layout().photo.x),
      r = await page.locator('#cv').boundingBox(),
      cdp = await page.context().newCDPSession(page),
      x = r.x + r.width / 2,
      y = r.y + r.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 20, y }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    assert.ok(
      await page.evaluate(
        (prior) => testEditor.layout().photo.x > prior,
        prior,
      ),
      'touch drag moves photo',
    );
    assert.deepEqual(errors, [], 'no browser errors');
    console.log(
      'PASS: template rendering, photo filters/flip/drag, per-format composition, text transform/lock, undo/redo, full-resolution PNG pixel parity, mobile layout',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
