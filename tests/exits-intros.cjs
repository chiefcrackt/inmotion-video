// Shared exits in Text Motion and Title Maker, and Activity Studio's route draw styles and intro.
// Checks: every new exit ends on an empty frame, green screen stays pure green at the end, fade
// becomes a wipe on green, the intro's last frame is the finished card, draw styles only change
// frames while the route is drawing, and an intro video records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  launchBrowser,
  server,
  artifactDirectory,
} = require('./browser-utils.cjs');

const STYLES = ['reverse', 'fade', 'wipe', 'slide', 'drop', 'shrink', 'pop', 'glitch', 'cut'];

function gpx() {
  let pts = '';
  for (let i = 0; i <= 200; i++) {
    const a = (i / 200) * Math.PI * 2,
      time = new Date(Date.UTC(2026, 9, 31, 7, 0, i * 15)).toISOString();
    pts += `<trkpt lat="${(10 + Math.sin(a) * 0.02).toFixed(6)}" lon="${(20 + (1 - Math.cos(a)) * 0.025).toFixed(6)}"><ele>${(200 + 80 * Math.sin(a * 2)).toFixed(1)}</ele><time>${time}</time></trkpt>`;
  }
  return `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Loop</name><trkseg>${pts}</trkseg></trk></gpx>`;
}

