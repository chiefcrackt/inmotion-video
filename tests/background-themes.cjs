const assert = require('node:assert/strict');
const fs = require('node:fs');
const { launchBrowser, server } = require('./browser-utils.cjs');
(async () => {
  const srv = server();
  await new Promise((r) => (srv.listening ? r() : srv.once('listening', r)));
  const browser = await launchBrowser();
  const shots = [];
  const hashes = Object.fromEntries(
    fs
      .readdirSync('shared/backgrounds')
      .filter((f) =>
        /^(night-track|misty-trail|wet-asphalt|sunrise-road|stadium-lights|paper-texture)(-(landscape|portrait))?\.jpg$/.test(
          f,
        ),
      )
      .map((f) => [
        f,
        require('node:crypto')
          .createHash('sha256')
          .update(fs.readFileSync('shared/backgrounds/' + f))
          .digest('hex'),
      ]),
  );
  try {
    const base = 'http://127.0.0.1:' + srv.address().port;
    for (const tool of ['cover-maker', 'carousel-maker']) {
      const page = await browser.newPage({
        viewport: { width: 1400, height: 1000 },
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base + '/' + tool + '/');
      await page.waitForSelector('#timBackgroundChoice');
      await page.selectOption('#timBackgroundChoice', 'misty-trail');
      await page.click('#timBackgroundApply');
      await page.waitForFunction(
        () => !document.querySelector('#timBackgroundMatch').disabled,
      );
      assert.equal(await page.isChecked('#timBackgroundMatch'), true);
      const canvas = tool === 'cover-maker' ? '#cv' : '#canvas';
      const capture = () => page.locator(canvas).evaluate((c) => c.toDataURL());
      let previous = '';
      const count = tool === 'cover-maker' ? 3 : 5;
      for (let i = 0; i < count; i++) {
        const before = await capture();
        if (tool === 'cover-maker')
          await page.evaluate((value) => {
            const s = document.querySelector('#tim-output-theme');
            s.value = value;
            s.dispatchEvent(new Event('change', { bubbles: true }));
          }, ['tim', 'minimal', 'broadcast'][i]);
        else await page.locator('#palettes button').nth(i).click();
        if (i > 0)
          await page.waitForFunction(
            ({ selector, before }) =>
              document.querySelector(selector).toDataURL() !== before,
            { selector: canvas, before },
          );
        const current = await capture();
        if (previous) assert.notEqual(current, previous);
        previous = current;
        shots.push({
          label:
            tool +
            ' · ' +
            (tool === 'cover-maker'
              ? ['T.im', 'Minimal', 'Race Broadcast'][i]
              : ['T.im', 'Minimal', 'Broadcast', 'Trail', 'Clay'][i]),
          src: current,
        });
      }
      const matched = await capture();
      await page.uncheck('#timBackgroundMatch');
      await page.waitForFunction(
        ({ selector, before }) =>
          document.querySelector(selector).toDataURL() !== before,
        { selector: canvas, before: matched },
      );
      const original = await capture();
      assert.notEqual(original, matched);
      await page.check('#timBackgroundMatch');
      await page.waitForFunction(
        ({ selector, before }) =>
          document.querySelector(selector).toDataURL() === before,
        { selector: canvas, before: matched },
      );
      if (tool === 'carousel-maker') {
        await page.reload();
        await page.waitForSelector('#timBackgroundMatch');
        assert.equal(await page.isChecked('#timBackgroundMatch'), true);
        const saved = await page.evaluate(() =>
          JSON.parse(localStorage.getItem('tim-carousel-v1')),
        );
        assert.equal(
          saved.slides[0].photoSettings.backgroundPack,
          'misty-trail',
        );
        assert.equal(saved.slides[0].photoSettings.textColor, 'palette');
      }
      // Ordinary uploads must not receive the generated-art treatment.
      await page
        .locator(tool === 'cover-maker' ? '#file' : '#photo')
        .setInputFiles({
          name: 'red.svg',
          mimeType: 'image/svg+xml',
          buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="red"/></svg>',
          ),
        });
      await page.waitForFunction(
        () => document.querySelector('#timBackgroundMatch').disabled,
      );
      assert.deepEqual(errors, []);
      await page.close();
    }
    const p = await browser.newPage({
      viewport: { width: 1600, height: 1500 },
    });
    await p.setContent(
      '<html style="background:#f6f4ef;color:#172332;font-family:Arial"><body><h2>Existing themes with the preserved Misty trail artwork</h2><main style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px">' +
        shots
          .map(
            (s) =>
              '<div><p>' +
              s.label +
              '</p><img style="width:100%;max-height:530px;object-fit:contain;object-position:top" src="' +
              s.src +
              '"></div>',
          )
          .join('') +
        '</main></body></html>',
    );
    await p.screenshot({
      path: 'shared/backgrounds/theme-review.jpg',
      fullPage: true,
    });
    await p.close();
    for (const [file, hash] of Object.entries(hashes))
      assert.equal(
        require('node:crypto')
          .createHash('sha256')
          .update(fs.readFileSync('shared/backgrounds/' + file))
          .digest('hex'),
        hash,
      );
    console.log(
      'PASS: Cover three themes, carousel five palettes, original/matched toggle, reload, ordinary uploads, unchanged image assets.',
    );
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
