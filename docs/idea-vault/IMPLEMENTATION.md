# Idea Vault implementation / setup

Phase 1 implementation on `feature/idea-vault`: browser-side capture, editing, filtering, stage changes, export, and an idempotent reference import from the Google Drive YouTube Outlines folder. Original Docs are not changed.

## Storage
The app caches its working data in localStorage pending Google authorization. Cloud mode uses Google Drive `appDataFolder` with the `drive.appdata` scope; a single `tim-idea-vault-v1.json` file represents the workspace. Google Drive API must be enabled in a Google Cloud project. Browser token acquisition uses Google Identity Services OAuth token client; no client secret is required or allowed in a static frontend. Public OAuth client ID is configured in `idea-vault/config.js` as `window.TIM_IDEA_VAULT_CONFIG = { googleClientId: '...' }`. Create a Web application OAuth client with authorized JavaScript origins including the actual HTTPS domain and (if needed) GitHub Pages origin. Do not commit secrets. Basic link-based importing does not require Drive permission. `drive.appdata` cannot open arbitrary existing Docs; those are linked using their known IDs. New Docs creation requires a later separate `drive.file` authorization and Google Docs API implementation.

## Current limits and next development
- Imported source items are linked metadata only, not copied outline text. PDF duplicate omitted. Reference docs are differentiated from video ideas.
- Cloud mode is intentionally opt-in and not configured yet: needs real Google OAuth client ID. Browser sync only occurs while the page is open and authorized.
- AppData file is reconciled before writing: when the cloud version differs from the last one seen, the cloud copy is merged per idea (newer `updatedAt` wins, ties keep local, nothing is deleted) and a local safety snapshot is saved first. The upload is still **not an atomic compare-and-swap**: a write by another device between the version check and the upload can be overwritten. Do not advertise reliable simultaneous editing; future work should use per-idea files or a transactional backend if concurrent writes become common. Duplicate workspace files are refused rather than picked.
- Local draft is browser-local, and explicit remote conflict must be resolved manually. Export JSON regularly.
- A client OAuth consent screen in Testing can require periodic reauthorization. No refresh tokens or private keys are stored.
- Future: structured sections, rich shot lists, Docs creation via drive.file/Docs, automatic scan of folder using Picker, T.IM tool handoffs, full IndexedDB queue, privacy-safe secured backup.

## Verification
Run existing `npm run test:hub`, `npm run build`, and browser tests. Verify Google auth only after a real configured client ID exists. Avoid claiming cloud or Docs integration tested until authorized end-to-end.


## Folder import / refresh (new)
Open Idea Vault, paste the Google Drive folder URL into **Google Drive outlines folder URL or ID**, and click **Import / Refresh from Drive**. The first use requests a *separate* Google Drive metadata-only read scope (`drive.metadata.readonly`) to enumerate existing Google Docs. This is broader than `drive.appdata`, which can only read the app's own hidden data. The app does not read document bodies, alter the originals, or place document IDs in committed static files. Each imported card links to its original Google Doc and deduplicates using the Google file ID. Reference/segment-bank documents are categorized separately through title heuristics. After import, click **Sync now** to save imported cards into appData cloud storage. Imported notes are blank because we intentionally do not request content access.

**OAuth considerations:** `drive.metadata.readonly` is a restricted Drive scope; Google's authorization warning, testing-user restrictions, and verification requirements may apply. This personal testing build must not be represented as publicly verified. If Google refuses this scope, revisit the design for Google Picker / `drive.file`, which supports user-selected files, or an import via a local JSON export. No permission to modify documents is requested.

**Manual validation:** test on the actual published origin with the test Google account; import twice and confirm no duplicates; verify only Google Docs are included and PDF files ignored; create one new outline in the folder and refresh; save new cards with Sync now; confirm they load on a second device; test rejection of an inaccessible folder and denial of consent. Cloud sync's current remote-version preflight is not atomic and cannot safely merge simultaneous edits.
