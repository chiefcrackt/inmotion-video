# Feature handoff

Planned features for the Video Tools site, listed in build order. These specs
were first written as `TODO(Claude)` comments inside the code; they live here
now so they're easy to find and check off. Spec text is kept as written.

Status: `todo` → `in progress` → `done` (link the PR).

Feature 4 was dropped and is intentionally not listed.

| Order | Feature | Tool | Status |
|---|---|---|---|
| 1 | [#3 Text-overflow detection and optional fit](#3-text-overflow-detection-and-optional-fit) | Carousel Maker | done (PR #11) |
| 2 | [#1 Activity-to-carousel race recap](#1-activity-to-carousel-race-recap) | Activity Studio → Carousel Maker | todo |
| 3 | [#5 Activity trim and checkpoints](#5-activity-trim-and-checkpoints) | Activity Studio | todo |
| 4 | [#2 Multi-select, grouping and distribution](#2-multi-select-grouping-and-distribution) | Carousel Maker | todo |
| 5 | [#6 Shared brand kits across visual tools](#6-shared-brand-kits-across-visual-tools) | Shared | todo |
| 6 | [#7 Shared recording lifecycle](#7-shared-recording-lifecycle) | Shared (Title Maker first) | todo |

Open question for #1: decide how it relates to the Race Recap download pack
(`tools/race-recap/`) before building — a new carousel flow, or a way to feed
activity data into that pack.

## Who does what

- **Claude:** code. The features above, plus wiring in finished artwork
  (format conversion, tool integration, tests).
- **ChatGPT (Codex + image generation):** artwork. The tasks under
  [Art tasks](#art-tasks-chatgpt) below.

Art PRs add image files and `prompts.json` only — no code changes — so the two
never edit the same files. Each art task has a matching wire-in task for Claude
once the art is merged.

---

## #3 Text-overflow detection and optional fit

Where: `carousel-maker/render.mjs`, `carousel-maker/elements.mjs`, editor.

Derive overflow diagnostics from the same font measurement, wrapping, line
spacing and frame bounds used to draw template text and independent text
elements (see elements.mjs). Wait for bundled fonts before measuring.
Expose diagnostics to the editor with the slide and affected text/frame;
show a non-blocking export warning and an explicit "Fit text" action.
Fit should reduce size only to a documented readable minimum, be undoable,
and leave unresolved overflow visible instead of silently changing content.
Do not mutate the project during rendering or merely to show diagnostics.

**Acceptance:** cover long words, multiline text, each font and both formats;
warnings reflect exported clipping, fitting survives project round trips,
and preview/thumbnail/PNG/ZIP all use the same resulting layout.

## #1 Activity-to-carousel race recap

Where: `activity-studio/app.mjs`, `carousel-maker/model.mjs`.

Add an explicit "Create recap carousel" action for the current normalized
activity. Start with one activity and one editable recap template: summary,
privacy-masked route, elevation, recorded laps (when available), closing slide.
Build a versioned adapter to carousel-maker/model.mjs; reuse existing units,
availability/source labels and rendering rather than parsing the file again.
Keep activity/GPS records out of persistent storage. Transfer only the
necessary editable values and rendered, privacy-masked graphics; make the
transfer explicit and let the user review before replacing a carousel draft.

**Acceptance:** metric/imperial values agree with Activity Studio, missing fields
are omitted/labeled rather than invented, masked gaps stay disconnected, and
generated slides remain editable and survive carousel JSON/PNG/ZIP exports.

## #5 Activity trim and checkpoints

Where: `activity-studio/app.mjs`, `model.mjs`, `render.mjs`.

Add start/end trim, jump-to-time/distance and user-authored checkpoint labels,
using model.mjs timeline lookup and render.mjs for both preview and export.
Define whether checkpoints use elapsed time or cumulative distance; preserve
gaps/pauses and disable unavailable navigation for untimed/missing-distance
data. Clearly distinguish whole-activity totals from selected-section values.
Store design settings only in existing saved presets; do not persist imported
GPS data or activity-specific annotations without a deliberate new policy.

**Acceptance:** trim boundaries and labels agree in scrubbing, PNG and video;
test pauses, gaps, boundary checkpoints and activities without timed GPS.

## #2 Multi-select, grouping and distribution

Where: `carousel-maker/editor.mjs`, `carousel-maker/model.mjs`.

Extend the existing element selection/dragging model with modifier-click and
accessible controls for selecting multiple independent elements. Add group/
ungroup, group movement and even horizontal/vertical distribution.
Keep locked elements fixed and hidden elements out of pointer hit testing;
define how mixed below/above-template selections behave before changing
stacking. Reuse the current coordinates, snapping and layer placement rules.
Treat each group drag, group/ungroup or distribution as one undo transaction.
Add version-compatible group metadata through model.mjs normalization; old
projects must load unchanged. Preserve groups in duplicate/save/import/export.

**Acceptance:** mouse, touch and keyboard produce matching positions; undo/redo
restores the entire operation; preview, thumbnails and PNG/ZIP match. Input
fields must retain normal selection and keyboard editing behavior.

## #6 Shared brand kits across visual tools

Where: `shared/projects.js`, `carousel-maker/editor.mjs` (existing brand kit).

Extend the existing theme/font infrastructure with named, versioned kits for
palette, font, handle and optional user-supplied logo assets. Start with
Carousel Maker and one existing visual tool, using explicit tool adapters.
Reuse/migrate carousel-maker/editor.mjs brand storage without discarding the
saved kit; do not assume the three existing theme presets are custom kits.
Applying a kit must be an explicit action, never a side effect of opening an
old project. Preserve uploaded photo/runner colors and chroma-green output.
Bound and validate imported kits/assets; use suitable browser asset storage,
include logos in portable backups, and report quota failures without losing
the active edit. Keep Sound Forge and its storage/integration untouched.

**Acceptance:** a kit applies consistently in both tools and their exports,
survives reload and JSON round trips, and old projects retain their look.

## #7 Shared recording lifecycle

Where: `title-maker/index.html` (`record()`), then `promo-maker/index.html`.

Extract codec selection, stream cleanup, cancellation, progress and
errors into a shared module. Migrate Title Maker, then Promo Maker;
consider River Run only after both migrations preserve behavior.
Hosts supply canvas, audio/frame scheduling and output settings.
Preserve MIME/extension choices, audio sync, download/share behavior
and original defaults. Leave Sound Forge and its integration intact.
Clean up tracks/listeners/object URLs on success, cancel and error;
handle hidden-tab recording explicitly and support repeat exports.

**Acceptance:** compare duration, audible sync and playback before/after;
exercise cancel, unsupported codecs, recorder failure and recording
again after each outcome. Keep browser workarounds until real-device
evidence supports removal; emulation cannot verify iPhone sharing.

---

# Art tasks (ChatGPT)

Tristan picks which to run and approves the art before it's wired in.

| Task | Deliverable | Status | Wire-in (Claude) |
|---|---|---|---|
| [A1 High-res runner parts sheet](#a1-high-res-runner-parts-sheet) | `river-run/artwork/hires/` | done (PR #14) | done (PR #16), awaiting Tristan's OK to make HD the default |
| [A2 New River Run scene](#a2-new-river-run-scene) | `river-run/scenes/<id>/` | todo | todo |
| [A3 More backgrounds](#a3-more-backgrounds) | `shared/backgrounds/` | todo | todo |
| [A4 Recap carousel artwork](#a4-recap-carousel-artwork) | waits on feature #1 | blocked | — |
| [A5 High-res Hooper](#a5-high-res-hooper) | `special-post/artwork/hooper/` | todo | todo |
| [A6 Sample photos for templates](#a6-sample-photos-for-templates) | `carousel-maker/samples/` | todo | todo |
| [A7 Redraw the Special Post runners](#a7-redraw-the-special-post-runners) | `special-post/artwork/runners/<id>/` | todo (Russ first) | todo |

## Rules for every art task

- **Brand palette:** navy `#0E1A2E`, gold `#E8C96A`, teal `#2E9BAD`, paper
  `#F6F4EF`. Gold in prompts means `#E8C96A`.
- **Never** use ring gold `#FAB627` (logo only), and never draw, redraw or
  imitate the T.im badge, waves mark or wordmark. The traced logo files are
  the only logo.
- No text, letters, numbers, logos, watermarks, borders, panels or
  checkerboard backgrounds in any image.
- "Transparent" means real alpha. A painted checkerboard is a failed asset.
- Save the exact prompt for every image in that folder's `prompts.json`, in the
  same shape as the existing ones (`id`, optional `name`, `prompt`).
- Use the built-in image generation tool, as the existing assets did.
- One PR per task. Add files only; do not edit code, tests or other assets.
  Include a contact sheet or preview PNG in the PR so Tristan can review it on
  his phone.

## A1 High-res runner parts sheet

**Why:** the runner puppet's pieces are small (the head is 84×116 px), so he
only looks good up to about half the frame height. A larger, crisp set allows
bigger shots in River Run and the video intros.

**Reference:** `river-run/artwork/tristan-parts-reference.png` (1536×1536,
3×3 grid). It is the original outfit, upscaled and soft-edged. Cell positions
and original sizes are in `river-run/artwork/layout.json`.

**Deliver:** `river-run/artwork/hires/parts-atlas.png`, 1536×1536 or larger,
transparent, same 3×3 grid and cell order as the reference:

| Row | Left | Middle | Right |
|---|---|---|---|
| 1 | head | torso | shorts |
| 2 | thigh (shorts leg on top) | shin (light-blue sock) | shoe |
| 3 | upper arm | forearm (watch) | far forearm |

- Redraw each piece as clean flat vector-style art with crisp edges, in the
  same side view facing right, same proportions, same outfit: gold shirt with
  gold sleeve band on the upper arm, navy hydration vest with teal bottles,
  camo shorts with pink flames, light-blue sock, blue shoe with white sole,
  black watch on the near forearm.
- Each piece centered in its cell, filling it like the reference does, with
  nothing touching neighboring cells.
- **Head:** this is Tristan's likeness. Keep the hair shape, beard, profile
  and skin tone matching the reference; change nothing about the face.
  Tristan must approve the head before it's used.
- Skin tone identical across every piece.

**Wire-in (Claude):** cut and fit the pieces, add a high-res mode to the
puppet so it renders at the larger size, keep the original small set as
fallback, and confirm the run cycle, outfits and recordings still line up
(`tests/river-outfit-fit.cjs`, `tests/river-outfits.cjs`).

## A2 New River Run scene

**Pick one to start** (Tristan chooses):

- `woods` — wooded singletrack: hardwood trunks, roots, fallen leaves, late
  autumn light.
- `night` — night trail lit by a headlamp: dark navy trees, a soft pool of
  warm light on the ground.

**Deliver:** `river-run/scenes/<id>/` with three PNG layers plus
`prompts.json`, matching `river-run/scenes/mountain/`:

- `distant.png` and `middle.png`: 2172×724 (3:1), transparent above an uneven
  silhouette rooted on the bottom edge, horizontally continuous to both edges,
  direct side view, no vanishing point.
- `ground.png`: 2172×724, opaque, seamlessly tileable left to right, viewed
  from directly above, constant lighting at both edges.
- Copy the boilerplate wording from `river-run/scenes/mountain/prompts.json`
  (use case, asset type, hand-painted editorial style, "compatible with a
  flat cutout animated runner", the no-people/no-text list) and change only
  the scene description and colors.

**Wire-in (Claude):** make `.webp` versions, register the scene in
`river-run/scenes.js`, add the scene picker option, extend
`tests/river-riverside.cjs`.

## A3 More backgrounds

**Candidates** (Tristan picks any): `finish-chute` (empty finish-line chute,
barriers, morning), `aid-station` (empty trail aid-station table, cups and
jugs, no labels), `frost-road` (frosty rural road at sunrise).

**Deliver:** one square JPEG per background in `shared/backgrounds/`, about
1254×1254 like the others, and append its entry to
`shared/backgrounds/prompts.json`.

- Follow the existing prompts: composed to crop to both 16:9 and 4:5, central
  65% quiet, dark and low contrast for headlines and stats, photographic
  cinematic texture, no people.

**Wire-in (Claude):** make the `-landscape` (1920×1080) and `-portrait`
(1080×1350) versions, add them to `shared/background-pack.js`, update the
contact sheet and `tests/background-pack.cjs`.

## A4 Recap carousel artwork

Blocked until feature #1 is scoped. Likely a few textured slide backgrounds
for recap carousels; the brief will be added here then.

## A5 High-res Hooper

**Why:** Hooper (Tristan's dog, a brindle French bulldog) gallops beside the
runners in Special Post, but his pieces are tiny (the torso is 139×98 px), so
he goes soft at any real size. If A1 makes the runner bigger, Hooper needs to
keep up.

**Reference:** `special-post/artwork/hooper-parts-reference.png`, extracted
from the pieces embedded in `special-post/index.html`
(`DOGIMG`). Rig: `DOGPARTS` in the same file.

**Deliver:** `special-post/artwork/hooper/parts-atlas.png`, 1320×1320 or
larger, transparent, same 3×3 grid as the reference:

| Row | Left | Middle | Right |
|---|---|---|---|
| 1 | torso (`torso`) | head with orange collar (`head`) | empty |
| 2 | front upper leg (`fu`) | front lower leg (`fl`) | front paw (`fp`) |
| 3 | hind thigh (`hu`) | hind shank (`hl`) | hind paw (`hp`) |

- Same realistic painted look, brindle coat (dark brown with tan stripes),
  cream chest patch, bat ears, orange collar, side view facing right.
- Each piece keeps its shape and proportions from the reference, just
  sharper. Legs keep rounded caps at the joints so they overlap cleanly.
- Hooper is a real dog: keep his markings and face matching the reference.
  Tristan approves before use.

**Wire-in (Claude):** rebuild `DOGIMG` from the new atlas, refit `DOGPARTS`,
keep the gallop timing, and check paw ground contact and joints (as in the
earlier Hooper gait checks).

## A6 Sample photos for templates

**Why:** Carousel templates with photo slots (for example "What I use" and the
photo-story layout) look empty until a real photo is uploaded. Sample photos
make template previews look finished. They are placeholders for previews only
and are never presented as Tristan's own photos.

**Deliver:** six portrait JPEGs, 1080×1350, in `carousel-maker/samples/`, plus
`prompts.json`:

- `shoes` — a pair of running shoes on wet pavement
- `kit` — gear flat-lay: watch, running belt, socks, gels, cap
- `trail` — wooded singletrack trail, no runner
- `road` — empty road at sunrise with a painted lane line
- `stretch` — legs only, calf stretch on a park bench, no face
- `coffee` — post-run coffee on a bench beside a water bottle

Rules: no identifiable faces, no brand names or logos on products, no text.
Natural photographic look; keep a calmer area in the upper half for headlines.

**Wire-in (Claude):** show the samples in template previews and offer "Try a
sample photo" in Carousel Maker, clearly labelled as a sample.

## A7 Redraw the Special Post runners

**Why:** in Special Post, only the original Tristan and Sam (blue shorts) look
natural. The others were assembled from parts never drawn to go together:

- **Neck:** each head was cut from a photo with a flat line at the bottom and
  a small skin block added as a neck, then pinned to Tristan's torso. Some
  still carry bits of Tristan's vest strap.
- **Chest:** each torso is Tristan's hydration-vest outline filled with one
  flat color, so it reads as a slab with a hump on the back.
- **Hips:** the hips and shorts are Tristan's camo shorts recolored, keeping
  their cut and faint flame shapes. Arms also show a faint sleeve band and
  watch.

The fix is a complete, matched parts set per runner, drawn in the original
Tristan's style so neck, chest and hips are designed together.

**Order:** do **Russ first** as a pilot. Claude wires it in and Tristan
reviews it moving before the rest are drawn.

**Style and grid target:** `river-run/artwork/tristan-parts-reference.png`
(same 3×3 grid, cell order, proportions and flat-vector look as the original
Tristan, which is the one that looks right). Cell positions are in
`river-run/artwork/layout.json`.

**Who's who:** `special-post/artwork/runners/<id>-reference.png` shows each
runner's current head (left) and how they look today mid-stride (right). Use
the head for likeness and the right side for outfit colors only — not for body
shape.

| id | Runner | Look |
|---|---|---|
| `shades` | Russ | Long wavy brown hair, dark sunglasses, mustache and goatee; black tank top, black running shorts, white socks, tan shoes |
| `beard` | Shirtless | Short ginger hair, full ginger beard; no shirt (natural chest and stomach, lightly defined, not a flat block), rust-brown shorts, white socks, navy shoes |
| `samk` | Sam K | Long wavy light-brown hair; cream crop top, black shorts over black full-length leggings, light-gray shoes |
| `leggings` | Leggings | Long dark-brown hair; white crop tank, black full-length leggings, white-gray shoes |
| `tristan2` | Tristan 2 | Ginger hair and beard; same outfit as the original Tristan (gold shirt, navy vest with teal bottles, camo shorts with pink flames, light-blue socks, blue shoes) |

**Deliver** per runner: `special-post/artwork/runners/<id>/parts-atlas.png`,
1536×1536, transparent, plus `prompts.json`. Same grid as the Tristan
reference:

| Row | Left | Middle | Right |
|---|---|---|---|
| 1 | head **with full neck** | torso | hips / shorts |
| 2 | thigh (shorts leg or legging on top) | shin (sock or legging) | shoe |
| 3 | upper arm (sleeve if any) | near forearm | far forearm |

- **Neck:** draw the whole neck as part of the head, tapering naturally into
  the torso's neckline. No flat cut line, no separate skin block, no straps
  from another outfit.
- **Torso:** a real side-view chest and back for that person and outfit, with
  a rounded shoulder where the upper arm attaches. No backpack hump unless
  they wear a vest (only Tristan 2 does).
- **Hips:** that runner's own shorts or leggings waistband and seat, drawn
  fresh. Nothing traced from Tristan's camo shorts.
- Keep the joints the same shape as Tristan's pieces (rounded caps at
  shoulder, elbow, hip and knee) so pieces overlap cleanly when they bend.
- Skin tone identical across every piece of one runner. No watch unless the
  runner wears one.
- These are real people: keep each face, hair and beard matching their
  reference head. Tristan approves every runner before it's used.

**Wire-in (Claude):** fit each atlas to the original Tristan rig (same
approach as `river-run/outfit-fit.js`), replace that runner's pieces in
`special-post/index.html`, check neck, shoulder and hip joints across the
whole stride and the jump, and render a side-by-side against the original
Tristan for review. Original Tristan and Sam stay unchanged.
