# Cyberpunk city run

Optional moving scene in River Run. Generated layers: distant futuristic skyline, closer industrial facades, and wet neon pavement. The near-camera light bollards, small sky lights and pavement joins are native canvas elements.

The three original PNG layers were generated with the built-in imagegen tool and are preserved alongside compressed WebP runtime copies. Exact prompts are in `prompts.json`. Runtime assets load only when the scene is selected. Transparent layers preserve alpha.

`../../scenes.js` shares the existing riverside tiling, palette handling and stride clock through `RiverParallax`. The ground moves at the runner’s ground speed, distant layers at 0.045× and 0.18×, and foreground at 1.18×. Mirrored repeats avoid edge gaps, and scene motion continues during jumps. T.im keeps the original artwork; Minimal and Race Broadcast follow their existing palettes while preserving runner colors.

All previous backgrounds, four outfits, audio choices, saved projects, formats and recordings remain available; River scene stays the default. Run `npm run test:river:scenes` for all three moving scenes, or `node tests/river-riverside.cjs cyberpunk` for this scene. Tests verify actual stride-matched ground pixels, repeat continuity, jumps, themes/formats, outfits, reload, green screen, mobile and moving ground in recorded video. Local previews are written to `output/`.
