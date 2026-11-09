# Motion Studio 2 render

Turns a `spec.json` exported from Motion Studio 2 into an MP4 (or ProRes/still).
Rendering happens on your computer with Remotion, not on the website.

## One-time setup
1. Install Node.js (LTS).
2. In this folder, run `npm ci`.

## Each piece
1. In Motion Studio 2, build the piece and click **Export spec.json**.
2. Copy that file here and name it `spec.json`, replacing the previous one.
3. Run `npm run render`. The MP4 lands in `out/piece.mp4`.
   - ProRes with alpha for desktop editors: `npm run render:prores`.
   - A single frame to check: `npm run still`.

## Notes
- The composition timing and styling mirror `../model.mjs` (`frameState`), so the
  render should match the browser preview. Check a still against the preview
  before rendering a long piece.
- Fonts: the render uses the installed Barlow Condensed if present. Install the
  font files from `../../shared/fonts/` so the render matches the preview.
- This render template was written without a local Remotion install, so run
  `npm run render` once on a test spec before relying on it.
