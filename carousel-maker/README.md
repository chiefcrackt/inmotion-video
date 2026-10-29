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

## Elements and projects

Add independent text boxes, photos, shapes, arrows, badges, star ratings, bar charts and comparison tables to a template or a new blank slide. Drag elements on the preview and resize with the bottom-right handle; toggle 10px snapping. Numeric position and size fields and left/center/right/middle buttons provide precise alignment. Select an element from the layers list to hide, lock, duplicate, delete or move it forward/backward. Arrow keys nudge a selected unlocked element by 1px (Shift: 10px); Delete removes it. Editing fields retain their normal keyboard behavior.

Text supports size, font, bold, alignment, line spacing and color. Elements support opacity, borders, rounded corners and shadows where applicable. Multiple photo elements support fill/crop and contain. Charts use `Label | value` rows; tables use pipe-separated columns. Copy/paste styles transfers presentation without replacing content or position. Existing template content remains editable through Slide settings; added elements are independent layers above it. A blank slide provides full composition control.

Undo/redo stores the latest 40 edits in memory, including slide changes. Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z work outside input fields. History resets when the page reloads. Saved projects, a reusable slide layout and a saved brand kit (palette, font, handle) live in this browser. Save a project under a different title to keep another version. Export/import JSON carries editable slides and embedded photos between devices. Storage limits apply; export JSON backups for important work. JSON import is limited to 25MB, 100 slides and 100 elements per slide.

`npm run test:carousel:editor` exercises independent elements, pointer dragging/resizing, undo/redo, layer order, style copying, reusable layouts, project files, brand kits, photo elements, PNG export, reload persistence and mobile widths. Requires Playwright and Chromium.

Grouping, automatic distribution, saved logo assets and a multi-template library are not included. Chart and table layouts support up to 12 rows and tables up to four columns. Text clips to its frame; resize it or lower the font size if needed. For the cleanest result, use blank slides when placing everything manually.

## Full-slide photo backgrounds

Upload a primary photo and choose **Photo placement → Full-slide background**. This fills every edge of portrait or square slides, including blank layouts and behind the footer. Background mode uses fill/crop; zoom, position, rotation and flip still apply. Photo-frame height and panel-opacity settings do not apply to backgrounds.

For readable text, choose a background tint color and strength, a top/bottom/left dark gradient, and white/black/palette template text. Hide template text and/or the footer to create photo-only slides or compose your own independent text layers. Independent elements keep their own colors. Framing and readability settings persist, duplicate and export with each slide. Reset framing also resets background mode and effects. `npm run test:carousel:background` validates full-bleed coverage, tint/gradient pixels, persistence and PNG export.

## Stacking around template text

Select an added element and choose **Stacking → Below template text** to keep built-in headlines, body text and footer above it. The Layers list shows the template-text boundary; Forward/Backward can move elements across that boundary as well as reorder them within either group. Existing elements default to above-text. Placement survives duplication, project saves/imports and PNG/ZIP export. Blank slides preserve the same below/above ordering even without template text.
