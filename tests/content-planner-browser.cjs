const assert = require('node:assert/strict');
const {
  server,
  launchBrowser,
  artifactDirectory,
} = require('./browser-utils.cjs');
const path = require('node:path');
(async () => {
  const srv = server();
  await new Promise((r) => (srv.listening ? r() : srv.once('listening', r)));
  const browser = await launchBrowser();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const base = 'http://127.0.0.1:' + srv.address().port;
  const artifacts = artifactDirectory('planner');
  try {
    // Homepage navigation is covered by tests/hub.mjs.
    await page.goto(base + '/content-planner/');
    await page.evaluate(() =>
      localStorage.setItem(
        'tim-idea-vault-v1',
        JSON.stringify({
          version: 1,
          ideas: [
            {
              id: 'idea1',
              title: 'Vault idea',
              notes: 'Opening',
              docUrl: 'https://docs.google.com/document/d/test/edit',
              status: 'Developing',
            },
          ],
        }),
      ),
    );
    await page.reload();
    await page.locator('#ideas').selectOption('idea1');
    await page.locator('#from-idea').click();
    assert.equal(await page.locator('#title').inputValue(), 'Vault idea');
    assert.equal(await page.locator('#stage').inputValue(), 'Outline');
    await page.locator('#from-idea').click();
    assert.equal(await page.locator('.card').count(), 1);
    await page.locator('#new').click();
    await page.locator('#title').fill('Race day');
    await page.locator('#stage').selectOption('Film');
    await page.locator('#publishDate').fill('2026-11-10');
    await page
      .locator('#outline')
      .fill('Opening hook\nB-roll: Shoes\nGear: Microphone\nLocation: Track');
    const id = new URL(page.url()).hash;
    await page.locator('[data-tab="shoot"]').click();
    await page.locator('#generate').click();
    assert.equal(await page.locator('.item').count(), 4);
    await page.locator('#generate').click();
    assert.equal(await page.locator('.item').count(), 4);
    await page.locator('#film').click();
    await page.locator('#film-notes').fill('Take 2');
    await page.locator('[data-result="captured"]').click();
    assert.equal(await page.locator('#film-text').textContent(), 'Shoes');
    await page.locator('[data-result="retake"]').click();
    await page.locator('#exit-film').click();
    await page.waitForFunction(() =>
      document.querySelector('#progress').textContent.startsWith('1 / 4'),
    );
    await page.reload();
    await page.locator('[data-tab="shoot"]').click();
    assert.equal(
      await page.locator('.item').first().locator('textarea').inputValue(),
      'Take 2',
    );
    assert.equal(
      await page
        .locator('.item')
        .first()
        .getByLabel('Capture status')
        .inputValue(),
      'captured',
    );
    await page.locator('[data-tab="assets"]').click();
    await page.locator('#footageUrl').fill('javascript:alert(1)');
    assert.equal(await page.locator('#asset-links a').count(), 0);
    await page.locator('#footageUrl').fill('https://example.com/footage');
    await page
      .getByRole('link', { name: 'Open footage', exact: true })
      .waitFor();
    await page
      .locator('#tools')
      .getByRole('link', { name: 'Title Maker', exact: true })
      .click();
    await page.locator('#tim-projects').evaluate((e) => (e.open = true));
    await page.locator('#tim-project-name').fill('Race title');
    await page.locator('#tim-project-save').click();
    await page.waitForFunction(() =>
      document
        .querySelector('#tim-project-status')
        .textContent.includes('Saved a new'),
    );
    await page.getByRole('link', { name: /Back to video project/ }).click();
    await page.locator('[data-tab="assets"]').click();
    await page.locator('#attachments').getByRole('link').waitFor();
    await page.locator('#attachments').getByRole('link').click();
    await page.getByRole('button', { name: 'Load attached snapshot' }).click();
    await page.waitForFunction(() =>
      document
        .querySelector('#tim-project-status')
        .textContent.startsWith('Loaded Race title'),
    );
    await page.goto(base + '/content-planner/' + id);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export').click(),
    ]);
    const stream = await download.createReadStream();
    let backup = '';
    for await (const chunk of stream) backup += chunk;
    assert.equal(
      JSON.parse(backup).projects.find((p) => p.title === 'Race day').title,
      'Race day',
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: path.join(artifacts, 'desktop.png'),
      fullPage: true,
    });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.locator('[data-tab="shoot"]').click();
      await page.locator('#film').click();
      assert(
        await page.evaluate(
          () => document.querySelector('dialog').scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: path.join(artifacts, 'filming-' + width + '.png'),
      });
      await page.locator('#exit-film').click();
    }
    const fresh = await browser.newContext();
    const phone = await fresh.newPage();
    phone.on('dialog', (d) => d.accept());
    await phone.goto(base + '/content-planner/');
    await phone.locator('#import').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backup),
    });
    await phone.locator('#board').getByRole('button', { name: /Race day/ }).first().click();
    await phone.locator('[data-tab="shoot"]').click();
    assert.equal(
      await phone.locator('.item').first().locator('textarea').inputValue(),
      'Take 2',
    );
    await phone.goto(base + '/shoot-planner/' + id);
    await phone.locator('#shoot').waitFor();
    assert.equal(await phone.locator('.item').count(), 4);
    await fresh.close();
    await page.goto(base + '/content-planner/');
    await page.locator('#ideas').selectOption('idea1');
    await page.locator('#from-idea').click();
    await page.locator('#delete').click();
    await page.locator('#from-idea').click();
    assert.equal(await page.locator('#title').inputValue(), 'Vault idea');
    await page.reload();
    assert.equal(await page.locator('.card').count(), 2);
    assert.deepEqual(errors, []);
    console.log(
      'Planner passed: stages, generation, filming, persistence, asset links, snapshot roundtrip, backup transfer, mobile widths.',
    );
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
