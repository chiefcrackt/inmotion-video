# T.IM · Activity Studio

## Local use and development

From the repository root, run `npm ci`, then `npm run preview` and open **http://127.0.0.1:4173/activity-studio/**. Choose a single-activity FIT, GPX or TCX export, choose a template, customize and export. Serve over HTTP; workers and modules do not work reliably with `file://`.

`npm test` runs parser/model tests. `npm run test:browser` runs headless installed Google Chrome, including the bundled worker, PNG pixels/dimensions/alpha, privacy masking, desktop dragging, mobile layout, three-second MediaRecorder output/cancellation, and script syntax checks for all original tools. Screenshots go to a printed temporary folder. Synthetic fixtures are strictly for tests; the editor never inserts sample activity data.

Run `npm run build` after changing worker/parser/model imports or dependencies. It bundles Garmin's official `@garmin/fitsdk` and `@xmldom/xmldom` locally into `worker.js`, and copies third-party licenses. The committed bundle means GitHub Pages needs **no new build configuration**. Relative navigation, module, worker and asset URLs work under `/inmotion-video/`. `.nojekyll` is unchanged. Node and npm are development tools only. Existing tool files and exports are untouched.

## Implemented

- Local worker imports with FIT integrity validation, namespace-aware GPX/TCX parsing, explicit unsupported/corrupt-file errors, 40 MB input cap and a 90-second import timeout.
- Normalized SI activity model with separate raw fields, derived points, availability, source labels, laps, elapsed/moving timelines, duplicate timestamp merging, sensor fields and segment boundaries.
- Run summary, mapless route, performance dashboard, elevation and paginated recorded-lap templates. All selected metrics are availability-gated. Summary cards show up to six fields; dashboards up to nine.
- T.IM Cyber, Minimal and Race Broadcast presets; four output dimensions; metric/imperial units; title/caption, font, colors, line thickness, rotation, scale, visibility, opacity, touch/mouse composition dragging and position sliders.
- Timestamp-based route reveal, held-last-observation metric counters, moving elevation marker, play/pause/scrubbing, linear/smooth timing and 3–60 second recordings.
- Full-resolution PNG, optional PNG alpha, real-time canvas MediaRecorder output, format detection, cancellation, progress and download/share. Video always has an opaque background; no unreliable alpha-video option is offered.
- Endpoint privacy radius: every route point within the specified straight-line radius of the start **or** finish is hidden, including loop returns. Gaps never join across masked locations. The same renderer applies this to PNG/video. Totals and sensor charts still describe the full activity; this is a visual masking tool, not an anonymized activity-file exporter.

## Data semantics and limits

Internal distance/elevation is meters, duration seconds, timestamp Unix milliseconds, speed m/s, cadence steps/min, heart rate bpm and power watts. FIT semicircles convert to degrees; FIT cadence and TCX RunCadence convert strides to steps/min. Recorded session/timer totals take priority. TCX lap timer totals provide moving duration. Without timer totals/events, moving time uses intervals of at most 120 seconds with speed above 0.5 m/s; it is explicitly labeled estimated. Untimed GPS supports static graphics but disables playback. Dates display in the viewer's local timezone.

Recorded cumulative distance takes priority over GPS-derived distance. Segment transitions, missing coordinates, intervals over 120 seconds and GPS speeds above 25 m/s break geometry; GPS gaps are not connected or added to inferred distance. Route reveal uses observations at their timestamps and does not interpolate across gaps. Untimed records remain available for static graphics. Some file exports lose pause information, so derived totals can differ from the source platform. Sensor averages without recorded summaries are sample averages; absent fields stay null. No developer-field-specific running-power decoding is implemented.

Recorded ascent/descent takes priority. Otherwise, elevation uses 5-meter hysteresis to reduce jitter, labeled estimated; it is not terrain-corrected elevation. The elevation profile shows recorded altitude samples. Routes are projected locally with cosine latitude correction, including antimeridian wrapping; no map requests occur. Long routes are cached and decimated for display to approximately 12,000 points while retaining gaps/privacy boundaries. Underlying records and summary calculations retain the full data. The worker avoids blocking the editor during parsing, but very large files can still consume substantial device memory.

Multiple-activity TCX, multi-track GPX and multisport FIT files are rejected; export one activity. GPX routes/waypoints without trackpoints are unsupported. Device-specific extensions and cadence conventions vary; inspect totals against your original activity before publishing. No imported activity or GPS data is stored persistently or sent to a server. Barlow Condensed is bundled locally, with system font alternatives available. Core parsing/rendering makes no third-party requests after page assets load. This is not an offline-installable PWA.

Modern browsers with ES modules, workers and Canvas 2D are required. MediaRecorder and `canvas.captureStream` determine video support. MP4 is selected only if the browser advertises it; WebM retains its real extension/MIME type. Playback/export is real time, not a frame-accurate offline encoder. Hidden-tab recordings cancel rather than silently skip frames. Video buffering is capped at 128 MB. iPhone Safari and native share-sheet saving still need testing on a physical device; automated browser validation uses desktop Chrome and mobile emulation.

## Extension points and remaining work

`parsers.mjs` provides import adapters; `model.mjs` owns normalization, units, privacy and timeline lookup; `render.mjs` contains a template registry and shared timestamp rendering; `app.mjs` owns editing and export. Future components can read `atTime(activity, progress)` and the normalized points without reparsing. `version: 1` permits future model migrations. Source records remain separate for comparisons, video-offset synchronization, annotation analysis and multi-activity tools.

Phase 2 core is implemented. Remaining playback work: start/end trim, speed controls independent of export duration, jump-to-distance/time, checkpoint annotations, additional charts, finer export diagnostics and physical Safari/iPhone validation. Phase 3 currently includes paginated **recorded laps** with pace/time/distance and fastest/slowest highlights. Generated distance splits, per-split heart rate/animation, per-component transforms, checkpoints and highlights remain future work. Race comparison, course posters, carousel integration, video synchronization and multi-activity recaps have no speculative UI.

## Verification for this implementation

`npm run build`, all nine `npm test` cases, `npm run test:browser`, and `git diff --check` passed. The browser suite checks all original tool pages respond and their scripts parse; the original tool directories and `.nojekyll` have zero diff against `origin/main`. Local preview returned HTTP 200.

The existing `node cover-maker/tests/render.cjs` suite was also attempted. It fails at `original defaults preserved for hl` (highlight-cover pixel parity). Cover Maker's source and tests are unchanged from `origin/main`; this separate regression failure was left untouched. No full regression pass for existing tools is claimed. Physical iPhone/Safari and Firefox exports remain unverified.

Named design and export presets are available above the activity controls. They store settings only; activity and GPS records are excluded. Export/import JSON to move presets between devices. Barlow Condensed is the default; sans serif, serif and monospace options are available.
