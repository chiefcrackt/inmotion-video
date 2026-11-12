// Start the server first, then: node local-voiceover/check-browser.cjs
// Makes a two-speaker voiceover at 400 px and 1280 px, checks the downloads, the word timing,
// a saved blend, a pronunciation fix, the per-line player, token rejection and sideways scrolling.
const assert = require('node:assert/strict');
const path = require('node:path');
const { launchBrowser } = require('../tests/browser-utils.cjs');

const SCRIPT = [
  "Hey, I'm Tristan. Today we're running ten miles along the river.",
  '',
  'Coach: Keep the first mile easy, then build.',
  '[pause 0.8]',
  'And that is how T.im paces a long run.',
].join('\n');

(async () => {
  const browser = await launchBrowser();
  try {
    const base = process.env.VOICEOVER_BASE || 'http://127.0.0.1:8767';
    for (const width of [400, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.fill('#script', SCRIPT);
      await page.waitForFunction(() =>
        /3 lines to speak/.test(
          document.querySelector('#line-count').textContent,
        ),
      );
      await page.waitForSelector('#speakers-section:not(.hidden)');
      assert.equal(
        await page.locator('#speakers select').count(),
        1,
        'one tagged speaker',
      );

      if (width === 1280) {
        // Save a blend and give it to the coach.
        await page.fill('#mix-name', 'Check blend');
        await page.click('#mix-save');
        await page.waitForFunction(() =>
          /Saved the blend/.test(document.querySelector('#status').textContent),
        );
        await page.selectOption('#speakers select', 'preset:Check blend');
        await page.selectOption('#voice', 'am_michael');
      }
      await page.click('#generate');
      await page.waitForFunction(
        () =>
          document.querySelectorAll('#downloads a').length > 0 ||
          document
            .querySelector('#status')
            .textContent.startsWith('Voiceover failed'),
        {},
        { timeout: 600000 },
      );
      const status = await page.locator('#status').textContent();
      assert.ok(!status.startsWith('Voiceover failed'), status);
      console.log(`${width}px:`, status);

      const links = await page
        .locator('#downloads a')
        .evaluateAll((a) => a.map((l) => l.getAttribute('href')));
      assert.equal(links.length, 4, 'WAV, word JSON, SRT and VTT');
      const files = {};
      for (const href of links) {
        const response = await page.request.get(base + href);
        assert.equal(response.status(), 200, href);
        assert.match(
          response.headers()['content-disposition'],
          /attachment; filename="voiceover/,
        );
        files[href.split('/').pop()] = await response.body();
      }
      const wav = files['voiceover.wav'];
      assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
      assert.equal(wav.readUInt32LE(24), 48000, '48 kHz');
      assert.equal(wav.readUInt16LE(22), 2, 'stereo');
      const seconds = (wav.length - 44) / (48000 * 2 * 3);
      const timing = JSON.parse(files['words.json']);
      assert.equal(timing.word_timing, 'kokoro');
      assert.ok(timing.words.length >= 20, 'words timed');
      assert.ok(
        timing.words.some((w) => w.word === 'T.im'),
        'pronunciation keeps the written word',
      );
      for (const [n, w] of timing.words.entries()) {
        assert.ok(
          w.end >= w.start && w.end <= seconds + 0.01,
          `word ${w.word} inside the audio`,
        );
        if (n)
          assert.ok(w.start >= timing.words[n - 1].start, 'words in order');
      }
      const pause = timing.lines.find((l) => l.kind === 'pause');
      assert.ok(
        Math.abs(pause.end - pause.start - 0.8) < 0.01,
        'the [pause] line',
      );
      if (width === 400)
        assert.equal(
          timing.lines[0].voice,
          '60% am_puck + 40% am_michael',
          'T.im narrator is the default',
        );
      if (width === 1280) {
        assert.match(
          timing.lines.find((l) => l.speaker === 'Coach').voice,
          /\+/,
          'coach uses the blend',
        );
        assert.equal(timing.lines[0].voice, 'am_michael');
      }
      assert.match(files['captions.srt'].toString(), /^1\n00:00:00,\d{3} --> /);
      assert.match(files['captions.vtt'].toString(), /^WEBVTT/);

      // Each line plays on its own.
      assert.equal(await page.locator('#lines li').count(), 4);
      await page.locator('#lines li button').first().click();
      await page.waitForFunction(
        () =>
          !document.querySelector('#player').paused ||
          document.querySelector('#player').currentTime > 0,
      );

      // A second run reuses every unchanged line.
      await page.click('#generate');
      await page.waitForFunction(
        () => /reused/.test(document.querySelector('#status').textContent),
        {},
        { timeout: 120000 },
      );

      const missingToken = await page.request.post(base + '/api/generate', {
        data: { script: 'x' },
      });
      assert.equal(missingToken.status(), 403, 'writes need the page token');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflow, false, `no sideways scrolling at ${width}px`);
      await page.screenshot({
        path: path.join(__dirname, `data/check-${width}.png`),
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(
      'Voiceover browser check passed. Screenshots are in local-voiceover/data.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
