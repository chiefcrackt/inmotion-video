import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { assets, svg, colors } from '../product-spotlight/assets.mjs';
import { templateScene } from '../product-spotlight/templates.mjs';
import { zipStore } from '../carousel-maker/model.mjs';
const { launchBrowser, server } = createRequire(import.meta.url)(
  '../tests/browser-utils.cjs',
);
const root = fileURLToPath(new URL('../product-spotlight/', import.meta.url));
for (const folder of [
  'files/svg',
  'files/png',
  'files/layers',
  'files/templates',
  'files/previews',
])
  await mkdir(root + folder, { recursive: true });
const archive = [],
  add = (name, data) =>
    archive.push({
      name,
      data: typeof data === 'string' ? new TextEncoder().encode(data) : data,
    });
const manifest = {
  version: 1,
  name: 'T.im Product Spotlight',
  palette: colors,
  rasterScale: 2,
  assets: assets.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    width: a.width,
    height: a.height,
    svg: `svg/${a.id}.svg`,
    png: `png/${a.id}.png`,
    template: `templates/${a.id}.json`,
    hint: a.hint,
    textAreas: a.texts.map((t) => ({
      x: t.x,
      y: t.y,
      width: t.width,
      fontSize: t.fontSize,
    })),
    layers: a.layers.map((l) => ({
      id: l.id,
      svg: `layers/${a.id}/${l.id}.svg`,
      pngInArchive: `layers/${a.id}/${l.id}.png`,
    })),
  })),
};
const guide = `T.im / Product Spotlight Kit

18 original graphics for product names, feature callouts and your own experiences.
Navy, gold and teal. PNGs are transparent; the navy panels are intentional.

QUICK START
Open the Product Spotlight catalog and choose Edit this template. Each design
opens in the standalone Asset Animator, with the wording on separate text layers.
Change the product name and your notes; move, resize and animate the layers.
Export a transparent PNG or animation and overlay it on your own product footage.

OFFLINE / OTHER EDITORS
png/ and svg/ contain BLANK graphics: no baked-in wording or product photos.
layers/<design>/ contains aligned PNG + SVG components on the same canvas.
templates/<design>.json is an editable Asset Animator project: import it using
Saved projects > Import JSON. Text remains editable and uses generic placeholders.
previews/ contains illustrated examples only; these example PNGs have placeholder
text baked in. They are previews, not the blank overlay assets.
manifest.json records dimensions, text positions and component names.

Keep names concise. Use your own specific observations, reasons and trade-offs.
Text uses generic placeholders. Add your own product name and observations.
The optional Affiliate link label can be edited or removed.
Default portrait placement is a starting point: check it against your footage,
captions and TikTok's interface before posting.

Original T.im artwork. Reuse and adapt in personal and commercial content.
No product images, third-party logos or fonts are included in this pack.
`;
const browser = await launchBrowser();
let srv;
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  async function raster(source) {
    return Buffer.from(
      await page.evaluate(async (source) => {
        const im = new Image();
        im.src =
          'data:image/svg+xml;base64,' +
          btoa(unescape(encodeURIComponent(source)));
        await im.decode();
        const c = document.createElement('canvas');
        c.width = im.width;
        c.height = im.height;
        c.getContext('2d').drawImage(im, 0, 0);
        return c.toDataURL().split(',')[1];
      }, source),
      'base64',
    );
  }
  for (const a of assets) {
    const source = svg(a),
      png = await raster(source);
    await writeFile(root + `files/svg/${a.id}.svg`, source);
    await writeFile(root + `files/png/${a.id}.png`, png);
    add(`svg/${a.id}.svg`, source);
    add(`png/${a.id}.png`, png);
    await mkdir(root + `files/layers/${a.id}`, { recursive: true });
    for (const l of a.layers) {
      const source = svg(a, { layerId: l.id });
      await writeFile(root + `files/layers/${a.id}/${l.id}.svg`, source);
      add(`layers/${a.id}/${l.id}.svg`, source);
      add(`layers/${a.id}/${l.id}.png`, await raster(source));
    }
    const doc = {
      version: 1,
      tool: 'asset-studio',
      name: 'Product Spotlight — ' + a.name,
      payload: { scene: templateScene('spotlight:' + a.id) },
    };
    const text = JSON.stringify(doc, null, 2) + '\n';
    await writeFile(root + `files/templates/${a.id}.json`, text);
    add(`templates/${a.id}.json`, text);
  }
  srv = server();
  await new Promise((r) => (srv.listening ? r() : srv.once('listening', r)));
  await page.goto('http://127.0.0.1:' + srv.address().port + '/asset-studio/');
  await page.evaluate(() => document.fonts.ready);
  if (pageErrors.length) throw Error(pageErrors.join('; '));
  const previews = [];
  for (const a of assets) {
    const png = Buffer.from(
      await page.evaluate(async (id) => {
        const { templateScene } =
            await import('/product-spotlight/templates.mjs'),
          { prepare, render } = await import('/asset-studio/render.mjs');
        const scene = templateScene('spotlight:' + id);
        await prepare(scene);
        const c = document.createElement('canvas');
        render(c, scene, 0, { still: true });
        const a = (await import('/product-spotlight/assets.mjs')).assets.find(
          (a) => a.id === id,
        );
        const b = scene.layers[0],
          w = (1080 * b.size) / 100,
          h = (w * a.height) / a.width;
        const out = document.createElement('canvas');
        out.width = Math.ceil(w + 40);
        out.height = Math.ceil(h + 40);
        out
          .getContext('2d')
          .drawImage(
            c,
            (1080 * b.x) / 100 - w / 2 - 20,
            (1920 * b.y) / 100 - h / 2 - 20,
            w + 40,
            h + 40,
            0,
            0,
            out.width,
            out.height,
          );
        return out.toDataURL().split(',')[1];
      }, a.id),
      'base64',
    );
    await writeFile(root + `files/previews/${a.id}.png`, png);
    add(`previews/${a.id}.png`, png);
    previews.push({ name: a.name, data: png.toString('base64') });
  }
  const preview = Buffer.from(
    await page.evaluate(async (entries) => {
      const c = document.createElement('canvas');
      c.width = 1800;
      c.height = 1940;
      const x = c.getContext('2d');
      x.fillStyle = '#0e1a2e';
      x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#e8c96a';
      x.font = 'bold 49px Arial';
      x.fillText('T.im / PRODUCT SPOTLIGHT', 52, 80);
      x.fillStyle = '#f6f4ef';
      x.font = '23px Arial';
      x.fillText(
        '18 DESIGNS / EDITABLE TEXT TEMPLATES / TRANSPARENT OVERLAYS',
        54,
        126,
      );
      for (let i = 0; i < entries.length; i++) {
        const px = 48 + (i % 3) * 570,
          py = 170 + Math.floor(i / 3) * 288;
        x.fillStyle = '#19334b';
        x.beginPath();
        x.roundRect(px, py, 550, 270, 12);
        x.fill();
        const im = new Image();
        im.src = 'data:image/png;base64,' + entries[i].data;
        await im.decode();
        const s = Math.min(490 / im.width, 196 / im.height);
        x.drawImage(
          im,
          px + (550 - im.width * s) / 2,
          py + 9 + (196 - im.height * s) / 2,
          im.width * s,
          im.height * s,
        );
        x.fillStyle = '#f6f4ef';
        x.font = 'bold 21px Arial';
        x.textAlign = 'center';
        x.fillText(entries[i].name, px + 275, py + 244);
        x.textAlign = 'left';
      }
      return c.toDataURL().split(',')[1];
    }, previews),
    'base64',
  );
  await writeFile(root + 'preview.png', preview);
  add('contact-sheet.png', preview);
} finally {
  await browser.close();
  srv?.close();
}
await writeFile(root + 'files/READ-ME.txt', guide);
add('READ-ME.txt', guide);
const json = JSON.stringify(manifest, null, 2) + '\n';
await writeFile(root + 'files/manifest.json', json);
add('manifest.json', json);
const zip = zipStore(archive);
await writeFile(
  root + 'files/TIM_Product_Spotlight_Kit.zip',
  new Uint8Array(await zip.arrayBuffer()),
);
const cards = assets
  .map(
    (a) =>
      `<article class="card" data-category="${a.category}"><div class="art"><img src="files/previews/${a.id}.png" alt="${a.name}: example wording shown on the editable template" width="720" height="440" loading="lazy"></div><div class="body"><span class="category">${a.category} / ${a.layers.length} movable parts</span><h2>${a.name}</h2><p>${a.hint}</p><a class="edit" href="../asset-studio/?template=spotlight:${a.id}">Edit this template →</a><div class="links"><a href="files/png/${a.id}.png" download>Blank PNG</a><a href="files/svg/${a.id}.svg" download>SVG</a><a href="files/templates/${a.id}.json" download>Editable project</a></div></div></article>`,
  )
  .join('\n');
const template = await readFile(
  new URL('../product-spotlight/template.html', import.meta.url),
  'utf8',
);
await writeFile(root + 'index.html', template.replace('<!-- CARDS -->', cards));
console.log(
  `Built 18 Product Spotlight designs, ${assets.reduce((n, a) => n + a.layers.length, 0)} parts, 18 editable projects, previews and ${archive.length}-file ZIP.`,
);
