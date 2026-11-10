// Every tool page carries the shared Studio bar and a standard title, so each
// one gets home the same way. A new tool folder fails here until it is in the
// registry (shared/tool-registry.mjs) and includes the bar
// (see shared/studio-bar.mjs for the three lines to add).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import {
  studioPages,
  pageName,
  pageTitle,
  TOOLS,
} from '../shared/tool-registry.mjs';

// Pages that deliberately have no Studio bar, with the reason.
const EXEMPT = {
  'spot-it/': 'unlinked prototype; Asset Animator uses its artwork',
};

const pages = studioPages();
const flat = (s) => s.replace(/\s+/g, ' ');
const unescape = (s) => s.replaceAll('&amp;', '&').replaceAll('&lt;', '<');

function files(dir) {
  return ['index.html', 'template.html']
    .map((f) => dir + f)
    .filter((f) => existsSync(f));
}

test('every registered page has a name', () => {
  for (const { dir, name } of pages) assert.ok(name, dir + ' has no name');
  for (const tool of TOOLS) assert.equal(pageName(tool.href), tool.name);
});

test('every page folder is registered or listed as exempt', () => {
  const known = new Set(pages.map((p) => p.dir));
  for (const d of readdirSync('.', { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('.') || d.name === 'node_modules')
      continue;
    const dir = d.name + '/';
    if (!existsSync(dir + 'index.html')) continue;
    assert.ok(
      known.has(dir) || dir in EXEMPT,
      `${dir}index.html is a page but isn't in shared/tool-registry.mjs. Register it so it gets the Studio bar, or add it to EXEMPT with a reason.`,
    );
  }
});

for (const { dir, name } of pages) {
  for (const file of files(dir)) {
    test(`${file}: Studio bar, title, no old back link`, () => {
      const html = flat(readFileSync(file, 'utf8'));
      assert.equal(
        (html.match(/<tim-studio-bar\b/g) || []).length,
        1,
        'exactly one <tim-studio-bar>',
      );
      assert.match(html, /href="\.\.\/shared\/studio-bar\.css(?:\?v=[0-9a-f]+)?"/, 'bar stylesheet');
      assert.match(
        html,
        /<script type="module" src="\.\.\/shared\/studio-bar\.mjs(?:\?v=[0-9a-f]+)?"><\/script>/,
        'bar script',
      );
      const title = html.match(/<title\b[^>]*>\s*([^<]*?)\s*<\/title\s*>/);
      assert.ok(title, 'has a <title>');
      assert.equal(unescape(title[1]), pageTitle(name));
      const back = [
        ...html.matchAll(
          /<a\b(?![^>]*class="logo")[^>]*\bhref="\.\.\/(?:index\.html)?"[^>]*>\s*(?:←[^<]*|All tools)\s*<\/a\s*>/g,
        ),
      ].map((m) => m[0]);
      assert.deepEqual(back, [], 'old per-tool back links are replaced by the bar');
    });
  }
}
