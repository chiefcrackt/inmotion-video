# Idea Vault implementation / setup

Phase 1 implementation on `feature/idea-vault`: browser-side capture, editing, filtering, stage changes, export, and an idempotent reference import from the Google Drive YouTube Outlines folder. Original Docs are not changed.

## Storage
The app caches its working data in localStorage pending Google authorization. Cloud mode uses Google Drive `appDataFolder` with the `drive.appdata` scope; a single `tim-idea-vault-v1.json` file represents the workspace. Google Drive API must be enabled in a Google Cloud project. Browser token acquisition uses Google Identity Services OAuth token client; no client secret is required or allowed in a static frontend. Public OAuth client ID is configured in `idea-vault/config.js` as `window.TIM_IDEA_VAULT_CONFIG = { googleClientId: '...' }`. Create a Web application OAuth client with authorized JavaScript origins including the actual HTTPS domain and (if needed) GitHub Pages origin. Do not commit secrets. Basic link-based importing does not require Drive permission. `drive.appdata` cannot open arbitrary existing Docs; those are linked using their known IDs. New Docs creation requires a later separate `drive.file` authorization and Google Docs API implementation.

## Current limits and next development
- Imported source items are linked metadata only, not copied outline text. PDF duplicate omitted. Reference docs are differentiated from video ideas.
- Cloud mode is intentionally opt-in and not configured yet: needs real Google OAuth client ID. Browser sync only occurs while the page is open and authorized.
- AppData sync model (per idea): every edit gets a unique `revision` token; each device keeps a `base` of the revision it last synced. If only one side changed since base, that side is kept. If both changed, the local idea stays, the cloud copy is kept as a **Conflict copy** (`conflictOf`), and the user chooses which to keep in the editor. Clock time (`updatedAt`) never decides a conflict. Sync uploads only when there are pending local changes or no cloud file exists, so repeated syncs do not bump the Drive version. Duplicate workspace files are refused rather than picked.
- Local draft is browser-local, and explicit remote conflict must be resolved manually. Export JSON regularly.
- A client OAuth consent screen in Testing can require periodic reauthorization. No refresh tokens or private keys are stored.
- Future: structured sections, rich shot lists, Docs creation via drive.file/Docs, automatic scan of folder using Picker, T.IM tool handoffs, full IndexedDB queue, privacy-safe secured backup.

## Concurrency limits (read before relying on sync)
- **Not an atomic compare-and-swap.** Drive `files.update` is used without a conditional write. A write by another device between the reconcile read and the upload can still be overwritten. The window is small but not zero. Per-idea Drive files or a transactional backend would remove it.
- **Conflicts are manual.** Both versions are kept, but resolution is a user choice ("Use this version" / "Keep original"). Nothing is merged field by field.
- **Base is per device.** If a device's sync state is cleared, every differing idea becomes a conflict copy on the next connect. This is safe but noisy.
- **Legacy data** (ideas saved before revisions existed) has no revision. Identical copies merge silently; differing copies become conflict copies.
- **Deletes are archives.** No hard delete is propagated. Archived ideas stay in the file.
- **Whole-file uploads.** The single `tim-idea-vault-v1.json` is re-uploaded in full whenever there are pending changes, so very large libraries will grow the upload size.
- **Residual clock issue.** Clock time is used only for display order, not for conflicts.

## Tests
- `npm run test:idea-vault` runs the unit tests (`node --test`) for merge, revisions, conflict resolution, and import rules.
- `npm run test:idea-vault:browser` runs the browser tests against a fake Google Drive with two devices in separate browser contexts. It needs Chrome (`CHROME_PATH`) and Playwright.

## Verification
Run existing `npm run test:hub`, `npm run build`, and browser tests. Verify Google auth only after a real configured client ID exists. Avoid claiming cloud or Docs integration tested until authorized end-to-end.


## Folder import / refresh (new)
Open Idea Vault, paste the Google Drive folder URL into **Google Drive outlines folder URL or ID**, and click **Import / Refresh from Drive**. The first use requests a *separate* Google Drive metadata-only read scope (`drive.metadata.readonly`) to enumerate existing Google Docs. This is broader than `drive.appdata`, which can only read the app's own hidden data. The app does not read document bodies, alter the originals, or place document IDs in committed static files. Each imported card links to its original Google Doc and deduplicates using the Google file ID. Reference/segment-bank documents are categorized separately through title heuristics. After import, click **Sync now** to save imported cards into appData cloud storage. Imported notes are blank because we intentionally do not request content access.

