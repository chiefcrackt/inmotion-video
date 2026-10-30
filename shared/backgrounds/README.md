# T.im background pack

Six optional backgrounds generated with the built-in imagegen tool. Exact prompts are in prompts.json. Square JPEGs are used by both tools; matching -landscape (1920 × 1080) and -portrait (1080 × 1350) versions are included for direct use. Crops are derived from the square sources; landscape versions are upscaled.

Choose a background and press Use selected background in Cover Maker or Carousel Maker. This replaces the current photo only when applied. All original uploads, layouts, framing and exports remain available. Existing undo and saved-project behavior applies. Carousel backgrounds use light text by default, adjustable with the existing controls.

Verify with node tests/background-pack.cjs and the existing cover and carousel browser suites.

## Theme matching

The six original images remain unchanged. Generated backgrounds now default to **Match current theme / palette**: Cover Maker follows T.im, Minimal and Race Broadcast, while Carousel Maker follows all five palettes and custom brand-kit colors. The original art remains available by turning the checkbox off. Treatment affects the generated background only; typography stays editable and uploaded photos retain their colors. Existing tint, gradient, framing and export controls still apply. The checkbox and generated-background identity are stored with projects and undo history. The small picker image previews the original; the canvas shows the active theme treatment.

Run `node tests/background-themes.cjs` to check theme changes, toggle restoration, carousel reload and original uploads.

## River Run

River Run adds **Image backdrop** alongside River scene, Navy + grid and Green screen. All six backgrounds use the same optional palette matching, preserve original runner and outfit colors, persist across reload and project JSON, and appear in recorded video. Choose an image in the pack and apply it, or use Image backdrop to return to the last selected image. Background controls are locked during playback and recording. The original procedural scenery also follows the output theme, with the default T.im scene retained. Run `node tests/river-backgrounds.cjs` to verify the scenes, themes, formats, outfits and actual recorded video.
