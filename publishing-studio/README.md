# Publishing Studio preview

Open `/publishing-studio/` locally after `npm run preview`. Use `#covers`,
`#promos` or `#brand` to open a mode directly. This preview groups Cover Maker,
Promo Maker and Brand Assets while retaining their existing editors.

Each editor loads only when first selected and stays mounted when hidden.
Switching preserves uploaded photos, settings, saved projects and generated
video blobs in memory. Project formats, original tool IDs, browser storage keys,
renderers and export paths remain unchanged. Named JSON projects remain portable
to the original editors. No saved data is migrated, merged or deleted; settings
and photos remain separate by original tool. Reloading retains the original
tools' persistence limits, including transient uploaded photos and video blobs.
Use named projects and JSON backups to preserve photos where supported.

Promo recording and finite sound previews must finish before switching. Brand
exports and sound preparation block mode changes; leaving a playing brand
preview stops its loop and audio without changing its design. Native PNG/WAV
exports, share behavior, recorder cancellation and encoder choices are retained.
No original editor needs the new host to work.

The host forwards project/setup query parameters. A `template` query is passed
only to Brand Assets and has its original template-application semantics. Match
tool-specific snapshots to their corresponding mode. In-workspace links can
switch modes, while unrelated destinations open outside the studio. Each mode
also offers its standalone editor. Without JavaScript, the mode links open the
original tools. The homepage and registry still list the originals.

Run `npm run test:publishing:browser` for all three modes, photo/project JSON
round trips to the originals, PNG dimensions, promo and brand recordings,
mode-change guards, stopping audio, persistence, mobile and no-JavaScript
fallback. Also run `npm run test:brand-assets`, `npm test` and `npm run build`.

Real iPhone/iPad sharing and still require
manual checks on the hosted origin before replacing dashboard entries. Local
preview storage is separate from GitHub Pages; hosted projects appear locally
only if imported via JSON. Brand Assets retains its own export capabilities.

Rollback: remove this directory, browser test and package/static-check entries,
then remove the two `TimPublishingEditor` bridge blocks. Cover Maker is unchanged.
No browser-data restoration or migration is needed.
