import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A script that wires up an element the page does not have stops at that line,
// and every control set up after it silently does nothing. Unit tests never load
// the page, so check the static ids here.
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

function missingIds(htmlPath, scriptPath) {
  const html = read(htmlPath);
  const script = read(scriptPath);
  const declared = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  // Ids the script creates itself are fine.
  for (const m of script.matchAll(/\.id\s*=\s*['"]([^'"]+)['"]/g)) declared.add(m[1]);
  const used = new Set([...script.matchAll(/\$\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]));
  return [...used].filter((id) => !declared.has(id)).sort();
}

test('every element Content Planner wires up exists on its page', () => {
  assert.deepEqual(missingIds('content-planner/index.html', 'content-planner/app.mjs'), []);
});
