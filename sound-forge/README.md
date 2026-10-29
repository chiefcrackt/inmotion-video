# T.IM · SOUND FORGE

Open `sound-forge/` through a local HTTP server or GitHub Pages. Select a preset,
press **Preview**, adjust the four quick controls, and export stereo WAV.
There is no build framework, runtime dependency, backend, API key, or paid service.
The root tool hub links to the studio. All 30 factory sounds are original
procedural recipes; no third-party samples are distributed.

## Files and architecture

* `sound-forge/index.html`, `style.css`, `app.mjs`: native suite styling, preset
  browser, quick editor, advanced mixer, actual rendered waveforms, numeric timing,
  playback position, library management and export actions.
* `shared/sound/model.mjs`: version 1 preset schema, defensive parameter bounds,
  mute/solo rules, seed generator, duration/tail calculations and quick transforms.
* `shared/sound/engine.mjs`: Web Audio oscillators, deterministic noise, FM, sweeps and
  envelopes; offline filters, convolution, distortion, stereo pan and
  delay. The complete rendered buffer is used by both preview and WAV export.
* `shared/sound/presets.mjs`: 30 distinct multilayer recipes in six categories.
* `shared/sound/storage.mjs`: shared IndexedDB presets and original audio assets,
  a bounded decoded-buffer cache, portable project packing and unpacking.
* `shared/sound/wav.mjs`: stereo/mono interleaved 16-bit PCM encoder and downloads.
* `shared/sound/picker.mjs`: reusable adapter for existing audio/MediaRecorder graphs.
* `title-maker/index.html`: saved-sound picker feeds the existing master gain and
  compressor, so its existing recording destination receives the selected sound.
* `tests/`: focused Node tests, static Pages validation and real-browser checks.
  `package.json` supplies commands; the other existing tools retain their code.

## Shared engine usage

```js
import { render, playBuffer } from '../shared/sound/engine.mjs';
import { listPresets, assetResolver } from '../shared/sound/storage.mjs';

// Resume the host's AudioContext inside a user gesture first.
const presets = await listPresets();
const { buffer } = await render(presets[0], {
  sampleRate: 48000,
  resolveAsset: assetResolver(audioContext)
});
playBuffer(audioContext, buffer, {
  destination: hostRecordingMaster,
  when: audioContext.currentTime + animationSoundOffset
});
```

The UI adapter accepts `{container, getContext, getDestination, onStatus}` and
returns `{play(when), dispose()}`. `play()` returns false until a selected sound
is ready, allowing the host's original sound to remain available. Title Maker
states this during rendering. Refresh its saved sounds after saving in the studio.
The offset and clip length must accommodate the sound and tails; the host video
still ends on its existing schedule.

## Presets, assets and portability

Version 1 presets contain `id`, `name`, `category`, `seed` and exactly four normalized
layers. Layers capture synthesis, asset reference, trim, timing, pitch, volume,
mute/solo, fades, ADSR, modulation, filters, distortion, reverb and delay.
Unknown schema versions are rejected. Factory presets remain immutable.

Saved presets and samples use the same IndexedDB database for all suite tools
on the same browser profile and origin. No audio blobs go into localStorage.
**Preset JSON is configuration only.** A missing sample produces a named error;
use that layer's import/relink control and save the preset again.
**Portable project JSON includes base64 original audio**, plus the preset. It
can be imported on another browser/device without depending on the old database.
Project files are larger than the original audio because of base64 encoding.

Storage failures preserve the active editor and imported sample in memory;
export a portable project before leaving the page. Saving and renaming only update
the library after a successful IndexedDB transaction. Custom-preset deletion leaves
audio assets in storage to avoid breaking references from other saved presets.

## Rendering and limits

* Up to four stereo layers; each output window is 0.02–12 seconds with a start
  offset up to 20 seconds. Quick controls are bounded by the same schema.
* WAV/MP3 import uses browser decoding; codec support varies by browser. Each
  imported file is capped at 25 MB. Short samples are recommended on phones.
* Sample pitch is playback-rate resampling, **not time-preserving pitch shift**.
  Trim is measured in original-source seconds; duration is an output window.
  Samples that end before the output window leave silence.
* White noise has no meaningful fundamental pitch. Oscillator-only controls are
  hidden for noise; filtered noise has a real band-pass frequency sweep.
* Normal oscillator layers use native Web Audio oscillators, exponential frequency
  automation, FM oscillators and amplitude envelopes. Reversed oscillator layers
  use deterministic PCM synthesis before the same effect graph, because native
  oscillator nodes cannot play backward. That fallback can alias at extreme
  pitches; band-limited reverse synthesis is a useful future enhancement.
* Reverse flips source audio and its fades before effects. Reverb uses a seeded
  stereo impulse. Delay uses eight finite echoes, with all tails allocated.
* Exports support 44.1/48 kHz, 16-bit PCM stereo. A common peak-protection gain is
  applied to mix and stems so their relationship is retained. Normalization targets
  0.95 peak, except when a louder isolated stem requires additional protection.
  The displayed level is a rendered peak reading, not a live LUFS meter.
* Stem WAVs share the mix length and include their start offsets. Save them using
  the individual download links to avoid browser multiple-download restrictions.
* Timing uses accessible numeric controls, optional 50 ms snapping and timeline
  zoom. Drag handles, waveform scrubbing, looping and time-stretch are not included.
* Preview/export share buffers and settings. Seeded source PCM is reproducible;
  Web Audio convolution/filter floating-point results may vary slightly across
  browser engines. Effects are offline-rendered sequentially with progress between
  layers; very long imported files may still take time to decode on phones.

## Validation

`npm test`: Combined Activity Studio and SOUND FORGE Node tests, including schema round trips, distinct factory settings, seeded
audio, quick transforms, timing/solo/mute, sample trim/rate/reverse, peak protection
and the stereo PCM WAV header/data.

`npm run build`: Activity Studio worker build plus static entry-point and relative dependency validation. This
repository deploys directly from static files to GitHub Pages; no compiled bundle
is required for SOUND FORGE.

`npm run test:browser` runs both studios' browser suites. `npm run test:sound:browser`
runs SOUND FORGE's Playwright Chromium/Edge integration tests. It uses an
installed `playwright` or the bundled Codex development runtime; on another machine,
install Playwright as a development tool and its Chromium browser first. The test
starts and closes its own local HTTP server and browser. It checks all 30 actual
renders, signal-changing effects, four-layer stem summation, sample decode and
portable packaging, persistence, missing assets, WAV download, mobile width,
existing tool startup and Title Maker recording with a saved sound.
Generated desktop/mobile screenshots are local test artifacts.

Real iPhone/iPad Safari audio, file-download/share behavior and touch-device
performance still require device QA. Browser tests use a narrow Chromium viewport,
not an actual iOS device.

Recommended next steps: real-device Safari QA, band-limited synthesis, asset-library
cleanup with reference tracking, optional waveform caching/workers, and extending
the picker to additional recording tools after validating their timing.
