const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
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
    await page.goto(
      'http://127.0.0.1:' +
        srv.address().port +
        '/asset-studio/?template=signature:spot-it',
    );
    await page.waitForFunction(
      () =>
        window.__assetStudio?.ready() &&
        window.__assetStudio.get().layers.length === 2,
    );
    assert.equal(await page.locator('#exit').inputValue(), 'fade');
    await page.selectOption('#exit', 'glitch');
    await page.reload();
    await page.waitForFunction(() => window.__assetStudio?.ready());
    assert.equal(await page.locator('#exit').inputValue(), 'glitch');
    const result = await page.evaluate(async () => {
      const { render, prepare } = await import('/asset-studio/render.mjs');
      const scene = window.__assetStudio.get();
      await prepare(scene);
      window.spotScene = scene;
      window.spotRender = render;
      const c = document.createElement('canvas');
      const sample = (t, opts) => {
        render(c, scene, t, opts);
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let hash = 0,
          count = 0;
        for (let i = 0; i < d.length; i++) {
          hash = (Math.imul(hash, 31) + d[i]) >>> 0;
          if (i % 4 === 3 && d[i]) count++;
        }
        return { hash, count };
      };
      return {
        start: sample(0),
        hold: sample(4),
        glitch: sample(5.6),
        repeat: sample(5.6),
        end: sample(6),
        still: sample(6, { still: true }),
        stillStart: sample(0, { still: true }),
        green: sample(6, { green: true }),
      };
    });
    assert.equal(result.start.count, 0);
    assert(result.hold.count > 0);
    assert.notEqual(result.hold.hash, result.glitch.hash);
    assert.deepEqual(result.glitch, result.repeat);
    assert.equal(result.end.count, 0);
    assert.deepEqual(result.still, result.stillStart);
    assert.equal(result.green.count, 1920 * 1080);
    assert.deepEqual(errors, []);
    const frames = path.resolve(__dirname, '../../spot-it-glitch-frames');
    await fs.mkdir(frames, { recursive: true });
    for (let i = 0; i < 120; i++) {
      const data = await page.evaluate((t) => {
        const c = document.createElement('canvas');
        spotRender(c, spotScene, t);
        const out = document.createElement('canvas');
        out.width = 960;
        out.height = 540;
        const x = out.getContext('2d');
        x.fillStyle = '#19334b';
        x.fillRect(0, 0, 960, 540);
        x.drawImage(c, 0, 0, 960, 540);
        return out.toDataURL().split(',')[1];
      }, i * 0.05);
      await fs.writeFile(
        path.join(frames, String(i).padStart(3, '0') + '.png'),
        Buffer.from(data, 'base64'),
      );
    }
    console.log(
      'Spot it passed: template, clean default, persisted glitch, deterministic slices, empty exit, unchanged still PNG and solid green background.',
    );
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
