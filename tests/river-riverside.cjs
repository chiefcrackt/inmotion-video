const assert = require('node:assert/strict');
const fs = require('node:fs');
const { launchBrowser, server } = require('./browser-utils.cjs');

(async () => {
  const srv = server();
  await new Promise((resolve) =>
    srv.listening ? resolve() : srv.once('listening', resolve),
  );
  const browser = await launchBrowser();
  try {
    const base = 'http://127.0.0.1:' + srv.address().port;
    const page = await browser.newPage({
      viewport: { width: 1300, height: 950 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Read the existing puppet's actual stride speed in this test only.
    const source = fs.readFileSync('river-run/index.html', 'utf8');
    await page.route(base + '/river-run/', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: source.replace(
          'window.RiverRun = {',
          'window.riversideTest = () => ({g:geom(),speed:PP.groundSpeed*geom().scale/cycle()}); window.RiverRun = {',
        ),
      }),
    );
    await page.goto(base + '/river-run/');
    await page.waitForFunction(
      () => window.RiverRun && !document.querySelector('#rec').disabled,
    );
    assert.equal(await page.evaluate(() => RiverRun.settings.bg), 'scene');
    for (const id of ['scene', 'navy', 'green', 'artwork', 'riverside'])
      assert.equal(
        await page.locator('[data-g=bg][data-v=' + id + ']').count(),
        1,
      );
    await page.click('[data-g=bg][data-v=riverside]');
    await page.waitForFunction(
      () =>
        RiverRiverside.ready &&
        RiverRun.settings.bg === 'riverside' &&
        !document.querySelector('#rec').disabled,
    );
    fs.mkdirSync('output', { recursive: true });
    const shots = [];
    for (const theme of ['tim', 'minimal', 'broadcast']) {
      await page.evaluate((theme) => {
        const select = document.querySelector('#tim-output-theme');
        select.value = theme;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, theme);
      for (const format of ['h', 'v']) {
        await page.click('[data-g=fmt][data-v=' + format + ']');
        const shot = await page.evaluate(() => {
          RiverRun.paint(0.6);
          const c = document.querySelector('#cv');
          return { src: c.toDataURL(), width: c.width, height: c.height };
        });
        assert.equal(shot.width, format === 'h' ? 1920 : 1080);
        assert.equal(shot.height, format === 'h' ? 1080 : 1920);
        shots.push({
          label: theme + ' · ' + (format === 'h' ? '16:9' : '9:16'),
          src: shot.src,
        });
      }
    }
    // The ground's actual pixels must travel the same distance as the existing stride.
    for (const pace of ['easy', 'jog', 'tempo']) {
      await page.click('[data-g=pace][data-v=' + pace + ']');
      const result = await page.evaluate(() => {
        const { g, speed } = riversideTest();
        const render = (t) => {
          const c = document.createElement('canvas');
          c.width = g.W;
          c.height = g.H;
          RiverRiverside.drawBack(c.getContext('2d'), g, t, speed, 'tim');
          return c;
        };
        const a = render(0),
          b = render(8 / speed),
          y = g.H - 80;
        const original = a.getContext('2d').getImageData(150, y, 256, 10).data;
        const shifted = a.getContext('2d').getImageData(158, y, 256, 10).data;
        const actual = b.getContext('2d').getImageData(150, y, 256, 10).data;
        let error = 0,
          movement = 0;
        for (let i = 0; i < actual.length; i++) {
          error += Math.abs(actual[i] - shifted[i]);
          movement += Math.abs(actual[i] - original[i]);
        }
        const motion = RiverRiverside.motion(g, 1, speed);
        // Crossing the repeat boundary must not create a jump or a transparent column.
        const time = motion.groundTile / speed;
        const before = render(time - 0.001),
          after = render(time + 0.001);
        const x = 180,
          left = before.getContext('2d').getImageData(x, y, 128, 10).data,
          right = after.getContext('2d').getImageData(x, y, 128, 10).data;
        let seamError = 0;
        for (let i = 0; i < left.length; i++)
          seamError += Math.abs(left[i] - right[i]);
        return {
          error: error / actual.length,
          movement: movement / actual.length,
          seamError: seamError / left.length,
          motion,
        };
      });
      assert.ok(
        result.error < 2,
        pace + ' ground displacement error: ' + result.error,
      );
      assert.ok(result.movement > 1, 'Ground must visibly move');
      assert.ok(
        result.seamError < 12,
        'The ground should continue smoothly through a repeat',
      );
      assert.ok(
        result.motion.hills < result.motion.riverbank &&
          result.motion.riverbank < result.motion.ground &&
          result.motion.foreground > result.motion.ground,
      );
    }
    const deterministic = await page.evaluate(() => {
      RiverRun.paint(1.4);
      const a = document.querySelector('#cv').toDataURL();
      RiverRun.paint(0);
      RiverRun.paint(1.4);
      return a === document.querySelector('#cv').toDataURL();
    });
    assert.equal(deterministic, true);
    // Backdrops and foreground must keep scrolling during jumps too.
    const jumpFrames = await page.evaluate(() => {
      const frames = [];
      for (const t of [4.55, 4.8, 5.1]) {
        RiverRun.paint(t);
        frames.push(document.querySelector('#cv').toDataURL());
      }
      return new Set(frames).size;
    });
    assert.equal(jumpFrames, 3);
    await page.reload();
    await page.waitForFunction(
      () =>
        window.RiverRun &&
        RiverRiverside.ready &&
        !document.querySelector('#rec').disabled,
    );
    assert.equal(await page.evaluate(() => RiverRun.settings.bg), 'riverside');
    for (const outfit of ['original', 'race', 'trail', 'winter']) {
      await page.selectOption('#outfit', outfit);
      await page.waitForFunction(
        (id) =>
          RiverRun.settings.outfit === id &&
          !document.querySelector('#rec').disabled,
        outfit,
      );
    }
    await page.selectOption('#outfit', 'original');
    await page.waitForFunction(
      () =>
        RiverRun.settings.outfit === 'original' &&
        !document.querySelector('#rec').disabled,
    );
    await page.click('[data-g=pace][data-v=jog]');
    await page.click('[data-g=fmt][data-v=h]');
    await page.evaluate(() => {
      const s = document.querySelector('#tim-output-theme');
      s.value = 'tim';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click('[data-g=len][data-v="5"]');
    await page.locator('button.snd').filter({ hasText: 'Silent clip' }).click();
    await page.click('#rec');
    assert.equal(
      await page.locator('[data-g=bg][data-v=riverside]').isDisabled(),
      true,
    );
    await page.waitForFunction(
      () =>
        !document.querySelector('#result').hidden &&
        document.querySelector('#vid').readyState >= 2,
      null,
      { timeout: 20000 },
    );
    const recorded = await page.evaluate(async () => {
      const video = document.querySelector('#vid');
      async function frame(time) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(Error('Video seek failed')),
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
          video.currentTime = time;
        });
        const c = document.createElement('canvas');
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        c.getContext('2d').drawImage(video, 0, 0);
        return c.getContext('2d').getImageData(40, c.height - 80, 100, 10).data;
      }
      const a = await frame(0.6),
        b = await frame(1.6);
      let delta = 0;
      for (let i = 0; i < a.length; i++) delta += Math.abs(a[i] - b[i]);
      const response = await fetch(video.src),
        blob = await response.blob();
      return {
        width: video.videoWidth,
        height: video.videoHeight,
        movement: delta / a.length,
        bytes: blob.size,
        base64: await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blob);
        }),
        type: blob.type,
      };
    });
    assert.equal(recorded.width, 1920);
    assert.equal(recorded.height, 1080);
    assert.ok(recorded.movement > 1);
    assert.ok(recorded.bytes > 10000);
    fs.writeFileSync(
      'output/moving-riverside-preview.' +
        (recorded.type.includes('mp4') ? 'mp4' : 'webm'),
      Buffer.from(recorded.base64, 'base64'),
    );
    await page.click('[data-g=bg][data-v=green]');
    assert.deepEqual(
      await page.evaluate(() => {
        RiverRun.paint(0.6);
        return Array.from(
          document
            .querySelector('#cv')
            .getContext('2d')
            .getImageData(0, 0, 1, 1).data,
        );
      }),
      [0, 255, 0, 255],
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    const review = await browser.newPage({
      viewport: { width: 1500, height: 1250 },
    });
    await review.setContent(
      '<html style="font-family:Arial;background:#f6f4ef;color:#172332"><body><h2>Moving riverside · layered scene</h2><main style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">' +
        shots
          .map(
            (s) =>
              '<div><p>' +
              s.label +
              '</p><img style="width:100%;height:500px;object-fit:contain" src="' +
              s.src +
              '"></div>',
          )
          .join('') +
        '</main></body></html>',
    );
    await review.screenshot({
      path: 'output/moving-riverside-themes.jpg',
      fullPage: true,
    });
    console.log(
      'PASS: stride-matched ground pixels at three paces, smooth repeats, deterministic jumps, six theme/format views, four outfits, reload, green screen, mobile and moving ground in recorded video.',
    );
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
