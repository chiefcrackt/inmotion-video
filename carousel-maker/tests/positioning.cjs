const {
  launchBrowser,
  server: startServer,
  artifactDirectory,
} = require('../../tests/browser-utils.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const artifacts = artifactDirectory('carousel-positioning');
  const server = startServer();
  await new Promise((r) => server.on('listening', r));
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base + '/carousel-maker/');
    await page.waitForFunction(
      () =>
        document.querySelector('#templateX') &&
        !document.querySelector('#templateX').disabled,
    );
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector('.inspector')
          .lastElementChild.classList.contains('elementPanel'),
      ),
      true,
    );
    await page.locator('#title').fill('Move this headline');
    await page.locator('#moveTemplate').click();
    const box = page.locator('[data-part="headline"]');
    await box.scrollIntoViewIfNeeded();
    const bounds = await box.boundingBox();
    await page.mouse.move(bounds.x + 60, bounds.y + 25);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 80, bounds.y + 60, { steps: 5 });
    await page.mouse.up();
    assert.ok(Number(await page.locator('#templateX').inputValue()) > 0);
    assert.ok(Number(await page.locator('#templateY').inputValue()) > 0);
    await page.locator('#templateX').fill('120');
    await page.locator('#templateY').fill('150');
    await page.locator('#undoEdit').click();
    assert.notEqual(await page.locator('#templateY').inputValue(), '150');
    await page.locator('#redoEdit').click();
    assert.equal(await page.locator('#templateY').inputValue(), '150');
    for (const part of ['eyebrow', 'content', 'highlight', 'footer']) {
      await page.locator('#templatePart').selectOption(part);
      await page.locator('#templateX').fill('40');
      await page.locator('#templateY').fill('-20');
    }
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelector('#templateX') &&
        !document.querySelector('#templateX').disabled,
    );
    assert.equal(await page.locator('#templateX').inputValue(), '120');
    assert.equal(await page.locator('#templateY').inputValue(), '150');
    await page.locator('#duplicate').click();
    assert.equal(await page.locator('#templateX').inputValue(), '120');
    await page.locator('#templatePart').selectOption('footer');
    assert.equal(await page.locator('#templateY').inputValue(), '-20');
    await page.locator('#resetTemplatePart').click();
    assert.equal(await page.locator('#templateY').inputValue(), '0');
    await page.locator('#templatePart').selectOption('headline');
    assert.equal(await page.locator('#templateY').inputValue(), '150');
    await page.locator('#moveTemplate').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-part="headline"]').scrollIntoViewIfNeeded();
    const touchBox = await page.locator('[data-part="headline"]').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    const tx = touchBox.x + 35,
      ty = touchBox.y + 25;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: tx, y: ty }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: tx + 10, y: ty + 30 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForFunction(
      () => Number(document.querySelector('#templateY').value) > 150,
    );
    await page.locator('#export').click();
    let pending = page.waitForEvent('download');
    await page.locator('#png').click();
    await (
      await pending
    ).saveAs(path.join(artifacts, 'template-positioned.png'));
    await page.locator('#closeDialog').click();
    await page.locator('#resetTemplateAll').click();
    assert.equal(await page.locator('#templateY').inputValue(), '0');
    assert.equal(await page.locator('#templateX').inputValue(), '0');
    await page.locator('#layout').selectOption('blank');
    await page.waitForFunction(
      () => document.querySelector('#templateX').disabled,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      'Passed: existing text mouse/touch dragging, numeric offsets for all groups, undo/redo, duplication, reload persistence, reset, mobile, blank layout and PNG export.',
    );
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
