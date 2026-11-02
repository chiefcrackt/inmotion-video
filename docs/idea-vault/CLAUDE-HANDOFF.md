# CLAUDE REVIEW REQUEST — Idea Vault cloud sync conflict

**Priority: P0 data integrity.** Review and repair before importing more Google Docs or shipping further features.

## Reproduction reported by user
- Site: https://chiefcrackt.github.io/inmotion-video/idea-vault/
- User connected via Google Identity Services to Drive appData.
- Created "Idea Vault Sync Test" and saw "Cloud sync complete" (10:03 PM).
- Later saw status "Synced to Google Drive at 10:06:25 PM" but a subsequent action displayed:
  "Remote changed on another device. Export backup and reload to reconcile; no overwrite performed."
- Only one local idea was visible. We have **not confirmed** a second device was modifying it.
- A screenshot shows the warning; no browser console/network trace is available. Do not assume the cause.

## Review scope
1. Inspect `idea-vault/app.js` functions `connect`, `sync`, `findRemote`, `downloadRemote`, and local `persist`; inspect `idea-vault/index.html`.
2. Check Drive file `version` field handling: creation/update metadata, version returned after media upload, numeric/string comparison, token expiry, stale remote versions and overlapping requests.
3. Diagnose why the UI can show a successful previous sync timestamp alongside a new conflict message. Keep cloud status and notification states coherent.
4. Check multi-device merge behavior: current connect code loads entries by ID, may leave locally deleted/archived or stale entries and lose changes. Avoid false conflict resolution.
5. Establish safe concurrency behavior. Drive version preflight alone is NOT atomic compare-and-swap. Consider per-idea files, serialized writes, revision-aware merge, or a backend if necessary. Do not assert atomicity without evidence.
6. Review `feature/idea-vault-drive-import` / PR #29 for interaction with sync (import is additive, needs explicit subsequent sync), but do not merge it before storage is safe.
7. Check OAuth scope boundaries: appData versus optional Drive folder metadata access; never commit access tokens/credentials. Do not broaden scopes silently.
8. Ensure existing user data and the test idea survive migration. Back up before any destructive change.

## Acceptance tests (must run or report blocked)
- First save, sync, reload, reconnect: identical data.
- Consecutive syncs with no changes: no false conflict.
- Save on phone → load on desktop; update on desktop → reconnect phone.
- Concurrent different-idea edits: preserve both or show explicit safe conflict.
- Concurrent same-idea edits: no silent overwrite.
- Network failure mid-upload; token expiry; retry without duplicate items.
- Archive/edit behavior across devices and cloud restores.
- Repeated Google Docs import from PR #29 does not duplicate or overwrite ideas.
- Browser tests with Google Drive API mocked; manual live check noted as pending if unavailable.

## Delivery
Work on a dedicated branch and submit a PR. Include root cause/evidence, migration impact, tests and results, and a rollback plan. Do **not** alter links-inMotion, DNS, or unrelated video tools. Do not merge/deploy untested sync changes. Keep privacy and data preservation ahead of UI polish.

## Existing handoff
The current document also contains broader UI review items; prioritize this sync review first.

---

# Claude handoff — Idea Vault

Status: **ready for review**. Work in a separate branch; do not overwrite Codex changes.

## Scope for Claude
- Review mobile-first layout and accessibility of `idea-vault/index.html`.
- Improve capture UX, empty states, card clarity, pipeline board and editing flow.
- Propose visual polish that follows T.IM navy/teal/gold and local Barlow Condensed fonts.
- Do **not** change Google OAuth, Drive API permissions or conflict logic without a separate security review.
- Add tests for touch/keyboard UX and iPhone-safe layout.

## Contract
- Existing Google Docs are only linked; never update or delete imported source docs.
- The `imports/youtube-outlines.json` list is metadata, not user-private document contents.
- Do not embed credentials or access tokens in GitHub.
- Review `docs/idea-vault/IMPLEMENTATION.md` before editing.
- Update this handoff with files changed, test results and unresolved issues.

---

# Claude review result — sync integrity (branch `fix/idea-vault-sync-integrity`)

## Root cause (evidence from code and reproduction)
1. **Stale status with a fresh conflict message.** On the "Remote changed on another device" path, `#cloudstatus` was never updated, so the last successful "Synced to Google Drive at …" text stayed on screen beside the new warning. Matches the reported screenshot.
2. **Dead-end conflict.** That path refused to proceed and told the user to "reload to reconcile". The reload then reconnected and used `connect()`, which overwrote same-id local entries with cloud copies.
3. **Unsynced edits lost on reload.** The `dirty` flag was memory-only. After a reload, a local edit that was never synced to a copy with the same id was replaced by the older cloud copy with no warning. Reproduced in `tests/idea-vault-browser.cjs` (fails on `main`).
4. **Duplicate workspace files.** `findRemote` took the first `.find` match and listed without a name filter. Two devices creating the file concurrently could leave two copies, and one would be silently ignored.
5. **Import duplicates within one scan.** Drive pagination can repeat an item if the folder changes mid-scan. PR #29 did not dedupe within a batch.

