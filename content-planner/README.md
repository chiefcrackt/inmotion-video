# Content Planner and Shoot Planner

Open Content Planner from T.IM Studio. Move videos through Idea, Outline, Film, Edit, Scheduled and Published using the Stage field or desktop drag and drop. Each video has an outline, film/publish dates, external asset links and tool snapshots. Start from Idea Vault copies a local idea without editing it; repeating opens the existing project.

Outline lines become talking points. Prefix lines with B-roll:, Gear: or Location: to classify them. Generation is additive and keeps capture status and take notes. External Google Docs links remain references; paste outline text to generate a checklist. Filming mode shows one item at a time with captured, retake and skip controls.

## Saving and sync

Plans save in this browser. Workspace cloud sync in Content Studio (Supabase) keeps plans and ideas in step across devices; concurrent edits keep both versions as a labeled conflict copy, deletions sync as tombstones, and a local before-sync backup is kept under tim-content-before-sync-v1. Export backup and Import backup move everything by file.

Google Drive was removed in November 2026. Drive folder and file links saved by earlier versions still appear under Earlier Drive files on a project, as plain links.

## Verification

Run npm run test:planner. npm test includes the planner and causal-sync unit tests.
