const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  server,
  launchBrowser,
  artifactDirectory,
} = require('./browser-utils.cjs');
const IDEA_KEY = 'tim-idea-vault-v1';
const PLAN_KEY = 'tim-content-planner-v1';

(async () => {
  const http = server();
  await new Promise((r) => (http.listening ? r() : http.once('listening', r)));
  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ acceptDownloads: true });
    // No real Google account or Drive writes are involved.
    await context.route('https://accounts.google.com/**', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: '' }),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('dialog', (d) => d.accept());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const artifacts = artifactDirectory('content-studio');
    const base = `http://127.0.0.1:${http.address().port}`;
    const select = (mode) => page.locator(`a[data-mode="${mode}"]`).click();
    await page.goto(base + '/content-studio/');
    const planner = page.frameLocator('iframe[data-editor="planner"]');
    await planner.locator('#from-idea').waitFor();
    assert.equal(await planner.locator('#from-idea').isDisabled(), true);
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), PLAN_KEY),
      null,
      'Opening does not create a project',
    );

    await select('ideas');
    const ideas = page.frameLocator('iframe[data-editor="ideas"]');
    await ideas
      .locator('#capture input[name="title"]')
      .fill('First merged workflow');
    await ideas
      .locator('#capture textarea[name="notes"]')
      .fill('Opening hook\nB-roll: Shoes\nGear: Microphone');
    await ideas.locator('#capture button[type="submit"]').click();
    const ideaId = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).ideas[0].id,
      IDEA_KEY,
    );
    await ideas.locator('#results article button').first().click();
    await ideas
      .locator('#e-notes')
      .fill('Opening hook updated\nB-roll: Shoes\nGear: Microphone');
    await select('videos');
    assert.match(await page.locator('#status').textContent(), /Save or close/);
    assert.equal(
      await ideas.locator('#e-notes').inputValue(),
      'Opening hook updated\nB-roll: Shoes\nGear: Microphone',
    );
    await ideas.locator('#save').click();
    await select('videos');
    await planner.locator('#ideas').selectOption(ideaId);
    await planner.locator('#from-idea').click();
    assert.equal(
      await planner.locator('#title').inputValue(),
      'First merged workflow',
    );
    assert.match(
      await planner.locator('#outline').inputValue(),
      /hook updated/,
    );
    await planner.locator('#from-idea').click();
    assert.equal(
      await planner.locator('.card').count(),
      1,
      'Repeated promotion opens the same project',
    );

    await select('shoot');
    assert.equal(
      await page.locator('iframe').count(),
      2,
      'Videos and Shoot share one planner instance',
    );
    assert.equal(await planner.locator('#shoot').isVisible(), true);
    await planner.locator('#generate').click();
    await planner.locator('#generate').click();
    assert.equal(await planner.locator('.item').count(), 3);
    await planner.locator('#film').click();
    await planner.locator('#film-notes').fill('Use take 2');
    await planner.locator('[data-result="captured"]').click();
    await select('ideas');
    assert.match(await page.locator('#status').textContent(), /Exit filming/);
    await planner.locator('#exit-film').click();
    await select('videos');
    await planner.locator('#stage').selectOption('Scheduled');
    await planner.locator('#publishDate').fill('2099-12-31');
    await select('ideas');
    await ideas.locator('#results article button').first().click();
    assert.equal(await ideas.locator('#e-status').inputValue(), 'Scheduled');
    assert.equal(await ideas.locator('#e-due').inputValue(), '2099-12-31');
    await ideas.locator('#e-status').selectOption('Editing');
    await ideas.locator('#e-due').fill('2099-11-30');
    await ideas.locator('#save').click();
    await select('videos');
    await planner.locator('#stage').evaluate(async (el) => {
      while (el.value !== 'Edit') await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(
      await planner.locator('#publishDate').inputValue(),
      '2099-11-30',
    );
    await select('shoot');
    assert.equal(
      await planner.locator('.item').first().locator('textarea').inputValue(),
      'Use take 2',
    );
    assert.equal(
      await planner
        .locator('.item')
        .first()
        .getByLabel('Capture status')
        .inputValue(),
      'captured',
    );

    // Legacy backup formats still contain their original data, including checklist notes.
    const [planDownload] = await Promise.all([
      page.waitForEvent('download'),
      planner.locator('#export').click(),
    ]);
    const planBackup = await fs.readFile(await planDownload.path());
    const saved = JSON.parse(planBackup).projects;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].items[0].notes, 'Use take 2');
    await select('ideas');
    const [ideaDownload] = await Promise.all([
      page.waitForEvent('download'),
      ideas.locator('#export').click(),
    ]);
    const ideaBackup = await fs.readFile(await ideaDownload.path());
    assert.equal(JSON.parse(ideaBackup).ideas[0].id, ideaId);
    // Quick-capture drafts remain in memory while switching views.
    await ideas.locator('#capture input[name="title"]').fill('Not saved yet');
    await select('videos');
    await select('ideas');
    assert.equal(
      await ideas.locator('#capture input[name="title"]').inputValue(),
      'Not saved yet',
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ['ideas', 'videos', 'shoot']) {
        await select(mode);
        assert.ok(
          (await page.locator('body > header').boundingBox()).y >= 0,
          'Workspace navigation stays visible',
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        const editor = mode === 'ideas' ? ideas : planner;
        assert.ok(
          await editor
            .locator('body')
            .evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        );
        await page.screenshot({
          path: path.join(artifacts, `${mode}-${width}.png`),
        });
      }
      await planner.locator('#film').click();
      const dialog = await planner.locator('#filming').boundingBox();
      const host = await page
        .locator('iframe[data-editor="planner"]')
        .boundingBox();
      assert.ok(
        dialog.y >= host.y &&
          dialog.y + dialog.height <= host.y + host.height + 1,
        'Filming dialog stays within the visible workspace',
      );
      await planner.locator('#exit-film').click();
    }
    // An explicit project link restores its shoot view after reload.
    await page.goto(
      base +
        '/content-studio/?project=' +
        encodeURIComponent(saved[0].id) +
        '#shoot',
    );
    const restored = page.frameLocator('iframe[data-editor="planner"]');
    await restored.locator('#shoot').waitFor();
    assert.equal(
      await restored.locator('.item').first().locator('textarea').inputValue(),
      'Use take 2',
    );
    // Original pages can import the same backups on a fresh device.
    const fresh = await browser.newContext();
    const original = await fresh.newPage();
    original.on('dialog', (d) => d.accept());
    await original.goto(base + '/content-planner/');
    await original.locator('#import').setInputFiles({
      name: 'plans.json',
      mimeType: 'application/json',
      buffer: planBackup,
    });
    await original.locator('.card').first().click();
    await original.locator('[data-tab="shoot"]').click();
    assert.equal(
      await original.locator('.item').first().locator('textarea').inputValue(),
      'Use take 2',
    );
    await original.goto(base + '/idea-vault/');
    await original.locator('#importfile').setInputFiles({
      name: 'ideas.json',
      mimeType: 'application/json',
      buffer: ideaBackup,
    });
    await original.locator('#results article').waitFor();
    assert.match(
      await original.locator('#results').textContent(),
      /First merged workflow/,
    );
    await fresh.close();

    // Bad idea storage is never overwritten by the host, and promotion stays unavailable.
    await page.evaluate(
      (key) => localStorage.setItem(key, '{broken'),
      IDEA_KEY,
    );
    await page.goto(base + '/content-studio/#videos');
    const corrupt = page.frameLocator('iframe[data-editor="planner"]');
    await corrupt.locator('#from-idea').waitFor();
    assert.equal(await corrupt.locator('#from-idea').isDisabled(), true);
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), IDEA_KEY),
      '{broken',
    );
    await page.evaluate(
      (key) => localStorage.setItem(key, '{unreadable plans'),
      PLAN_KEY,
    );
    await page.goto(base + '/content-studio/#shoot');
    const badPlans = page.frameLocator('iframe[data-editor="planner"]');
    await badPlans.locator('#new').click();
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), PLAN_KEY),
      '{unreadable plans',
    );
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const fallback = await noJs.newPage();
    await fallback.goto(base + '/content-studio/');
    await fallback.locator('a[data-mode="shoot"]').click();
    assert.match(fallback.url(), /\/shoot-planner\/$/);
    await noJs.close();
    assert.deepEqual(errors, []);
    console.log(
      'Content Studio passed: capture/promote without duplicates, two-way stage/date updates, filming notes/guards, original backups, corrupt-data protection, mobile and fallback.',
    );
  } finally {
    await browser?.close();
    http.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
