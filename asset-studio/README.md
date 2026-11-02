# Asset Animator

A standalone composition and export tool. It does not modify Video Framer.
Uses 66 graphics from Running + Creator, Motion + Stats and Product Spotlight.

- Up to 12 layers, including editable text. Reorder, duplicate, hide, resize,
  rotate, fade, drag and precisely position each layer.
- Split Motion + Stats graphics into their original aligned components. All 68
  component IDs are validated and can be saved with individual motion presets.
- Still, pulse, float, nudge, spin and pop-in/out motion on a shared 2–8s clock.
- Transparent 1080-square, 1920×1080 or 1080×1920 PNGs and silent alpha WebM.
- Green-screen MP4/WebM through browser-supported MediaRecorder codecs.
- Shared saved project snapshots and portable JSON; browser draft autosave.

Rasterizes only known self-contained library SVGs. Imported projects contain
asset IDs and text, not external URLs. Validation, decoding and font loading
finish before state replacement/export. Both export paths call the same renderer;
selection guides are on a separate preview canvas and never enter exports.
Alpha export uses the existing `text-motion/alpha-video.js` VP9 helper.

The PNG export shows the composed still layout. For video, pop-in/out layers
start and end invisible; loop presets share the export duration. Animated SVG
demos in the downloadable kit are separate from this tool's motion presets.

Run `npm run test:asset-studio` to check validation, motion, composition, dragging,
layer order, draft/project round trips, PNG alpha and actual video output.

Product Spotlight provides 18 editable starting scenes. Text is separate from
the graphic; known template links and the template selector validate and decode
the next scene before replacement. Existing drafts require confirmation.
