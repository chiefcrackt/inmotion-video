const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser } = require('../tests/browser-utils.cjs');
(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:8765');
    await page.setInputFiles(
      '#file',
      path.join(
        __dirname,
        process.env.TRANSCRIBE_SAMPLE || 'data/test/sample.wav',
      ),
    );
    await page.selectOption('#device', process.env.TRANSCRIBE_DEVICE || 'auto');
    await page.click('#start');
    await page.waitForFunction(
      () =>
        !document.querySelector('#result').classList.contains('hidden') ||
        document
          .querySelector('#status')
          .textContent.startsWith('Transcription failed'),
      {},
      { timeout: 600000 },
    );
    assert.ok(
      !(await page.locator('#status').textContent()).startsWith(
        'Transcription failed',
      ),
      await page.locator('#status').textContent(),
    );
    assert.ok((await page.locator('.segment').count()) > 0);
    const initial = await page
      .locator('.segment textarea')
      .first()
      .inputValue();
    console.log('Recognized:', initial);
    assert.match(
      (await page.locator('#segments').textContent()) + initial,
      /ran|river|kilometer|Today/i,
    );
    await page
      .locator('.segment textarea')
      .first()
      .fill('Corrected running transcript.');
    assert.equal(await page.locator('#downloads a').count(), 0);
    await page.click('#save');
    await page.waitForFunction(
      () =>
        document.querySelector('#save-status').textContent === 'Saved locally',
    );
    assert.equal(await page.locator('#downloads a').count(), 5);
    const downloads = await page
      .locator('#downloads a')
      .evaluateAll((links) => links.map((link) => link.href));
    for (const url of downloads) {
      const response = await page.request.get(url);
      assert.equal(response.status(), 200);
      const text = await response.text();
      assert.ok(text.length > 0);
      if (url.endsWith('.srt'))
        assert.match(text, /Corrected running transcript/);
      if (url.endsWith('.json')) {
        const json = JSON.parse(text);
        assert.ok(json.original_words.length);
        console.log(
          'Engine:',
          json.device,
          json.model,
          'words:',
          json.original_words.length,
        );
      }
    }
    const denied = await page.request.post(
      'http://127.0.0.1:8765/api/transcribe',
      { data: 'invalid' },
    );
    assert.equal(denied.status(), 403);
    await page.screenshot({
      path: path.join(__dirname, 'data/desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: path.join(__dirname, 'data/mobile.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      'PASS: real transcription, word timings, text edits, exports, missing-token rejection, mobile layout, no page errors.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
