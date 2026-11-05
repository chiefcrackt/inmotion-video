# Content Studio

One place for every video, from first idea to published. The board shows
videos by stage (Idea, Outline, Film, Edit, Scheduled, Published). Open a video
to edit its outline, plan its shots, film through them, open the tools for it
and attach saved tool work.

## Data

- Shows nothing until the Supabase cloud sync has finished for the signed-in
  account. Sign in from the Cloud sync panel.
- Ideas and video projects are stored in the same two browser stores the
  sync keeps in step (`tim-idea-vault-v1`, `tim-content-planner-v1`). Edits
  keep both sides in step, so a stage or publish date means the same thing
  everywhere.
- Footage and thumbnails are never stored in the cloud. Saved tool work
  (snapshots) stays in this browser and is attached to a video by id.
- Backups: Export backup writes both stores to one file. Import backup merges
  a file into this device. Older Idea Vault and Content Planner backups import
  too. Due dates export as CSV.

## Old links

`idea-vault/` and `content-planner/` now redirect here. A video id in the old
address (`#idea:<id>` or `?idea=`) opens that video.

## Files

- `index.html`, `studio.css`: page and styles.
- `app.mjs`: board, capture and the detail dialog.
- `store.mjs`: reads and writes the two stores, backups and CSV.
- `video-model.mjs`: pure helpers: stages, progress, filtering, grouping.
- `supabase-sync.mjs`: sign-in and the cloud sync; emits `tim-cloud-synced`.

## Tests

- `node --test tests/content-studio-store.test.mjs tests/content-studio-model.test.mjs`
- `npm run test:content-studio:browser`: signs in with an in-memory Supabase
  stand-in and walks the whole flow at 1440 and 390 px.
