# Running Essentials

Additive ready-made download pack in `downloads/files/running-essentials/`.
The files are committed so GitHub Pages serves them directly; visitors do not
need a browser recorder, dependencies or a build step.

- Six labels: Easy run, Tempo, Intervals, Long run, Recovery, Race day.
- Four transitions: Track wipe, Footstrike ripple, Trail dust, Finish tape.
- Five distance markers: 1 km, 5 km, 10 km, half marathon, marathon.
- Each asset has 1920 × 1080 and 1080 × 1920 versions at 30 fps: green-screen
  H.264/AAC MP4 and VP9-alpha/Opus WebM. Each has one stereo 48 kHz PCM WAV.
- Navy-backed reference PNGs, a preview montage, manifest, import guide and ZIP.

Transitions cover the complete frame at 0.70 seconds: align the edit cut there.
All overlays begin and end clear. Videos include sound, so mute that track if
using the standalone WAV. WebM alpha requires a compatible desktop editor;
green-screen MP4 is the phone-friendly alternative. Import guidance is included
in the pack. The PNGs are reference stills, not transparent overlays.

## Rebuild

Run `npm ci`, install Chrome/Edge or Playwright Chromium, then provide FFmpeg
through `FFMPEG_PATH` or `python -m pip install --user imageio-ffmpeg`.

```
node tools/running-essentials/build.cjs
node tests/running-essentials.cjs
```

`--only=easy-run` renders one asset without repackaging. `--skip-render` rebuilds
the montage, manifest, ZIP and download section from existing exports. A full
build uses deterministic Canvas frames and procedural audio, without remote
services or new art dependencies. It only replaces its own exports and marked
HTML section; previous packs and tool implementations remain intact.

The validation decodes all actual MP4/WebM files, examines decoded WebM alpha,
checks every transition's opaque cut frame, WAV headers/durations, ZIP integrity,
all download targets, browser download behavior, preview metadata and mobile
overflow. Other project checks remain available through the existing npm scripts.
