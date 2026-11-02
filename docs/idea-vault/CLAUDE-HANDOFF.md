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
