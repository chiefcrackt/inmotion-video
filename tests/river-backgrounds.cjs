const assert = require('node:assert/strict');
const fs = require('node:fs');
const { launchBrowser, server } = require('./browser-utils.cjs');
(async () => {
  const srv = server();
  await new Promise((r) => (srv.listening ? r() : srv.once('listening', r)));
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
        viewport: { width: 1300, height: 950 },
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const base = 'http://127.0.0.1:' + srv.address().port;
    await page.goto(base + '/river-run/');
    await page.waitForFunction(
      () => window.RiverRun && !document.querySelector('#rec').disabled,
    );
    for (const value of ['scene', 'navy', 'green'])
      assert.equal(
        await page.locator('[data-g=bg][data-v=' + value + ']').count(),
        1,
      );
    assert.equal(await page.locator('#outfit option').count(), 4);
    const ids = await page
      .locator('#timBackgroundChoice option')
      .evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
    assert.equal(ids.length, 6);
    const shots = [];
    for (const id of ids) {
      await page.selectOption('#timBackgroundChoice', id);
      await page.click('#timBackgroundApply');
      await page.waitForFunction(
        (id) =>
          RiverRun.settings.bg === 'artwork' &&
          RiverRun.settings.backgroundPack === id &&
          !document.querySelector('#rec').disabled,
        id,
      );
      console.log('Checking River Run backdrop: ' + id);
      let last = '';
      for (const theme of ['tim', 'minimal', 'broadcast']) {
        await page.evaluate((theme) => {
          const s = document.querySelector('#tim-output-theme');
          s.value = theme;
          s.dispatchEvent(new Event('change', { bubbles: true }));
        }, theme);
        await page.waitForFunction(
          (theme) => RiverRun.settings.theme === theme,
          theme,
        );
        for (const fmt of ['h', 'v']) {
          await page.click('[data-g=fmt][data-v=' + fmt + ']');
          const result = await page.evaluate(() => {
            RiverRun.paint(0.6);
            const c = document.querySelector('#cv');
            return { width: c.width, height: c.height, src: c.toDataURL() };
          });
          assert.equal(result.width, fmt === 'h' ? 1920 : 1080);
          assert.equal(result.height, fmt === 'h' ? 1080 : 1920);
          if (fmt === 'h') {
            assert.notEqual(result.src, last);
            last = result.src;
            if (id === 'misty-trail')
              shots.push({ label: theme, src: result.src });
          }
        }
      }
    }
    const themed = await page.evaluate(() => {
      RiverRun.paint(0.6);
      return document.querySelector('#cv').toDataURL();
    });
    await page.uncheck('#timBackgroundMatch');
    const original = await page.evaluate(() => {
      RiverRun.paint(0.6);
      return document.querySelector('#cv').toDataURL();
    });
    assert.notEqual(original, themed);
    await page.reload();
    await page.waitForFunction(
      () => window.RiverRun && !document.querySelector('#rec').disabled,
    );
    assert.equal(await page.isChecked('#timBackgroundMatch'), false);
    assert.equal(
      await page.evaluate(() => RiverRun.settings.backgroundPack),
      'paper-texture',
    );
    await page.check('#timBackgroundMatch');
    for (const id of ['original', 'race', 'trail', 'winter']) {
      await page.selectOption('#outfit', id);
      await page.waitForFunction(
        (id) =>
          RiverRun.settings.outfit === id &&
          !document.querySelector('#rec').disabled,
        id,
      );
    }
    for (const theme of ['tim', 'minimal', 'broadcast']) {
      await page.evaluate((theme) => {
        const s = document.querySelector('#tim-output-theme');
        s.value = theme;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      }, theme);
      for (const mode of ['scene', 'navy', 'green']) {
        await page.click('[data-g=bg][data-v=' + mode + ']');
        const pixel = await page.evaluate(() => {
          RiverRun.paint(0.6);
          return Array.from(
            document
              .querySelector('#cv')
              .getContext('2d')
              .getImageData(0, 0, 1, 1).data,
          );
        });
        if (mode === 'green') assert.deepEqual(pixel, [0, 255, 0, 255]);
        if (mode === 'scene') {
          shots.push({
            label: 'River scene · ' + theme,
            src: await page.evaluate(() =>
              document.querySelector('#cv').toDataURL(),
            ),
          });
        }
      }
    }
    await page.click('[data-g=bg][data-v=artwork]');
    await page.waitForFunction(() => !document.querySelector('#rec').disabled);
    await page.evaluate(() => {
      const s = document.querySelector('#tim-output-theme');
      s.value = 'minimal';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click('[data-g=len][data-v="5"]');
    await page.locator('button.snd').filter({ hasText: 'Silent clip' }).click();
    const expectedPixel = await page.evaluate(() => {
      const c = document.querySelector('#cv');
      return Array.from(
        c.getContext('2d').getImageData(Math.floor(c.width / 2), 50, 1, 1).data,
      );
    });
    await page.click('#rec');
    await page.waitForFunction(() => document.querySelector('#rec').disabled);
    assert.equal(await page.locator('#timBackgroundApply').isDisabled(), true);
    assert.equal(await page.locator('#timBackgroundMatch').isDisabled(), true);
    await page.waitForFunction(
      () =>
        !document.querySelector('#result').hidden &&
        document.querySelector('#vid').readyState >= 2,
      null,
      { timeout: 20000 },
    );
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const video = document.querySelector('#vid');
          const timeout = setTimeout(
            () => reject(Error('Recorded video could not seek.')),
            5000,
          );
          video.addEventListener(
            'seeked',
            () => {
              clearTimeout(timeout);
              resolve();
            },
            { once: true },
          );
          video.currentTime = 0.5;
        }),
    );
    const recorded = await page.evaluate(() => {
      const v = document.querySelector('#vid'),
        c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      return {
        width: v.videoWidth,
        height: v.videoHeight,
        pixel: Array.from(c.getContext('2d').getImageData(0, 0, 1, 1).data),
        duration: v.duration,
      };
    });
    assert.equal(recorded.width, 1080);
    assert.equal(recorded.height, 1920);
    assert.ok(
      recorded.pixel
        .slice(0, 3)
        .every((value, i) => Math.abs(value - expectedPixel[i]) < 35),
      'Recorded background pixels should match the themed preview: ' +
        JSON.stringify({ expectedPixel, recorded }),
    );
    assert.ok(recorded.duration >= 4.5 || recorded.duration === Infinity);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    const review = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
    });
    await review.setContent(
      '<html style="font-family:Arial;background:#f6f4ef;color:#172332"><body><h2>River Run · preserved scenes and theme-aware backdrops</h2><main style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">' +
        shots
          .map(
            (s) =>
              '<div><p>' +
              s.label +
              '</p><img style="width:100%;height:360px;object-fit:contain" src="' +
              s.src +
              '"></div>',
          )
          .join('') +
        '</main></body></html>',
    );
    await review.screenshot({
      path: 'shared/backgrounds/river-theme-review.jpg',
      fullPage: true,
    });
    await review.close();
    console.log(
      'PASS: six backgrounds × three themes × two formats, three original scenes, four outfits, reload, original toggle, mobile, five-second recorded video with theme pixels.',
    );
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
