const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path');
const { server, launchBrowser } = require('./browser-utils.cjs');
(async () => {
  const srv = server();
  await new Promise((r) => (srv.listening ? r() : srv.once('listening', r)));
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const base = 'http://127.0.0.1:' + srv.address().port;
    await page.goto(base + '/asset-studio/');
    await page.waitForFunction(() => window.__assetStudio?.ready());
    const results = await page.evaluate(async () => {
      const { toys } = await import('/weird-motion/artwork.mjs'),
        { templateScene } = await import('/product-spotlight/templates.mjs'),
        { validate, motionOptions } = await import('/asset-studio/model.mjs'),
        { prepare, render } = await import('/asset-studio/render.mjs');
      window.toyScenes = toys.map((a) => ({
        toy: a,
        scene: validate(templateScene('toy:' + a.id)),
      }));
      window.toyRender = render;
      const results = [];
      const sample = (c) => {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let hash = 0,
          count = 0;
        for (let i = 0; i < d.length; i++) {
          hash = (Math.imul(hash, 31) + d[i]) >>> 0;
          if (i % 4 === 3 && d[i]) count++;
        }
        return { hash, count };
      };
      for (const { toy, scene } of toyScenes) {
        await prepare(scene);
        const c = document.createElement('canvas');
        const variants = [];
        for (const mode of ['perform', 'remix']) {
          scene.layers[0].motion = mode;
          assertMode: if (
            !motionOptions(scene.layers[0]).some((a) => a.value === mode)
          )
            throw Error('Missing action');
          validate(scene);
          const frames = [];
          for (const t of [0, 0.7, 1.4, 2.8, 4, 6]) {
            render(c, scene, t);
            frames.push(sample(c));
          }
          render(c, scene, 1.4);
          const repeat = sample(c);
          variants.push({ frames, repeat });
        }
        scene.layers[0].motion = 'perform';
        scene.exit = 'glitch';
        render(c, scene, 6);
        const end = sample(c);
        render(c, scene, 6, { still: true });
        const still = sample(c);
        results.push({ id: toy.id, variants, end, still });
      }
      return results;
    });
    for (const r of results) {
      for (const v of r.variants) {
        assert.equal(v.frames[0].count, 0);
        assert(v.frames[1].count > 0);
        assert.notEqual(v.frames[1].hash, v.frames[2].hash);
        assert.deepEqual(v.frames[2], v.repeat);
        assert.equal(v.frames[5].count, 0);
      }
      assert.notEqual(
        r.variants[0].frames[2].hash,
        r.variants[1].frames[2].hash,
      );
      assert.equal(r.end.count, 0);
      assert(r.still.count > 0);
    }
    const out = path.resolve(__dirname, '../../weird-motion-frames');
    await fs.mkdir(out, { recursive: true });
    for (let i = 0; i < 120; i++) {
      const data = await page.evaluate((t) => {
        const out = document.createElement('canvas');
        out.width = 1200;
        out.height = 1090;
        const x = out.getContext('2d');
        x.fillStyle = '#0e1a2e';
        x.fillRect(0, 0, 1200, 760);
        x.fillStyle = '#e8c96a';
        x.font = 'bold 40px Arial';
        x.fillText('T.im / WEIRD MOTION', 28, 54);
        toyScenes.forEach(({ toy, scene }, index) => {
          scene.exit = 'glitch';
          scene.layers[0].motion = 'perform';
          const c = document.createElement('canvas');
          toyRender(c, scene, t);
          const px = 24 + (index % 2) * 588,
            py = 85 + Math.floor(index / 2) * 330;
          x.fillStyle = '#19334b';
          x.fillRect(px, py, 564, 300);
          x.drawImage(c, px, py, 564, 285);
          x.fillStyle = '#f6f4ef';
          x.font = 'bold 22px Arial';
          x.fillText(toy.name.toUpperCase(), px + 18, py + 286);
        });
        return out.toDataURL().split(',')[1];
      }, i * 0.05);
      await fs.writeFile(
        path.join(out, String(i).padStart(3, '0') + '.png'),
        Buffer.from(data, 'base64'),
      );
    }
    await page.goto(base + '/weird-motion/');
    assert.equal(await page.locator('article').count(), 6);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      'Six toys passed: twelve distinct deterministic actions, timing/hold, transparent start/end, optional glitch, stills, gallery and mobile.',
    );
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
