# Asset Animator

A standalone composition and export tool. It does not modify Video Framer.
The shared catalog includes Weird Motion, Running + Creator Icons, Motion + Stats
and Product Spotlight, plus the signature callout. Pack counts in the editor are
derived from the catalog so new graphics appear without stale totals.

- Up to 12 layers, including editable text. Reorder, duplicate, hide, resize,
  rotate, fade, drag and precisely position each layer.
- Split Motion + Stats graphics into their original aligned components. All 68
  component IDs are validated and can be saved with individual motion presets.
- Still, pulse, float, nudge, spin and pop-in/out motion on a shared 2–8s clock.
- Native vector entrances: outline/fill drawing, piece-by-piece construction,
  wipes, route/ring tracing with a moving marker, pin landing, confetti bursts
  and finish-tape breaks. Text can type on in its final layout.
- Asset-aware motion choices, recommended entrances, an automatic graphic/text
  sequence, and per-layer delay and entrance duration. Entrances hold after
  finishing; the original looping motions remain available.
- Transparent 1080-square, 1920×1080 or 1080×1920 PNGs and silent alpha WebM.
- Green-screen MP4/WebM through browser-supported MediaRecorder codecs.
- Shared saved project snapshots and portable JSON; browser draft autosave.

Rasterizes only known self-contained library SVGs. Imported projects contain
asset IDs and text, not external URLs. Validation, decoding and font loading
finish before state replacement/export. Both export paths call the same renderer;
selection guides are on a separate preview canvas and never enter exports.
Alpha export uses the existing `text-motion/alpha-video.js` VP9 helper.

`native-motion.mjs` compiles only trusted library SVGs. Geometry is measured once
in an off-screen SVG, then cached as paths/points and component images. Rendering
and seeking are synchronous and use export time, not CSS or wall-clock animations.
Actual artwork is used for the settled frame; a tape-break intentionally holds
its separated halves. Still PNGs always export the complete unanimated artwork.
Motion/timing fields are portable; older scenes gain compatible defaults.

The PNG export shows the composed still layout. For video, pop-in/out layers
start and end invisible; loop presets share the export duration. Animated SVG
demos in the downloadable kit are separate from this tool's motion presets.

Run `npm run test:asset-studio` to check validation, motion, composition, dragging,
layer order, draft/project round trips, PNG alpha and actual video output.
Run `npm run test:asset-motion` for path reveals, deterministic frames,
specialized choreography, entrance sequencing, timing and real video exports.

Editable starting scenes include Product Spotlight, Weird Motion and the
signature callout. Text is separate from the graphic; known template links and
the template selector validate and decode the next scene before replacement.
Existing drafts require confirmation. Original pack pages remain available for
browsing, previews and downloads; Asset Animator is already their shared editor.
