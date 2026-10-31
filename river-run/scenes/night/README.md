# Night trail

Optional moving scene in River Run (handoff A2). Generated layers: distant night forest, mossy undergrowth with ferns, roots and rocks, and a dirt trail with a warm headlamp-lit band painted into it. The fixed stars and pale crescent moon are native canvas elements; there is no foreground layer.

The original PNG layers were generated with the built-in imagegen tool and are kept alongside compressed WebP runtime copies (quality 88). Exact prompts are in `prompts.json`; `preview.png` is the review sheet. Runtime assets load only when the scene is selected. Transparent layers keep their alpha.

`../../scenes.js` shares the stride clock, tiling, mirrored repeats and palette handling with the other scenes. The forest reaches down to the path behind the undergrowth so no edge shows where the undergrowth dips. The ground darkening is lighter than other scenes so the lit band stays visible.

Run `node tests/river-riverside.cjs night`, or `npm run test:river:scenes` for all moving scenes.
