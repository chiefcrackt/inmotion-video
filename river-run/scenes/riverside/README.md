# Moving riverside

One optional side-scrolling scene in River Run. Choose **Moving riverside** under Scene. All prior scene, image background, outfit, sound and recording choices remain available; the default is still River scene.

Four PNG layers were generated with the built-in imagegen tool: distant wooded hills, a tree-lined bank, gravel path and sparse foreground reeds. The hills, bank and reeds retain genuine alpha. Exact prompts are in `prompts.json`; source assets are preserved without destructive recoloring. The sky, sun, water, shadows and small ground accents are drawn in canvas.

`../../riverside.js` draws every layer from the same time and ground-speed values as the existing runner. Ground moves at 1×, the bank at 0.18×, distant hills at 0.045× and foreground reeds at 1.18×. The world keeps moving during jumps. Alternate mirrored tiles meet at their own matching edges, avoiding gaps without claiming the generated strips are perfectly seamless. Transparent bottom padding is fitted to the waterline at render time.

T.im uses the original navy/teal/gold artwork. Minimal and Race Broadcast apply the existing palette treatment while preserving alpha, and the runner keeps its original colors. The scene loads lazily before playback or recording is enabled, survives reload and named project JSON, and supports landscape and portrait output.

Run `npm run test:river:riverside`. The browser check measures rendered ground displacement against actual stride speed at all three paces, checks repeat-boundary continuity, deterministic jumps, all themes and formats, all four outfits, persistence, mobile layout, green screen and moving ground in an actual five-second recording. Local review artifacts are saved in `output/`.

Runtime uses compressed WebP copies (including alpha) to reduce scene-loading downloads. The original generated PNGs are kept beside them for future edits.
