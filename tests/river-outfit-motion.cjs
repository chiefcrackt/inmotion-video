const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge' }),
    page = await browser.newPage();
  await page.goto('http://127.0.0.1:4173/river-run/');
  const base64 = await page.evaluate(async () => {
    const html = await (await fetch('index.html')).text();
    const sources = JSON.parse(html.match(/var IMGSRC=(.*);/)[1]),
      parts = JSON.parse(html.match(/var PARTS=(.*);/)[1]);
    const makePuppet = new Function(
      html.slice(
        html.indexOf('function makePuppet('),
        html.indexOf('// ---------- settings'),
      ) + ';return makePuppet',
    )();
    const load = async (src) => {
      const im = new Image();
      im.src = src;
      await im.decode();
      return im;
    };
    const original = {};
    for (const [n, s] of Object.entries(sources)) original[n] = await load(s);
    const puppets = [makePuppet(original, parts, { imgScale: 0.5 })];
    for (const id of ['race', 'trail', 'winter']) {
      const art = {};
      for (const n of Object.keys(original))
        art[n] = await load(
          'artwork/' +
            id +
            '/' +
            n +
            ((id === 'race' && n === 'shorts') ||
            (id === 'trail' && (n === 'shorts' || n === 'torso'))
              ? '-v2'
              : '') +
            '.png',
        );
      puppets.push(
        makePuppet(fitRiverOutfit(art, original, id), parts, { imgScale: 0.5 }),
      );
    }
    const c = document.createElement('canvas');
    c.width = 1440;
    c.height = 660;
    document.body.replaceChildren(c);
    const x = c.getContext('2d');
    function frame(t) {
      x.fillStyle = '#0e1a2e';
      x.fillRect(0, 0, c.width, c.height);
      x.strokeStyle = '#2e9bad';
      x.beginPath();
      x.moveTo(0, 600);
      x.lineTo(1440, 600);
      x.stroke();
      puppets.forEach((p, i) => {
        p.draw(x, t, 180 + i * 360, 600, 0.43);
        x.fillStyle = '#f6f4ef';
        x.font = '24px Arial';
        x.textAlign = 'center';
        x.fillText(
          ['Original Tristan', 'Race day', 'Trail runner', 'Cold weather'][i],
          180 + i * 360,
          640,
        );
      });
    }
    frame(0);
    const stream = c.captureStream(30),
      rec = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 5000000,
      }),
      chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise((resolve) => {
      rec.onstop = resolve;
    });
    rec.start();
    await new Promise((resolve) => {
      let start;
      function tick(now) {
        if (!start) start = now;
        let t = (now - start) / 1000;
        frame(t);
        if (t < 5) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
    rec.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
    });
  });
  fs.writeFileSync(
    'river-run/artwork/outfit-motion-review.webm',
    Buffer.from(base64, 'base64'),
  );
  await browser.close();
  console.log('Saved five-second synchronized outfit comparison.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
