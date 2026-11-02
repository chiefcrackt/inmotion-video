const { launchBrowser, server } = require('./browser-utils.cjs');
const assert = require('node:assert/strict');
(async () => {
  const { TOOLS } = await import('../shared/tool-registry.mjs');
  const http = server();
  await new Promise(resolve => http.on('listening', resolve));
  const browser = await launchBrowser();
  let failures = 0;
  try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    for (const route of ['', ...TOOLS.map(t => t.href)]) {
      await page.goto(`http://127.0.0.1:${http.address().port}/` + route);
      await page.locator('link[href$="shared/responsive.css"]').waitFor({ state: 'attached' });
      await page.waitForTimeout(120);
      const result = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        elements: [...document.querySelectorAll('body *')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width && r.right > innerWidth + 2 && getComputedStyle(el).position !== 'absolute' && !el.closest('[hidden]');
        }).slice(0, 5).map(el => el.tagName + '.' + el.className),
      }));
      if (result.overflow > 2) { failures++; console.log(width, route || '/', JSON.stringify(result)); }
      if (width <= 650) {
        const small = await page.locator('button:visible, select:visible, textarea:visible, input[type="text"]:visible').evaluateAll(elements => elements.filter(el => el.getBoundingClientRect().height < 43).map(el => el.id || el.className));
        assert.deepEqual(small, [], `Touch targets at ${width}px on ${route}`);
      }
      if ([390, 1440].includes(width) && ['', 'title-maker/', 'carousel-maker/'].includes(route)) {
        await page.screenshot({ path: `artifacts/responsive-${width}-${route.replace('/', '') || 'home'}.png`, fullPage: true });
      }
      if (!route) {
        assert.equal(await page.locator('a.tool').count(), TOOLS.length);
        await page.locator('[data-chip="running"]').click();
        assert.equal(await page.locator('a.tool').count(), TOOLS.filter(t => t.workspaces.includes('running')).length);
        await page.locator('[data-chip="all"]').click();
        await page.locator('#q').fill('no such tool');
        assert.equal(await page.locator('#empty').isVisible(), true);
        await page.locator('#reset').click();
        assert.equal(await page.locator('a.tool').count(), TOOLS.length);
      }
    }
    await page.close();
  }
  console.log(`${failures} pages with horizontal overflow`);
  process.exitCode = failures ? 1 : 0;
  } finally { await browser.close(); http.close(); }
})();
