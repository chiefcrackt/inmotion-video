// Desktop save: on a Windows computer every tool downloads its file directly instead of opening the
// share sheet, even though desktop Chrome/Edge report that they can share files. Phones still share.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchBrowser, server } = require('./browser-utils.cjs');

const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// tool → how to make it save something
const TOOLS = [
  ['video-framer', ['#png']],
  ['title-maker', ['#png']],
  ['cover-maker', ['#png']],
  ['mile-marker', ['#png']],
  ['promo-maker', ['#png']],
  ['celebrate', ['#still']],
  ['special-post', ['#still']],
  ['start-line', ['#rec', 'wait:#result', '#save']],
  ['river-run', ['#rec', 'wait:#result', '#save']],
  ['downloads', ['button.dl:not([data-ext="zip"])']],
  ['activity-studio', ['gpx', '#png']],
];
function gpx() {
  let pts = '';
  for (let i = 0; i < 30; i++)
    pts += `<trkpt lat="${10 + i * 0.0002}" lon="${20 + Math.sin(i / 4) * 0.002}"><ele>${100 + i}</ele><time>${new Date(Date.UTC(2026, 0, 1) + i * 10000).toISOString()}</time></trkpt>`;
  return `<?xml version="1.0"?><gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>T</name><trkseg>${pts}</trkseg></trk></gpx>`;
}
(async () => {
  const http = server(0);
  await new Promise((r) => http.on('listening', r));
  const base = `http://127.0.0.1:${http.address().port}`;
  const gpxPath = path.join(os.tmpdir(), 'tim-desktop-save.gpx');
  fs.writeFileSync(gpxPath, gpx());
  let browser;
  try {
    browser = await launchBrowser();
    async function run(ua, tool, steps, expectShare) {
      const context = await browser.newContext({ userAgent: ua, acceptDownloads: true, viewport: { width: 1366, height: 900 } });
      // pretend the browser can share files (desktop Chrome/Edge on Windows can) and record if it's used
      await context.addInitScript(() => {
        window.__shared = 0;
        navigator.canShare = () => true;
        navigator.share = () => {
          window.__shared++;
          return Promise.resolve();
        };
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
      await page.goto(`${base}/${tool}/`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      let download = null;
      page.on('download', (d) => (download = d));
      for (const step of steps) {
        if (step === 'gpx') {
          await page.locator('#file').setInputFiles(gpxPath);
          await page.locator('#png').waitFor({ state: 'visible' });
          await page.waitForFunction(() => !document.getElementById('editor').disabled, null, { timeout: 20000 });
        } else if (step.startsWith('wait:')) await page.locator(step.slice(5)).waitFor({ state: 'visible', timeout: 60000 });
        else await page.locator(step).first().click();
      }
      // wait for the file (or, on a phone, the share sheet)
      for (let i = 0; i < 80 && !download && !(await page.evaluate(() => window.__shared)); i++)
        await page.waitForTimeout(100);
      const shared = await page.evaluate(() => window.__shared);
      if (expectShare) assert.ok(shared > 0, `${tool}: phone uses the share sheet`);
      else {
        assert.equal(shared, 0, `${tool}: no share sheet on the computer`);
        assert.ok(download, `${tool}: file downloaded on the computer`);
        console.log(`${tool}: downloaded ${download.suggestedFilename()}`);
      }
      assert.deepEqual(errors, [], tool);
      await context.close();
    }
    for (const [tool, steps] of TOOLS) await run(WINDOWS, tool, steps, false);
    // phones keep the share sheet (Save Video / Save Image → Photos)
    for (const [tool, steps] of TOOLS.filter((t) => ['video-framer', 'title-maker', 'activity-studio'].includes(t[0])))
      await run(IPHONE, tool, steps, true);
    console.log('Desktop save passed: every tool downloads on a Windows computer; phones still get the share sheet.');
  } finally {
    await browser?.close();
    http.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
