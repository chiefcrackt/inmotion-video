# inmotion-video

Recording tools for tristan.inmotion (T.im) videos, published with GitHub Pages at
**https://chiefcrackt.github.io/inmotion-video/**

For development, run `npm ci`, then `npm test` and `npm run build`.
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
| Activity Studio     | `/activity-studio/` | Local FIT/GPX/TCX imports, editable run cards, dashboards, route reveals, elevation profiles and recorded lap graphics; PNG and browser-recorded video; route draw styles (glowing head, comet trail, ghost route, runner dot, zoom-follow) and an optional route intro that draws in, glides into the card and lands on the finished card |
| Sound Forge         | `/sound-forge/`     | Four-layer sound effects studio: 35 procedural presets (incl. the data-kit hits), samples, effects, shared local library, stereo WAV and stems                                                                                                                                                                                       |
| Beat Bed            | `/beat-bed/`        | Music beds in eight styles (Cyber, Soft, Minimal, Drive, Lo-fi, Synthwave, Cinematic, Trap): tempo, swing, key, sections (intro, build, drop, verse, breakdown, outro) or one length, intros and endings, a five-part mixer with mute/solo, bass sound, brightness, reverb and echo; live preview and 48 kHz stereo WAV that ends on the bar |
| Title Maker         | `/title-maker/`     | Cyber-kit title cards, lower thirds, word tags and chapter cards with sound; optional exits (reverse, fade, wipe, slide, drop, shrink, pop, glitch, cut) with length, easing, direction and end hold, or each card’s original ending |
| Promo Maker         | `/promo-maker/`     | An "Out now" clip from a video's thumbnail and title                                                                                                                                                                                                                                                       |
| Cover Maker         | `/cover-maker/`     | YouTube thumbnails, Reel covers and highlight covers as PNGs                                                                                                                                                                                                                                               |
| Video Framer        | `/video-framer/`    | A branded 16:9 frame with windows for 9:16 clips: centered, side or two-clip layouts, 9:16/4:5/1:1 windows, standard/phone/polaroid/offset/viewfinder styles, facecam window, end-screen version; stats or a description, series tag, icons and mi/km, GPX/FIT/TCX route and elevation (local, ends hidden), ticker, jogging runner, T.im badge, River Run scenes or your own photo, grain/scanlines; seamless loops or static, plus an intro with sound that ends on the loop’s first frame; transparent PNG, green-screen MP4 or transparent WebM for CapCut |
| Start Line Recorder | `/start-line/`      | The runner walks to the line, gets set, countdown, takes off                                                                                                                                                                                                                                               |
| River Run Recorder  | `/river-run/`       | The link-page night scene: the runner jogs along the river under a gold sun, with jumps, rim light and footstrike ripples; green screen and navy for overlays                                                                                                                                              |
| Mile Marker Maker   | `/mile-marker/`     | A trail-sign pop-up for any distance, with a climbing ding                                                                                                                                                                                                                                                 |
| Special Post Maker  | `/special-post/`    | Birthday, congrats, race-day and thank-you posts: 1–3 runners (pick whole runners or mix any pieces) jog in and finish with a jump, high-five or arms up; show/hide every piece; add-ins: Hooper, fireworks, streamers, sparkles, number balloons, stat card, zoom punch; video with sound, still PNG, WAV |
| Celebration Maker   | `/celebrate/`       | Shout-out posts without runners: name card, cake + candles, race bib or finisher medal, with confetti, balloons, number balloons, fireworks, streamers and sparkles; video with sound, still PNG, WAV                                                                                                      |
| Animation Downloads | `/downloads/`       | Finished animations (trailer pack, River Run, Portal, The Loop, The Drop): MP4, green screen MP4, transparent WebM, WAV, and a zip per pack                                                                                                                                                                |

Each tool is a single self-contained HTML page. It draws on a canvas, synthesizes its sounds with the Web Audio API, and records the result with MediaRecorder (MP4 on Safari, WebM where MP4 isn't available). Recordings save through the share sheet on iPhone, iPad and Android ("Save Video" puts them in Photos) and as a normal download on a computer, including Windows, where Chrome and Edge would otherwise open the Windows share panel. Run `npm run test:desktop-save` to check every tool on a simulated Windows desktop.

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
