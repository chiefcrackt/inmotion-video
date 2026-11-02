# Running + Creator Icons — Volume 01

24 original T.im overlay assets: 12 running icons and 12 creator icons in navy,
gold and teal. The catalog is registered in Asset Library and linked from
Animation Downloads.

- `files/png/`: transparent 1024 × 1024 PNGs for video editors and social posts.
- `files/svg/`: self-contained editable vector artwork.
- `files/TIM_Running_Creator_Icons.zip`: all 48 assets, guide and contact sheet.
- `preview.png`: contact sheet with all 24 designs.

Edit `icons.mjs` to change artwork and `template.html` to change the catalog.
Run `npm ci` then `npm run build:icons` to regenerate the shipped files. The
builder needs Playwright's Chromium, Chrome or Edge; it has no runtime role.
Run `npm run test:icons` to check asset transparency and bounds, individual and
pack downloads, category filters, library navigation and mobile layouts.

Artwork uses a 128-unit square grid and a 7-unit navy outline. Preserve clear
silhouettes and transparent padding; preview on both light and dark footage.
The shared UI icon set in `shared/icons.mjs` is unchanged.
