const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({
      viewport: { width: 1200, height: 900 },
    }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/river-run/');
  await page.waitForFunction(
    () => window.RiverRun && document.querySelector('#readout').textContent,
  );
  await page.selectOption('#outfit', 'race');
  await page.waitForFunction(
    () =>
      RiverRun.settings.outfit === 'race' &&
      !document.querySelector('#rec').disabled,
  );
  await page.reload();
  await page.waitForFunction(
    () =>
      window.RiverRun &&
      RiverRun.settings.outfit === 'race' &&
      !document.querySelector('#rec').disabled &&
      document.querySelector('#msg').textContent === '',
  );
  const frames = [];
  for (const outfit of ['original', 'race', 'trail', 'winter']) {
    await page.selectOption('#outfit', outfit);
    await page.waitForFunction(
      (id) =>
        RiverRun.settings.outfit === id &&
        !document.querySelector('#rec').disabled,
      outfit,
    );
    if (outfit === 'race' || outfit === 'trail') {
      const cleanup = await page.evaluate(async (id) => {
        const html = await (await fetch('index.html')).text(),
          sources = JSON.parse(html.match(/var IMGSRC=(.*);/)[1]);
        const load = async (src) => {
          const im = new Image();
          im.src = src;
          await im.decode();
          return im;
        };
        const original = {},
          art = {};
        for (const [n, src] of Object.entries(sources)) {
          original[n] = await load(src);
          const revised = n === 'shorts' || (id === 'trail' && n === 'torso');
          art[n] = await load(
            'artwork/' + id + '/' + n + (revised ? '-v2' : '') + '.png',
          );
        }
        const fitted = fitRiverOutfit(art, original, id),
          hip = fitted.shorts
            .getContext('2d')
            .getImageData(0, 0, fitted.shorts.width, fitted.shorts.height).data;
        let skinPixels = 0,
          armPixels = 0;
        for (let p = 0; p < hip.length; p += 4)
          if (
            hip[p + 3] > 180 &&
            hip[p] > 120 &&
            hip[p] > hip[p + 1] * 1.17 &&
            hip[p + 1] > hip[p + 2] * 1.12
          )
            skinPixels++;
        if (id === 'trail') {
          const c = fitted.torso,
            d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          for (let y = 30; y < 75; y++)
            for (let x = 20; x < 50; x++) {
              const p = (y * c.width + x) * 4;
              if (d[p + 3] > 180 && d[p] > 110 && d[p] > d[p + 1] * 1.3)
                armPixels++;
            }
          const sleeve = fitted.upperarm,
            s = sleeve
              .getContext('2d')
              .getImageData(0, 0, sleeve.width, sleeve.height).data;
          for (let p = 0; p < s.length; p += 4)
            if (
              s[p + 3] > 180 &&
              s[p] > 160 &&
              s[p + 1] > 100 &&
              s[p] > s[p + 1] * 1.05 &&
              s[p] < s[p + 1] * 1.5 &&
              s[p + 2] < s[p + 1] * 0.65
            )
              armPixels++;
        }
        if (id === 'race') {
          const c = fitted.shorts,
            d = c
              .getContext('2d')
              .getImageData(
                0,
                Math.ceil(c.height * 0.7),
                c.width,
                c.height - Math.ceil(c.height * 0.7),
              ).data;
          for (let p = 3; p < d.length; p += 4)
            if (d[p]) throw Error('Race hip still has a stationary lower leg');
        }
        return { skinPixels, armPixels };
      }, outfit);
      assert.deepEqual(
        cleanup,
        { skinPixels: 0, armPixels: 0 },
        outfit + ' clothing cleanup',
      );
    }
    for (const time of [
      0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 4.85, 5.15, 5.5,
    ]) {
      const data = await page.evaluate((t) => {
        RiverRun.paint(t);
        const c = document.createElement('canvas');
        c.width = 360;
        c.height = 460;
        c.getContext('2d').drawImage(
          document.querySelector('#cv'),
          640,
          500,
          550,
          550,
          0,
          0,
          360,
          360,
        );
        return c.toDataURL();
      }, time);
      frames.push({ outfit, time, data });
      if ((outfit === 'race' || outfit === 'trail') && time === 0.375) {
        const detail = await page.evaluate(() => {
          const c = document.createElement('canvas');
          c.width = 720;
          c.height = 700;
          c.getContext('2d').drawImage(
            document.querySelector('#cv'),
            760,
            590,
            360,
            350,
            0,
            0,
            720,
            700,
          );
          return c.toDataURL();
        });
        fs.writeFileSync(
          'river-run/artwork/' + outfit + '-detail.png',
          Buffer.from(detail.split(',')[1], 'base64'),
        );
      }
    }
    for (const fmt of ['v', 'h'])
      for (const bg of ['green', 'scene']) {
        await page.click(`[data-g="fmt"][data-v="${fmt}"]`);
        await page.click(`[data-g="bg"][data-v="${bg}"]`);
        assert.equal(
          await page.locator('#cv').getAttribute('width'),
          fmt === 'v' ? '1080' : '1920',
        );
        await page.evaluate(() => RiverRun.paint(5.15));
      }
  }
  const image = await page.evaluate(async (frames) => {
    const c = document.createElement('canvas');
    c.width = 11 * 240;
    c.height = 4 * 300;
    const x = c.getContext('2d');
    x.fillStyle = '#f6f4ef';
    x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i],
        im = new Image();
      im.src = f.data;
      await im.decode();
      const dx = (i % 11) * 240,
        dy = Math.floor(i / 11) * 300;
      x.drawImage(im, dx, dy, 240, 307);
      x.fillStyle = '#111';
      x.font = '16px Arial';
      x.fillText(f.outfit + ' ' + f.time, dx + 6, dy + 290);
    }
    return c.toDataURL();
  }, frames);
  fs.writeFileSync(
    'river-run/artwork/outfit-preview.png',
    Buffer.from(image.split(',')[1], 'base64'),
  );
  // Record a real five-second clip with the selected outfit.
  await page.click('[data-g="len"][data-v="5"]');
  await page.click('#rec');
  await page.waitForFunction(
    () => !document.querySelector('#result').hidden,
    {},
    { timeout: 15000 },
  );
  assert(await page.locator('#vid').getAttribute('src'));
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    'Outfit loading, persistence, 44 poses, formats, backgrounds and recording passed.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
