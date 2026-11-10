// Adds a content version (?v=<hash>) to every local CSS and script reference,
// so a phone never mixes a new page with old cached files after an update.
// GitHub Pages lets browsers keep files for up to 10 minutes; a versioned URL
// is a different URL, so a changed file is always fetched fresh, and an
// unchanged file keeps its version and stays cached.
//
// A file's version is a hash of its own content after its references are
// stamped, so a change to a shared module also changes the version of every
// file that imports it, up to the page. Every reference to the same file gets
// the same URL, so modules are still loaded once.
//
//   node tools/stamp-assets.mjs           rewrite references in place
//   node tools/stamp-assets.mjs --check   exit 1 if any reference is out of date
//
// Run by `npm run build`; `npm test` runs the check.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, extname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'tests', 'tools', 'artifacts', 'docs']);
const TEXT = new Set(['.html', '.css', '.js', '.mjs']);
const ASSET = /\.(?:css|js|mjs)$/;
const SCAN_LIMIT = 400_000; // large built script bundles have no local references
// Page generators hold page markup in strings; their output is stamped
// instead, so they are never rewritten. Node-only scripts are skipped too.
const GENERATORS = new Set(['dashboard-preview/render.mjs', 'dashboard-preview/build.mjs']);

// Each pattern captures: 1 prefix (kept), 2 quote, 3 path, 4 old ?v= (dropped).
const PATTERNS = [
  // <link href="..."> and <script src="...">
  /(\b(?:src|href)=)(["'])([^"'?#\s]+?\.(?:css|js|mjs))(\?v=[\w.-]+)?\2/g,
  // import x from '...'; export { x } from '...'; import '...';
  /(\b(?:from|import)\s*)(["'])(\.{0,2}\/[^"'?#\s]+?\.(?:js|mjs))(\?v=[\w.-]+)?\2/g,
  // import('...')
  /(\bimport\s*\(\s*)(["'])(\.{0,2}\/[^"'?#\s]+?\.(?:js|mjs))(\?v=[\w.-]+)?\2/g,
  // new Worker('...') and new URL('...', import.meta.url)
  /(\bnew\s+(?:Worker|URL)\s*\(\s*)(["'])([^"'?#\s:]+?\.(?:js|mjs))(\?v=[\w.-]+)?\2/g,
];

function listFiles(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) listFiles(join(dir, entry.name), out);
    } else if (TEXT.has(extname(entry.name))) out.push(join(dir, entry.name));
  }
  return out;
}

const original = new Map();
const stamped = new Map();
const versions = new Map();
const visiting = new Set();

function read(file) {
  if (!original.has(file)) original.set(file, readFileSync(file, 'utf8'));
  return original.get(file);
}

function target(fromFile, path) {
  if (/^(?:[a-z]+:|\/\/)/i.test(path) || path.startsWith('/')) return null;
  const file = resolve(dirname(fromFile), path);
  if (!file.startsWith(ROOT + '/') || !existsSync(file) || !statSync(file).isFile()) return null;
  return ASSET.test(file) ? file : null;
}

function stamp(file) {
  if (stamped.has(file)) return stamped.get(file);
  const text = read(file);
  if (
    (text.length > SCAN_LIMIT && !file.endsWith('.html')) ||
    GENERATORS.has(relative(ROOT, file)) ||
    /\bfrom\s*['"]node:/.test(text)
  ) {
    stamped.set(file, text);
    return text;
  }
  visiting.add(file);
  let out = text;
  for (const pattern of PATTERNS)
    out = out.replace(pattern, (whole, prefix, quote, path) => {
      const dep = target(file, path);
      if (!dep) return whole;
      // A file mentioning itself (usually a usage comment) is left unversioned.
      if (dep === file) return prefix + quote + path + quote;
      return prefix + quote + path + '?v=' + version(dep) + quote;
    });
  visiting.delete(file);
  stamped.set(file, out);
  return out;
}

function version(file) {
  if (versions.has(file)) return versions.get(file);
  // A cycle (two modules importing each other) uses the unstamped content; the
  // two sides could then load twice, so say so.
  if (visiting.has(file)) console.warn('Import cycle through ' + relative(ROOT, file));
  const content = visiting.has(file)
    ? read(file).replace(/\?v=[0-9a-f]+/g, '')
    : stamp(file);
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 8);
  if (!visiting.has(file)) versions.set(file, hash);
  return hash;
}

const check = process.argv.includes('--check');
const stale = [];
for (const file of listFiles()) {
  const next = stamp(file);
  if (next !== read(file)) {
    stale.push(relative(ROOT, file));
    if (!check) writeFileSync(file, next);
  }
}
if (check && stale.length) {
  console.error(
    'Asset versions are out of date in ' + stale.length + ' file(s): ' + stale.slice(0, 8).join(', ') +
      (stale.length > 8 ? ', …' : '') + '\nRun: node tools/stamp-assets.mjs (or npm run build)',
  );
  process.exit(1);
}
console.log(check ? 'Asset versions are current.' : 'Stamped asset versions in ' + stale.length + ' file(s).');
