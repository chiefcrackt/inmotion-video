# Race Recap

Ten ready-made overlays for a race video, matching T.im's navy, gold, teal and
bundled Barlow Condensed typography. This pack complements Running Essentials;
existing packs and tools are retained.

Suggested sequence: Race recap → Before the start → Race start → Halfway →
Final push → Finish line → Finish time / Average pace → Thanks for watching.
Personal best is an optional celebration for an actual PB.

## Using the exports

Both landscape (1920 × 1080) and portrait (1080 × 1920) are 30 fps. Green-screen
MP4s include H.264 video and AAC sound; transparent WebMs include VP9 alpha and
Opus sound for compatible desktop editors. Matching WAVs are 48 kHz stereo PCM.
Mute video sound if using the WAV separately.

Finish time and Average pace deliberately have empty result insets. Add the
actual time or pace and units as a separate text layer in an editor. Keep it
visible only from 0.65s to 4.40s, while the panel holds still. The included
`READ-ME.txt` lists the inset's coordinates for each orientation. There are no
invented race results or fixed pace units in the exports.

Each clip also has a smaller navy-backed MP4 preview and reference PNGs; those
are for browsing, not transparent overlays. The downloads page exposes previews
in native disclosure controls and loads them only when requested. The complete
ZIP contains all assets, previews, a manifest and the import guide.

## Rebuilding and validation

The renderer is deterministic Canvas code with procedural sound; it makes no
remote requests and uses the repo's existing licensed fonts. The build follows
the Running Essentials export pipeline but writes only this pack's directory
and marked download section. Visitors use the committed files without building.

Install the repo dependencies with `npm ci`, provide Chrome/Edge or Playwright
Chromium, and set `FFMPEG_PATH` or install `python -m pip install --user imageio-ffmpeg`.

```
node tools/race-recap/build.cjs
node tests/race-recap.cjs
```

Use `--only=finish-time` to render one asset without packaging, or `--skip-render`
to regenerate the previews, manifest, ZIP and section from existing overlays.
The validation decodes all actual exports and their alpha planes, checks WAVs
and ZIP contents, plays preview metadata, exercises the download button, and
checks narrow layouts and every pre-existing download target. Run the existing
project tests and hub checks separately.
