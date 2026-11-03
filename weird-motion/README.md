# Weird Motion

Original T.im vector motion toys in the suite's navy, gold and teal.

| Toy | Action 1 | Action 2 |
| --- | --- | --- |
| Pocket portal | Open + summon | Vortex spin |
| Elastic grabber | Stretch + grab | Slingshot delivery |
| Orbit swarm | Orbit + lock on | Magnetic scramble |
| Pixel critter | Run + deliver | Peek + celebrate |

Each toy has a blank callout version and a standalone version without the panel. Both are in Asset Animator's Weird Motion pack. Full callout templates add independent editable text. Actions use the layer's start delay and entrance duration, then hold their final pose. All composition exit options remain available.

`artwork.mjs` produces the same vector commands for SVG downloads and direct canvas animation. It uses no external images, random state, timers, or per-frame image decoding. Preview, seeking and both video export paths share the renderer. Still PNGs use the completed SVG artwork.

Run `npm run test:weird-motion`. To package blank SVG/PNG graphics, editable JSON projects and an offline interactive preview, run `npm run build:weird-motion -- <output-directory>`. The JSON projects and online builder links require this version of Asset Animator. PNG and SVG downloads are static; export animated clips through the builder.
