// Video Framer: layout at phone and desktop widths, clean loop seam with every extra on, intro ending on the
// loop's first frame, clean windows (green / clear) for every style and layout, activity-file route import,
// PNG save, green-screen loop and intro recordings, transparent WebM and saved settings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  launchBrowser,
  server,
  artifactDirectory,
} = require('./browser-utils.cjs');

function gpx() {
  // a small synthetic out-and-back with some climbing (no real location)
  let pts = '';
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2,
      lat = 10 + Math.sin(a) * 0.01,
      lon = 20 + (1 - Math.cos(a)) * 0.012,
      ele = 200 + 60 * Math.sin(a * 2),
      time = new Date(Date.UTC(2026, 9, 31, 7, 0, i * 20)).toISOString();
    pts += `<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(1)}</ele><time>${time}</time></trkpt>`;
  }
  return `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Test</name><trkseg>${pts}</trkseg></trk></gpx>`;
}

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
    await page.waitForFunction(() => window.__framer && window.__framer.ready());
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

    // Pixel checks on an offscreen canvas through the page's own renderer. For each window, the
    // central area (away from rounded corners, in-window furniture and tilted edges) must be pure.
    const probe = (state, t, mode, intro) =>
      page.evaluate(
        ({ state, t, mode, intro }) => {
          const F = window.__framer;
          F.set(state);
          const c = document.createElement('canvas');
          c.width = 1920;
          c.height = 1080;
          const x = c.getContext('2d', { willReadFrequently: true });
          F.render(x, t, mode, intro);
          let off = 0;
          for (const w of F.geom().wins) {
            const mx = w.rot ? w.w * 0.2 : 30,
              my = w.rot ? w.h * 0.2 : 110;
            const d = x.getImageData(
              Math.ceil(w.x + mx),
              Math.ceil(w.y + my),
              Math.floor(w.w - 2 * mx),
              Math.floor(w.h - 2 * my),
            ).data;
            for (let i = 0; i < d.length; i += 4) {
              const ok =
                mode === 'green'
                  ? d[i] === 0 && d[i + 1] === 255 && d[i + 2] === 0
                  : d[i + 3] === 0;
              if (!ok) off++;
            }
          }
          return {
            url: c.toDataURL(),
            corner: [...x.getImageData(960, 2, 1, 1).data],
            edge: [...x.getImageData(4, 540, 1, 1).data],
            off,
          };
        },
        { state, t, mode, intro: intro === undefined ? null : intro },
      );

    // Loop seam with every moving extra switched on.
    const busy = {
      motion: 'animated',
      loop: '4',
      runner: true,
      ticker: true,
      badge: true,
      texture: 'grain',
      winStyle: 'viewfinder',
      showMeta: true,
      statIcons: true,
    };
    const a0 = await probe(busy, 0, 'green');
    const aL = await probe(busy, 4, 'green');
    const aHalf = await probe(busy, 2, 'green');
    assert.equal(a0.url, aL.url, 'frame 0 and frame L match: seamless loop');
    assert.notEqual(a0.url, aHalf.url, 'the frame animates mid-loop');
    for (const loop of ['6', '8', '10']) {
      const s = { ...busy, loop, texture: 'scan', winStyle: 'standard' };
      assert.equal(
        (await probe(s, 0, 'green')).url,
        (await probe(s, +loop, 'green')).url,
        `${loop}s loop is seamless`,
      );
    }
    // The intro's last frame is the loop's first frame.
    const i1 = await probe({ ...busy, loop: '8' }, 0, 'green', 1);
    const l0 = await probe({ ...busy, loop: '8' }, 0, 'green');
    assert.equal(i1.url, l0.url, 'intro ends exactly on loop frame 0');
    const i0 = await probe({ ...busy, loop: '8' }, 0, 'green', 0);
    assert.notEqual(i0.url, l0.url, 'intro starts somewhere else');
    assert.ok(i0.off > 0, 'window starts closed');

    // Clean windows in every style and layout, with extras on and the window cropped.
    const base = {
      runner: false,
      ticker: false,
      badge: false,
      texture: 'scan',
      glow: true,
      aSweep: true,
      bg: 'photo:night-track',
      cropTop: 6,
      cropBottom: 8,
      inset: 40,
    };
    const combos = [];
    for (const winStyle of ['standard', 'phone', 'polaroid', 'offset', 'viewfinder'])
      for (const layout of ['center', 'left', 'right', 'dual'])
        combos.push({ winStyle, layout, aspect: layout === 'dual' ? '45' : '916', pip: layout === 'right', pipCorner: 'tl' });
    combos.push({ endScreen: true, winStyle: 'standard', layout: 'center', aspect: '11' });
    for (const combo of combos) {
      const s = { ...base, endScreen: false, ...combo },
        name = `${s.endScreen ? 'endscreen' : s.layout}-${s.winStyle}`;
      for (const motion of ['animated', 'static']) {
        s.motion = motion;
        const g = await probe(s, 1.3, 'green');
        assert.equal(g.off, 0, `${name}/${motion}: windows are pure green`);
        const c = await probe(s, 1.3, 'clear');
        assert.equal(c.off, 0, `${name}/${motion}: windows are fully clear`);
        assert.equal(c.edge[3], 255, `${name}: frame is opaque`);
        if (motion === 'animated')
          fs.writeFileSync(
            path.join(out, `frame-${name}.png`),
            Buffer.from(g.url.split(',')[1], 'base64'),
          );
      }
    }

    // Reset to defaults, then exercise the real buttons.
    await page.locator('#reset').click();
    assert.match(await page.locator('#fit').innerHTML(), /no adjusting needed/);
    await page.locator('#pip').check();
    assert.match(await page.locator('#fit').innerHTML(), /Facecam/);
    await page.locator('#pip').uncheck();

    // description instead of stats
    await page.locator('[data-g="sideMode"][data-v="text"]').click();
    assert.equal(await page.locator('#statFields').isVisible(), false);
    await page.locator('#desc').fill('Easy miles and good company.');
    const withDesc = await probe({}, 1, 'green');
    const withStats = await probe({ sideMode: 'stats' }, 1, 'green');
    assert.notEqual(withDesc.url, withStats.url, 'description replaces stats');
    assert.equal(withDesc.off, 0);
    await page.locator('[data-g="sideMode"][data-v="stats"]').click();

    // activity file → route line, elevation and stats
    const gpxPath = path.join(os.tmpdir(), 'framer-test.gpx');
    fs.writeFileSync(gpxPath, gpx());
    await page.locator('#actFile').setInputFiles(gpxPath);
    await page.locator('#routeBox').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-g="route"][data-v="both"]').click();
    await page.locator('#useStats').click();
    assert.match(await page.locator('#s1v').inputValue(), /MI$/);
    const withRoute = await probe({ route: 'both' }, 1, 'green');
    const noRoute = await probe({ route: 'off' }, 1, 'green');
    assert.notEqual(withRoute.url, noRoute.url, 'route draws');
    assert.equal(withRoute.off, 0);
    fs.writeFileSync(
      path.join(out, 'route.png'),
      Buffer.from(withRoute.url.split(',')[1], 'base64'),
    );
    await page.locator('#units [data-v="km"], [data-g="units"][data-v="km"]').first().click();
    assert.match(await page.evaluate(() => window.__framer.state().s1v), /MI$/, 'typed value kept; shown converted');

    await page.locator('#reset').click();
    await page.locator('[data-g="hole"][data-v="clear"]').click();
    let dl = page.waitForEvent('download');
    await page.locator('#png').click();
    const png = await dl;
    assert.match(png.suggestedFilename(), /transparent\.png$/);
    await png.saveAs(path.join(out, png.suggestedFilename()));

    // green-screen loop recording, one 4s loop
    await page.locator('[data-g="hole"][data-v="green"]').click();
    await page.locator('[data-g="loop"][data-v="4"]').click();
    await page.locator('[data-g="length"][data-v="1"]').click();
    await page.locator('#runner').check();
    await page.locator('#rec').click();
    await page.locator('#result').waitFor({ state: 'visible', timeout: 20000 });
    dl = page.waitForEvent('download');
    await page.locator('#save').click();
    const vid = await dl;
    const vidPath = path.join(out, vid.suggestedFilename());
    await vid.saveAs(vidPath);
    assert.ok(fs.statSync(vidPath).size > 20000, 'recording has content');
    await page.locator('#close').click();

    // green-screen intro with sound
    await page.locator('[data-g="introLen"][data-v="1.5"]').click();
    await page.locator('#recIntro').click();
    await page.locator('#result').waitFor({ state: 'visible', timeout: 20000 });
    assert.match(await page.locator('#savenote').textContent(), /-intro-greenscreen\./);
    dl = page.waitForEvent('download');
    await page.locator('#save').click();
    const intro = await dl;
    const introPath = path.join(out, intro.suggestedFilename());
    await intro.saveAs(introPath);
    assert.ok(fs.statSync(introPath).size > 10000, 'intro has content');
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
    assert.equal(await page.locator('#runner').isChecked(), true);

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
