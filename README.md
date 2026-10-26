# inmotion-video

Recording tools for tristan.inmotion (T.im) videos, published with GitHub Pages at
**https://chiefcrackt.github.io/inmotion-video/**

| Tool | Path | What it makes |
|---|---|---|
| Title Maker | `/title-maker/` | Cyber-kit title cards, lower thirds, word tags and chapter cards with sound |
| Promo Maker | `/promo-maker/` | An "Out now" clip from a video's thumbnail and title |
| Cover Maker | `/cover-maker/` | YouTube thumbnails, Reel covers and highlight covers as PNGs |
| Start Line Recorder | `/start-line/` | The runner walks to the line, gets set, countdown, takes off |
| Mile Marker Maker | `/mile-marker/` | A trail-sign pop-up for any distance, with a climbing ding |
| Animation Downloads | `/downloads/` | Finished animations (trailer pack, Portal, The Loop, The Drop): MP4, green screen MP4, transparent WebM, WAV, and a zip per pack |

Each tool is a single self-contained HTML page. It draws on a canvas, synthesizes its sounds with the Web Audio API, and records the result with MediaRecorder (MP4 on Safari, WebM where MP4 isn't available). Recordings save through the share sheet on iPhone ("Save Video" puts them in Photos) or as a normal download on a computer.

The runner is the cut-out from [links-inMotion](https://github.com/chiefcrackt/links-inMotion) (`scene/runner/`), inlined into the Start Line page.

The ProRes 4444 desktop versions of the animations are not in this repo; they are too large for GitHub Pages.
