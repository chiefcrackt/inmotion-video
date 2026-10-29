const fs = require('fs'),
  vm = require('vm');
const { chromium } = require('playwright');
(async () => {
  const html = fs.readFileSync('river-run/index.html', 'utf8');
  const src = html.match(/var IMGSRC=(.*);/)[1];
  const imgs = vm.runInNewContext('(' + src + ')');
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();
  const result = await page.evaluate(async (imgs) => {
    const c = document.createElement('canvas');
    c.width = c.height = 1536;
    const x = c.getContext('2d'),
      layout = {};
    let i = 0;
    for (const [name, src] of Object.entries(imgs)) {
      const im = new Image();
      im.src = src;
      await im.decode();
      const cellX = (i % 3) * 512,
        cellY = Math.floor(i / 3) * 512;
      const scale = Math.min(440 / im.width, 440 / im.height);
      const w = Math.round(im.width * scale),
        h = Math.round(im.height * scale);
      const dx = cellX + Math.round((512 - w) / 2),
        dy = cellY + Math.round((512 - h) / 2);
      x.drawImage(im, dx, dy, w, h);
      layout[name] = {
        x: dx,
        y: dy,
        w,
        h,
        originalWidth: im.width,
        originalHeight: im.height,
      };
      i++;
    }
    return { data: c.toDataURL(), layout };
  }, imgs);
  fs.writeFileSync(
    'river-run/artwork/tristan-parts-reference.png',
    Buffer.from(result.data.split(',')[1], 'base64'),
  );
  fs.writeFileSync(
    'river-run/artwork/layout.json',
    JSON.stringify(result.layout, null, 2),
  );
  await browser.close();
})();
