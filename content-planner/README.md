# Content Planner and Shoot Planner

Open Content Planner from T.IM Studio. Move videos through Idea, Outline, Film, Edit, Scheduled and Published using the Stage field or desktop drag and drop. Each video has an outline, film/publish dates, external asset links and tool snapshots. Start from Idea Vault copies a local idea without editing it; repeating opens the existing project.

Outline lines become talking points. Prefix lines with B-roll:, Gear: or Location: to classify them. Generation is additive and keeps capture status and take notes. External Google Docs links remain references; paste outline text to generate a checklist. Filming mode shows one item at a time with captured, retake and skip controls.

## Google Drive

Connect Google Drive once using the existing Idea Vault OAuth/Picker configuration. The account, parent folder and per-project export destination are remembered locally. Returning pages request a token with existing consent and an account hint. Tokens stay in memory. If Google or the browser requires interaction, tap Reconnect Drive; folder selections remain saved. Disconnect stops this connection without revoking Idea Vault's access or deleting Drive files.

Choose a parent folder or let the app create T.IM Studio. Create/open project folder stores a stable folder ID with the account, so project renames do not create another folder. Changing the parent affects new project folders. Assets are ordinary Drive files in the visible project folder; project/checklist sync uses separate app-data files.

Open a creation tool from the project. Project & Google Drive lets you select Download to this device or Save to Google Drive, and Save another version or Update last matching asset. Exports use the existing render output and a resumable upload. Failed uploads retain the generated Blob in the current page for retry or download; leaving the page discards it. Close neither the tab nor the browser during an upload. Local download/share behavior is retained.

Save editable setup to Drive uploads a supported tool's editable JSON. On another device, the project's Drive asset list offers Edit saved setup, followed by Load Drive setup in the tool. Browser-only IndexedDB snapshots are not uploaded automatically.

Plans auto-sync after edits and check Drive on return. Each device owns a separate app-data snapshot; causal clocks prevent older snapshots from rolling back newer changes. Concurrent edits keep both versions, with a labeled conflict copy. Review both and delete the unwanted copy. Deletions sync as tombstones. A local before-sync backup is kept under tim-content-before-sync-v1. No offline page cache or platform publishing integration is included.

## Configuration and verification

Uses idea-vault/config.js (public OAuth client ID, Picker API key and Cloud project number) and its authorized origins. Requests the existing drive.file and drive.appdata scopes; no client secret or refresh token is stored. The Drive API and Google Picker must be enabled for that project.

Run npm run test:planner and npm run test:drive. Drive browser checks use a simulated Google account and do not modify real Drive files. npm test includes the planner and causal-sync unit tests. The real account consent flow still needs verification on the hosted origin.
