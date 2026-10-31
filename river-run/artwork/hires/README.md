# High-res runner (handoff A1)

`parts-atlas.png` is the ChatGPT-drawn parts sheet for the original Tristan
runner (prompt in `prompts.json`). `build.py` turns it into the nine `.webp`
pieces River Run loads for the **Original Tristan (HD)** outfit.

- Each piece is 2× the original piece's size and stretched to its exact
  bounds, so it sits on the original joints (`PARTS`) with no rig changes.
  River Run loads them with `imgScale: 1` (the originals use 0.5).
- The build keeps one solid shape per cell, removes stray flecks, and
  recolors edge pixels from just inside the piece, so colored fringes from
  generation don't show.
- 2× is the most the atlas supports: it came out 1254 px square, which gives
  the torso and thighs about 2× the original detail. A 2048+ px atlas could
  support 4×.

At today's River Run sizes (up to 1.2×) the original pieces are drawn near
their native resolution, so HD mostly matters for larger, close-up sizes.
The original runner is unchanged and stays the default.

Rebuild from the repo root: `python3 river-run/artwork/hires/build.py`
(needs Pillow, NumPy and SciPy). `preview.png` is the same image as the atlas.
