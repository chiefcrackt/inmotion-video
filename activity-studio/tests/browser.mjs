import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {server} from '../serve.mjs';
import {gpx,tcx,fitFixture} from './fixtures.mjs';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const http=server(0);await new Promise(r=>http.on('listening',r));const base=`http://127.0.0.1:${http.address().port}`;
let browser;const errors=[],artifacts=mkdtempSync(path.join(tmpdir(),'tim-activity-'));
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.goto(base+'/activity-studio/');
 await page.locator('#file').setInputFiles({name:'synthetic.gpx',mimeType:'application/xml',buffer:Buffer.from(gpx)});await page.waitForFunction(()=>document.querySelector('#importStatus').textContent.startsWith('Loaded'));
 assert.equal(await page.locator('#title').inputValue(),'Synthetic test run');assert.equal(await page.locator('#editor').isDisabled(),false);
 assert.equal(await page.locator('#template option[value=route]').isDisabled(),false);
 assert.equal(await page.locator('#metrics input[value=power]').isDisabled(),true);
 // Capture actual PNG blobs before platform download/share UI.
 await page.evaluate(()=>{navigator.canShare=()=>false;URL.createObjectURL=b=>{window.savedBlob=b;return 'blob:test';};HTMLAnchorElement.prototype.click=function(){};});
 for(const size of ['1920,1080','1080,1920','1080,1350','1080,1080']){
  await page.locator('#size').selectOption(size);await page.locator('#transparent').check();await page.evaluate(()=>window.savedBlob=null);await page.locator('#png').click();await page.waitForFunction(()=>window.savedBlob);
  const result=await page.evaluate(async()=>{const b=window.savedBlob,img=await createImageBitmap(b),c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {width:img.width,height:img.height,alpha:ctx.getImageData(0,0,1,1).data[3],type:b.type};});
  const [w,h]=size.split(',').map(Number);assert.equal(result.width,w);assert.equal(result.height,h);assert.equal(result.alpha,0);assert.equal(result.type,'image/png');
 }
 await page.locator('#transparent').uncheck();await page.locator('#size').selectOption('1920,1080');
 for(const template of ['summary','route','dashboard','elevation']){await page.locator('#template').selectOption(template);await page.locator('#scrub').fill('0.5');await page.screenshot({path:path.join(artifacts,template+'.png'),fullPage:true});}
 // Privacy hides route pixels on the exported render, even when all geometry is masked.
 await page.locator('#template').selectOption('route');await page.locator('#trim').fill('0');const before=await page.locator('#canvas').evaluate(c=>c.toDataURL());await page.locator('#trim').fill('10000');const after=await page.locator('#canvas').evaluate(c=>c.toDataURL());assert.notEqual(before,after);await page.locator('#showRoute').uncheck();assert.equal(await page.locator('#canvas').evaluate(c=>c.toDataURL()),after);await page.locator('#showRoute').check();await page.locator('#trim').fill('0');
 // Mouse repositioning.
 const rect=await page.locator('#canvas').boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+30,rect.y+rect.height/2+15);await page.mouse.up();assert.ok(+(await page.locator('#x').inputValue())>0);
 // Worker must handle FIT and TCX through the actual bundled import path.
 for(const [name,buffer] of [['synthetic.fit',Buffer.from(fitFixture())],['synthetic.tcx',Buffer.from(tcx)]]){await page.locator('#file').setInputFiles({name,mimeType:'application/octet-stream',buffer});await page.waitForFunction(n=>document.querySelector('#importStatus').textContent.startsWith('Loaded '+n),name);}
 await page.locator('#template').selectOption('splits');assert.equal(await page.locator('#lapControl').isVisible(),true);
 await page.locator('#template').selectOption('route');await page.locator('#seconds').fill('3');await page.locator('#video').click();await page.waitForFunction(()=>document.querySelector('#saveVideo').hidden===false,{timeout:15000});
 assert.match(await page.locator('#exportStatus').textContent(),/tim-activity\.(mp4|webm) ready/);await page.locator('#saveVideo').click();
 const video=await page.evaluate(()=>({type:window.savedBlob.type,size:window.savedBlob.size}));assert.ok(video.size>1000);assert.ok(['video/mp4','video/webm'].includes(video.type));
 await page.locator('#video').click();await page.locator('#cancel').click();await page.waitForFunction(()=>document.querySelector('#video').disabled===false);assert.equal(await page.locator('#saveVideo').isVisible(),false);
 // Responsive mobile and touch composition dragging.
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const mp=await mobile.newPage();mp.on('pageerror',e=>errors.push(e.message));await mp.route('https://fonts.googleapis.com/**',r=>r.abort());await mp.goto(base+'/activity-studio/');await mp.locator('#file').setInputFiles({name:'synthetic.gpx',mimeType:'application/xml',buffer:Buffer.from(gpx)});await mp.waitForFunction(()=>document.querySelector('#importStatus').textContent.startsWith('Loaded'));assert.ok(await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mp.locator('#canvas').evaluate(c=>{const r=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:r.x+50,clientY:r.y+50,bubbles:true,pointerType:'touch'}));c.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:r.x+75,clientY:r.y+60,bubbles:true,pointerType:'touch'}));c.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,bubbles:true,pointerType:'touch'}));});
 await mp.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:true});
 // All original tool pages remain reachable and their inline scripts parse.
 for(const tool of ['title-maker','promo-maker','cover-maker','start-line','river-run','mile-marker','special-post','celebrate','downloads']){const response=await page.request.get(base+'/'+tool+'/');assert.equal(response.status(),200);const source=readFileSync(tool+'/index.html','utf8');for(const m of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))if(m[1].trim())new Function(m[1]);}
 assert.deepEqual(errors,[]);console.log('Browser checks passed: worker FIT/GPX/TCX, templates, four PNG dimensions/alpha, privacy pixels, desktop dragging, mobile overflow, video/cancel, and original tool scripts.');console.log('Screenshots: '+artifacts);
}finally{await browser?.close();http.close();}

