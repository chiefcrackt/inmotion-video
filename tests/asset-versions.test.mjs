// Every local CSS/script reference carries the current content version, so a
// phone never mixes a new page with old cached files. Fix with: npm run build
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('asset versions are current (run npm run build if this fails)', () => {
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ['tools/stamp-assets.mjs', '--check'], { stdio: 'pipe' }),
  );
});