**OAuth considerations:** `drive.metadata.readonly` is a restricted Drive scope; Google's authorization warning, testing-user restrictions, and verification requirements may apply. This personal testing build must not be represented as publicly verified. If Google refuses this scope, revisit the design for Google Picker / `drive.file`, which supports user-selected files, or an import via a local JSON export. No permission to modify documents is requested.

**Manual validation:** test on the actual published origin with the test Google account; import twice and confirm no duplicates; verify only Google Docs are included and PDF files ignored; create one new outline in the folder and refresh; save new cards with Sync now; confirm they load on a second device; test rejection of an inaccessible folder and denial of consent. Cloud sync's current remote-version preflight is not atomic and cannot safely merge simultaneous edits.

## Read-only Google Docs viewer
Each imported card with a linked Google Doc has an **Imported Google Doc · read-only** section in its editor. **Show document** (then **Refresh document**) reads the document through the Google Docs API (`documents.get`) and shows headings, paragraphs, bullet and numbered lists, checklists, simple tables, and links. Production notes are a separate editable field; the document content is never written into them.

**Read-only by construction.** The only request is a `GET` to `https://docs.googleapis.com/v1/documents/{id}`. The viewer never calls Drive or the Docs write methods, and it stores nothing: document content and the access token live in memory only, not in localStorage, not in the ideas file, and not in the repository. Text is rendered with `textContent`; only `http(s)` links are kept.

**Authorization (minimum practical scope).** The viewer requests `https://www.googleapis.com/auth/drive.file`, a non-sensitive scope that grants access only to files the user selects. Selection happens in **Google Picker**, opened with the document preselected. Flow:
1. The first press asks for `drive.file` consent (token kept in memory until about a minute before expiry).
2. The Docs API request is made. If Google refuses it (403/404, because the file has not been granted to this app), the Picker opens with the document preselected. Confirming it grants access, and the request is retried once.
3. Expired authorization (401) clears the in-memory token and asks the user to press Refresh document again.

The existing `drive.metadata.readonly` import scope and `drive.appdata` sync scope are unchanged.

**Failure handling.** Each case shows a message in the status line: expired authorization, Picker closed without a choice, document not found or not granted, rate limit (429), Google outage (5xx), network failure, and unreadable response. A failed refresh keeps the last loaded content on screen and says when that version was loaded.

### Google Cloud configuration (required before the viewer works)
In the same Google Cloud project as the OAuth client:
1. **Enable APIs:** Google Docs API and Google Picker API.
2. **OAuth consent screen:** add the scope `.../auth/drive.file` (non-sensitive). Keep `drive.appdata` and `drive.metadata.readonly` as they are.
3. **Create a browser API key** (APIs & Services → Credentials). Restrict it: *Application restrictions* → HTTP referrers, listing the GitHub Pages origin (`https://chiefcrackt.github.io/*`) and `http://localhost/*` for local testing. *API restrictions* → Google Picker API only.
4. **Put public identifiers in `idea-vault/config.js`:**
   - `pickerApiKey`: the restricted browser key above.
   - `cloudProjectNumber`: the numeric project number (not the project ID). It is passed to Picker as `appId`.
   Neither value is a secret, but do not add OAuth client secrets, tokens, or document content to this file. Without both values the viewer shows "needs Google Picker setup" and reads nothing.
5. The OAuth client's authorized JavaScript origins must already include the origin the app runs on (unchanged from the existing setup).

### Tests
- `npm run test:idea-vault:docs`: unit tests for document parsing (headings, paragraphs, bullet, numbered and nested, roman and alpha numbering, checklists, safe and unsafe links, inline image and footnote placeholders, tables, empty documents), request-URL validation, and HTTP status classification.
- `npm run test:idea-vault:docs:browser`: fake Docs API, Google Identity Services, and Picker, at 390×844. Covers the Picker grant and retry, rendering and formatting, no horizontal overflow, 44px touch target, script-like text as plain text, read-only behavior (only GET requests, no Drive calls, no change to ideas or notes, no new storage keys), refresh, failed refresh keeping prior content, expired authorization and recovery, Picker cancelled and recovery, network failure and retry, missing Picker configuration, and idea cards without a linked doc.

### Not verified live (must check before relying on it)
The tests use fakes. These behaviors are unverified against real Google services and must be checked on the published origin with a test account:
- `documents.get` returns the document for a token whose only file access comes from a Picker `drive.file` grant. This is the core assumption; if Google refuses it, the viewer will keep showing the Picker prompt.
- Picker opens with the document preselected and reports `PICKED`/`CANCEL` as the code expects.
- Checklist state: the Docs API exposes checkbox symbols but checked state may be limited; the viewer shows open boxes unless a checked symbol is present.
- Real-device check on iPhone Safari (scroll inside the document panel, touch targets).