## Changes
- `idea-vault/vault-core.mjs` (new, pure logic): per-idea merge (newer `updatedAt` wins, ties keep local, local-only and cloud-only kept, unparseable entries pass through), duplicate-file refusal, name-filtered workspace query, additive import planner.
- `idea-vault/app.js`: uses the core; durable pending state (`tim-idea-vault-sync-v1`); safety snapshots (`tim-idea-vault-backups-v1`, last 3) written before any merge that changes local data, and the merge aborts if the snapshot cannot be saved; conflicts are merged and uploaded instead of dead-ending; status text is set on every path; unreadable local data is preserved under `tim-idea-vault-unreadable-v1`.
- No change to OAuth client, scopes, Drive permissions, `config.js`, `index.html`, Links in Motion, DNS, or other tools.
- `tests/idea-vault.test.mjs` (25 unit tests), `tests/idea-vault-browser.cjs` (8 browser tests, fake Drive, two devices as separate browser contexts), `package.json` scripts `test:idea-vault` and `test:idea-vault:browser` (unit tests added to `npm test`).

## Test results
- Unit: `node --test tests/idea-vault.test.mjs` → 25 pass, 0 fail.
- Browser (system Chrome, Playwright, fake Drive): 8 pass, 0 fail on the fix. Against `main`'s `app.js`, 6 of 8 fail, including the same-id revert and the dead-end "no overwrite performed" message. Import idempotency passes on both.
- `tests/check-static.mjs` passes. `prettier --check` passes on changed files (global Prettier 3.8.1).
- Not run: `tests/hub.mjs` (needs `@playwright/test`, which the sandbox could not install; it fails identically on the untouched baseline) and live Google sign-in (no real OAuth in this environment).

## Acceptance coverage
- First save, sync, reload, reconnect identical: covered (browser + unit).
- Consecutive syncs, no false conflict: covered.
- Phone save → desktop load → desktop update → phone reconnect: covered by the two-device merge test.
- Concurrent different-idea edits: both preserved (unit).
- Concurrent same-idea edits: newer wins by `updatedAt`, older is never silently applied (unit + browser).
- Duplicate cloud files: refused, nothing modified (browser).
- Network/upload failure: status reports failure and local data is kept (browser). Token expiry and retry-without-duplicates are covered only by reasoning, not by a test.
- Repeated Google Docs import: idempotent, archived cards not resurrected (browser + unit).

## Unresolved issues and remaining risks
- **Not atomic.** Drive `files.update` has no conditional write here. A write by another device between the version check and the upload can still be overwritten. The window is small, but it is not zero. Per-idea files or a transactional backend are the real fix.
- **Clock-dependent merge.** Newer-wins uses each device's `updatedAt`. A device with a wrong clock can make an older edit win.
- **Duplicate files have no UI.** The app refuses to sync and says so, but the user must clean up manually in Drive app data.
- **PR #29 is already merged into `main`.** The handoff asked that it not be merged until data integrity was verified. The API shows it merged (merge commit `1c41a30`, an ancestor of `main`), along with PR #30. I did not revert it. Decision needed: keep it with this fix on top, or revert it until live verification is complete.
- **Scope tension in this document.** The lower "Scope for Claude" section says not to change conflict logic without a security review. The P0 section above asks for exactly that fix. I changed conflict logic only and did not touch OAuth, scopes, or Drive permissions. Please confirm this is acceptable.
- **`drive.metadata.readonly` remains a restricted scope** (see IMPLEMENTATION.md). This PR does not change it.
- **Manual validation still pending** on the published origin with a real test account, per IMPLEMENTATION.md.

## Rollback
Revert the PR's commit. Local data is untouched by the rollback because the storage key `tim-idea-vault-v1` is unchanged. The new keys (`tim-idea-vault-sync-v1`, `tim-idea-vault-backups-v1`, `tim-idea-vault-unreadable-v1`) are ignored by the old code.

## Files changed by this review
`idea-vault/app.js`, `idea-vault/vault-core.mjs` (new), `tests/idea-vault.test.mjs` (new), `tests/idea-vault-browser.cjs` (new), `package.json`, `docs/idea-vault/CLAUDE-HANDOFF.md`, `docs/idea-vault/IMPLEMENTATION.md`.
