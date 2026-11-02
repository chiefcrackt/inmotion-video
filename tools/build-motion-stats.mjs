import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { assets, colors, svg } from '../motion-stats/assets.mjs';
import { zipStore } from '../carousel-maker/model.mjs';
const { launchBrowser } = createRequire(import.meta.url)('../tests/browser-utils.cjs');
const root = fileURLToPath(new URL('../motion-stats/', import.meta.url));
for (const folder of ['files/png', 'files/svg', 'files/animated', 'files/layers']) await mkdir(root+folder,{recursive:true});
const layerCount = assets.reduce((n,a)=>n+a.layers.length,0);
const guide = `T.im / Motion + Stats Kit

24 original reusable graphics in navy #0E1A2E, gold #E8C96A and teal #2E9BAD.
${layerCount} separate movable layers. All PNGs have transparent backgrounds.

CONTENTS
png/ — composed PNGs, at twice the SVG viewBox size (up to 1280 pixels wide).
svg/ — composed SVGs with named groups for editable layers.
animated/ — animated SVG demos; playback needs an SVG animation-capable viewer.
layers/<asset>/ — separate SVG + PNG for each movable part.
manifest.json — dimensions, layer order, pivot points, text-safe areas and hints.
preview.html — open in a browser to see all the animation examples offline.
contact-sheet.png — overview of the 24 designs.

IN CAPCUT / CANVA / YOUR VIDEO EDITOR
Use the composed PNG for a quick overlay. Add your own text on a separate layer.
Panels intentionally have no sample numbers, labels or placeholder text.
For custom motion, import each PNG in a layers/<asset>/ folder at identical size
and centre them together. Each part keeps the full canvas, so they line up.
Animate the parts separately with position, scale, rotation or opacity keyframes.
Pivots in manifest.json use SVG units; multiply by rasterScale (2) for PNG pixels.
For a progress bar, adjust the fill and marker to your actual result. Demos are
decorative examples, not measured progress. SVG animations do not play in all
video editors. Use the PNG layers and your editor's keyframes in that case.

ANIMATION EXAMPLES
The browser examples loop slowly to show how parts can move. They respect the
system reduced-motion preference. Each composed SVG retains the group names;
each separate layer file contains just that piece on the original canvas.
Gold/teal accents need contrast against footage; use a navy backing if needed.
The navy fill inside panels is intentional and is not a full-canvas background.

Original T.im artwork. Reuse and adapt in personal and commercial content.
No attribution required. No third-party logos or fonts are included.
`;
const textSafeAreas = {
  'stat-card':[[64,56,352,92],[64,170,352,28]],
  'stat-pill':[[148,45,270,70]],
  'lower-third':[[72,62,455,64]],
  'split-card':[[48,50,156,120],[276,50,156,120]],
  'result-badge':[[105,86,110,90]],
  'speech-bubble':[[62,68,348,96]],
  'chapter-tab':[[42,48,62,84],[150,50,245,58]],
  podium:[[55,221,82,40],[193,150,94,78],[343,245,82,28]],
};
const manifest = {version:1,name:'T.im Motion + Stats',palette:colors,rasterScale:2,coordinateSystem:'SVG viewBox units, origin top-left; PNG coordinates are multiplied by rasterScale.',layerPNGAvailability:'Layer PNGs are included in the ZIP; individual layer SVGs are also served in files/layers/.',assets:assets.map(a=>({id:a.id,name:a.name,category:a.category,width:a.width,height:a.height,pngWidth:a.width*2,pngHeight:a.height*2,png:`png/${a.id}.png`,svg:`svg/${a.id}.svg`,animated:`animated/${a.id}.svg`,textSafeAreas:textSafeAreas[a.id]||[],hint:a.hint,layers:a.layers.map(l=>({id:l.id,svg:`layers/${a.id}/${l.id}.svg`,pngInArchive:`layers/${a.id}/${l.id}.png`,pivot:l.origin||[a.width/2,a.height/2],suggestedMotion:l.motion}))}))};
const archive=[];
const add=(name,data)=>archive.push({name,data:typeof data==='string'?new TextEncoder().encode(data):data});
const browser=await launchBrowser();
try {
  const page=await browser.newPage();
  async function png(source){return Buffer.from(await page.evaluate(async source=>{
    const im=new Image();im.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(source)));await im.decode();
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);return c.toDataURL('image/png').split(',')[1];
  },source),'base64');}
  for(const a of assets){
    const composed=svg(a), animated=svg(a,{animated:true}), bitmap=await png(composed);
    await writeFile(root+`files/svg/${a.id}.svg`,composed);await writeFile(root+`files/animated/${a.id}.svg`,animated);await writeFile(root+`files/png/${a.id}.png`,bitmap);
    add(`svg/${a.id}.svg`,composed);add(`animated/${a.id}.svg`,animated);add(`png/${a.id}.png`,bitmap);
    await mkdir(root+`files/layers/${a.id}`,{recursive:true});
    for(const l of a.layers){const source=svg(a,{layerId:l.id});await writeFile(root+`files/layers/${a.id}/${l.id}.svg`,source);add(`layers/${a.id}/${l.id}.svg`,source);add(`layers/${a.id}/${l.id}.png`,await png(source));}
  }
  const preview=Buffer.from(await page.evaluate(async entries=>{
    const c=document.createElement('canvas');c.width=1800;c.height=1440;const x=c.getContext('2d');
    x.fillStyle='#0e1a2e';x.fillRect(0,0,1800,1440);x.fillStyle='#e8c96a';x.font='bold 48px Arial';x.fillText('T.im / MOTION + STATS',52,80);x.fillStyle='#f6f4ef';x.font='23px Arial';x.fillText('24 DESIGNS   /   SEPARATE LAYERS   /   SVG + TRANSPARENT PNG',54,125);
    for(let i=0;i<entries.length;i++){
      const a=entries[i],px=48+(i%4)*428,py=170+Math.floor(i/4)*204;
      x.fillStyle='#152b43';x.beginPath();x.roundRect(px,py,410,186,12);x.fill();
      const im=new Image();im.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(a.source)));await im.decode();
      const scale=Math.min(345/im.width,115/im.height);x.drawImage(im,px+(410-im.width*scale)/2,py+12+(115-im.height*scale)/2,im.width*scale,im.height*scale);
      x.fillStyle='#f6f4ef';x.font='bold 19px Arial';x.textAlign='center';x.fillText(a.name,px+205,py+159);x.textAlign='left';
    }return c.toDataURL('image/png').split(',')[1];
  },assets.map(a=>({name:a.name,source:svg(a)}))),'base64');
  await writeFile(root+'preview.png',preview);add('contact-sheet.png',preview);
} finally{await browser.close();}
const manifestJSON=JSON.stringify(manifest,null,2)+'\n';await writeFile(root+'files/manifest.json',manifestJSON);add('manifest.json',manifestJSON);await writeFile(root+'files/READ-ME.txt',guide);add('READ-ME.txt',guide);
const demo=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>T.im Motion + Stats examples</title><style>body{margin:24px;background:#0e1a2e;color:#f6f4ef;font:16px Arial}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}article{background:#152b43;padding:16px;border-radius:10px}img{width:100%;height:160px;object-fit:contain}p{line-height:1.5}h2{font-size:18px}</style><h1>T.im / Motion + Stats</h1><p>Decorative motion examples. Use separate PNG layers and editor keyframes for video. Panels are blank so you can add your own text.</p><main>${assets.map(a=>`<article><img src="animated/${a.id}.svg" alt="${a.name}"><h2>${a.name}</h2><p>${a.hint}</p></article>`).join('')}</main></html>`;
await writeFile(root+'files/preview.html',demo);add('preview.html',demo);
const blob=zipStore(archive);await writeFile(root+'files/TIM_Motion_Stats_Kit.zip',new Uint8Array(await blob.arrayBuffer()));
const cards=assets.map(a=>`<article class="card" data-category="${a.category}"><div class="art"><img src="files/svg/${a.id}.svg" data-static="files/svg/${a.id}.svg" data-animated="files/animated/${a.id}.svg" width="${a.width}" height="${a.height}" alt="${a.name}" loading="lazy"></div><div class="body"><span class="category">${a.category} / ${a.layers.length} layers</span><h2>${a.name}</h2><p>${a.hint}</p><div class="links"><a href="files/png/${a.id}.png" download>PNG</a><a href="files/svg/${a.id}.svg" download>SVG</a><a href="files/animated/${a.id}.svg" download>Animated SVG</a><a href="../asset-studio/?asset=motion:${a.id}">Animate this →</a></div><details><summary>Separate layers</summary><ul>${a.layers.map(l=>`<li><a href="files/layers/${a.id}/${l.id}.svg" download>${l.id.replaceAll('-',' ')} · SVG</a></li>`).join('')}</ul><p>Aligned PNG layers are in the full ZIP.</p></details></div></article>`).join('\n');
const template=await readFile(new URL('../motion-stats/template.html',import.meta.url),'utf8');await writeFile(root+'index.html',template.replace('<!-- CARDS -->',cards).replaceAll('{{LAYERS}}',String(layerCount)));
console.log(`Built ${assets.length} graphics, ${layerCount} aligned SVG/PNG layers, animated SVG demos, manifest, catalog and ${archive.length}-file ZIP.`);
