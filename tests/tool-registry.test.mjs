// Tests for the T.IM Studio registry and icon set.
// Run: node --test tests/tool-registry.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORKSPACES,
  TOOLS,
  getWorkspace,
  getTool,
  toolsInWorkspace,
  workspaceCounts,
  quickLaunch,
  featuredTool,
  searchTools,
} from '../shared/tool-registry.mjs';
import { ICON_NAMES, iconSvg } from '../shared/icons.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Every registered tool page. Keeping the list here stops a tool from being
// dropped by accident; update it on purpose when a tool is added or retired.
const EXPECTED_HREFS = [
  'activity-studio/', 'asset-studio/', 'beat-bed/', 'before-after/', 'brand-assets/',
  'caption-maker/', 'carousel-maker/', 'celebrate/', 'clean-voice/', 'content-planner/',
  'cover-maker/', 'downloads/', 'goals-maker/', 'icon-pack/', 'idea-vault/', 'mile-marker/',
  'motion-stats/', 'motion-studio/', 'product-spotlight/', 'promo-maker/', 'river-run/',
  'shoot-planner/', 'sound-forge/', 'special-post/', 'start-line/', 'stat-counter/',
  'teleprompter/', 'text-motion/', 'tier-list/', 'title-maker/', 'transcribe-video/',
  'video-framer/', 'weird-motion/',
];

test('the registry contains exactly the existing tools, each with one canonical href', () => {
  assert.deepEqual(TOOLS.map((t) => t.href).sort(), [...EXPECTED_HREFS].sort());
  assert.equal(new Set(TOOLS.map((t) => t.id)).size, TOOLS.length, 'ids are unique');
});

test('every registered href points at a page that exists in the repo', () => {
  for (const tool of TOOLS) {
    const page = join(root, tool.href, 'index.html');
    assert.ok(existsSync(page), tool.href + ' has no index.html');
  }
});

test('tool page titles are unique (no page is labelled with another tool name)', () => {
  const titles = TOOLS.map((t) => {
    const html = readFileSync(join(root, t.href, 'index.html'), 'utf8');
    const match = html.match(/<title[^>]*>\s*([^<]*?)\s*<\/title/);
    return match ? match[1] : '';
  });
  assert.ok(titles.every(Boolean), 'every tool page has a title');
  assert.equal(new Set(titles).size, titles.length, 'titles: ' + titles.join(' | '));
});

test('every tool belongs to at least one known workspace, and workspace ids resolve', () => {
  for (const tool of TOOLS) {
    assert.ok(tool.workspaces.length >= 1, tool.id + ' has a workspace');
    for (const id of tool.workspaces) assert.ok(getWorkspace(id), tool.id + ' → ' + id);
  }
  assert.equal(WORKSPACES.length, 6);
  assert.deepEqual(WORKSPACES.map((w) => w.number), ['01', '02', '03', '04', '05', '06']);
});

test('the spec placements hold: Running Studio and Publishing Studio contents', () => {
  const ids = (ws) => toolsInWorkspace(ws).map((t) => t.id).sort();
  assert.deepEqual(ids('running'), ['activity-studio', 'mile-marker', 'river-run', 'start-line', 'stat-counter']);
  assert.deepEqual(ids('audio'), ['beat-bed', 'clean-voice', 'sound-forge', 'transcribe-video']);
  assert.deepEqual(ids('publishing'), ['before-after', 'brand-assets', 'carousel-maker', 'content-planner', 'cover-maker', 'goals-maker', 'promo-maker', 'tier-list', 'transcribe-video']);
  assert.deepEqual(ids('library'), ['asset-studio', 'brand-assets', 'downloads', 'icon-pack', 'motion-stats', 'product-spotlight', 'weird-motion']);
  assert.deepEqual(ids('plan'), ['content-planner', 'idea-vault', 'shoot-planner', 'teleprompter', 'transcribe-video']);
});

test('counts are derived from the registry, and every tool appears in some workspace', () => {
  const counts = workspaceCounts();
  for (const w of WORKSPACES) assert.equal(counts[w.id], toolsInWorkspace(w.id).length);
  const reachable = new Set(WORKSPACES.flatMap((w) => toolsInWorkspace(w.id).map((t) => t.id)));
  assert.equal(reachable.size, TOOLS.length, 'no orphan tools');
});

test('Content Planner is the flagged tool, and Quick Launch covers the spec shortcuts', () => {
  assert.equal(featuredTool().id, 'content-planner');
  const labels = quickLaunch().map((q) => q.label);
  assert.deepEqual(labels, ['Plan videos', 'New Idea', 'Title Maker', 'Activity', 'Sound', 'Cover', 'Promo']);
});

test('search matches names, keywords and workspace names, case-insensitively', () => {
  assert.deepEqual(searchTools('capcut').map((t) => t.id).sort(), ['downloads', 'video-framer']);
  assert.deepEqual(searchTools('STRAVA').map((t) => t.id), ['activity-studio']);
  assert.deepEqual(searchTools('running studio').map((t) => t.id).sort(), ['activity-studio', 'mile-marker', 'river-run', 'start-line', 'stat-counter']);
  assert.equal(searchTools('').length, TOOLS.length, 'empty query shows everything');
  assert.equal(searchTools('zzqqx').length, 0, 'no match is an empty result');
});

test('search can be limited to one workspace', () => {
  const hits = searchTools('', { workspace: 'audio' }).map((t) => t.id).sort();
  assert.deepEqual(hits, ['beat-bed', 'clean-voice', 'sound-forge', 'transcribe-video']);
  assert.deepEqual(searchTools('sound forge', { workspace: 'publishing' }), []);
});

test('getTool returns null for unknown ids', () => {
  assert.equal(getTool('nope'), null);
  assert.equal(getTool('idea-vault').href, 'idea-vault/');
});

test('every icon named by the registry exists in the icon set', () => {
  const used = [...WORKSPACES.map((w) => w.icon), ...TOOLS.map((t) => t.icon)];
  for (const name of used) assert.ok(ICON_NAMES.includes(name), 'missing icon: ' + name);
});

test('icons are decorative by default, expose a label when asked, and contain no text', () => {
  const decorative = iconSvg('idea');
  assert.match(decorative, /^<svg class="ico" viewBox="0 0 24 24"/);
  assert.match(decorative, /aria-hidden="true"/);
  assert.doesNotMatch(decorative, /<text/i, 'icons never embed text');

  const labelled = iconSvg('shoe', { label: 'Activity Studio' });
  assert.match(labelled, /role="img" aria-label="Activity Studio"/);
  assert.doesNotMatch(labelled, /aria-hidden/);
});

test('icon labels are escaped and unknown icons are rejected', () => {
  assert.match(iconSvg('idea', { label: '<b>"x"&' }), /aria-label="&lt;b&gt;&quot;x&quot;&amp;"/);
  assert.throws(() => iconSvg('missing-icon'), /Unknown icon/);
});
