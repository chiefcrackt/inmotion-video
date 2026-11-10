# Celebration Studio preview

Open `/celebration-studio/` for Runner celebrations and Cards, cakes & medals.
Use `#runners` or `#cards` to link directly to a mode. Run `npm run preview`
from the repository root to serve this locally.

This first integration hosts the existing Special Post and Celebration editors
in same-origin frames. Renderers, sound, export handlers, storage keys, tool IDs,
project JSON formats and original URLs are unchanged. Each editor loads only
when first selected, and stays mounted when switching modes. This preserves
unsaved in-memory settings, generated recordings.
Drafts and named projects remain separate by original tool; no data migration
or cross-mode project conversion occurs. Reloading has the same persistence
limits as the original editors (generated video blobs are not saved).

Mode changes are blocked while recording or previewing. Stop the preview or
finish the recording first. Switching pauses any recorded-video playback.
The standalone link opens the selected original editor if needed. Without
JavaScript, mode links open the original pages directly.

The homepage and tool registry intentionally retain their original entries
until this preview has been reviewed. To roll back, remove this directory,
its browser test and the package/static-check entries; original editors have
no dependencies on it. Nothing needs to be restored in browser storage.

Run `npm run test:celebration:browser` to exercise both modes, PNG/WAV/video
downloads, recording guards, preview guards, mode-state retention, reload
persistence, saved projects, narrow-screen layout and no-JavaScript fallback.
The test writes screenshots and exports to a unique OS temporary directory.
Also run `npm test`, `npm run build`, and `npm run test:projects:browser`.

Real iPhone/iPad sharing inside the combined
page require manual checks on the hosted origin before replacing dashboard
links. Automated Chromium tests cannot establish those platform behaviors.
