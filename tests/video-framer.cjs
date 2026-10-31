// Video Framer: layout at phone and desktop widths, clean loop seam, window transparency / green fill,
// no glow spilling into the window, PNG save, green-screen recording and transparent WebM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  launchBrowser,
  server,
  artifactDirectory,
} = require('./browser-utils.cjs');

(async () => {
  const out = artifactDirectory('video-framer');
  const http = server(0);
  await new Promise((r) => http.on('listening', r));
  const url = `http://127.0.0.1:${http.address().port}/video-framer/`;
  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => window.__framer);
    await page.evaluate(() => document.fonts.ready);

    for (const width of [400, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `no sideways scroll at ${width}px`,
      );
      await page.screenshot({
        path: path.join(out, `page-${width}.png`),
        fullPage: true,
      });
    }

    // Pixel checks on an offscreen canvas through the page's own renderer.
    const probe = (state, t, mode) =>
      page.evaluate(
        ({ state, t, mode }) => {
          const F = window.__framer;
          F.set(state);
          const c = document.createElement('canvas');
          c.width = 1920;
          c.height = 1080;
          const x = c.getContext('2d', { willReadFrequently: true });
          F.render(x, t, mode);
          const g = F.geom(),
            h = g.hole,
            S = F.state();
          const px = (a, b) => [...x.getImageData(a, b, 1, 1).data];
          // every window pixel at least (border + 3px) in from the edge and clear of the rounded corners
          const m = (S.border === 'none' ? 0 : S.borderW / 2) + 3,
            r = +S.radius;
          const inner = x.getImageData(
            Math.ceil(h.x + m),
            Math.ceil(h.y + m + r),
            Math.floor(h.w - 2 * m),
            Math.floor(h.h - 2 * m - 2 * r),
          ).data;
          let off = 0;
          for (let i = 0; i < inner.length; i += 4) {
            const ok =
              mode === 'green'
                ? inner[i] === 0 && inner[i + 1] === 255 && inner[i + 2] === 0
                : inner[i + 3] === 0;
            if (!ok) off++;
          }
          return {
            url: c.toDataURL(),
            center: px(h.x + h.w / 2, h.y + h.h / 2),
            corner: px(10, 10),
            off,
          };
        },
        { state, t, mode },
      );

    const anim = { motion: 'animated', loop: '4', layout: 'center' };
    const a0 = await probe(anim, 0, 'green');
    const aL = await probe(anim, 4, 'green');
    const aHalf = await probe(anim, 2, 'green');
    assert.equal(a0.url, aL.url, 'frame 0 and frame L match: seamless loop');
    assert.notEqual(a0.url, aHalf.url, 'the frame animates mid-loop');
    assert.deepEqual(a0.center.slice(0, 3), [0, 255, 0], 'green window');
    assert.equal(a0.corner[3], 255, 'frame is opaque');

    for (const layout of ['center', 'left', 'right']) {
      for (const motion of ['animated', 'static']) {
        const s = {
          layout,
          motion,
          glow: true,
          aSweep: true,
          bg: 'photo:night-track',
          cropTop: 6,
          cropBottom: 10,
          inset: 40,
        };
        await page.waitForTimeout(50);
        const g = await probe(s, 1.3, 'green');
        assert.equal(g.off, 0, `${layout}/${motion}: window is pure green`);
        const c = await probe(s, 1.3, 'clear');
        assert.equal(c.off, 0, `${layout}/${motion}: window is fully clear`);
        assert.equal(c.corner[3], 255);
        fs.writeFileSync(
          path.join(out, `frame-${layout}-${motion}.png`),
          Buffer.from(g.url.split(',')[1], 'base64'),
        );
      }
    }
    // a couple of looks for review
    for (const [name, s] of [
      ['default', { layout: 'center', bg: 'grid', inset: 0, cropTop: 0, cropBottom: 0 }],
      ['left-dusk', { layout: 'left', bg: 'dusk', inset: 0, cropTop: 0, cropBottom: 0 }],
      ['right-teal', { layout: 'right', bg: 'tealfade', border: 'teal', inset: 60 }],
    ]) {
      const f = await probe(s, 1.5, 'preview');
      fs.writeFileSync(
        path.join(out, `look-${name}.png`),
        Buffer.from(f.url.split(',')[1], 'base64'),
      );
    }

    // Reset to defaults, then exercise the real buttons.
    await page.locator('#reset').click();
    await page.locator('[data-g="hole"][data-v="clear"]').click();
    let dl = page.waitForEvent('download');
    await page.locator('#png').click();
    const png = await dl;
    assert.match(png.suggestedFilename(), /transparent\.png$/);
    await png.saveAs(path.join(out, png.suggestedFilename()));

    // green-screen recording, one 4s loop
    await page.locator('[data-g="hole"][data-v="green"]').click();
    await page.locator('[data-g="loop"][data-v="4"]').click();
    await page.locator('[data-g="length"][data-v="1"]').click();
    await page.locator('#rec').click();
    await page.locator('#result').waitFor({ state: 'visible', timeout: 20000 });
    dl = page.waitForEvent('download');
    await page.locator('#save').click();
    const vid = await dl;
    const vidPath = path.join(out, vid.suggestedFilename());
    await vid.saveAs(vidPath);
    assert.ok(fs.statSync(vidPath).size > 20000, 'recording has content');
    await page.locator('#close').click();

    // transparent WebM (WebCodecs) for a 4s loop
    await page.locator('[data-g="hole"][data-v="clear"]').click();
    await page.locator('#rec').click();
    await page.locator('#result').waitFor({ state: 'visible', timeout: 240000 });
    assert.match(await page.locator('#savenote').textContent(), /\.webm/);
    dl = page.waitForEvent('download');
    await page.locator('#save').click();
    const alpha = await dl;
    const alphaPath = path.join(out, alpha.suggestedFilename());
    await alpha.saveAs(alphaPath);
    assert.ok(fs.statSync(alphaPath).size > 20000, 'alpha webm has content');

    // settings survive a reload
    await page.locator('[data-g="layout"][data-v="right"]').click();
    await page.locator('#kicker').fill('RACE DAY');
    await page.reload();
    await page.waitForFunction(() => window.__framer);
    assert.equal(
      await page.locator('[data-g="layout"][data-v="right"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await page.locator('#kicker').inputValue(), 'RACE DAY');

    assert.deepEqual(errors, []);
    console.log('Video Framer passed. Artifacts in ' + out);
  } finally {
    await browser?.close();
    http.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
