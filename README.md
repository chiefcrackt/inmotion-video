# inmotion-video

Recording tools for tristan.inmotion (T.im) videos, published with GitHub Pages at
**https://chiefcrackt.github.io/inmotion-video/**

| Tool | Path | What it makes |
|---|---|---|
| Activity Studio | `/activity-studio/` | Local FIT/GPX/TCX imports, editable run cards, dashboards, route reveals, elevation profiles and recorded lap graphics; PNG and browser-recorded video |
| Sound Forge | `/sound-forge/` | Four-layer sound effects studio: 30 procedural presets, samples, effects, shared local library, stereo WAV and stems |
| Title Maker | `/title-maker/` | Cyber-kit title cards, lower thirds, word tags and chapter cards with sound |
| Promo Maker | `/promo-maker/` | An "Out now" clip from a video's thumbnail and title |
| Cover Maker | `/cover-maker/` | YouTube thumbnails, Reel covers and highlight covers as PNGs |
| Start Line Recorder | `/start-line/` | The runner walks to the line, gets set, countdown, takes off |
| River Run Recorder | `/river-run/` | The link-page night scene: the runner jogs along the river under a gold sun, with jumps, rim light and footstrike ripples; green screen and navy for overlays |
| Mile Marker Maker | `/mile-marker/` | A trail-sign pop-up for any distance, with a climbing ding |
| Special Post Maker | `/special-post/` | Birthday, congrats, race-day and thank-you posts: 1–3 runners (pick whole runners or mix any pieces) jog in and finish with a jump, high-five or arms up; show/hide every piece; add-ins: Hooper, fireworks, streamers, sparkles, number balloons, stat card, zoom punch; video with sound, still PNG, WAV |
| Celebration Maker | `/celebrate/` | Shout-out posts without runners: name card, cake + candles, race bib or finisher medal, with confetti, balloons, number balloons, fireworks, streamers and sparkles; video with sound, still PNG, WAV |
| Animation Downloads | `/downloads/` | Finished animations (trailer pack, River Run, Portal, The Loop, The Drop): MP4, green screen MP4, transparent WebM, WAV, and a zip per pack |

Each tool is a single self-contained HTML page. It draws on a canvas, synthesizes its sounds with the Web Audio API, and records the result with MediaRecorder (MP4 on Safari, WebM where MP4 isn't available). Recordings save through the share sheet on iPhone ("Save Video" puts them in Photos) or as a normal download on a computer.

Sound Forge uses reusable modules in `shared/sound/` for offline rendering, a
versioned preset schema, IndexedDB sample storage and PCM WAV export. Title Maker
can select saved Sound Forge presets and include them in its existing video
recording. See [Sound Forge implementation and validation](sound-forge/README.md)
for integration examples, project portability, testing and limitations.

The runner is the cut-out from [links-inMotion](https://github.com/chiefcrackt/links-inMotion) (`scene/runner/`), inlined into the Start Line and River Run pages.

The ProRes 4444 desktop versions of the animations are not in this repo; they are too large for GitHub Pages.

Activity Studio uses small native ES modules and a committed parser-worker bundle alongside its HTML page. See [its documentation](activity-studio/README.md) for development, data semantics, tests and browser limitations. Existing tools still require no build step.
