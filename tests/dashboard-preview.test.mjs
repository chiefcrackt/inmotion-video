import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import {
  TOOLS,
  WORKSPACES,
  DASHBOARD_GROUPS,
  dashboardEntries,
  searchDashboard,
  getTool,
} from '../shared/tool-registry.mjs';
import { renderDashboard, renderHomepage } from '../dashboard-preview/render.mjs';
const read = (path) =>
  readFileSync(new URL('../' + path, import.meta.url), 'utf8');
// Pages carry asset versions (tools/stamp-assets.mjs); compare without them.
const unversioned = (text) => text.replace(/\?v=[0-9a-f]+/g, '');

test('live homepage uses consolidated studios and root-relative assets and original links', () => {
  const html = renderHomepage();
  assert.equal(unversioned(read('index.html').replaceAll('\r\n', '\n')), html);
  assert.ok(!html.includes('href="../'));
  assert.ok(!html.includes('Dashboard preview'));
  assert.ok(html.includes('src="dashboard-preview/app.mjs"'));
  assert.ok(html.includes('href="dashboard-preview/style.css"'));
  for (const tool of TOOLS) assert.ok(html.includes(`href="${tool.href}"`));
  for (const entry of dashboardEntries()) assert.ok(html.includes(`href="${entry.href}"`));
});

test('every original tool remains reachable exactly once through the preview grouping', () => {
  const entries = dashboardEntries();
  const originals = entries.flatMap((entry) =>
    entry.originals.map((tool) => tool.id),
  );
  assert.deepEqual([...originals].sort(), TOOLS.map((tool) => tool.id).sort());
  assert.equal(new Set(originals).size, originals.length);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  assert.ok(entries.length < TOOLS.length);
  for (const entry of entries) {
    assert.ok(
      existsSync(new URL('../' + entry.href + 'index.html', import.meta.url)),
      entry.href,
    );
    assert.ok(
      entry.workspaces.every((id) =>
        WORKSPACES.some((workspace) => workspace.id === id),
      ),
    );
  }
});
test('studio shortcuts resolve only to supported modes, keeping canonical original routes unchanged', () => {
  for (const group of DASHBOARD_GROUPS) {
    if (!group.modes) continue;
    assert.equal(group.modes.length, group.members.length);
    const script = read(group.href + 'studio.js');
    const markup = read(group.href + 'index.html');
    for (const [index, mode] of group.modes.entries()) {
      if (!mode) continue;
      assert.match(script, new RegExp('\\b' + mode + ':'));
      assert.ok(
        (script + markup).includes('../' + getTool(group.members[index]).href),
      );
    }
  }
  assert.equal(getTool('content-planner').href, 'content-planner/');
  assert.equal(getTool('title-maker').href, 'title-maker/');
  assert.equal(getTool('asset-studio').href, 'asset-studio/');
});
test('search finds studios by original names and supports workspace filtering without mutating tools', () => {
  const original = JSON.stringify(TOOLS);
  assert.deepEqual(
    searchDashboard('title maker').map((entry) => entry.id),
    ['text-and-titles'],
  );
  assert.deepEqual(
    searchDashboard('birthday').map((entry) => entry.id),
    ['celebration-studio'],
  );
  assert.deepEqual(
    searchDashboard('idea vault').map((entry) => entry.id),
    ['content-studio'],
  );
  assert.deepEqual(
    searchDashboard('running shoe').map((entry) => entry.id),
    [],
  );
  assert.deepEqual(
    searchDashboard('', { workspace: 'audio' })
      .map((entry) => entry.id)
      .sort(),
    ['beat-bed', 'clean-voice', 'sound-forge', 'transcribe-video', 'voiceover'],
  );
  assert.deepEqual(
    searchDashboard('sound forge', { workspace: 'running' }),
    [],
  );
  assert.equal(JSON.stringify(TOOLS), original);
});
test('generated no-JavaScript page stays in sync and retains every original fallback link', () => {
  const expected = renderDashboard();
  assert.equal(
    unversioned(read('dashboard-preview/index.html').replaceAll('\r\n', '\n')),
    expected,
  );
  for (const tool of TOOLS)
    assert.ok(expected.includes(`href="../${tool.href}"`), tool.href);
  assert.match(expected, /class="finder"[^>]*hidden/);
  assert.match(expected, /<details id="originals">/);
  assert.ok(
    !expected.includes('data-entry="title-maker"'),
    'original titles are grouped on primary cards',
  );
});
test('actual dashboard handler filters cards, exposes empty results and resets accessibly', () => {
  const element = (extra = {}) => ({
    hidden: false,
    textContent: '',
    value: '',
    events: {},
    attrs: {},
    addEventListener(name, handler) {
      this.events[name] = handler;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    focus() {
      this.focused = true;
    },
    ...extra,
  });
  const cards = dashboardEntries().map((entry) =>
    element({ dataset: { entry: entry.id } }),
  );
  const filters = ['all', ...WORKSPACES.map((workspace) => workspace.id)].map(
    (id) => element({ dataset: { workspace: id } }),
  );
  const elements = Object.fromEntries(
    ['query', 'count', 'empty', 'reset'].map((id) => [id, element()]),
  );
  const finder = element({ hidden: true });
  const document = {
    getElementById: (id) => elements[id],
    querySelector: () => finder,
    querySelectorAll: (selector) =>
      selector === '[data-entry]' ? cards : filters,
  };
  const context = { document, dashboardEntries, searchDashboard };
  vm.createContext(context);
  vm.runInContext(
    read('dashboard-preview/app.mjs').replace(/^import[\s\S]*?;\s*/, ''),
    context,
  );
  assert.equal(finder.hidden, false);
  elements.query.value = 'birthday';
  elements.query.events.input();
  assert.deepEqual(
    cards.filter((card) => !card.hidden).map((card) => card.dataset.entry),
    ['celebration-studio'],
  );
  elements.query.value = 'zzqxv';
  elements.query.events.input();
  assert.equal(elements.empty.hidden, false);
  elements.reset.events.click();
  assert.equal(elements.query.value, '');
  assert.equal(elements.query.focused, true);
  assert.equal(
    cards.filter((card) => !card.hidden).length,
    dashboardEntries().length,
  );
  filters.find((filter) => filter.dataset.workspace === 'audio').events.click();
  assert.deepEqual(
    cards
      .filter((card) => !card.hidden)
      .map((card) => card.dataset.entry)
      .sort(),
    ['beat-bed', 'clean-voice', 'sound-forge', 'transcribe-video', 'voiceover'],
  );
});
