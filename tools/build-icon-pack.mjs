// Rebuild the shipped, dependency-free icon downloads and catalog.
// npm ci, then node tools/build-icon-pack.mjs (Chromium/Chrome/Edge required).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { icons, svg } from '../icon-pack/icons.mjs';
import { zipStore } from '../carousel-maker/model.mjs';
const require = createRequire(import.meta.url);
const { launchBrowser } = require('../tests/browser-utils.cjs');
const root = fileURLToPath(new URL('../icon-pack/', import.meta.url));
for (const folder of ['files/svg', 'files/png']) await mkdir(root + folder, { recursive: true });
const readme = `T.im — Running + Creator Icons / Volume 01

24 original icons in navy #0E1A2E, gold #E8C96A and teal #2E9BAD.
12 running icons + 12 creator icons.

PNG: 1024 × 1024 pixels, transparent background. Add as an overlay or photo
layer in CapCut, Canva, a video editor or a social post. No chroma key needed.
SVG: editable vector artwork, scales without losing detail. Import in an SVG
compatible design tool. PNG is the easiest choice for mobile video editors.

The navy outline is part of the icon, not a background. Preview on light and
dark footage; add a light backing shape in your editor if contrast is low.
Icons share one square canvas so they align at the same size. Keep at least
48 screen pixels for smaller details; larger is better in vertical video.

Reuse and adapt this original T.im artwork in personal and commercial content.
No attribution required. No third-party logos, fonts or linked assets are used.

Included: 24 PNGs, 24 SVGs, contact sheet and this guide.
`;
const archive = [];
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  for (const icon of icons) {
    const source = svg(icon);
    await writeFile(root + `files/svg/${icon.id}.svg`, source);
    const png = Buffer.from(await page.evaluate(async (source) => {
      const image = new Image();
      image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(source)));
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1024;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    }, source), 'base64');
    await writeFile(root + `files/png/${icon.id}.png`, png);
    archive.push({ name: `svg/${icon.id}.svg`, data: new TextEncoder().encode(source) }, { name: `png/${icon.id}.png`, data: png });
  }
  const preview = Buffer.from(await page.evaluate(async (entries) => {
    const c = document.createElement('canvas'); c.width = 1800; c.height = 1380;
    const x = c.getContext('2d');
    x.fillStyle = '#0e1a2e'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#e8c96a'; x.font = 'bold 46px Arial'; x.fillText('T.im / RUNNING + CREATOR ICONS', 52, 79);
    x.fillStyle = '#f6f4ef'; x.font = '23px Arial'; x.fillText('VOLUME 01     /     24 ICONS     /     SVG + TRANSPARENT PNG', 54, 124);
    for (let i = 0; i < entries.length; i++) {
      const px = 48 + (i % 6) * 286, py = 168 + Math.floor(i / 6) * 289;
      x.fillStyle = '#f6f4ef'; x.beginPath(); x.roundRect(px, py, 270, 268, 14); x.fill();
      const im = new Image(); im.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(entries[i].source))); await im.decode();
      x.drawImage(im, px + 47, py + 20, 176, 176);
      x.fillStyle = '#0e1a2e'; x.font = 'bold 19px Arial'; x.textAlign = 'center'; x.fillText(entries[i].name, px + 135, py + 232); x.textAlign = 'left';
    }
    return c.toDataURL('image/png').split(',')[1];
  }, icons.map(i => ({ name: i.name, source: svg(i) }))), 'base64');
  await writeFile(root + 'preview.png', preview);
  await writeFile(root + 'files/READ-ME.txt', readme);
  archive.push({ name: 'READ-ME.txt', data: new TextEncoder().encode(readme) }, { name: 'contact-sheet.png', data: preview });
  const zip = zipStore(archive);
  await writeFile(root + 'files/TIM_Running_Creator_Icons.zip', new Uint8Array(await zip.arrayBuffer()));
} finally { await browser.close(); }

const cards = icons.map(i => `<article class="card" data-category="${i.category}"><div class="art"><img src="files/svg/${i.id}.svg" alt="${i.name}" width="128" height="128" loading="lazy"></div><div class="cardbody"><span class="tag">${i.category}</span><h2>${i.name}</h2><div class="files"><a href="files/png/${i.id}.png" download="tim-${i.id}.png">PNG <span>1024px</span></a><a href="files/svg/${i.id}.svg" download="tim-${i.id}.svg">SVG <span>Vector</span></a></div><a href="../asset-studio/?asset=icon:${i.id}" style="display:inline-flex;min-height:44px;align-items:center;font-size:13px">Animate this →</a></div></article>`).join('\n');
const template = await readFile(new URL('../icon-pack/template.html', import.meta.url), 'utf8');
await writeFile(root + 'index.html', template.replace('<!-- ICON_CARDS -->', cards));
console.log(`Built ${icons.length} SVGs, ${icons.length} transparent PNGs, contact sheet, ZIP and catalog.`);
