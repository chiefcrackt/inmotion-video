const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge' }),
    page = await browser.newPage();
  await page.goto('http://127.0.0.1:4173/river-run/');
  const result = await page.evaluate(async () => {
    const html = await (await fetch('index.html')).text(),
      sources = JSON.parse(html.match(/var IMGSRC=(.*);/)[1]);
    const load = async (src) => {
      const im = new Image();
      im.src = src;
      await im.decode();
      return im;
    };
    const original = {};
    for (const [n, s] of Object.entries(sources)) original[n] = await load(s);
    const pixels = (im) => {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth || im.width;
      c.height = im.naturalHeight || im.height;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      return x.getImageData(0, 0, c.width, c.height).data;
    };
    const parts = JSON.parse(html.match(/var PARTS=(.*);/)[1]);
    const makePuppet = new Function(
      html.slice(
        html.indexOf('function makePuppet('),
        html.indexOf('// ---------- settings'),
      ) + ';return makePuppet',
    )();
    const result = {};
    for (const id of ['race', 'trail', 'winter']) {
      const art = {};
      for (const n of Object.keys(original))
        art[n] = await load(
          'artwork/' +
            id +
            '/' +
            n +
            ((id === 'race' && n === 'shorts') ||
            (id === 'trail' && (n === 'shorts' || n === 'torso'))
              ? '-v2'
              : '') +
            '.png',
        );
      const fit = fitRiverOutfit(art, original, id);
      let maxAlphaError = 0;
      if (id !== 'winter') {
        const hip = pixels(fit.shorts);
        let skinPixels = 0;
        for (let p = 0; p < hip.length; p += 4)
          if (
            hip[p + 3] > 180 &&
            hip[p] > 120 &&
            hip[p] > hip[p + 1] * 1.17 &&
            hip[p + 1] > hip[p + 2] * 1.12
          )
            skinPixels++;
        if (skinPixels)
          throw Error(
            id + ' hip still contains ' + skinPixels + ' skin pixels',
          );
      }
      if (id === 'trail') {
        // This was the baked-in sleeve/upper arm in the torso, behind the rigged arm.
        const torso = pixels(fit.torso),
          w = fit.torso.width;
        let warmPixels = 0;
        for (let y = 30; y < 75; y++)
          for (let x = 20; x < 50; x++) {
            let p = (y * w + x) * 4;
            if (
              torso[p + 3] > 180 &&
              torso[p] > 110 &&
              torso[p] > torso[p + 1] * 1.3
            )
              warmPixels++;
          }
        if (warmPixels)
          throw Error('Trail torso still contains baked-in arm colors');
      }
      for (const n of Object.keys(original)) {
        if (id === 'race' && n === 'shorts') continue;
        const a = pixels(original[n]),
          b = pixels(fit[n]);
        for (let p = 3; p < a.length; p += 4)
          maxAlphaError = Math.max(maxAlphaError, Math.abs(a[p] - b[p]));
      }
      const baseline = makePuppet(original, parts, { imgScale: 0.5 }),
        puppet = makePuppet(fit, parts, { imgScale: 0.5 });
      const a = document.createElement('canvas'),
        b = document.createElement('canvas');
      a.width = b.width = 480;
      a.height = b.height = 660;
      let movingAlphaError = 0;
      for (let frame = 0; frame < 51; frame++) {
        const phase = (frame % 48) / 48,
          pose =
            frame < 48
              ? { tuck: 0, crouch: 0, lift: 0, w: 0, pump: 0 }
              : frame === 48
                ? { tuck: 0, crouch: 1, lift: 0, w: 1, pump: 0 }
                : frame === 49
                  ? { tuck: 1, crouch: 0, lift: 250, w: 1, pump: 0 }
                  : { tuck: 0, crouch: 0.5, lift: 0, w: 1, pump: 1 };
        for (const [runner, canvas] of [
          [baseline, a],
          [puppet, b],
        ]) {
          Object.assign(runner.jump, pose);
          const x = canvas.getContext('2d');
          x.clearRect(0, 0, 480, 660);
          runner.draw(x, phase, 220, 630, 0.45);
        }
        const ap = pixels(a),
          bp = pixels(b);
        for (let p = 3; p < ap.length; p += 4)
          movingAlphaError = Math.max(
            movingAlphaError,
            Math.abs(ap[p] - bp[p]),
          );
      }
      result[id] = {
        maxAlphaError,
        movingAlphaError,
        pelvisTrimmed: id === 'race',
        originalHead: fit.head === original.head,
        originalForearms:
          id === 'winter' ||
          (fit.forearm === original.forearm &&
            fit.forearm_far === original.forearm_far),
      };
    }
    return result;
  });
  for (const r of Object.values(result)) {
    assert.equal(r.maxAlphaError, 0);
    if (!r.pelvisTrimmed) assert(r.movingAlphaError <= 1);
    assert(r.originalHead);
    assert(r.originalForearms);
  }
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
