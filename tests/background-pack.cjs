const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, server } = require('./browser-utils.cjs');
(async () => {
  const srv = server();
  await new Promise((r) => (srv.listening ? r() : srv.once('listening', r)));
  const browser = await launchBrowser();
  try {
    const base = 'http://127.0.0.1:' + srv.address().port;
    for (const tool of ['cover-maker', 'carousel-maker']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base + '/' + tool + '/');
      await page.waitForSelector('#timBackgroundChoice');
      assert.equal(
        await page.locator('#timBackgroundChoice option').count(),
        7,
      );
      assert.equal((await page.locator('input[type=file]').count()) > 0, true);
      const ids = await page
        .locator('#timBackgroundChoice option')
        .evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
      for (const id of ids) {
        await page.selectOption('#timBackgroundChoice', id);
        await page.waitForFunction(
          () =>
            document.querySelector('#timBackgroundPreview').naturalWidth > 0,
        );
        await page.click('#timBackgroundApply');
        await page.waitForFunction(() =>
          document
            .querySelector('#timBackgroundStatus')
            .textContent.startsWith('Background added'),
        );
      }
      if (tool === 'carousel-maker') {
        assert.equal(await page.inputValue('#photoMode'), 'background');
        await page.reload();
        await page.waitForSelector('#timBackgroundChoice');
        assert.equal(await page.inputValue('#photoMode'), 'background');
      } else {
        await page.waitForFunction(
          () => !document.querySelector('#clear').hidden,
        );
      }
      await page.screenshot({
        path: 'shared/backgrounds/' + tool + '-preview.png',
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
      );
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(
      'Background pack: all six images apply in both tools; carousel reload and mobile layout pass.',
    );
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
