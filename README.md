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
| Activity Studio     | `/activity-studio/` | Local FIT/GPX/TCX imports, editable run cards, dashboards, route reveals, elevation profiles and recorded lap graphics; PNG and browser-recorded video                                                                                                                                                     |
| Sound Forge         | `/sound-forge/`     | Four-layer sound effects studio: 30 procedural presets, samples, effects, shared local library, stereo WAV and stems                                                                                                                                                                                       |
| Title Maker         | `/title-maker/`     | Cyber-kit title cards, lower thirds, word tags and chapter cards with sound                                                                                                                                                                                                                                |
| Promo Maker         | `/promo-maker/`     | An "Out now" clip from a video's thumbnail and title                                                                                                                                                                                                                                                       |
| Cover Maker         | `/cover-maker/`     | YouTube thumbnails, Reel covers and highlight covers as PNGs                                                                                                                                                                                                                                               |
| Start Line Recorder | `/start-line/`      | The runner walks to the line, gets set, countdown, takes off                                                                                                                                                                                                                                               |
| River Run Recorder  | `/river-run/`       | The link-page night scene: the runner jogs along the river under a gold sun, with jumps, rim light and footstrike ripples; green screen and navy for overlays                                                                                                                                              |
| Mile Marker Maker   | `/mile-marker/`     | A trail-sign pop-up for any distance, with a climbing ding                                                                                                                                                                                                                                                 |
| Special Post Maker  | `/special-post/`    | Birthday, congrats, race-day and thank-you posts: 1–3 runners (pick whole runners or mix any pieces) jog in and finish with a jump, high-five or arms up; show/hide every piece; add-ins: Hooper, fireworks, streamers, sparkles, number balloons, stat card, zoom punch; video with sound, still PNG, WAV |
| Celebration Maker   | `/celebrate/`       | Shout-out posts without runners: name card, cake + candles, race bib or finisher medal, with confetti, balloons, number balloons, fireworks, streamers and sparkles; video with sound, still PNG, WAV                                                                                                      |
| Animation Downloads | `/downloads/`       | Finished animations (trailer pack, River Run, Portal, The Loop, The Drop): MP4, green screen MP4, transparent WebM, WAV, and a zip per pack                                                                                                                                                                |

Each tool is a single self-contained HTML page. It draws on a canvas, synthesizes its sounds with the Web Audio API, and records the result with MediaRecorder (MP4 on Safari, WebM where MP4 isn't available). Recordings save through the share sheet on iPhone ("Save Video" puts them in Photos) or as a normal download on a computer.

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

Enable Transparent background in Text Motion for alpha-preserving PNG stills and a 30 fps PNG-sequence ZIP. Import the frames as an image sequence in a video editor. The preview checkerboard is not exported. Browser-recorded video uses a solid background; transparent mode offers PNG exports instead.
