const {
  launchBrowser,
  server: startServer,
  artifactDirectory,
} = require('../../tests/browser-utils.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const artifacts = artifactDirectory('carousel-editor');
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
    await page.waitForSelector('.controlGroup');
    await page
      .locator('.controlGroup')
      .evaluateAll((groups) => groups.forEach((group) => (group.open = true)));
    await page.waitForFunction(() => document.querySelector('#newBlank'));
    await page.locator('#newBlank').click();
    await page.locator('[data-add="text"]').click();
    await page.locator('#elText').fill('Movable heading');
    await page.locator('#el_size').fill('72');
    await page.locator('#el_color').fill('#ff0000');
    await page.locator('#undoEdit').click();
    assert.notEqual(await page.locator('#el_color').inputValue(), '#ff0000');
    await page.locator('#redoEdit').click();
    assert.equal(await page.locator('#el_color').inputValue(), '#ff0000');
    await page.locator('#el_x').fill('100');
    await page.locator('#el_y').fill('300');
    const box = page.locator('.elementHit.chosen');
    await box.scrollIntoViewIfNeeded();
    const bounds = await box.boundingBox();
    await page.mouse.move(bounds.x + 30, bounds.y + 30);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 80, bounds.y + 60, { steps: 5 });
    await page.mouse.up();
    assert.ok(Number(await page.locator('#el_x').inputValue()) > 100);
    const before = Number(await page.locator('#el_w').inputValue());
    const handle = await page.locator('.chosen .resizeHandle').boundingBox();
    await page.mouse.move(handle.x + 5, handle.y + 5);
    await page.mouse.down();
    await page.mouse.move(handle.x + 25, handle.y + 15, { steps: 4 });
    await page.mouse.up();
    assert.ok(Number(await page.locator('#el_w').inputValue()) > before);
    await page.locator('#copyElement').click();
    assert.equal(await page.locator('.layer').count(), 2);
    await page.locator('#elText').fill('Second layer');
    await page.locator('#backElement').click();
    await page.locator('#copyStyle').click();
    await page.locator('[data-add="badge"]').click();
    await page.locator('#pasteStyle').click();
    assert.equal(await page.locator('#el_size').inputValue(), '72');
    await page.locator('#saveLayout').click();
    await page.locator('#loadLayout').click();
    assert.equal(await page.locator('.thumb').count(), 7);
    await page.locator('#project').fill('Editor QA');
    await page.locator('#saveProject').click();
    await page.locator('#saveBrand').click();
    await page.locator('#brandBg').fill('#aabbcc');
    await page.locator('#loadBrand').click();
    assert.notEqual(await page.locator('#brandBg').inputValue(), '#aabbcc');
    let pending = page.waitForEvent('download');
    await page.locator('#exportProject').click();
    const file = await pending;
    await file.saveAs(path.join(artifacts, 'editor-project.json'));
    const project = JSON.parse(
      fs.readFileSync(path.join(artifacts, 'editor-project.json')),
    );
    assert.equal(project.slides.at(-2).elements.length, 3);
    await page.reload();
    await page.waitForSelector('.controlGroup');
    await page
      .locator('.controlGroup')
      .evaluateAll((groups) => groups.forEach((group) => (group.open = true)));
    await page.waitForFunction(
      () => document.querySelectorAll('.layer').length === 3,
    );
    assert.equal(await page.locator('#project').inputValue(), 'Editor QA');
    for (const type of ['shape', 'arrow', 'rating', 'chart', 'table'])
      await page.locator(`[data-add="${type}"]`).click();
    await page.locator('#elementPhotoFile').setInputFiles({
      name: 'p.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>',
      ),
    });
    await page.waitForFunction(
      () => document.querySelectorAll('.layer').length === 9,
    );
    await page.getByRole('button', { name: 'Lock photo', exact: true }).click();
    assert.equal(await page.locator('#elText').isDisabled(), true);
    await page
      .getByRole('button', { name: 'Unlock photo', exact: true })
      .click();
    assert.equal(await page.locator('#elText').isDisabled(), false);
    await page.getByRole('button', { name: 'Hide photo', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll('.elementHit').length === 8,
    );
    await page.getByRole('button', { name: 'Show photo', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll('.elementHit').length === 9,
    );
    await page.screenshot({
      path: path.join(artifacts, 'carousel-editor.png'),
      fullPage: true,
    });
    await page.locator('#export').click();
    pending = page.waitForEvent('download');
    await page.locator('#png').click();
    await (await pending).saveAs(path.join(artifacts, 'editor-export.png'));
    await page.locator('#closeDialog').click();
    page.once('dialog', (d) => d.accept());
    await page
      .locator('#importProject')
      .setInputFiles(path.join(artifacts, 'editor-project.json'));
    await page.waitForFunction(
      () => document.querySelectorAll('.layer').length === 3,
    );
    assert.equal(await page.locator('#project').inputValue(), 'Editor QA');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      'Passed: element editing, drag/resize, undo/redo, layers, styles, layouts, projects, brand kit, all element types, photo and PNG export, persistence, mobile.',
    );
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
