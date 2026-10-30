const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { once } = require('node:events');
const {
  launchBrowser,
  server,
  artifactDirectory,
} = require('./browser-utils.cjs');
const root = path.resolve(__dirname, '..');
const pack = path.join(root, 'downloads/files/running-essentials');
const manifest = JSON.parse(fs.readFileSync(path.join(pack, 'manifest.json')));
const ffmpeg =
  process.env.FFMPEG_PATH ||
  spawnSync(
    'python',
    ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],
    { encoding: 'utf8' },
  ).stdout.trim();
assert.equal(manifest.items.length, 15);
assert.equal(manifest.items.filter((i) => i.kind === 'label').length, 6);
assert.equal(manifest.items.filter((i) => i.kind === 'transition').length, 4);
assert.equal(manifest.items.filter((i) => i.kind === 'distance').length, 5);
for (const entry of manifest.files)
  assert.equal(
    fs.statSync(path.join(pack, entry.file)).size,
    entry.bytes,
    entry.file,
  );
for (const item of manifest.items) {
  const wav = fs.readFileSync(path.join(pack, item.id + '.wav'));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.length, 44 + Math.round(item.duration * 48000) * 4);
  for (const format of ['16x9', '9x16']) {
    const base = path.join(pack, `${item.id}_${format}`);
    // Decode the encoded alpha plane, not just the source canvas or container tag.
    const decoded = spawnSync(
      ffmpeg,
      [
        '-v',
        'error',
        '-c:v',
        'libvpx-vp9',
        '-i',
        base + '_Alpha.webm',
        '-vf',
        'alphaextract,scale=16:16',
        '-an',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'gray',
        'pipe:1',
      ],
      { maxBuffer: 1024 * 1024 },
    );
    assert.equal(decoded.status, 0, decoded.stderr.toString());
    const alpha = decoded.stdout,
      frames = Math.round(item.duration * 30);
    assert.equal(alpha.length, frames * 256);
    assert.equal(
      Math.max(...alpha.subarray(0, 256)),
      0,
      base + ' starts clear',
    );
    assert.equal(Math.max(...alpha.subarray(-256)), 0, base + ' ends clear');
    assert.ok(alpha.includes(255), base + ' has visible content');
    if (item.kind === 'transition')
      assert.equal(
        Math.min(...alpha.subarray(21 * 256, 22 * 256)),
        255,
        base + ' covers the cut',
      );
    const mp4 = spawnSync(
      ffmpeg,
      ['-v', 'error', '-i', base + '_GreenScreen.mp4', '-f', 'null', '-'],
      { maxBuffer: 1024 * 1024 },
    );
    assert.equal(mp4.status, 0, mp4.stderr.toString());
  }
}
const zip = spawnSync(
  'python',
  [
    '-c',
    "import zipfile,sys,pathlib; p=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(p/'TIM_Running_Essentials.zip'); assert z.testzip() is None; assert set(z.namelist())=={f.name for f in p.iterdir() if f.is_file() and f.suffix!='.zip' and not f.name.startswith('.')}",
    pack,
  ],
  { encoding: 'utf8' },
);
assert.equal(zip.status, 0, zip.stderr);
async function browserChecks() {
  const artifacts = artifactDirectory('running-essentials');
  const http = server();
  await once(http, 'listening');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const origin = `http://127.0.0.1:${http.address().port}`;
    await page.goto(origin + '/downloads/');
    const section = page.locator('#running-essentials');
    assert.equal(await section.locator('li.item').count(), 15);
    assert.equal(await section.locator('button.dl').count(), 76);
    const html = fs.readFileSync(
      path.join(root, 'downloads/index.html'),
      'utf8',
    );
    // Every download on the page, including every pre-existing pack, still resolves.
    for (const match of html.matchAll(/data-src="([^"]+)"/g))
      assert.ok(
        fs.existsSync(path.join(root, 'downloads', match[1])),
        match[1],
      );
    for (const id of ['trailer-kit', 'river-run', 'portal', 'loop', 'drop'])
      assert.equal(await page.locator(`section#${id}`).count(), 1);
    const metadata = await section.locator('video').evaluate(
      (video) =>
        new Promise((resolve, reject) => {
          const done = () =>
            resolve({
              width: video.videoWidth,
              height: video.videoHeight,
              duration: video.duration,
            });
          if (video.readyState >= 1) done();
          else {
            video.onloadedmetadata = done;
            video.onerror = () => reject(Error('Preview failed'));
          }
        }),
    );
    assert.equal(metadata.width, 960);
    assert.equal(metadata.height, 540);
    assert.ok(
      Math.abs(
        metadata.duration - manifest.items.reduce((n, i) => n + i.duration, 0),
      ) < 0.25,
    );
    await page.screenshot({
      path: path.join(artifacts, 'downloads-desktop.png'),
    });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      section.locator('button.dl').first().click(),
    ]);
    assert.equal(download.suggestedFilename(), 'TIM_Running_Essentials.zip');
    assert.equal(await download.failure(), null);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await page.screenshot({
      path: path.join(artifacts, 'downloads-mobile.png'),
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    http.close();
  }
}
browserChecks()
  .then(() =>
    console.log(
      'Running Essentials: 60 videos decoded, encoded alpha and cut coverage verified, WAVs/ZIP/links/preview/download/mobile passed.',
    ),
  )
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
