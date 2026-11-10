# Content Studio

One place for every video, from first idea to published.

The page opens to **Capture an idea**, then **Next up** (one row per video:
film date and shots left until it reaches Edit, then its publish date, nearest
first), then **Videos by stage**. On a laptop the stages are side-by-side
columns; on a phone only the stages that have videos are listed. Backup and
Cloud sync fold away at the bottom once you are signed in.

Open a video to change its stage (or tap Move to the next stage), dates, notes
and outline; plan its shots and film through them (Retake shots come round
again); open the tools for it; and attach saved tool work. The stage is the
progress tracker: the old five-step production checklist is no longer shown,
though any ticks already saved stay in the data.

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
