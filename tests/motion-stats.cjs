const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { launchBrowser, server, artifactDirectory } = require('./browser-utils.cjs');
(async () => {
  const { assets } = await import('../motion-stats/assets.mjs');
  const { getTool, toolsInWorkspace } = await import('../shared/tool-registry.mjs');
  const manifest = JSON.parse(await readFile(path.join(__dirname, '../motion-stats/files/manifest.json'), 'utf8'));
  assert.equal(assets.length, 24); assert.equal(new Set(assets.map(a=>a.id)).size,24);
  assert.equal(assets.reduce((n,a)=>n+a.layers.length,0),68);
  for(const category of ['panels','pointers','motion','callouts'])assert.equal(assets.filter(a=>a.category===category).length,6);
  assert.equal(getTool('motion-stats').href,'motion-stats/');assert(toolsInWorkspace('library').some(t=>t.id==='motion-stats'));
  const srv=server();await new Promise(r=>srv.listening?r():srv.once('listening',r));
  const browser=await launchBrowser(),base='http://127.0.0.1:'+srv.address().port,out=artifactDirectory('motion-stats');
  try {
    const page=await browser.newPage({acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.locator('#q').fill('movable');await page.locator('a[href="motion-stats/"]').click();
    assert.equal(await page.locator('.card').count(),24);
    for(const a of manifest.assets){
      for(const area of a.textSafeAreas)assert(area[0]>=0&&area[1]>=0&&area[0]+area[2]<=a.width&&area[1]+area[3]<=a.height);
      const result=await page.evaluate(async a=>{
        const get=async src=>{const im=new Image();im.src='files/'+src;await im.decode();return im;};
        const composed=await get(a.png),c=document.createElement('canvas');c.width=composed.width;c.height=composed.height;
        const x=c.getContext('2d');x.drawImage(composed,0,0);const expected=x.getImageData(0,0,c.width,c.height).data;
        let filled=0,edge=0;for(let y=0;y<c.height;y++)for(let xx=0;xx<c.width;xx++){if(expected[(y*c.width+xx)*4+3]){filled++;if(y===0||xx===0||y===c.height-1||xx===c.width-1)edge++;}}
        x.clearRect(0,0,c.width,c.height);
        for(const layer of a.layers){const im=await get(layer.svg);if(im.width!==c.width||im.height!==c.height)throw Error('Layer canvas mismatch');x.drawImage(im,0,0);}
        const actual=x.getImageData(0,0,c.width,c.height).data;let diff=0;for(let i=0;i<actual.length;i++)diff+=Math.abs(actual[i]-expected[i]);
        return {width:c.width,height:c.height,filled,edge,meanDifference:diff/actual.length};
      },a);
      assert.equal(result.width,a.pngWidth);assert.equal(result.height,a.pngHeight);assert(result.filled>500&&result.filled<result.width*result.height*.95,a.id+' contains visible transparent artwork');assert.equal(result.edge,0,a.id+' has unclipped bounds');assert(result.meanDifference<1,a.id+' aligned layers reconstruct the composition');
      const source=await (await page.request.get(base+'/motion-stats/files/svg/'+a.id+'.svg')).text();assert(!/<(?:text|script|image|foreignObject)\b/.test(source));
    }
    for(const category of ['Panels','Pointers','Motion','Callouts']){await page.getByRole('button',{name:category,exact:true}).click();assert.equal(await page.locator('.card:visible').count(),6);}
    await page.getByRole('button',{name:'All',exact:true}).click();
    await page.locator('#animate').click();assert.equal(await page.locator('#assets img').first().getAttribute('src'),'files/animated/stat-card.svg');
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('#animate').getAttribute('aria-pressed')==='false');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('#backdrop').click();assert.equal(await page.locator('#assets').getAttribute('class'),'grid light');
    for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' has no overflow');}
    await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
    for(const selector of ['.download','a[href="files/png/stat-card.png"]','a[href="files/svg/stat-card.svg"]','a[href="files/animated/stat-card.svg"]']){
      const [dl]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);const chunks=[];for await(const chunk of await dl.createReadStream())chunks.push(chunk);const expected=await readFile(path.join(__dirname,'../motion-stats',await page.locator(selector).getAttribute('href')));assert(Buffer.concat(chunks).equals(expected));
    }
    await page.goto(base+'/motion-stats/files/animated/route-pin.svg');
    const first=await page.locator('#pin').evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(450);const next=await page.locator('#pin').evaluate(el=>getComputedStyle(el).transform);assert.notEqual(first,next,'animated SVG actually moves');
    await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#pin').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.goto(base+'/downloads/');await page.locator('#motion-stats a[aria-label]').click();assert.equal(new URL(page.url()).pathname,'/motion-stats/');assert.deepEqual(errors,[]);
    const noJS=await browser.newContext({javaScriptEnabled:false});const p=await noJS.newPage();await p.goto(base+'/motion-stats/');assert.equal(await p.locator('.card').count(),24);assert.equal(await p.locator('a[href$=".png"]').count(),24);await noJS.close();
    console.log('Motion + Stats passed: all 24 composites, 68 aligned layers, alpha/bounds, actual SVG animation, reduced motion, downloads, filters, mobile/desktop and static access.');
  }finally{await browser.close();srv.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
