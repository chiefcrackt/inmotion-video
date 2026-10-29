import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, mkdirSync} from 'node:fs';
import {server} from '../activity-studio/serve.mjs';

// Compare against every tool directory, so future additions cannot silently disappear.
const expected = readdirSync('.', {withFileTypes:true}).filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules').filter(d=>{try{return /<title>/.test(readFileSync(`${d.name}/index.html`,'utf8'));}catch{return false;}}).map(d=>d.name+'/').sort();
const http=server(0); await new Promise(r=>http.on('listening',r));
const base=`http://127.0.0.1:${http.address().port}`;
let browser;
try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());
  await page.goto(base);
  const links=await page.locator('a.tool').evaluateAll(cards=>cards.map(c=>c.getAttribute('href')).sort());
  assert.deepEqual(links,expected);
  assert.equal(await page.locator('a.tool:visible').count(),12);
  for(const link of links){
    await page.locator(`a.tool[href="${link}"]`).click();
    assert.equal(new URL(page.url()).pathname,'/'+link);
    assert.equal(await page.locator('h1').count(),1);
    await page.goBack();
  }
  for(const [category,count] of [['video',5],['running',4],['celebrations',2],['downloads',1]]){
    await page.locator(`[data-filter="${category}"]`).click();
    assert.equal(await page.locator('a.tool:visible').count(),count);
  }
  await page.locator('#reset').click();
  await page.locator('#search').fill('GPS route');assert.equal(await page.locator('a.tool:visible').count(),1);
  await page.locator('#search').fill('birthday');assert.equal(await page.locator('a.tool:visible').count(),2);
  await page.locator('#search').fill('no such tool');assert.equal(await page.locator('#empty').isVisible(),true);
  await page.locator('#reset').click();assert.equal(await page.locator('a.tool:visible').count(),12);
  mkdirSync('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/hub-desktop.png',fullPage:true});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('[data-filter="running"]').click();assert.equal(await page.locator('a.tool:visible').count(),4);
    await page.locator('#reset').click();
  }
  await page.screenshot({path:'artifacts/hub-mobile.png',fullPage:true});
  const plain=await browser.newContext({javaScriptEnabled:false});
  const fallback=await plain.newPage();await fallback.goto(base);
  assert.equal(await fallback.locator('a.tool:visible').count(),12);
  assert.equal(await fallback.locator('.finder').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('Hub passed: all 12 tool links and actual navigation, categories, search, reset, mobile widths, and no-JavaScript access.');
} finally {await browser?.close();http.close();}

