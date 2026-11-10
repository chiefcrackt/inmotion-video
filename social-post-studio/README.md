# Social Post Studio preview

Open `/social-post-studio/` locally after `npm run preview`. Deep links are
`#carousel`, `#rankings` and `#compare`. The three modes host Carousel Post Maker,
Tier List Maker and Before & After in persistent same-origin frames.

Carousels keeps its existing templates, slide/element editing, ordering, saved
projects, JSON imports and numbered PNG/ZIP exports. Rankings retains its tier
board, item editor, carousel exports and reveal video with sound. Before & After
retains its two-photo framing, divider, labels, wipe/fade and still/video output.
The existing renderers, export handlers, storage keys and project formats are
unchanged. No data migration, cross-tool conversion or automatic draft replacement
occurs; the host groups workflows without turning one editor into another.

Editors load on first selection and stay mounted. Switching preserves in-memory
photos, edits, generated recordings and scroll positions. Carousel's export
dialog must be closed before leaving; active exports and previews must finish.
Busy status comes from small read-only `TimSocialEditor` bridges. Playback of a
recorded video pauses when its mode is hidden.

Persistence retains the originals' limits. Carousel projects/JSON and embedded
photos still work with its standalone editor. Tier List retains its original
local draft (including its existing storage-quota fallback). Before & After
photos/settings are session-only; switching modes keeps them, but reloading or
leaving the page discards them. The host does not add a project format or save
library to that tool. Generated video blobs are not saved across reloads.

The homepage and registry continue to list the original editors. Mode links open
those pages if JavaScript is unavailable; each mode also has a standalone link.
Project query parameters are forwarded, retaining each editor's existing
integration support. Local preview storage is separate from GitHub Pages.

Run `npm run test:social-post:browser` for the three modes, standalone carousel
project compatibility, numbered PNG/ZIP exports, ranking/comparison recordings,
busy guards, photo retention, legacy drafts, mobile and no-JavaScript fallback.
Also run `npm test`, `npm run test:carousel:editor`, `npm run test:carousel:ux`
and `npm run build`. Browser artifacts are written to an OS temporary directory.

Real iPhone/iPad sharing and require manual
checks on the hosted origin before replacing dashboard entries. Existing native
codec support is retained.

Rollback: remove this directory and its test/package/static-check entries, then
remove the three `TimSocialEditor` bridge blocks. No browser-data migration or
restoration is needed.
