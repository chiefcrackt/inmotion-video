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
