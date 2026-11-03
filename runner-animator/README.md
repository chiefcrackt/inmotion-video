# Runner Animator preview

Open `/runner-animator/` locally after `npm run preview`. `#start` opens Start
Line; `#run` opens Running scenes. The combined entry point retains the original
Start Line and River Run editors in persistent same-origin frames.

Start Line keeps its approach/countdown/takeoff sequence, direction, line label,
numbers and footstep sound. Running scenes keeps River Run's scene/outfit/pace/
jump controls, moving backgrounds and original sound. Both formats, recording
code, renderers, defaults, themes and export behavior are retained. No animation
timing or audio scheduling is rewritten. This is an interface integration, not
a conversion of one tool's rig or project format into the other's.

The host lazily loads each editor once and keeps it mounted. Returning to a mode
preserves its setup and generated video in memory. Mode changes wait for finite
previews, recordings and scene/outfit loading; recorded-video playback pauses
when leaving. Busy state comes from small read-only `TimRunnerEditor` bridges.
The original editors continue working on their own.

Original browser storage keys, named-project tool IDs and JSON formats remain
unchanged. No migration or deletion occurs. An exported setup still imports into
its original tool. Reloading has the original tools' persistence limits and
discards generated video blobs. Keep JSON backups of important setups. Project
and setup query parameters pass through; select the matching mode for a
tool-specific snapshot.

The homepage and registry still list the original tools. Each mode offers a
standalone fallback link; without JavaScript the mode links open those original
pages directly. Local preview storage is separate from GitHub Pages.

Run `npm run test:runner-animator:browser` for both modes/formats, four moving
scenes, preview/recording guards, video downloads, original-format project round
trips, persistence, mobile and no-JavaScript fallback. Also run `npm test`,
`npm run test:projects:browser`, `npm run test:river:scenes` and `npm run build`.

Real iPhone/iPad sharing and Google Drive exports in the host need manual checks
on the hosted origin before dashboard replacements. The preview does not change
the existing tools' codec or browser support.

Rollback: remove this directory and its test/package/static-check entries, then
remove the two `TimRunnerEditor` bridge blocks. Saved data requires no migration
or restoration.
