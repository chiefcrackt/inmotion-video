const assert = require('node:assert/strict'),
  path = require('node:path');
const {
  server,
  launchBrowser,
  artifactDirectory,
} = require('./browser-utils.cjs');
(async () => {
  const srv = server();
  await new Promise((r) => (srv.listening ? r() : srv.once('listening', r)));
  const browser = await launchBrowser(),
    base = 'http://127.0.0.1:' + srv.address().port,
    out = artifactDirectory('asset-motion');
  try {
    const page = await browser.newPage({
        acceptDownloads: true,
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    await page.goto(base + '/asset-studio/');
    await page.waitForFunction(() => window.__assetStudio?.ready());
    const frames = await page.evaluate(async () => {
      const { catalog } = await import('/asset-studio/catalog.mjs'),
        { newLayer, initial } = await import('/asset-studio/model.mjs'),
        { prepare, render } = await import('/asset-studio/render.mjs');
      const sample = (c) => {
        const off = document.createElement('canvas');
        off.width = off.height = 128;
        off.getContext('2d').drawImage(c, 0, 0, 128, 128);
        const d = off.getContext('2d').getImageData(0, 0, 128, 128).data;
        let hash = 2166136261,
          count = 0;
        for (let i = 0; i < d.length; i++) {
          hash = Math.imul(hash ^ d[i], 16777619) >>> 0;
          if (i % 4 === 3 && d[i]) count++;
        }
        return { hash, count };
      };
      const results = [];
      for (const a of catalog.filter(a=>!a.id.startsWith('toy:'))) {
        const state = {
          ...initial(),
          layers: [
            {
              ...newLayer('asset', a.id),
              motion: 'draw',
              size: 70,
              delay: 0.2,
              entrance: 1.2,
            },
          ],
        };
        await prepare(state);
        const c = document.createElement('canvas');
        render(c, state, 0.1);
        const start = sample(c);
        render(c, state, 0.55);
        const mid = sample(c);
        render(c, state, 0.55);
        const repeat = sample(c);
        render(c, state, 1.6);
        const end = sample(c);
        render(c, state, 0, { still: true });
        const still = sample(c);
        results.push({ id: a.id, start, mid, repeat, end, still });
      }
      for (const [asset, motion] of [
        ['motion:route-trail', 'trace'],
        ['motion:route-pin', 'drop'],
        ['motion:confetti', 'burst'],
        ['motion:finish-tape', 'break'],
        ['spotlight:feature-left', 'build'],
      ]) {
        const state = {
          ...initial(),
          layers: [
            {
              ...newLayer('asset', asset),
              motion,
              delay: 0,
              entrance: 1.2,
              size: 60,
            },
          ],
        };
        await prepare(state);
        const c = document.createElement('canvas');
        render(c, state, 0);
        const start = sample(c);
        render(c, state, 0.6);
        const mid = sample(c);
        render(c, state, 1.5);
        const end = sample(c);
        render(c, state, 0, { still: true });
        results.push({
          id: asset + '/' + motion,
          start,
          mid,
          end,
          still: sample(c),
          special: true,
        });
      }
      return results;
    });
    for (const f of frames) {
      assert.equal(f.start.count, 0, f.id + ' starts empty');
      assert(f.mid.count > 0, f.id + ' visibly draws');
      assert.notEqual(
        f.mid.hash,
        f.still.hash,
        f.id + ' is partial, not a static shift',
      );
      if (f.repeat)
        assert.equal(
          f.mid.hash,
          f.repeat.hash,
          f.id + ' seek is deterministic',
        );
      if (f.id.endsWith('/break'))
        assert.notEqual(f.end.hash, f.still.hash, 'tape stays broken');
      else
        assert.equal(
          f.end.hash,
          f.still.hash,
          f.id + ' settles to the complete artwork',
        );
    }
    await page.goto(base + '/asset-studio/?template=spotlight:why-use');
    await page.waitForFunction(
      () =>
        window.__assetStudio?.ready() &&
        window.__assetStudio.get().layers.length === 3,
    );
    await page.locator('#sequence').click();
    let state = await page.evaluate(() => window.__assetStudio.get());
    assert.equal(state.layers[0].motion, 'build');
    assert(
      state.layers.slice(1).every((l) => l.motion === 'type' && l.delay > 0),
    );
    await page.locator('#play').click();
    await page.locator('#scrub').evaluate((el) => {
      el.value = '0';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(
      await page
        .locator('#canvas')
        .evaluate(
          (c) =>
            c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1)
              .data[3],
        ),
      0,
      'scrubbing zero shows the real empty first frame',
    );
    await page.locator('#scrub').evaluate((el) => {
      el.value = '1';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#duration').selectOption('2');
    state = await page.evaluate(() => window.__assetStudio.get());
    assert(state.layers.every((l) => l.delay + l.entrance <= 2.00001));
    await page.reload();
    await page.waitForFunction(() => window.__assetStudio?.ready());
    assert.deepEqual(
      await page.evaluate(() => window.__assetStudio.get()),
      state,
      'motion and timing survive reload',
    );
    await page.locator('#layers').selectOption(state.layers[0].id);
    await page.locator('#suggest').click();
    await page.locator('#play').click();
    await page.locator('#browse').evaluate((el) => (el.open = false));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(out, 'draw-controls.png'),
      fullPage: true,
    });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        width + ' no overflow',
      );
    }
    await page.goto(base + '/asset-studio/?asset=motion:route-trail');
    await page.waitForFunction(
      () =>
        window.__assetStudio?.ready() &&
        window.__assetStudio.get().layers.at(-1)?.asset ===
          'motion:route-trail',
    );
    await page.locator('#clear').click();
    await page.locator('#search').fill('route trail');
    await page
      .getByRole('button', { name: 'Add Route trail', exact: true })
      .click();
    await page.waitForFunction(() => window.__assetStudio.ready());
    await page.locator('#motion').selectOption('trace');
    for (const [id, value] of [
      ['delay', 0.2],
      ['entrance', 1],
    ])
      await page.locator('#' + id).evaluate((el, v) => {
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
    await page.locator('#mode').selectOption('green');
    await page.locator('#export').click();
    await page.locator('#result').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(
      () => document.querySelector('#videoPreview').readyState >= 2,
    );
    const counts = await page.locator('#videoPreview').evaluate(async (v) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      async function frame(t) {
        await new Promise((r) => {
          v.onseeked = r;
          v.currentTime = t;
        });
        x.clearRect(0, 0, 128, 128);
        x.drawImage(v, 0, 0, 128, 128);
        const d = x.getImageData(0, 0, 128, 128).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4)
          if (!(d[i] < 35 && d[i + 1] > 220 && d[i + 2] < 35)) n++;
        return n;
      }
      return [await frame(0.05), await frame(1.7)];
    });
    assert(
      counts[1] > counts[0] + 100,
      'actual encoded video reveals more artwork over time',
    );
    await page.locator('#mode').selectOption('transparent');
    await page.locator('#export').click();
    await page
      .locator('#result')
      .waitFor({ state: 'visible', timeout: 180000 });
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#saveVideo').click(),
    ]);
    const chunks = [];
    for await (const c of await dl.createReadStream()) chunks.push(c);
    assert(
      Buffer.concat(chunks).includes(Buffer.from([0x53, 0xc0, 0x81, 0x01])),
      'transparent WebM carries alpha mode',
    );
    await dl.saveAs(path.join(out, 'route-draw.webm'));
    assert.deepEqual(errors, []);
    console.log(
      'Native asset motion passed: 66 real path reveals, deterministic seeking, specialized choreography, timing persistence, sequence/type-on, responsive UI and actual green/alpha video exports.',
    );
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
