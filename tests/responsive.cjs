const { launchBrowser, server } = require('./browser-utils.cjs');
(async () => {
  const { TOOLS, DASHBOARD_GROUPS } = await import('../shared/tool-registry.mjs');
  const routes = ['', ...new Set([...TOOLS.map(t => t.href), ...DASHBOARD_GROUPS.map(g => g.href)])];
  const http = server();
  await new Promise(resolve => http.on('listening', resolve));
  const browser = await launchBrowser();
  let failures = 0;
  try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let current = '';
    page.on('pageerror', e => { failures++; console.log(width, current || '/', 'page error', e.message); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    for (const route of routes) {
      current = route;
      await page.goto(`http://127.0.0.1:${http.address().port}/` + route, { waitUntil: 'load' });
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
        if (small.length) { failures++; console.log(width, route || '/', 'small touch targets', JSON.stringify(small.slice(0, 8))); }
      }
      if ([390, 1440].includes(width) && ['', 'title-maker/', 'carousel-maker/'].includes(route)) {
        await page.screenshot({ path: `${require('os').tmpdir()}/responsive-${width}-${route.replace('/', '') || 'home'}.png`, fullPage: true });
      }
    }
    await page.close();
  }
  console.log(`${failures} page checks failed (page errors, sideways scroll or touch targets)`);
  process.exitCode = failures ? 1 : 0;
  } finally { await browser.close(); http.close(); }
})();
