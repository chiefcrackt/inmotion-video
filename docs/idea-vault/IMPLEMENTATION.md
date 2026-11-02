# Idea Vault implementation / setup

Phase 1 implementation on `feature/idea-vault`: browser-side capture, editing, filtering, stage changes, export, and an idempotent reference import from the Google Drive YouTube Outlines folder. Original Docs are not changed.

## Storage
The app caches its working data in localStorage pending Google authorization. Cloud mode uses Google Drive `appDataFolder` with the `drive.appdata` scope; a single `tim-idea-vault-v1.json` file represents the workspace. Google Drive API must be enabled in a Google Cloud project. Browser token acquisition uses Google Identity Services OAuth token client; no client secret is required or allowed in a static frontend. Public OAuth client ID is configured in `idea-vault/config.js` as `window.TIM_IDEA_VAULT_CONFIG = { googleClientId: '...' }`. Create a Web application OAuth client with authorized JavaScript origins including the actual HTTPS domain and (if needed) GitHub Pages origin. Do not commit secrets. Basic link-based importing does not require Drive permission. `drive.appdata` cannot open arbitrary existing Docs; those are linked using their known IDs. New Docs creation requires a later separate `drive.file` authorization and Google Docs API implementation.

## Current limits and next development
- Imported source items are linked metadata only, not copied outline text. PDF duplicate omitted. Reference docs are differentiated from video ideas.
- Cloud mode is intentionally opt-in and not configured yet: needs real Google OAuth client ID. Browser sync only occurs while the page is open and authorized.
- AppData file uses Drive file metadata version preflight before writing, and rejects a stale remote version. This is **not an atomic compare-and-swap**. Do not advertise reliable simultaneous editing; future work should use per-idea files or a transactional backend if concurrent writes become common.
- Local draft is browser-local, and explicit remote conflict must be resolved manually. Export JSON regularly.
- A client OAuth consent screen in Testing can require periodic reauthorization. No refresh tokens or private keys are stored.
- Future: structured sections, rich shot lists, Docs creation via drive.file/Docs, automatic scan of folder using Picker, T.IM tool handoffs, full IndexedDB queue, privacy-safe secured backup.

## Verification
Run existing `npm run test:hub`, `npm run build`, and browser tests. Verify Google auth only after a real configured client ID exists. Avoid claiming cloud or Docs integration tested until authorized end-to-end.
