// Slice generated atlases, remove disconnected generation specks, and fit to
// the original sprite bounds. Never alter the original images or rig geometry.
const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const sources = JSON.parse(
    fs
      .readFileSync('river-run/index.html', 'utf8')
      .match(/var IMGSRC=(.*);/)[1],
  );
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();
  const cleanup = process.argv.includes('--cleanup');
  for (const id of cleanup ? ['race', 'trail'] : ['race', 'trail', 'winter']) {
    const file = `river-run/artwork/${id}-atlas${cleanup ? '-v2' : ''}.png`;
    if (!fs.existsSync(file)) continue;
    const atlas =
      'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    const output = await page.evaluate(
      async ({ sources, atlas }) => {
        const load = async (src) => {
          const im = new Image();
          im.src = src;
          await im.decode();
          return im;
        };
        const sheet = await load(atlas),
          result = {};
        let index = 0;
        function component(canvas) {
          const x = canvas.getContext('2d'),
            { width: w, height: h } = canvas,
            pixels = x.getImageData(0, 0, w, h),
            d = pixels.data;
          const seen = new Uint8Array(w * h);
          let best = [];
          for (let p = 0; p < w * h; p++) {
            if (seen[p] || d[p * 4 + 3] < 96) continue;
            let group = [p];
            seen[p] = 1;
            for (let j = 0; j < group.length; j++) {
              const n = group[j];
              for (const q of [
                n - w,
                n + w,
                ...(n % w ? [n - 1] : []),
                ...(n % w < w - 1 ? [n + 1] : []),
              ]) {
                if (q >= 0 && q < w * h && !seen[q] && d[q * 4 + 3] >= 96) {
                  seen[q] = 1;
                  group.push(q);
                }
              }
            }
            if (group.length > best.length) best = group;
          }
          if (!best.length) throw Error('Empty sprite');
          let minX = w,
            minY = h,
            maxX = 0,
            maxY = 0;
          const mask = new Uint8Array(w * h);
          for (const p of best) {
            mask[p] = 1;
            minX = Math.min(minX, p % w);
            maxX = Math.max(maxX, p % w);
            minY = Math.min(minY, Math.floor(p / w));
            maxY = Math.max(maxY, Math.floor(p / w));
          }
          for (let p = 0; p < w * h; p++) if (!mask[p]) d[p * 4 + 3] = 0;
          x.putImageData(pixels, 0, 0);
          return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
        }
        for (const [name, src] of Object.entries(sources)) {
          const original = await load(src),
            c = document.createElement('canvas');
          c.width = original.width;
          c.height = original.height;
          const x = c.getContext('2d');
          x.drawImage(original, 0, 0);
          const target = component(c);
          const cell = document.createElement('canvas');
          cell.width = Math.round(sheet.width / 3);
          cell.height = Math.round(sheet.height / 3);
          cell
            .getContext('2d')
            .drawImage(
              sheet,
              ((index % 3) * sheet.width) / 3,
              (Math.floor(index / 3) * sheet.height) / 3,
              sheet.width / 3,
              sheet.height / 3,
              0,
              0,
              cell.width,
              cell.height,
            );
          index++;
          const box = component(cell);
          x.clearRect(0, 0, c.width, c.height);
          x.drawImage(
            cell,
            box.x,
            box.y,
            box.w,
            box.h,
            target.x,
            target.y,
            target.w,
            target.h,
          );
          result[name] = c.toDataURL('image/png');
        }
        return result;
      },
      { sources, atlas },
    );
    fs.mkdirSync(`river-run/artwork/${id}`, { recursive: true });
    for (const [name, data] of Object.entries(output)) {
      if (cleanup && name !== 'shorts' && !(id === 'trail' && name === 'torso'))
        continue;
      fs.writeFileSync(
        `river-run/artwork/${id}/${name}${cleanup ? '-v2' : ''}.png`,
        Buffer.from(data.split(',')[1], 'base64'),
      );
    }
  }
  await browser.close();
})();
