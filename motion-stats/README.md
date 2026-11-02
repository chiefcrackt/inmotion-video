# T.im Motion + Stats Kit

24 compositions, 68 movable layers, transparent PNGs and editable SVGs.
This kit is independent of the Running + Creator Icon Pack.

Edit artwork and layer definitions in `assets.mjs`, then run
`npm run build:motion-stats`. The builder uses Playwright's Chromium, Chrome or
Edge to rasterize SVGs. Shipped pages and downloads require no build or service.

`files/svg/` contains composed graphics with named groups. `files/layers/` serves
each component as an SVG on its original canvas. Layer PNGs are included in the
ZIP to avoid shipping duplicate raster files outside the downloadable pack.
`files/manifest.json` documents dimensions, ordering, pivots, text-safe regions
and motion hints; `pngInArchive` paths refer to the ZIP, not HTTP endpoints.

`files/animated/` contains looping SVG examples, not finished video files. All
examples respect reduced motion. Import aligned PNG layers and animate them
with editor keyframes when SVG animation is unsupported. Stat panels have no
baked-in numbers or labels; progress examples are decorative.

Run `npm run test:motion-stats` to verify alpha and clipping, layer alignment,
animation playback and reduced motion, downloads, gallery filters, navigation,
and responsive layout. Original artwork uses the existing T.im palette.
