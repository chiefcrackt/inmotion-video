const fs = require('node:fs/promises'),
  path = require('node:path');
const { server, launchBrowser } = require('../tests/browser-utils.cjs');
(async () => {
  const out = path.resolve(process.argv[2] || 'weird-motion/kit');
  await fs.mkdir(out, { recursive: true });
  const { toys, svg } = await import('../weird-motion/artwork.mjs');
  const { templateScene } = await import('../product-spotlight/templates.mjs');
  for (const toy of toys) {
    await fs.writeFile(
      path.join(out, toy.id + '.json'),
      JSON.stringify(
        {
          tool: 'asset-studio',
          version: 1,
          payload: { scene: templateScene('toy:' + toy.id) },
        },
        null,
        2,
      ),
    );
    for (const id of [toy.id, toy.id + '-solo'])
      await fs.writeFile(path.join(out, id + '.svg'), svg(id));
  }
  let html = await fs.readFile(
    path.join(__dirname, '../weird-motion/index.html'),
    'utf8',
  );
  const source = await fs.readFile(
      path.join(__dirname, '../weird-motion/artwork.mjs'),
      'utf8',
    ),
    exits = await fs.readFile(
      path.join(__dirname, '../shared/exits.js'),
      'utf8',
    );
  html = html.replaceAll("'./files/'", "'./'");
  html = html.replace(
    "import { toys, draw } from './artwork.mjs';",
    source.replaceAll('export ', ''),
  );
  html = html.replace("import '../shared/exits.js';", exits);
  html = html.replace(
    'href="../asset-studio/"',
    'href="https://chiefcrackt.github.io/inmotion-video/asset-studio/"',
  );
  html = html.replace(
    "'../asset-studio/?template=toy:'",
    "'https://chiefcrackt.github.io/inmotion-video/asset-studio/?template=toy:'",
  );
  await fs.writeFile(path.join(out, 'Weird-Motion-Preview.html'), html);
  await fs.writeFile(
    path.join(out, 'README.txt'),
    'T.im Weird Motion\nTwenty motion toys with two actions each. Forty transparent SVG/PNG graphics: full callout and standalone toy versions.\nOpen Weird-Motion-Preview.html for the interactive offline preview. Labels, actions, scrubbing and optional glitch work offline. Builder links require the new pack to be deployed.\nImport the JSON projects into Asset Animator after this update is deployed. Text remains editable. Choose the Weird Motion pack for the standalone versions. Change Motion to switch actions; entrance duration sets speed.\nStatic PNG/SVG files are complete blank artwork, not animated videos. Make video in Asset Animator exports transparent WebM or green screen.\nOriginal vector artwork in navy #0e1a2e, gold #e8c96a and teal #2e9bad.\n',
  );
  const srv = server();
  await new Promise((r) => (srv.listening ? r() : srv.once('listening', r)));
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(
      'http://127.0.0.1:' + srv.address().port + '/weird-motion/',
    );
    for (const toy of toys)
      for (const id of [toy.id, toy.id + '-solo']) {
        const data = await page.evaluate(async (id) => {
          const { svg } = await import('/weird-motion/artwork.mjs');
          const im = new Image();
          im.src =
            'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(id));
          await im.decode();
          const c = document.createElement('canvas');
          c.width = 960;
          c.height = 540;
          c.getContext('2d').drawImage(im, 0, 0);
          return c.toDataURL().split(',')[1];
        }, id);
        await fs.writeFile(
          path.join(out, id + '.png'),
          Buffer.from(data, 'base64'),
        );
      }
    await page.goto(
      'file:///' +
        path.join(out, 'Weird-Motion-Preview.html').replaceAll('\\', '/'),
    );
    await page.waitForSelector('article');
    if ((await page.locator('article').count()) !== 20)
      throw Error('Offline preview failed');
    console.log(
      'Built forty SVG/PNG graphics, twenty editable projects and verified offline gallery.',
    );
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
