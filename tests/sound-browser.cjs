const fs = require('node:fs'),
  assert = require('node:assert/strict');
const {
  launchBrowser,
  server: startServer,
  artifactDirectory,
} = require('./browser-utils.cjs');
const path = require('node:path');
const artifacts = artifactDirectory('sound');
const server = startServer();
(async () => {
  await new Promise((r) => server.on('listening', r));
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true,
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin + '/sound-forge/');
    await page.getByRole('button', { name: '▶ Preview', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('#level').textContent.includes('dBFS'),
    );
    const report = await page.evaluate(async () => {
      const { FACTORY } = await import('/shared/sound/presets.mjs'),
        { render, audioContext } = await import('/shared/sound/engine.mjs'),
        { preset, layer } = await import('/shared/sound/model.mjs'),
        store = await import('/shared/sound/storage.mjs');
      const check = (v, s) => {
        if (!v) throw Error(s);
      };
      let peaks = [];
      for (const p of FACTORY) {
        const r = await render(p, { sampleRate: 44100 });
        check(
          r.peak > 0 && Number.isFinite(r.peak),
          p.name + ' is silent or invalid',
        );
        check(r.buffer.sampleRate === 44100, 'rate');
        peaks.push(r.peak);
      }
      const p = preset(FACTORY[5]);
      p.layers = Array.from({ length: 4 }, (_, i) =>
        layer({
          source: ['sine', 'square', 'noise', 'triangle'][i],
          start: 0.1 + i * 0.1,
          duration: 0.2,
          pan: i % 2 ? 1 : -1,
          volume: 0.2,
          delay: 0.2,
          reverb: 0.1,
        }),
      );
      const r = await render(p);
      let delta = 0;
      for (let c = 0; c < 2; c++)
        for (let j = 0; j < r.buffer.length; j++) {
          const sum = r.stems.reduce(
            (s, x) => s + x.buffer.getChannelData(c)[j],
            0,
          );
          delta = Math.max(
            delta,
            Math.abs(sum - r.buffer.getChannelData(c)[j]),
          );
        }
      check(delta < 1e-6, 'stem sum');
      check(
        r.buffer
          .getChannelData(0)
          .slice(0, 4000)
          .every((v) => v === 0),
        'start offset',
      );
      const ctx = audioContext(),
        sample = ctx.createBuffer(2, 4800, 48000);
      sample.getChannelData(0).fill(0.3);
      sample.getChannelData(1).fill(0.1);
      p.layers = [
        layer({ source: 'sample', assetId: 'test', duration: 0.1, pan: 0 }),
        layer({ enabled: false }),
        layer({ enabled: false }),
        layer({ enabled: false }),
      ];
      const sampled = await render(p, { resolveAsset: async () => sample });
      check(sampled.peak > 0, 'sample rendering');
      let missing = false;
      try {
        await render(p);
      } catch (e) {
        missing = e.message.includes('Missing sample');
      }
      check(missing, 'missing asset error');
      const { encodeWav } = await import('/shared/sound/wav.mjs');
      await store.saveAssetRecord({
        id: 'test',
        name: 'stereo.wav',
        type: 'audio/wav',
        data: encodeWav(sample),
      });
      const packed = await store.packageProject(p),
        unpacked = store.unpackProject(JSON.parse(JSON.stringify(packed)));
      check(
        unpacked.assets[0].data.byteLength === encodeWav(sample).byteLength,
        'portable audio data',
      );
      const decoded = await store.assetResolver(ctx)('test');
      check(decoded.numberOfChannels === 2, 'stereo decode');
      const portable = await render(unpacked.preset, {
        resolveAsset: store.assetResolver(ctx),
      });
      check(portable.peak > 0, 'portable render');
      const fx = preset(FACTORY[5]);
      fx.layers = [
        layer({
          source: 'sawtooth',
          frequency: 330,
          endFrequency: 110,
          duration: 0.25,
        }),
        layer({ enabled: false }),
        layer({ enabled: false }),
        layer({ enabled: false }),
      ];
      const dry = await render(fx);
      for (const settings of [
        { lowpass: 300 },
        { highpass: 2000 },
        { distortion: 0.8 },
        { reverb: 0.8 },
        { delay: 0.6 },
        { pan: -1 },
        { reverse: true },
        { pulse: 30 },
        { modRate: 100, modDepth: 200 },
      ]) {
        const wet = preset(fx);
        Object.assign(wet.layers[0], settings);
        const r = await render(wet);
        const d = dry.buffer.getChannelData(0),
          w = r.buffer.getChannelData(0);
        let diff = 0;
        for (let i = 0; i < Math.min(d.length, w.length); i++)
          diff += Math.abs(d[i] - w[i]);
        check(
          diff > 0.01,
          'effect has no signal change: ' + JSON.stringify(settings),
        );
      }
      await store.savePreset({ ...FACTORY[0], id: 'browser-test' });
      check(
        (await store.listPresets()).some((p) => p.id === 'browser-test'),
        'persistence',
      );
      await store.deletePreset('browser-test');
      await store.savePreset({
        ...fx,
        id: 'integration-test',
        name: 'Integration test',
      });
      // Hold an offline render while refreshing to reproduce an in-flight selection.
      const { createSoundPicker } = await import('/shared/sound/picker.mjs');
      const host = document.createElement('div');
      document.body.append(host);
      let resumeSound;
      const originalStart = OfflineAudioContext.prototype.startRendering;
      OfflineAudioContext.prototype.startRendering = async function () {
        const rendered = originalStart.call(this);
        await new Promise((resolve) => (resumeSound = resolve));
        OfflineAudioContext.prototype.startRendering = originalStart;
        return rendered;
      };
      const picker = createSoundPicker({
        container: host,
        getContext: () => ctx,
        getDestination: () => ctx.destination,
      });
      const select = host.querySelector('select'),
        refresh = host.querySelector('button');
      while (!select.querySelector('option[value="integration-test"]'))
        await new Promise((resolve) => setTimeout(resolve, 10));
      select.value = 'integration-test';
      const pendingSelection = select.onchange();
      while (!resumeSound)
        await new Promise((resolve) => setTimeout(resolve, 10));
      await refresh.onclick();
      resumeSound();
      await pendingSelection;
      check(select.value === '', 'refresh resets selected preset');
      check(picker.play(0) === false, 'refresh must discard in-flight sound');
      picker.dispose();
      host.remove();
      const original = await render(FACTORY[1]),
        again = await render(JSON.parse(JSON.stringify(FACTORY[1])));
      let maxRenderDifference = 0;
      original.buffer.getChannelData(0).forEach((v, i) => {
        maxRenderDifference = Math.max(
          maxRenderDifference,
          Math.abs(v - again.buffer.getChannelData(0)[i]),
        );
      });
      check(
        maxRenderDifference < 1e-4,
        'reproducible render difference ' + maxRenderDifference,
      );
      await ctx.close();
      return {
        factoryRendered: peaks.length,
        stemDelta: delta,
        missingAssetHandled: missing,
        effectsVerified: 9,
        portableSampleVerified: true,
      };
    });
    await page.getByRole('button', { name: '■ Stop', exact: true }).click();
    await page.locator('#advanced').evaluate((e) => (e.open = true));
    await page.getByLabel('Start offset (s)', { exact: true }).fill('0.3');
    await page
      .getByLabel('Start offset (s)', { exact: true })
      .dispatchEvent('change');
    await page.getByRole('button', { name: '▶ Preview', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('#level').textContent.includes('dBFS'),
    );
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export WAV', exact: true }).click();
    const download = await dl;
    const tmp = await download.path();
    const wav = fs.readFileSync(tmp);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.ok(wav.length > 44);
    await page.screenshot({
      path: path.join(artifacts, 'sound-forge-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(artifacts, 'sound-forge-mobile.png'),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      'mobile page overflow',
    );
    await page.goto(origin + '/title-maker/');
    const picker = page
      .locator('label')
      .filter({ hasText: 'Shared SOUND FORGE preset' });
    await picker.waitFor();
    await picker.locator('select').selectOption('integration-test');
    await page.getByText(/Ready · 0.25 seconds/).waitFor();
    await page.evaluate(() => {
      const Original = window.MediaRecorder;
      window.MediaRecorder = class extends Original {
        constructor(stream, options) {
          super(stream, options);
          window.recordedAudioTracks = stream.getAudioTracks().length;
        }
      };
    });
    await page.locator('#rec').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.equal(
      await page.evaluate(() => window.recordedAudioTracks),
      1,
      'existing recording includes sound stream',
    );
    for (const tool of [
      'promo-maker',
      'cover-maker',
      'start-line',
      'river-run',
      'mile-marker',
      'special-post',
      'celebrate',
      'downloads',
    ]) {
      await page.goto(origin + '/' + tool + '/');
      assert.ok(await page.title(), tool + ' loads');
    }
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          ...report,
          wavBytes: wav.length,
          mobileOverflow: false,
          recordingAudioTracks: 1,
          existingToolsLoaded: 9,
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  server.close();
});
