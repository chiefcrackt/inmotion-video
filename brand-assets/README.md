# T.im Brand Assets

Editable reconstructions of the Keep Moving story, Find Your Flow story and YouTube banner. Reach the editor from Graphics & Video, Publishing Studio, Asset Library, Cover Maker, Title Maker, Asset Animator or Animation Downloads.

Bundled Barlow Condensed 900/700 and exact palette values drive canvas text and graphics. The two-wave motif is procedural; the supplied raster concepts are preserved in `references/` and are not baked into editable output. No replacement badge is invented and ring gold is not used.

Change words, ground, text size/position, wave size/position, stripe opacity and individual layer visibility. Undo/redo, browser autosave, named shared projects and project JSON preserve settings. Applying a template can be undone. PNG export uses 1080 × 1920 stories or 2560 × 1440 banners, with no preview guides. Banner wordmarks fit inside the central 1546 × 423 safe area. Long copy scales down to fit.

Motion mode splits the loop evenly between headline lines. Each word eases in over 0.3 s in Reveal mode, and the eyebrow never moves. Glitch flashes teal/gold for a short burst at the start of each word. The subline takes over the last 20% of the loop and fades in over 0.4 s. Speed controls wave flow and the glitch burst length; word timing follows the Duration setting so sound cues stay on the beat. The footer watermark is 65% opaque at a 40 px left inset. Whoosh and pulse cues use the suite's shared sound engine; cue timing follows headline beats. Silent is the default. Preview audio, WAV download and video use the same rendered soundtrack. Video is recorded in real time through MediaRecorder, with WebM preferred and MP4 when supported. Keep the tab visible; hiding the tab cancels recording. PNG and editable project exports remain available without video support.

Checks: `node --test tests/brand-assets.test.mjs`, `node tests/brand-assets-browser.cjs`, `node tests/check-static.mjs`.
