# Carousel Post Maker

Open `carousel-maker/` through any static server. No build, network services or extra packages are required at runtime. Back to toolkit returns to the existing Video Tools hub.

Six templates: gear review, race recap, training lessons, monthly mileage, product pros and cons, and what I use. Edit each slide's layout, title, description, highlight and uploaded photo. Use `|` between comparison columns and a newline between rows. Stats use `Label | Value`. Reorder with drag and drop or the arrow buttons, duplicate a slide, or add/delete slides. Editor and Overview show the same slide order.

Palette, typeface, handle and portrait/square format apply to the whole deck. Drafts and resized photos save to this browser's localStorage; private browsing, clearing browser data or switching devices loses that draft. Storage failures display next to the project title. Uploaded photos stay in the browser and are resized to at most 1800 pixels on the long edge.

Export the selected numbered PNG or a ZIP of every numbered PNG at 1080 × 1350 / 1080 × 1080. ZIP generation uses valid uncompressed ZIP entries and snapshots the deck at export start. Large decks consume browser memory. Text and tables have finite space: review the canvas before exporting; long text is limited to the visible layout, and tables support up to four columns and nine rows.

Validation:

- `node --test carousel-maker/tests/model.test.mjs`
- `node carousel-maker/tests/browser.cjs` (requires Playwright and Chromium; set CHROME_PATH if necessary)

The browser check covers hub discovery, editing, duplication, reordering, reload persistence, photo uploads, all templates, PNG dimensions, ZIP download and mobile widths. No shared sound or activity behavior is changed.

Photo framing controls are per slide: fill/crop or fit the whole image, 1–3× zoom, horizontal/vertical positioning, 90° rotation, horizontal flip, frame height on non-photo layouts and text-panel opacity on photo layouts. Reset framing restores defaults; replacing a photo also resets framing. Controls persist in drafts, copy with duplicate slides and use the same renderer for previews, thumbnails and PNG/ZIP exports. Existing drafts default to their original framing.
