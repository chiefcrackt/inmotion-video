// Browser tests for due dates, checklists and the due-date export (idea-vault/app.js).
// Local only: no Google account, token or network access is needed.
//
// Run: node tests/idea-vault-due-browser.cjs
const assert = require('node:assert/strict');
const { launchBrowser, server } = require('./browser-utils.cjs');

const KEY = 'tim-idea-vault-v1';
const FUTURE = '2099-12-31';
const PAST = '2000-01-01';

function deviceUrl(base) {
  return base + '/idea-vault/index.html';
}

async function openPage(browser, base) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(deviceUrl(base));
  await page.waitForFunction(
    () => document.getElementById('cloudstatus') !== null,
  );
  return { context, page, errors };
}

async function addIdea(page, title) {
  await page.fill('#capture input[name=title]', title);
  await page.click('#capture button[type=submit]');
  await page.waitForFunction(
    (t) =>
      JSON.parse(
        localStorage.getItem('tim-idea-vault-v1') || '{"ideas":[]}',
      ).ideas.some((i) => i.title === t),
    title,
  );
}

function cardFor(page, title) {
  return page.locator('#results article', { hasText: title });
}

async function openIdea(page, title) {
  await cardFor(page, title)
    .locator('button', { hasText: 'Open workspace' })
    .click();
  await page.waitForFunction(() =>
    document.getElementById('editor').classList.contains('open'),
  );
}

async function saveIdea(page) {
  await page.click('#save');
  await page.waitForFunction(
    () => !document.getElementById('editor').classList.contains('open'),
  );
}

