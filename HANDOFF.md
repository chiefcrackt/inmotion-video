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
| [A1 High-res runner parts sheet](#a1-high-res-runner-parts-sheet) | `river-run/artwork/hires/` | done (PR #14) | done (PR #16); also in links-inMotion rotation |
| [A2 New River Run scene](#a2-new-river-run-scene) | `river-run/scenes/<id>/` | done: night (PR #15) | done (PR #17) |
| [A3 More backgrounds](#a3-more-backgrounds) | `shared/backgrounds/` | todo | todo |
| [A4 Recap carousel artwork](#a4-recap-carousel-artwork) | waits on feature #1 | blocked | — |
| [A5 High-res Hooper](#a5-high-res-hooper) | `special-post/artwork/hooper/` | todo | todo |
| [A6 Sample photos for templates](#a6-sample-photos-for-templates) | `carousel-maker/samples/` | todo | todo |
| [A7 Redraw the Special Post runners](#a7-redraw-the-special-post-runners) | `special-post/artwork/runners/<id>/` | todo (Russ first) | todo |
| [A8 Travis puppet and aid-station props](#a8-travis-puppet-and-aid-station-props) | `shared/characters/travis/` | done (PR #20), redraw in A8b | done (links-inMotion da8b0b9) |
| [A8b Redraw Travis to Tristan's outlines](#a8b-redraw-travis-to-tristans-outlines) | `shared/characters/travis/v2/` | done (PR #21) | done (links-inMotion b8e5c29) |
| [A8c Redraw Travis's torso only](#a8c-redraw-traviss-torso-only) | `shared/characters/travis/v2/torso.png` | done (PR #22) | done (links-inMotion 9706a2f) |
| [A9 Flat Hooper for the links page](#a9-flat-hooper-for-the-links-page) | `shared/characters/hooper/` | done (PR #23) | done (links-inMotion d818c0c) |
| [A9b Calmer coat for flat Hooper](#a9b-calmer-coat-for-flat-hooper) | `shared/characters/hooper/parts-atlas-v2.png` | todo | todo (links-inMotion) |

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

## A8 Travis puppet and aid-station props

**Why:** the links page (chiefcrackt/links-inMotion, https://in-motion.run)
gets an **Aid station** button next to the Hooper button. Tapping it plays a
short scene: Tristan slows to a stop, Travis (Tristan's fiancé) walks in from
the right, hands Tristan a PB&J, and Tristan eats it. Travis needs his own
puppet drawn to match the Tristan puppet, plus a few props.

**Style and grid target:** `river-run/artwork/hires/parts-atlas.png` and its
prompt in `river-run/artwork/hires/prompts.json` (same flat vector-style look,
same 3×3 grid and cell order, same side view facing right). Cell positions are
in `river-run/artwork/layout.json`. Copy that prompt's boilerplate (clean
silhouettes, flat fills, real transparency, no halos or flecks) and change only
the person and outfit.

**Likeness:** Tristan attaches a photo of Travis in the ChatGPT chat; it is not
stored in this repo. Use it for face, hair, beard, skin tone and build only, not
for the outfit (the photo shows jeans and sunglasses; the puppet has neither).

| Part | Travis |
|---|---|
| Hair | Short dark brown, a little fuller on top, short sides |
| Beard | Full, neatly trimmed dark brown beard and mustache |
| Skin | Fair, warm undertone, identical across every piece |
| Face | Calm, slight smile, right-facing profile. **No sunglasses** — not on his face and not pushed up on his head |
| Build | Broader and stockier than Tristan through the chest and middle; same joint positions so he fits the same rig |
| Shirt | Olive / gray-green crew-neck short-sleeve tee with a chest pocket. **No logo, no tag, no text** |
| Shorts | Casual khaki shorts, knee length (not running shorts) |
| Socks / shoes | Short dark crew socks; dark brown low hiking shoes with a gray sole |
| Watch | Black smartwatch on the near forearm |

Travis is crew, not a runner: no hydration vest, no bib, no race gear.

**Deliver** in `shared/characters/travis/`:

1. `parts-atlas.png`, 1536×1536 or larger (2048 preferred), transparent, same
   grid as the Tristan reference:

   | Row | Left | Middle | Right |
   |---|---|---|---|
   | 1 | head **with full neck** | torso | hips / shorts |
   | 2 | thigh (shorts leg on top) | shin (sock at bottom) | shoe |
   | 3 | upper arm (tee sleeve) | near forearm with watch and fist | far forearm with fist |

2. `props-atlas.png`, 1536×1024 or larger, transparent, 3×2 grid:

   | Row | Left | Middle | Right |
   |---|---|---|---|
   | 1 | PB&J, whole (triangle half, side-on: tan crust, white bread, brown peanut butter, purple jelly) | PB&J with one bite out | PB&J with two bites out |
   | 2 | last corner of crust | Travis near forearm, **open hand** palm up (watch) | Tristan near forearm, **open hand** reaching (match `river-run/artwork/hires` skin and his black watch) |

   The sandwich is drawn at the size it would be in a fist, so it can sit in
   any hand. Bites are clean rounded scallops, same piece otherwise.

3. `prompts.json` with both prompts, same shape as the others.
4. A preview PNG with Travis assembled standing next to the Tristan HD
   reference for scale, for review on a phone.

- Same rules as A7: draw the whole neck with the head (no flat cut, no skin
  block), rounded caps at shoulder, elbow, hip and knee, real side-view chest
  with a rounded shoulder.
- Draw Travis facing **right** like every other piece. The page flips him to
  face left as he walks in.
- Do not redraw or change Tristan's head or face.
- Travis is a real person: Tristan approves the head before anything is wired in.

**Wire-in (Claude, in links-inMotion):** fit the atlas to the Tristan rig the
way `scene/outfit-fit.js` does; copy the pieces locally under
`scene/travis/` (no cross-site image loads). Add an **Aid station** button
beside the Hooper button. Scene: Tristan eases to a stop and stands; Travis
walks in from the right edge at an easy walking cadence (slower than Tristan's
~0.6 s stride), stops a hand's reach away, raises the open hand with the
sandwich; Tristan's hand takes it; Tristan lifts it to his mouth three times
as the bite states advance, with a few crumbs; Travis waves and walks back out
to the right; Tristan resumes running. Button is disabled while it plays.
Hooper can stay in the scene. With reduced motion, show a still of the
handoff instead. Add checks to `tests/` for the button, a full play-through,
foot contact during Travis's walk, and the reduced-motion still.

## A8b Redraw Travis to Tristan's outlines

**Why:** the first Travis (A8) looks wrong next to Tristan on the live page:

- **Too heavy.** A8 asked for a "stockier" build, so he was drawn with a belly,
  then stretched to fill Tristan's torso, which is extra wide from the vest.
- **Straight lines.** His shorts were drawn as a full shorts leg, not a hip
  piece, so they had to be cut off flat at the hips. Sleeve and shorts cuffs
  are flat bands where Tristan's are rounded.
- **Different style.** His head is painted (eye, ear detail, shading, smile);
  Tristan's is flat shapes with no eye.
- **Hole in the shirt.** The torso has a cut-out armhole.

The fix: draw Travis **inside Tristan's exact outlines**, one piece per cell.

**Shape template:** `shared/characters/travis/v2/shape-template.png`
(1536x1536, 3x3, 512 px cells). Each gray shape is Tristan's piece outline,
traced from `river-run/artwork/hires/parts-atlas.png`. Same grid and order:

| Row | Left | Middle | Right |
|---|---|---|---|
| 1 | head with neck | torso | shorts (hip piece only) |
| 2 | thigh (shorts leg on top) | shin (sock at bottom) | shoe |
| 3 | upper arm (tee sleeve) | near forearm with watch and fist | far forearm with fist |

**Style target:** `river-run/artwork/hires/parts-atlas.png`. Flat vector
fills, one or two tones per area, no painted shading, no outlines, no texture.

**Likeness:** Tristan attaches the same photos of Travis in the ChatGPT chat
(not stored in this repo). Use them for hair, beard, skin tone and profile
only.

### Per piece

- **Head:** same size and outline as Tristan's head cell, same style: flat
  shapes, **no eye, no eyebrow detail, no mouth line, no ear detail** (Tristan
  shows none). Travis's own short dark brown hair (fuller on top, short sides)
  and his full, neatly trimmed dark brown beard, his nose and brow profile.
  Neck tapers into the bottom the way Tristan's does. No sunglasses.
- **Torso:** Tristan's torso outline **without the vest**: remove the bulge on
  the back (left side of the cell) and the bottle bulge on the chest, leaving a
  normal side-view chest and back. **Average build, flat stomach, no belly**,
  no wider than Tristan's chest. Olive tee, crew neck, small chest pocket, no
  logo. **No armhole cut-out**: the shoulder is solid shirt (the upper arm
  covers it).
- **Shorts:** **fill the hip-piece outline only**, like Tristan's camo piece:
  waistband to seat, rounded bottom corners. **Do not draw a shorts leg or any
  skin.** Khaki, a belt-loop waistband, maybe one pocket seam.
- **Thigh:** khaki shorts leg on top with a **rounded, slightly flared hem**
  (like Tristan's thigh cell), skin below, rounded knee cap.
- **Shin:** skin, short dark crew sock at the bottom with a soft curved top.
- **Shoe:** dark brown low hiking shoe, gray sole, flat side view, same outline
  as Tristan's shoe.
- **Upper arm:** olive tee sleeve on top with a **rounded hem**, skin below,
  rounded caps both ends.
- **Forearms:** same as Tristan's: near one with a black watch, both ending in
  a fist.

### Rules

- Every piece fills its gray shape: same outline, same size, same position in
  the cell. Small changes are fine where the clothing needs them (hair, beard,
  shoe tread), never a different body shape.
- Skin tone identical across every piece.
- Flat fills only. No gradients, no painted shading, no outlines, no texture.
- **No glow, no soft edges**, real transparent background, no checkerboard.
  (A8's props came with a wide orange glow that had to be cut off.)
- No text, logos, watermark or grid lines.

**Deliver** in `shared/characters/travis/v2/`: `parts-atlas.png` (1536x1536,
transparent, 512 px cells), `prompts.json`, and a preview PNG of Travis
assembled standing beside Tristan.

Props stay as they are (the sandwich states from A8 are fine). Tristan approves
the head before wire-in.

**Wire-in (Claude):** build from `v2/` in `shared/characters/travis/build.py`
(no shorts crop needed), recopy to links-inMotion `scene/travis/`, bump the
cache version, rerun `tests/aid-station.cjs` and compare frames.

## A8c Redraw Travis's torso only

**Why:** A8b fixed everything except the torso. His chest and back look large
and rounded on the live page, like a barrel. The A8b torso traced the outline
of Tristan's torso **with the hydration vest on** and rounded it off, so it came
out about 28% wider than Tristan's at the stomach. Everything else in A8b stays.

**Redraw one piece:** Travis's torso, side view facing right.

**References:**

- `shared/characters/travis/v2/torso-guide.png` (512x512): the **size target**,
  the A8b torso 20% narrower. Fill this area; do not go wider. Same position
  in the frame.
- Cell row 1, middle of `shared/characters/travis/v2/parts-atlas.png`: the
  current torso, for colors, collar, pocket and neck stub.
- `river-run/artwork/hires/parts-atlas.png`: style target (flat vector fills).

**Shape (this is the fix):**

- **Back (left edge): nearly straight.** A gentle shoulder-blade curve at the
  top, then a straight line down to the hem. No bulge, no hump.
- **Chest (right edge): one shallow curve** from the collar to the bottom of
  the chest, then **straight down** to the hem. No round belly, no barrel.
- The torso is **narrowest at the waist** and the hem is no wider than the
  chest. Average build, about as wide as Tristan's chest without his vest.
- Shoulders: rounded on top where the upper arm attaches, solid shirt (no
  armhole cut-out).
- Neck stub at the top in the same place and size as the current one, so the
  head still sits on it.
- Hem at the bottom, flat, in the same place as the current one.

**Look:** same olive tee as A8b, crew-neck collar band, small chest pocket, no
logo. Flat fills, no shading, no outlines, no texture.

**Rules:** real transparent background, no glow, no soft edges, no
checkerboard, no text. Match A8b's skin tone on the neck stub exactly.

**Deliver** in `shared/characters/travis/v2/`:

- `torso.png`: 512x512, transparent, torso centered like the guide.
- Add its prompt to `shared/characters/travis/v2/prompts.json` (new entry,
  `id: "torso"`).
- `torso-preview.png`: the new torso and the current one side by side, so
  Tristan can compare on his phone.

**Do not** change `parts-atlas.png` or any other piece.

Tristan sends Claude the preview before merging.

**Wire-in (Claude):** when `v2/torso.png` exists, `build.py` uses it in place
of the atlas torso cell. Recopy to links-inMotion `scene/travis/`, bump the
image version, rerun `tests/aid-station.cjs` and compare frames.

## A9 Flat Hooper for the links page

**Why:** on the links page (links-inMotion), Hooper gallops beside Tristan, but
his legs look wrong. His torso piece was cut with the **tops of his legs still
attached**: the rump hangs down like a thigh at the back, and the chest drops
at the front. The real legs attach below those stumps, so he gets doubled-up
legs and thin, spindly lower legs. He is also realistic painted fur, while
Tristan and Travis are flat vector style.

This is separate from A5 (high-res realistic Hooper for Special Post). A9 is a
new **flat** Hooper for the links page.

**Reference:** `shared/characters/hooper/links-reference.png` (1536x1536, 3x3,
512 px cells): his current eight links-page pieces, all scaled by the same
factor so their sizes relative to each other are true. Use it for likeness,
markings, proportions and which piece is which. **Do not copy the torso's
outline** (that is the bug).

**Style target:** `river-run/artwork/hires/parts-atlas.png` (Tristan) and
`shared/characters/travis/v2/parts-atlas.png` (Travis). Flat vector fills,
no painted fur, no shading gradients, no outlines.

**Hooper:** brindle French bulldog, side view facing right.

- Coat: dark brown with tan brindle stripes, drawn as **simple flat stripes**
  (two or three tones), not fur texture.
- Cream chest patch at the front of the chest.
- Bat ears, upright. Short flat muzzle, dark nose. Match the puppets' faces:
  **no eye detail** (Tristan and Travis show none).
- Orange collar on the neck.

**Deliver** `shared/characters/hooper/parts-atlas.png`, 1536x1536,
transparent, 512 px cells, same grid as the reference:

| Row | Left | Middle | Right |
|---|---|---|---|
| 1 | torso | head with neck and orange collar | empty |
| 2 | front upper leg (shoulder to elbow) | front lower leg | front paw |
| 3 | hind thigh | hind shank | hind paw (hock and foot) |

### Torso (the fix)

- **Body only, no legs.** A compact, muscular barrel from the shoulders to the
  rump. The bottom edge is the chest and belly line: deep at the chest,
  tucking up toward the hips.
- **Nothing hangs below that line** at either end. No thigh at the back, no
  leg at the front.
- **Round shoulder and hip areas** where the legs attach, so the leg tops
  tuck in under them as the legs swing.
- Cream chest patch at the front; tail is a short stub at the top of the rump.
- No neck; the head piece brings the neck.

### Legs

- Each piece is **one solid shape with rounded caps at both joint ends**, so
  pieces overlap cleanly when they bend.
- **Front upper leg:** the shoulder and upper leg in one piece, wide at the
  top. **Hind thigh:** the meaty thigh, wide at the top.
- Lower legs are sturdy, not thin. Hooper is stocky.
- Paws: a rounded foot with a hint of toes, same flat style.
- Keep the same sizes as the reference pieces (same proportions to the torso).

### Head

- Head, neck and collar in one piece, facing right, neck tapering at the
  bottom so it tucks into the front of the torso.

### Rules

- Brindle colors identical across every piece.
- Real transparent background; no glow, no soft edges, no checkerboard, no
  text, no grid lines.
- Add the prompt to `shared/characters/hooper/prompts.json` (`id`,
  `prompt`).
- Add `preview.png`: Hooper assembled standing, next to the current Hooper
  from the reference for comparison.

Hooper is a real dog: Tristan approves the likeness. Tristan sends Claude the
preview before merging.

**Wire-in (Claude, in links-inMotion):** cut the atlas to `scene/hooper/`,
refit `DOGPARTS` in `scene/runner.js` (pivots, ends, scales) to the new
pieces, keep the gallop timing and hop, and run `tests/hooper-gait.cjs` (paw
ground contact, fixed bone lengths, continuous joints). Compare frames before
and after.

## A9b Calmer coat for flat Hooper

**Why:** A9's shapes work and are wired in, but at the size Hooper runs on a
phone (about 60 px tall) his coat is too busy. Every piece has the same bold,
high-contrast tiger stripes, so his near legs, far legs and body blur into one
shape and you can't see where a leg ends. The thin dark outline on every piece
also shows as seams where the pieces overlap at the joints.

**Keep the shapes exactly. Change only the coat.**

**Shape template:** `shared/characters/hooper/shape-template.png`
(1536x1536, 3x3, 512 px cells): the A9 pieces as gray silhouettes, same grid
and cell order as `shared/characters/hooper/parts-atlas.png`. Fill each gray
shape exactly: same outline, size and position in the cell. The rig is already
fitted to these shapes.

**Coat:**

- **Mostly solid dark brindle base** (dark chocolate brown), with **a few
  thin, soft tan streaks**: low contrast, roughly a third as many as A9, and
  none on the lower legs and paws.
- **Lower legs and paws a touch darker** than the body, so legs read clearly
  against the chest and belly.
- **Cream chest patch** kept, a little larger so the front of the body reads.
- **A slightly lighter top-line** along the back and the top of the head
  (simple flat highlight band), so his silhouette pops on a dark navy page.
- **No outlines** around any piece. Edges are just the fill color.
- Same head details as A9: bat ears with pink inside, dark muzzle and nose,
  orange collar, no eye.

**Rules:** flat fills only (two or three tones total), real transparent
background, no glow, no soft edges, no checkerboard, no text, no grid lines.
Colors identical across every piece.

**Deliver** `shared/characters/hooper/parts-atlas-v2.png` (1536x1536,
transparent, same grid), add its prompt to
`shared/characters/hooper/prompts.json` (`id: "parts-atlas-v2"`), and
`preview-v2.png`: the A9 Hooper and the new one standing side by side on a
**dark navy background (#0E1A2E)** and again at small size (about 60 px tall),
so Tristan can judge it at phone size. Do not change `parts-atlas.png`.

Tristan sends Claude the preview before merging.

**Wire-in (Claude):** point `shared/characters/hooper/build.py` at
`parts-atlas-v2.png` (the leg fitting reads the shapes, so pivots barely
move), recopy to links-inMotion `scene/hooper/`, update `DOGPARTS` from the
printed values, run `tests/hooper-gait.cjs`, compare frames at phone size.