(async () => {
  const out = artifactDirectory('exits-intros');
  const http = server(0);
  await new Promise((r) => http.on('listening', r));
  const base = `http://127.0.0.1:${http.address().port}`;
  let browser;
  try {
    browser = await launchBrowser();
    const errors = [];
    const open = async (url, viewport = { width: 1300, height: 900 }) => {
      const page = await browser.newPage({ viewport });
      page.on('pageerror', (e) => errors.push(url + ': ' + e.message));
      await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
      await page.goto(base + url);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.evaluate(() => document.fonts.ready);
      return page;
    };

    // ---------- Text Motion
    const tm = await open('/text-motion/');
    if ((await tm.locator('#play').textContent()) === 'Pause') await tm.locator('#play').click();
    const setTm = (o) =>
      tm.evaluate((o) => {
        for (const [k, v] of Object.entries(o)) document.getElementById(k).value = v;
        document.getElementById('controls').dispatchEvent(new Event('input'));
      }, o);
    const inkPixels = () =>
      tm.locator('canvas').evaluate((c) => {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4)
          if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 6) n++;
        return n;
      });
    await tm.locator('#scrub').fill('300');
    assert.ok((await inkPixels()) > 1000, 'text visible mid-clip');
    for (const style of STYLES) {
      await setTm({ exStyle: style });
      await tm.locator('#scrub').fill('1000');
      assert.equal(await inkPixels(), 0, `Text Motion ${style}: empty last frame`);
      await tm.locator('#scrub').fill('300');
      assert.ok((await inkPixels()) > 1000, `Text Motion ${style}: text before the exit`);
    }
    // stagger: lines leave one after another
    await setTm({ exStyle: 'slide', exStagger: '0.25', exLen: '0.3', exOrder: 'first' });
    await tm.locator('#scrub').fill('880');
    fs.writeFileSync(
      path.join(out, 'text-motion-stagger.png'),
      Buffer.from((await tm.locator('canvas').evaluate((c) => c.toDataURL())).split(',')[1], 'base64'),
    );
    assert.equal(await tm.locator('#exRow1').isVisible(), true);
    await setTm({ exStyle: 'original' });
    assert.equal(await tm.locator('#exRow1').isVisible(), false);
    await tm.close();

    // ---------- Title Maker
    const tt = await open('/title-maker/');
    await tt.waitForFunction(() => window.__titleMaker);
    const frame = (s, at) =>
      tt.evaluate(
        ([s, at]) => {
          const T = window.__titleMaker;
          T.set(s);
          const D = T.dur();
          T.paint(at === 'end' ? D - 0.01 : D - 0.1 - 0.6 * (1 - at), false);
          const c = document.getElementById('cv'),
            d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let notGreen = 0;
          for (let i = 0; i < d.length; i += 4) if (!(d[i] === 0 && d[i + 1] === 255 && d[i + 2] === 0)) notGreen++;
          return { url: c.toDataURL(), notGreen };
        },
        [s, at],
      );
    for (const mode of ['lower', 'tag', 'chapter'])
      for (const style of STYLES) {
        const s = { mode, bg: 'green', exStyle: style, exLen: '0.6', exHold: '0.1' };
        assert.equal((await frame(s, 'end')).notGreen, 0, `Title Maker ${mode}/${style}: last frame is pure green`);
        assert.ok((await frame(s, 0.2)).notGreen > 0, `Title Maker ${mode}/${style}: card visible as the exit starts`);
      }
    // fade on green turns into a wipe; on navy it stays a fade
    const fadeG = await frame({ mode: 'lower', bg: 'green', exStyle: 'fade' }, 0.5),
      wipeG = await frame({ mode: 'lower', bg: 'green', exStyle: 'wipe' }, 0.5);
    assert.equal(fadeG.url, wipeG.url, 'fade becomes a wipe on green');
    const fadeN = await frame({ mode: 'lower', bg: 'navy', exStyle: 'fade' }, 0.5),
      wipeN = await frame({ mode: 'lower', bg: 'navy', exStyle: 'wipe' }, 0.5);
    assert.notEqual(fadeN.url, wipeN.url, 'fade stays a fade on navy');
    // the full-screen title card leaves over navy
    const titleSlide = await frame({ mode: 'title', exStyle: 'slide', exDir: 'left' }, 0.6);
    fs.writeFileSync(path.join(out, 'title-slide.png'), Buffer.from(titleSlide.url.split(',')[1], 'base64'));
    await tt.locator('[data-g="exStyle"][data-v="drop"]').click();
    assert.equal(await tt.locator('#exDirRow').isVisible(), true);
    await tt.locator('[data-g="exStyle"][data-v="original"]').click();
    assert.equal(await tt.locator('#exOpts').isVisible(), false);
    await tt.close();

    // ---------- Activity Studio
    const as = await open('/activity-studio/');
    const file = path.join(os.tmpdir(), 'tim-exits-test.gpx');
    fs.writeFileSync(file, gpx());
    await as.locator('#file').setInputFiles(file);
    await as.waitForFunction(() => window.__activityStudio && window.__activityStudio.loaded(), null, { timeout: 20000 });
    const R = (o, p, animated, intro) =>
      as.evaluate(
        ([o, p, animated, intro]) => {
          const A = window.__activityStudio;
          Object.assign(A.settings, o);
          const c = document.createElement('canvas');
          c.width = 1920;
          c.height = 1080;
          A.render(c, p, animated, intro);
          return c.toDataURL();
        },
        [o, p, animated, intro],
      );
    for (const template of ['summary', 'route', 'dashboard', 'elevation'])
      for (const introPlace of ['center', 'inplace'])
        for (const introCard of ['wipe', 'rise', 'cut']) {
          const o = { template, introPlace, introCard, drawStyle: 'glow' };
          assert.equal(await R(o, 1, false, 1), await R(o, 1, false, null), `${template}/${introPlace}/${introCard}: intro ends on the finished card`);
          assert.notEqual(await R(o, 1, false, 0.4), await R(o, 1, false, null), `${template}: intro differs mid-way`);
        }
    const plainMid = await R({ template: 'summary', drawStyle: 'line', zoom: 0 }, 0.5, true, null),
      plainEnd = await R({ drawStyle: 'line' }, 1, false, null);
    for (const drawStyle of ['glow', 'comet', 'ghost', 'runner']) {
      const mid = await R({ drawStyle, zoom: 0 }, 0.5, true, null);
      assert.notEqual(mid, plainMid, `${drawStyle} changes the reveal`);
      assert.equal(await R({ drawStyle }, 1, false, null), plainEnd, `${drawStyle} leaves the finished card unchanged`);
      fs.writeFileSync(path.join(out, `activity-${drawStyle}.png`), Buffer.from(mid.split(',')[1], 'base64'));
    }
    assert.notEqual(await R({ drawStyle: 'line', zoom: 1.5 }, 0.5, true, null), plainMid, 'zoom-follow changes the reveal');
    // record a short intro video through the real buttons
    await as.evaluate(() => Object.assign(window.__activityStudio.settings, { drawStyle: 'glow', zoom: 0 }));
    await as.locator('#intro').check();
    await as.selectOption('#introLen', '1.5');
    await as.selectOption('#introHold', '1');
    assert.match(await as.locator('#playNote').textContent(), /2\.5s total/);
    await as.locator('#video').click();
    await as.locator('#saveVideo').waitFor({ state: 'visible', timeout: 30000 });
    assert.match(await as.locator('#exportStatus').textContent(), /ready/);
    await as.close();

    assert.deepEqual(errors, []);
    console.log('Exits and intros passed. Artifacts in ' + out);
  } finally {
    await browser?.close();
    http.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