async function storedIdea(page, title) {
  return page.evaluate(
    (t) =>
      JSON.parse(localStorage.getItem('tim-idea-vault-v1')).ideas.find(
        (i) => i.title === t,
      ),
    title,
  );
}

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test('a new idea starts with the five default steps', async ({
  browser,
  base,
}) => {
  const { context, page, errors } = await openPage(browser, base);
  await addIdea(page, 'Steps idea');
  const idea = await storedIdea(page, 'Steps idea');
  assert.deepEqual(
    idea.checklist.map((s) => s.text),
    ['Script', 'Shot list', 'Filmed', 'Edited', 'Posted'],
  );
  await openIdea(page, 'Steps idea');
  assert.equal(await page.locator('#e-checklist li').count(), 5);
  assert.equal(await page.locator('#e-step-defaults').isHidden(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('due date and a ticked step show on the card and persist after reload', async ({
  browser,
  base,
}) => {
  const { context, page } = await openPage(browser, base);
  await addIdea(page, 'Due idea');
  await openIdea(page, 'Due idea');
  await page.fill('#e-due', FUTURE);
  await page
    .locator('#e-checklist li')
    .nth(0)
    .locator('input[type=checkbox]')
    .check();
  await saveIdea(page);

  const card = cardFor(page, 'Due idea');
  assert.match(await card.textContent(), /Due Dec 31, 2099/);
  assert.match(await card.textContent(), /1\/5 done/);
  assert.equal(
    await card.locator('small.due.overdue').count(),
    0,
    'a future date is not overdue',
  );

  await page.reload();
  await page.waitForFunction(
    () => document.getElementById('cloudstatus') !== null,
  );
  const idea = await storedIdea(page, 'Due idea');
  assert.equal(idea.dueDate, FUTURE);
  assert.equal(idea.checklist[0].done, true);
  await context.close();
});

test('a past due date is shown as overdue unless the idea is published', async ({
  browser,
  base,
}) => {
  const { context, page } = await openPage(browser, base);
  await addIdea(page, 'Late idea');
  await openIdea(page, 'Late idea');
  await page.fill('#e-due', PAST);
  await saveIdea(page);
  const card = cardFor(page, 'Late idea');
  assert.match(await card.textContent(), /Overdue · Jan 1, 2000/);
  assert.equal(await card.locator('small.due.overdue').count(), 1);

  await openIdea(page, 'Late idea');
  await page.selectOption('#e-status', 'Published');
  await saveIdea(page);
  assert.equal(
    await cardFor(page, 'Late idea').locator('small.due.overdue').count(),
    0,
    'published ideas are not overdue',
  );
  await context.close();
});

test('steps can be added and removed; closing without saving discards the draft', async ({
  browser,
  base,
}) => {
  const { context, page } = await openPage(browser, base);
  await addIdea(page, 'Edit steps');
  await openIdea(page, 'Edit steps');
  await page.fill('#e-step-new', 'Thumbnail');
  await page.press('#e-step-new', 'Enter');
  assert.equal(await page.locator('#e-checklist li').count(), 6);
  await page
    .locator('#e-checklist li')
    .nth(1)
    .locator('button', { hasText: 'Remove' })
    .click();
  assert.equal(await page.locator('#e-checklist li').count(), 5);

  // Discard: close without Save changes.
  await page.click('#close');
  await openIdea(page, 'Edit steps');
  assert.equal(
    await page.locator('#e-checklist li').count(),
    5,
    'the unsaved draft was discarded',
  );

  await page.fill('#e-step-new', 'Thumbnail');
  await page.press('#e-step-new', 'Enter');
  await saveIdea(page);
  const idea = await storedIdea(page, 'Edit steps');
  assert.equal(idea.checklist.length, 6);
  assert.equal(idea.checklist.at(-1).text, 'Thumbnail');
  await context.close();
});

test('an idea saved before checklists existed offers the default steps', async ({
  browser,
  base,
}) => {
  const { context, page } = await openPage(browser, base);
  await addIdea(page, 'Old idea');
  // Simulate an idea saved before this feature: remove its checklist field.
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('tim-idea-vault-v1'));
    data.ideas = data.ideas.map((i) => {
      const { checklist, ...rest } = i;
      return rest;
    });
    localStorage.setItem('tim-idea-vault-v1', JSON.stringify(data));
  });
  await page.reload();
  await page.waitForFunction(
    () => document.getElementById('cloudstatus') !== null,
  );
  await openIdea(page, 'Old idea');
  assert.equal(await page.locator('#e-checklist li').count(), 0);
  assert.equal(await page.locator('#e-step-defaults').isVisible(), true);
  await page.click('#e-step-defaults');
  assert.equal(await page.locator('#e-checklist li').count(), 5);
  await context.close();
});

test('Export due dates downloads a spreadsheet file with titles and dates', async ({
  browser,
  base,
}) => {
  const { context, page } = await openPage(browser, base);
  await addIdea(page, 'Oil Creek, finale');
  await openIdea(page, 'Oil Creek, finale');
  await page.fill('#e-due', FUTURE);
  await saveIdea(page);
  await addIdea(page, '=HYPERLINK("bad")');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-due'),
  ]);
  assert.equal(download.suggestedFilename(), 'tim-idea-vault-due-dates.csv');
  const path = await download.path();
  const fs = require('node:fs');
  const text = fs.readFileSync(path, 'utf8');
  const lines = text.replace(/^﻿/, '').trim().split(/\r\n/);
  assert.equal(lines[0], 'Title,Due date,Status,Platform,Checklist');
  // Dated ideas come first; the undated formula title follows.
  assert.equal(lines[1], '"Oil Creek, finale",2099-12-31,Inbox,YouTube,0/5');
  assert.match(lines[2], /^"'=HYPERLINK/, 'formula title is neutralised');
  await context.close();
});

(async () => {
  const srv = server(0);
  await new Promise((resolve) =>
    srv.listening ? resolve() : srv.once('listening', resolve),
  );
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await launchBrowser();
  let failed = 0;
  try {
    for (const { name, fn } of cases) {
      try {
        await fn({ browser, base });
        console.log('ok   - ' + name);
      } catch (error) {
        failed++;
        console.log(
          'FAIL - ' +
            name +
            '\n       ' +
            error.message.split('\n').slice(0, 6).join('\n       '),
        );
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n${cases.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
