# inmotion-video

**Transcribe Video** is available from the tools hub at `/transcribe-video/`.
It opens the local transcription engine on the current computer. Start
`local-transcriber/Start Transcribe Video.cmd` on Windows; the studio opens at
`http://127.0.0.1:8765/`. GPU/CPU processing, recordings and exports stay local.
See [setup and usage](local-transcriber/README.md). GitHub Pages hosts the entry
page; the Python engine runs only on the computer where the launcher is started.

**Clean Voice** is available from the tools hub at `/clean-voice/`. Start
`local-voice/Start Clean Voice.cmd` on Windows; the studio opens at
`http://127.0.0.1:8766/`. It removes background noise or isolates the voice on
the NVIDIA GPU, then evens out the volume. See [setup and usage](local-voice/README.md).

**Video Tagger** is available from the tools hub at `/video-tagger/`. Start
`local-tagger/Start Video Tagger.cmd` on Windows and pick a folder: it transcribes
each video with the Transcribe Video engine, tags and describes it with a local
Ollama model, and writes `library.json` to `D:\VideoTagger`. See
[setup and usage](local-tagger/README.md).

Celebration Studio is at `/celebration-studio/`, combining
Special Post and Celebration as two modes while retaining both original editors
and dashboard links. See [preview behavior and validation](celebration-studio/README.md).

Text & Titles is at `/text-and-titles/` with Animated text and
Titles & lower thirds modes. Original projects and export paths are preserved.
See [compatibility and validation](text-and-titles/README.md).

Content Studio is at `/content-studio/`, with Ideas,
Videos and Shoot views retaining their existing data and sync systems. See
[workflow, compatibility and validation](content-studio/README.md).

Publishing Studio is at `/publishing-studio/`, grouping Covers,
Promo clips and Brand templates with the original saved-project formats. See
[preview behavior and validation](publishing-studio/README.md).

Runner Animator is at `/runner-animator/`, grouping Start Line
and Running scenes while preserving their renderers, sound and project formats.
See [compatibility and validation](runner-animator/README.md).

Social Post Studio is at `/social-post-studio/`, grouping
Carousels, Rankings and Before & After with their original editors and formats.
See [preview behavior and validation](social-post-studio/README.md).

The homepage is the consolidated studio dashboard, built from
`shared/tool-registry.mjs` by `npm run build`. It shows the studios first and
keeps every original tool under "Original tools & asset packs". `/dashboard-preview/` remains available for comparison. See
[preview behavior and validation](dashboard-preview/README.md).

**Saving and sync.** Every tool saves on the device you use it on. Ideas and
video plans sync across devices with Workspace cloud sync in Content Studio
(Supabase). Google Drive sync and Drive exports were removed in November 2026.

Recording tools for tristan.inmotion (T.im) videos, published with GitHub Pages at
**https://chiefcrackt.github.io/inmotion-video/**

For development, run `npm ci`, then `npm test` and `npm run build`.

**Asset versions.** Every local CSS and script link carries `?v=<hash>` of
that file's content (`tools/stamp-assets.mjs`), so after an update a phone
never mixes a new page with old cached files. `npm run build` restamps; run it
(or `npm run stamp`) before committing any page, style or script change.
`npm test` fails if a version is out of date.
`npm run format` formats handwritten HTML, CSS, JavaScript and JSON;
`npm run format:check` checks the same files without writing them. Generated
`activity-studio/worker.js`, third-party licenses and the lockfile are excluded.

Browser tests share `tests/browser-utils.cjs`. They use `CHROME_PATH` when set,
otherwise Playwright's installed Chromium, then installed Chrome or Edge.
Run `npx playwright install chromium` if no supported browser is available.
All suites use the project's `@playwright/test` dependency and write screenshots
and downloads to unique OS temporary directories printed during each run.
Run `npm run test:hub`, `npm run test:browser`, `npm run test:carousel:all`
and `npm run test:cover:browser` for the full browser checks. These commands work
from the repository root on Windows, macOS and Linux with a supported browser.

The home page groups tools by task and offers search and category filters. All tool links remain ordinary relative links and work without JavaScript. Run `npm run test:hub` to check every tool's navigation, filters, search, mobile layout and JavaScript-free access (requires Chrome).

