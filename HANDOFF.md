# Feature handoff

Planned features for the Video Tools site, listed in build order. These specs
were first written as `TODO(Claude)` comments inside the code; they live here
now so they're easy to find and check off. Spec text is kept as written.

Status: `todo` → `in progress` → `done` (link the PR).

Feature 4 was dropped and is intentionally not listed.

| Order | Feature | Tool | Status |
|---|---|---|---|
| 1 | [#3 Text-overflow detection and optional fit](#3-text-overflow-detection-and-optional-fit) | Carousel Maker | todo |
| 2 | [#1 Activity-to-carousel race recap](#1-activity-to-carousel-race-recap) | Activity Studio → Carousel Maker | todo |
| 3 | [#5 Activity trim and checkpoints](#5-activity-trim-and-checkpoints) | Activity Studio | todo |
| 4 | [#2 Multi-select, grouping and distribution](#2-multi-select-grouping-and-distribution) | Carousel Maker | todo |
| 5 | [#6 Shared brand kits across visual tools](#6-shared-brand-kits-across-visual-tools) | Shared | todo |
| 6 | [#7 Shared recording lifecycle](#7-shared-recording-lifecycle) | Shared (Title Maker first) | todo |

Open question for #1: decide how it relates to the Race Recap download pack
(`tools/race-recap/`) before building — a new carousel flow, or a way to feed
activity data into that pack.

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
