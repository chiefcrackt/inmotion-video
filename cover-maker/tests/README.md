# Cover Maker rendering checks

The tool remains a standalone GitHub Pages HTML file. No build step or production dependency is required.

The optional regression script requires Node.js, Playwright, and installed Google Chrome. With Playwright available in your Node module path, run from the repository root:

```sh
node cover-maker/tests/render.cjs
```

The script uses local HTML and an in-memory photo fixture; it blocks external requests. It checks original template pixel parity against `origin/main` when that ref is available, photo adjustments, mouse and touch dragging, text transforms and locks, layer visibility and ordering, undo/redo, per-format composition retention, mobile overflow, and exported PNG pixels/dimensions for all three formats. Exported blobs are captured before the native download/share dialog. Screenshots are written to a temporary directory.

Manual checks before release:

- Choose and drop real photos, including a portrait and a landscape image.
- Select Photo in Layers to drag it underneath text; select a text layer to move words. Verify flip, fit/fill/original, rotation, adjustments, and resets.
- Check fonts after they load, long headlines, label alignment, subtitle wrapping, and each original template option.
- Test PNG download and the native share sheet on the intended phones/tablets, including canceling a save.
- Check Safari and Firefox on the intended devices. Automated checks currently use Chrome; browser support for Canvas 2D filters and letter spacing can vary.

Composition settings are remembered separately for each format. Uploaded images and undo history stay in memory and do not survive a page reload. Brand accents are grouped as one layer to keep the editor approachable. Exposure is a brightness multiplier in stops, rather than a RAW photo exposure adjustment.
