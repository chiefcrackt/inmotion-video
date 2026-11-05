# Text & Titles preview

Open `/text-and-titles/` locally after `npm run preview`. Deep links are `#text`
and `#titles`. This preview has not replaced either tool in the dashboard.

Animated text retains all Text Motion controls, transparent PNG/WebM and
PNG-sequence exports. Titles & lower thirds retains Title Maker's title cards,
lower thirds, word tags, chapter cards and synthesized/shared Sound Forge sound.
The existing renderers and export paths run inside persistent same-origin frames.

Draft keys, named-project tool IDs, version 1 JSON formats remain
unchanged. There is no project migration or conversion between the two modes.
An exported setup can still be imported into its original standalone editor.
Each editor loads only when first selected and stays mounted when hidden, so
changing modes preserves in-memory settings, recordings.
Reloading still discards generated video blobs, just as in the original editors.

Two small `TimStudioEditor` bridges expose busy status and, in Text Motion, a
pause action. They do not change standalone playback or export behavior. Mode
changes wait for recordings, transparent encodes and PNG-sequence generation.
Title Maker's sound preview must finish before leaving that mode. Text Motion's
automatic preview pauses on leaving; returning keeps its position and settings.

Project and setup query parameters are forwarded to the editors. Use a matching
mode when opening a tool-specific snapshot; incompatible setups retain the
original wrong-tool validation. Editor navigation leaves the whole studio, and
the standalone link provides a fallback. Without JavaScript, mode links open the
original editors directly.

Run `npm run test:text-titles:browser` for both modes, all four title styles,
PNG/video exports, decoded transparent WebM alpha, export and preview guards,
portable JSON round trips with the originals, reload persistence and desktop/
mobile layout. Run `node tests/text-motion.cjs` for the original editor's full
effects, formats, alpha compositing, sequence ZIP and encoder recovery checks.
Also run `npm test` and `npm run build`.

Real iPhone/iPad sharing and Google consent/upload require manual verification
on the hosted origin before replacing dashboard entries. A local preview uses
a different browser-storage origin from GitHub Pages; existing hosted projects
will not appear locally unless imported via JSON.

Rollback is independent of Celebration Studio: remove this directory and its
test/package/static-check entries, then remove the two `TimStudioEditor` bridge
blocks. The original tools and saved data require no migration or restoration.