| Tool                | Path                | What it makes                                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carousel Post Maker | `/carousel-maker/`  | Six running and gear templates; editable photo, text, product, stats and comparison slides; shared styling; reorder and duplicate; numbered PNG and ZIP export                                                                                                                                             |
| Tier List Maker     | `/tier-list/`       | Rank up to 12 items in five editable tiers: photo (optional white-background cut-out), notes, verdict; a 1080×1350 carousel (tier board plus one slide per item) as PNGs or a ZIP, and a 9:16 or 16:9 tier-reveal video where each item drops into its tier, with Cyber/Soft/Minimal/None sound from the Beat Bed engine, navy or green screen |
| Activity Studio     | `/activity-studio/` | Local FIT/GPX/TCX imports, a Run recap card in the Video Framer look (navy grid or your own photo, gold route window, journey tag, typed-over stats incl. temperature, elevation profile and per-mile/km split bars, 9:16 kept clear of TikTok's UI), editable run cards, dashboards, route reveals, elevation profiles and recorded lap graphics; PNG and browser-recorded video; route draw styles (glowing head, comet trail, ghost route, runner dot, zoom-follow) and an optional route intro that draws in, glides into the card and lands on the finished card |
| Sound Forge         | `/sound-forge/`     | Four-layer sound effects studio: 35 procedural presets (incl. the data-kit hits), samples, effects, shared local library, stereo WAV and stems                                                                                                                                                                                       |
| Beat Bed            | `/beat-bed/`        | Music beds in 14 styles (Cyber, Soft, Minimal, Drive, Lo-fi, Synthwave, Cinematic, Trap, Anthem, Reflective, Trail, Heartbeat, Playful, Sunny), each with 2–3 grooves and a Dark/Bright/Dreamy mood: tempo, swing, key, sections (intro, build, drop, verse, breakdown, outro) or one length, intros and endings, a five-part mixer with mute/solo, bass sound, brightness, reverb and echo; live preview and 48 kHz stereo WAV that ends on the bar |
| Clean Voice         | `/clean-voice/`     | Computer only, with the local launcher: GPU noise removal (MossFormer2) or voice isolation (Demucs), loudness to −16 LUFS; cleaned MP4 with the original picture, or WAV                                                                                                                                                                                                                                                                             |
| Video Tagger        | `/video-tagger/`    | Computer only, with the local launcher: transcribes, tags and describes a folder of footage into `library.json` (speech level, tags from your list, description, transcripts)                                                                                                                                                                                                                                                                        |
| Title Maker         | `/title-maker/`     | Cyber-kit title cards, lower thirds, word tags and chapter cards with sound; optional exits (reverse, fade, wipe, slide, drop, shrink, pop, glitch, cut) with length, easing, direction and end hold, or each card’s original ending |
| Promo Maker         | `/promo-maker/`     | An "Out now" clip from a video's thumbnail and title                                                                                                                                                                                                                                                       |
| Goals Maker         | `/goals-maker/`     | A goals graphic for 5–7 goals: checklist, numbered or route layouts; optional photo or logo per goal; an optional runner; animated video with sound (16:9 for YouTube, 9:16, 1:1) or PNG; navy, paper or green screen |
| Cover Maker         | `/cover-maker/`     | YouTube thumbnails, Reel covers and highlight covers as PNGs                                                                                                                                                                                                                                               |
| Video Framer        | `/video-framer/`    | Two directions: a branded 16:9 frame with windows for 9:16 clips, or a 9:16 frame (1080×1920) with a YouTube clip full width, title above, stats/description/call to action below, all clear of TikTok’s UI. In 16:9: centered, side or two-clip layouts, 9:16/4:5/1:1 windows, standard/phone/polaroid/offset/viewfinder styles, facecam window, end-screen version; stats or a description, series tag, icons and mi/km, GPX/FIT/TCX route and elevation (local, ends hidden), ticker, jogging runner, T.im badge, River Run scenes or your own photo, grain/scanlines; seamless loops or static, plus an intro with sound that ends on the loop’s first frame; transparent PNG, green-screen MP4 or transparent WebM for CapCut |
| Start Line Recorder | `/start-line/`      | The runner walks to the line, gets set, countdown, takes off                                                                                                                                                                                                                                               |
| River Run Recorder  | `/river-run/`       | The link-page night scene: the runner jogs along the river under a gold sun, with jumps, rim light and footstrike ripples; green screen and navy for overlays                                                                                                                                              |
| Stat Counter        | `/stat-counter/`    | A big number counts up to your figure, with a unit, eyebrow, sub line, HUD brackets, a glitch on the hit and Cyber/Soft/Minimal/None sound; every value editable; 16:9 or 9:16; navy or green screen; video (MP4/WebM) and PNG still |
| Mile Marker Maker   | `/mile-marker/`     | A trail-sign pop-up for any distance, with a climbing ding                                                                                                                                                                                                                                                 |
| Special Post Maker  | `/special-post/`    | Birthday, congrats, race-day and thank-you posts: 1–3 runners (pick whole runners or mix any pieces) jog in and finish with a jump, high-five or arms up; show/hide every piece; add-ins: Hooper, fireworks, streamers, sparkles, number balloons, stat card, zoom punch; video with sound, still PNG, WAV |
| Celebration Maker   | `/celebrate/`       | Shout-out posts without runners: name card, cake + candles, race bib or finisher medal, with confetti, balloons, number balloons, fireworks, streamers and sparkles; video with sound, still PNG, WAV                                                                                                      |
| Merch Stencils      | `/merch-stencils/`  | Cricut cut files (true-size SVG) for bleach-stencil shirts. Cut settings (12×12 / 12×24 mat or Smart Materials size check on every file; mirror for iron-on vinyl). Shirt builder: oversized tee at real scale (S–2XL, front/back, 1" grid) in black splatter, charcoal or denim acid wash, black or navy; light or dark bleach design or iron-on vinyl (white/cream/gold); add pieces from the makers and library, drag, size, nudge, center; save one side as an aligned transfer or every piece packed for the mat, both with weed frames. a [name].inmotion maker (one line or stacked, center chest / left chest / full back, thin-line warning, dark or light preview); a route maker (GPX/FIT/TCX read on the device through the Activity Studio reader, first-loop trim for loop races, rotate, size, line weight, race name and an optional distance/date line; Pain in Moraine preset); plus .inmotion wordmarks, the .inmotion + waves lockup, outline waves + STAY IN MOTION, both mottos, the distance ladder (stacked and sleeve), the round badge (4" and 10"), the T.im mark and the waves mark. Rebuild with `python3 tools/build-merch-stencils.py` |
| Animation Downloads | `/downloads/`       | Finished animations (trailer pack, River Run, Portal, The Loop, The Drop): MP4, green screen MP4, transparent WebM, WAV, and a zip per pack                                                                                                                                                                |

Each tool is a single self-contained HTML page. It draws on a canvas, synthesizes its sounds with the Web Audio API, and records the result with MediaRecorder (MP4 on Safari, WebM where MP4 isn't available). Recordings save through the share sheet on iPhone, iPad and Android ("Save Video" puts them in Photos) and as a normal download on a computer, including Windows, where Chrome and Edge would otherwise open the Windows share panel. Run `npm run test:desktop-save` to check every tool on a simulated Windows desktop.

Recording and saving are shared: `shared/recorder.js` (`TimRecorder`) picks the format, runs MediaRecorder, stops on a hidden tab and releases tracks, timers and listeners on every outcome; `shared/save.js` (`TimSave`) tries the host's downloads capability, then the phone share sheet, then a download link, for videos, PNGs, WAVs and ZIPs. A tool still draws its own frames, schedules its own sound and sets its own pre-roll and tail with `session.after()`. Load both as plain scripts (`<script src="../shared/recorder.js"></script><script src="../shared/save.js"></script>`) and don't copy recorder or save code into a new tool. Run `node --test tests/recorder.test.mjs tests/save.test.mjs`.

Beat Bed's engine is `shared/sound/beat.mjs`: `bedEvents()` builds a testable note timeline and `makeKit()`/`playEvents()` play it, so other tools can put the same bed and hits under their videos. Run `node --test tests/beat.test.mjs`.

Sound Forge uses reusable modules in `shared/sound/` for offline rendering, a
versioned preset schema, IndexedDB sample storage and PCM WAV export. Title Maker
can select saved Sound Forge presets and include them in its existing video
recording. See [Sound Forge implementation and validation](sound-forge/README.md)
for integration examples, project portability, testing and limitations.

The runner is the cut-out from [links-inMotion](https://github.com/chiefcrackt/links-inMotion) (`scene/runner/`), inlined into the Start Line and River Run pages.

The ProRes 4444 desktop versions of the animations are not in this repo; they are too large for GitHub Pages.

Activity Studio uses small native ES modules and a committed parser-worker bundle alongside its HTML page. See [its documentation](activity-studio/README.md) for development, data semantics, tests and browser limitations. Existing tools still require no build step.

Carousel Post Maker runs locally in the browser with no build or external dependencies. Drafts (including resized uploaded photos) save in localStorage; storage limits are reported in the editor. PNG exports are 1080 × 1350 or 1080 × 1080. ZIP export uses uncompressed PNG entries. Opening a template replaces the current slides after confirmation. See `carousel-maker/README.md`.

### Text Motion

Open `text-motion/` for animated text clips in the T.im palette. Choose Rise up, Typewriter, Pop in or Slide across; edit the headline and caption; set colors, duration and landscape, portrait or square output. Download a silent video (WebM, or MP4 where supported) or save the current frame as PNG. Exports run locally in the browser.

Text Motion also includes Fade in and Wipe reveal, entrance speed, alignment and vertical placement, four color presets, and an optional Title Maker-style glitch with strength and timing controls. Drafts save on the current device; Reset settings restores the defaults.

Text Motion and Title Maker share an exit engine (`shared/exits.js`): reverse of entrance, fade, wipe, slide, drop, shrink, pop, glitch out or cut, with exit length, easing, direction, end hold and, in Text Motion, a gap and order for each line. **Original** keeps each tool’s existing ending and is the default; its frames are unchanged. Fades never run on green screen (Title Maker wipes instead) so Chroma Key stays clean. Run `npm run test:exits:browser`.

Enable Transparent background in Text Motion for alpha-preserving PNG stills and a 30 fps PNG-sequence ZIP. Import the frames as an image sequence in a video editor. The preview checkerboard is not exported. Download video follows this toggle: transparent mode exports an alpha-channel WebM using WebCodecs VP9 encoding (Chrome or Edge). Import it into an editor that supports WebM alpha. Solid backgrounds retain the existing browser recorder.

## Studio bar on every tool

Every tool page starts with the shared Studio bar: `← Studio` plus the page
name, linking back to the homepage. Page titles follow
`Tool name · T.IM Studio`. Both names come from `shared/tool-registry.mjs`.
To add the bar to a new tool, register the tool, then add to its page:

```html
<!-- in <head> -->
<link rel="stylesheet" href="../shared/studio-bar.css" />
<script type="module" src="../shared/studio-bar.mjs"></script>
<!-- first thing in <body> -->
<tim-studio-bar></tim-studio-bar>
```

Don't add a separate back link. The bar hides itself when a studio preview
shows the page in a frame. `npm test` (`tests/studio-bar.test.mjs`) fails if a
page folder isn't registered, is missing the bar, or has an off-pattern title.

## Kinetic text and morphs

`shared/kinetic.js` animates words for any tool: per-letter (cascade, bounce,
wave, flip, decode), per-word (word by word, word punch) and split/mask
reveals (slice, mask rise, split), plus morphs from one phrase to another
(word to word, scramble, liquid). Used by Text Motion, Title Maker, Promo
Maker (video title), Special Post and Celebrate (the name), Mile Marker (the
big number), Tier List (title and item names; no morph) and Brand Assets
(the newest headline line, in its Animation picker; no morph).

A tool sets its canvas font and fill, then calls
`TimKinetic.draw(ctx, { lines, align, t, len, style, seed, opaque, to, morph, morphAt, morphLen })`
with the lines it would have drawn. It returns `false` for Original, so the
tool keeps its own entrance. Frames are a pure function of time, so preview,
scrubbing and recordings match. Pass `opaque: true` on green screen so nothing
is part-transparent. Exits stay with `shared/exits.js`. Optional:
`passes` for layered text (outline, offset shadow, fill), `perChar` for
tools that space letters one at a time, `maxWidth` to keep a word punch in
frame, and `TimKinetic.morphWindow(enterEnd, endBy, len)` to place a morph
between a tool's entrance and its ending.
`tests/kinetic.test.mjs` covers timing, layout, morph pairing and that every
style ends on the plain text.

## Saved projects, themes and text

Barlow Condensed is the default text family, served from the licensed font files in `shared/fonts/`; no Google Fonts request is required. Editable visual tools offer other font choices. Existing saved carousel typography is preserved, while new carousels default to Barlow Condensed. T.im remains the default output theme; Minimal and Race Broadcast are optional alternatives. Uploaded photos and runner cutouts retain their original colors, and chroma green remains green. Sound Forge and Animation Downloads have no editable visual output, so they use the bundled interface font without output-style controls.

Title, Promo, Cover, Start Line, River Run, Mile Marker, Special Post, Celebration and Text Motion offer named snapshots under **Saved projects & text / theme**. Save as new creates another version; load/import asks before replacing the current setup. Snapshots live in IndexedDB on this browser and origin. Export/import version 1 JSON to back up or move work between devices. Cover and Promo include photos (resized to at most 2400 pixels along the long edge); project JSON is limited to 35 MB. Text Motion retains its automatic draft saving; named projects provide additional snapshots. Browser storage can be cleared; keep JSON backups for important work.

Activity Studio saves named design and export presets only, without persisting activity or GPS data. Re-import the activity separately. Carousel Maker and Sound Forge retain their existing project libraries and portable formats.

The jogging runner is shared from `shared/runner.js` (a copy of River Run’s rig). River Run’s scene scripts accept `window.RiverSceneBase` so other tools can load the scenes; River Run itself is unchanged. Run `npm run test:framer:browser` for the Video Framer checks.

Run `npm run test:projects:browser` for named save/load, reload persistence, JSON round trips, wrong-tool rejection, embedded photo restoration, local fonts and mobile layout.

## Optional T.im background pack

Cover Maker and Carousel Maker include six generated backgrounds under **T.im background pack**. Select a preview and press **Use selected background** to apply it using existing photo controls. Original options remain available. Square, portrait and landscape assets plus exact generation prompts are in `shared/backgrounds/`. Run `node tests/background-pack.cjs` for integration checks.

River Run also offers the six optional image backdrops, with output-theme matching and an original-art toggle. River scene, Navy + grid, Green screen, all four outfits and existing recording controls remain available. Run `node tests/river-backgrounds.cjs` for the scene and recording checks.

### Moving riverside

River Run has one optional **Moving riverside** scene with separately generated hill, tree-bank, gravel and foreground-reed layers. Scrolling ground follows the existing stride speed; distant layers move more slowly and near reeds move faster. It supports the three output themes, both formats, all outfits and existing recordings. All previous backgrounds remain available and River scene stays the default. See `river-run/scenes/riverside/README.md` and run `npm run test:river:riverside`.

River Run also includes optional **Cyberpunk city run** and **Mountain trail** moving scenes, sharing the riverside parallax system and stride-matched ground. Each adds three generated layers with compressed runtime assets; the original PNGs and prompts are preserved under `river-run/scenes/`. Existing scenes and defaults are retained. Run `npm run test:river:scenes` to verify all three moving scenes and their recorded output.

## Running Essentials downloads

Animation Downloads now also includes six training labels, four transitions and five distance markers, in landscape and portrait with green-screen MP4, transparent WebM and matching WAV sound. Finished files, a preview and the complete ZIP are in downloads/files/running-essentials/. See [pack sources and rebuild instructions](tools/running-essentials/README.md). All existing tools and packs remain available.

## Race Recap downloads

Animation Downloads also includes ten matching race-video clips: an opener,
four race chapters, finish and PB celebrations, blank finish-time and pace
panels, and an outro. Both orientations include green-screen MP4, transparent
WebM and matching WAV sound. Individual previews, a montage and a complete ZIP
are included. Add your actual result as an editor text layer over the blank
result panels. See [Race Recap usage and rebuild instructions](tools/race-recap/README.md).
