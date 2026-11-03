# Mountain trail

**Mountain trail · gravel** is an optional variation using 3DTexel's CC0 Gravel
Ground material (asset 25921). It shares the original mountains, foreground,
stride clock and theme handling. The original Mountain trail remains available.
`gravel-ground.webp` is a 1536×320 color-only texture with small repeated stones
and a muted teal blend, exported at WebP quality 0.86. Source and license details
are recorded in `gravel-source.json`. Download cost was zero credits. No API
connection is needed at runtime. Run `node tests/river-riverside.cjs mountain-gravel`
for motion, repeat boundaries, themes, formats, persistence and recording checks.

Optional moving scene in River Run. Generated layers: alpine peaks, pine/rock middle distance, and dirt/gravel trail. The foreground reuses the existing riverside grasses; native sky, sun and rolling valley slopes add depth without extra generated assets.

The three original PNG layers were generated with the built-in imagegen tool and are preserved alongside compressed WebP runtime copies. Exact prompts are in `prompts.json`. Runtime assets load only when the scene is selected. Transparent layers preserve alpha.

`../../scenes.js` shares the existing riverside tiling, palette handling and stride clock through `RiverParallax`. The ground moves at the runner’s ground speed, distant layers at 0.045× and 0.18×, and foreground at 1.18×. Mirrored repeats avoid edge gaps, and scene motion continues during jumps. T.im keeps the original artwork; Minimal and Race Broadcast follow their existing palettes while preserving runner colors.

All previous backgrounds, four outfits, audio choices, saved projects, formats and recordings remain available; River scene stays the default. Run `npm run test:river:scenes` for all three moving scenes, or `node tests/river-riverside.cjs mountain` for this scene. Tests verify actual stride-matched ground pixels, repeat continuity, jumps, themes/formats, outfits, reload, green screen, mobile and moving ground in recorded video. Local previews are written to `output/`.
