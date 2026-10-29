# Tristan outfits

Final overlap fix: race-day hips are now a compact pelvis underlay; the animated thighs supply both shorts legs, avoiding a third stationary lobe. Trail upper arms use only the new sleeve artwork, without copying back the original gold sleeve. The fabric/skin seam detector now distinguishes gold from skin and crops before the first skin pixel in the race shorts texture. The race pelvis intentionally differs from the original silhouette below the hip; the other joint masks and animation curves are retained. `tests/river-outfits.cjs` checks the missing hip lobe and absence of gold sleeve pixels and exports `race-detail.png` and `trail-detail.png`.

Latest cleanup: `race-atlas-v2.png` and `trail-atlas-v2.png` remove skin from the hip sprites; the trail torso also removes the painted sleeve and upper arm. Only `race/shorts-v2.png`, `trail/shorts-v2.png`, and `trail/torso-v2.png` are consumed from these revised atlases. Rebuild those three files with `node build-outfit-assets.cjs --cleanup`. Exact built-in imagegen edit prompts are in `cleanup-prompts.json`. Cold-weather assets and fitting are unchanged.

Three new outfits generated with the built-in imagegen tool: race day (teal singlet, navy shorts, coral shoes), trail runner (orange shirt, green hydration vest, charcoal shorts, ochre shoes), and cold weather (blue jacket, black tights and gloves, lime shoes).

The exact prompts, including the winter joint-coverage correction, are in `prompts.json`. Full transparent generated images are `race-atlas.png`, `trail-atlas.png`, and `winter-atlas.png`. The reference atlas is `tristan-parts-reference.png`. Individual fitted sprites are in `race/`, `trail/`, and `winter/`. `outfit-preview.png` shows all four assembled puppets over the stride and jump.

Every outfit keeps the original head at runtime and uses the original PARTS joint coordinates, image dimensions, skeleton, run cycle, ground contact and jump poses. The outfit selector remembers the choice in River Run's existing local settings. Recorded filenames include the outfit.

From the repository root, `node build-outfit-assets.cjs` regenerates the individual sprites from the saved atlases using Playwright and Microsoft Edge. It extracts the largest connected component from each cell to remove detached generation artifacts, then fits each piece to the original sprite bounds. No API key is required to rebuild saved assets.

Run `npm run preview`, then `node tests/river-outfits.cjs` to verify loading, persistence, 44 poses, landscape/portrait, scene/green screen and an actual five-second video recording.

## Joint fit refinement

The runtime fitter in `../outfit-fit.js` now uses the original sprite alpha as the silhouette for each outfit piece. Race and trail retain the original bare forearms and the original skin below the shorts and sleeve hems. Generated clothing is fitted to those seams, and the race/trail pelvis uses only fabric from the atlas so a second bare thigh cannot appear under the moving shorts.

`node tests/river-outfit-fit.cjs` verifies identical alpha at every pixel for all three fitted outfits and that original heads and exposed forearms are reused. `node tests/river-outfit-motion.cjs` records `outfit-motion-review.webm`, a synchronized five-second comparison with the original. The source atlases and original animation curves are unchanged.
The fit test also compares the assembled silhouettes at 48 stride phases plus crouch, airborne tuck and landing/fist-pump poses.
