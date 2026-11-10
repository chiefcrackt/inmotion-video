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

// Content Studio loads only after a cloud sync, so sign in with an in-memory
// Supabase stand-in. No network or real account is used.
const fakeSupabase = `
const user = { id: 'test-user' };
const ok = { error: null, data: [{ revision: 1 }] };
const query = {
  select() { return this; },
  eq() { return this; },
  maybeSingle: async () => ({ data: null, error: null }),
  insert: async () => ok,
  update() { return { eq() { return this; }, select: async () => ok }; },
};
export function createClient() {
  return {
    auth: {
      onAuthStateChange(callback) {
        setTimeout(() => callback('SIGNED_IN', { user }), 0);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signOut: async () => ({ error: null }),
      signInWithOtp: async () => ({ error: null }),
    },
    from(table) {
      if (table === 'entitlements')
        return { ...query, maybeSingle: async () => ({ data: { product: 'content-studio' }, error: null }) };
      return query;
    },
  };
}
`;

async function signedInContext(browser) {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route(
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.1/+esm',
    (r) => r.fulfill({ contentType: 'text/javascript', body: fakeSupabase }),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('dialog', (d) => d.accept());
  return { context, page };
}

// Playwright's fill() does not fire "change"; the page saves on change.
async function commit(locator, value) {
  await locator.fill(value);
  await locator.dispatchEvent('change');
}

(async () => {
  const http = server();
  await new Promise((r) => (http.listening ? r() : http.once('listening', r)));
  let browser;
  const contexts = [];
  try {
    browser = await launchBrowser();
    const base = `http://127.0.0.1:${http.address().port}`;
    const artifacts = artifactDirectory('content-studio');
    const main = await signedInContext(browser);
    contexts.push(main.context);
    const { page } = main;
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // Nothing shows until the cloud sync has finished.
    await page.goto(base + '/content-studio/');
    await page.locator('#app').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#waiting').isVisible(), false);

    // Capture an idea.
    await page.locator('#capture input[name="title"]').fill('First merged workflow');
    await page
      .locator('#capture textarea[name="notes"]')
      .fill('Opening hook\nB-roll: Shoes\nGear: Microphone');
    await page.locator('#capture select[name="platform"]').selectOption('TikTok');
    await page.locator('#capture button[type="submit"]').click();
    const card = page.locator('#board button.card', { hasText: 'First merged workflow' });
    await card.waitFor();
    const ideaId = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).ideas[0].id,
      IDEA_KEY,
    );
    assert.equal(await page.locator('#board .column', { hasText: 'Idea · 1' }).count(), 1);

    // Open the video and move it to Outline: both stores agree.
    await card.click();
    await page.locator('#detail[open]').waitFor();
    assert.equal(await page.locator('#d-title').inputValue(), 'First merged workflow');
    await page.locator('#d-stage').selectOption('Outline');
    const outlined = await page.evaluate(
      ([i, p]) => ({
        idea: JSON.parse(localStorage.getItem(i)).ideas[0].status,
        project: JSON.parse(localStorage.getItem(p)).projects[0],
      }),
      [IDEA_KEY, PLAN_KEY],
    );
    assert.equal(outlined.idea, 'Developing');
    assert.equal(outlined.project.id, 'idea:' + ideaId);
    assert.equal(outlined.project.stage, 'Outline');
    assert.equal(
      outlined.project.outline,
      'Opening hook\nB-roll: Shoes\nGear: Microphone',
      'the outline starts from the notes',
    );

    // Outline to shots: generated once, shown as shots.
    await commit(page.locator('#d-outline'), 'Opening hook updated\nB-roll: Shoes\nGear: Microphone');
    await page.locator('#tab-shoot').click();
    await page.locator('#d-generate').click();
    await page.locator('#d-shots li.shot').first().waitFor();
    assert.equal(await page.locator('#d-shots li.shot').count(), 3);
    await page.locator('#d-generate').click();
    assert.equal(await page.locator('#d-shots li.shot').count(), 3, 'generation is additive');

    // Film through the pending shots and record a result.
    await page.locator('#d-film-start').click();
    await page.locator('#d-filming').waitFor({ state: 'visible' });
    assert.match(await page.locator('#d-film-count').textContent(), /Shot 1 of 3/);
    await commit(page.locator('#d-film-notes'), 'Use take 2');
    await page.locator('[data-result="captured"]').click();
    assert.match(await page.locator('#d-film-count').textContent(), /Shot 2 of 3/);
    await page.locator('[data-result="retake"]').click();
    await page.locator('#d-film-exit').click();
    assert.equal(await page.locator('#d-filming').isVisible(), false);
    // A retake comes round again next time, with the shots not yet filmed.
    await page.locator('#d-film-start').click();
    assert.match(await page.locator('#d-film-count').textContent(), /Shot 1 of 2/);
    await page.locator('#d-film-exit').click();
    const firstShot = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).projects[0].items[0],
      PLAN_KEY,
    );
    assert.equal(firstShot.status, 'captured');
    assert.equal(firstShot.notes, 'Use take 2');

    // The publish date is one fact shared by the idea and the project.
    await page.locator('#tab-outline').click();
    await commit(page.locator('#d-publish'), '2099-11-30');
    const dated = await page.evaluate(
      ([i, p]) => ({
        due: JSON.parse(localStorage.getItem(i)).ideas[0].dueDate,
        publish: JSON.parse(localStorage.getItem(p)).projects[0].publishDate,
      }),
      [IDEA_KEY, PLAN_KEY],
    );
    assert.deepEqual(dated, { due: '2099-11-30', publish: '2099-11-30' });

    // The stage tracks progress; there is no separate production checklist.
    assert.equal(await page.locator('#d-steps, #d-step-form').count(), 0);
    const stageBefore = await page.locator('#d-stage').inputValue();
    await page.locator('#d-advance').click();
    assert.notEqual(await page.locator('#d-stage').inputValue(), stageBefore, 'Move to next stage advances the stage');
    assert.equal(
      await page.evaluate((p) => JSON.parse(localStorage.getItem(p)).projects[0].stage, PLAN_KEY),
      await page.locator('#d-stage').inputValue(),
    );

    // Next up lists the video once, with its publish date.
    await page.keyboard.press('Escape');
    const nextRows = page.locator('#next-up-list button', { hasText: 'First merged workflow' });
    assert.equal(await nextRows.count(), 1);
    await nextRows.click();
    await page.locator('#detail[open]').waitFor();

    // Tools open for this video, carrying its id.
    await page.locator('#tab-assets').click();
    const toolHref = await page.locator('#d-tools a').first().getAttribute('href');
    assert.match(toolHref, /\?videoProject=/);

    // Reopening with the id in the address opens that video.
    await page.goto(base + '/content-studio/?videoProject=' + encodeURIComponent(ideaId));
    await page.locator('#detail[open]').waitFor();
    assert.equal(await page.locator('#d-title').inputValue(), 'First merged workflow');
    await page.keyboard.press('Escape');

    // Old links still open the right place.
    await page.goto(base + '/idea-vault/');
    await page.waitForURL(/\/content-studio\//);
    await page.goto(base + '/content-planner/#' + encodeURIComponent('idea:' + ideaId));
    await page.waitForURL(/\/content-studio\/\?videoProject=/);
    await page.locator('#detail[open]').waitFor();
    await page.keyboard.press('Escape');

    // Backup downloads both stores as one file (from the folded Backup panel).
    await page.locator('#backup summary').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export-backup').click(),
    ]);
    const backupText = await fs.readFile(await download.path(), 'utf8');
    const backup = JSON.parse(backupText);
    assert.equal(backup.format, 'tim-content-studio');
    assert.equal(backup.ideas[0].id, ideaId);
    assert.equal(backup.projects[0].items.length, 3);

    // Restore on a fresh device; importing again does not duplicate.
    const fresh = await signedInContext(browser);
    contexts.push(fresh.context);
    const device = fresh.page;
    device.on('pageerror', (e) => errors.push(e.message));
    await device.goto(base + '/content-studio/');
    await device.locator('#app').waitFor({ state: 'visible' });
    const importOnce = async () =>
      device.locator('#import-backup').setInputFiles({
        name: 'backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(backupText),
      });
    await importOnce();
    await device.locator('#board button.card', { hasText: 'First merged workflow' }).waitFor();
    assert.match(await device.locator('#status').textContent(), /Imported 1 ideas and 1 projects/);
    await importOnce();
    await device.waitForFunction(() => document.getElementById('status').textContent.startsWith('Imported'));
    assert.equal(await device.locator('#board button.card').count(), 1);
    assert.equal(
      await device.evaluate((key) => JSON.parse(localStorage.getItem(key)).ideas.length, IDEA_KEY),
      1,
    );

    // Unreadable local data blocks loading and is never overwritten.
    const corrupt = await signedInContext(browser);
    contexts.push(corrupt.context);
    await corrupt.page.goto(base + '/content-studio/');
    await corrupt.page.evaluate((key) => localStorage.setItem(key, '{broken'), IDEA_KEY);
    await corrupt.page.goto(base + '/content-studio/');
    await corrupt.page.locator('#studio-sync [role="status"]').filter({ hasText: /Cloud sync:/ }).waitFor();
    assert.equal(await corrupt.page.locator('#app').isVisible(), false);
    assert.equal(
      await corrupt.page.evaluate((key) => localStorage.getItem(key), IDEA_KEY),
      '{broken',
    );

    // Desktop: the board and the detail dialog.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base + '/content-studio/');
    await page.locator('#board button.card', { hasText: 'First merged workflow' }).click();
    await page.locator('#detail[open]').waitFor();
    await page.screenshot({ path: path.join(artifacts, 'detail-1440.png') });
    await page.keyboard.press('Escape');

    // Phone width: capture first, then Next up, then only the stages with
    // videos; no sideways page scroll; the detail sheet fits.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/content-studio/');
    await page.locator('#board').waitFor();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'no sideways page scroll at 390px',
    );
    const order = await page.evaluate(() =>
      ['capture', 'next-up', 'board'].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().top)),
    );
    assert.ok(order[0] < order[1] && order[1] < order[2], 'capture, then Next up, then videos: ' + order);
    assert.ok(order[0] < 300, 'capture starts on the first screen (top ' + order[0] + ')');
    assert.equal(await page.locator('#board .column:visible').count(), 1, 'only stages with videos are listed');
    assert.equal(await page.locator('#studio-sync').evaluate((el) => el.open), false, 'cloud sync folds away once synced');
    await page.screenshot({ path: path.join(artifacts, 'board-390.png') });
    await page.locator('#board button.card', { hasText: 'First merged workflow' }).click();
    await page.locator('#detail[open]').waitFor();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'the detail sheet fits 390px',
    );
    await page.screenshot({ path: path.join(artifacts, 'detail-390.png') });

    assert.deepEqual(errors, []);
    console.log(
      'Content Studio passed: cloud-gated loading, capture, stage and date sync between stores, outline to shots, filming, tools, old links, backup and restore, corrupt-data protection, phone width.',
    );
  } finally {
    for (const c of contexts) await c.close().catch(() => {});
    await browser?.close();
    http.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
