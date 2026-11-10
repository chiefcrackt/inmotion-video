# Transcribe Video (local)

After transcription, **Full edit plan + content package** builds a copyable
brief for ChatGPT or Claude. Add the platform, target length, audience, goal,
style, available footage and extra directions. **Copy prompt + word JSON**
includes the current transcript and original recognition timings in one paste.
**Copy prompt only** pairs with **Download matching JSON**; a combined text-file
download is also available for longer recordings. Preview the generated prompt
before copying. Nothing is sent automatically.

Length, audience, goal and editing style have reusable dropdown presets plus
**Custom…**. **Recommend from the transcript** leaves the choice to the assistant.
Platform and these four choices, including custom text, are remembered in this
browser on this local origin. **Reset preferences** restores the defaults.
Project title, footage notes and extra instructions are specific to the current
session and are not persisted.

The brief requests a recommended edit, source-timed timeline, three opening
options, best takes/cuts, visual/sound plan, caption checks, standalone clips,
titles/covers/description/carousel, chapters and a prioritized handoff. It
distinguishes original timings from finished edit times and limits conclusions
to transcript evidence. Matching AI JSON includes current unsaved text edits;
the ordinary transcript downloads still require **Save edits** to update.

Double-click **Start Transcribe Video.cmd**; the studio opens at
http://127.0.0.1:8765 in your browser. Choose a video/audio file, select the model
and press **Transcribe recording**. Sentence Play buttons seek in the recording;
edit text/timings and press **Save edits** before downloading.

It runs in the background with no window: the launcher's window shows only
while it installs or starts, then closes. **Stop** at the bottom of the page
ends it; opening the launcher again while it runs just opens the page. If it
can't start, the window stays open with the reason; its messages go to
`data/server.log`.

Exports: TXT, SRT, VTT, JSON with original word timestamps/confidence, and review
notes for words below 65% confidence. This threshold is a review aid, not an
accuracy guarantee. Sentence edits do not realign individual word timings.
The subtitle cues follow recognition segments; they are not automatically
reflowed into short social-video caption groups. No captions are burned in.

## Clean voice first

**Clean voice first** runs Clean Voice (`../local-voice`) on the upload before
transcribing: Remove noise (Light, Medium, Strong) or Isolate voice from music.
Whisper then hears the cleaned sound, the player switches to the cleaned
recording, and **Cleaned video** and **Cleaned WAV** join the downloads, with
the same timings as the original. It runs `local-voice/clean_file.py` in
Clean Voice's own environment (`.venv-clean-voice`, made by
**Start Clean Voice.cmd**; the Clean Voice page itself needn't be open). Until
that exists the choice stays Off. The choice is remembered in this browser.
Cleaning takes the first 30% of the progress bar; its log is
`data/<job-id>/clean.log`.

## Skipped speech

Whisper can skip a phrase after a pause or stretch one word over it (the
medium model dropped two phrases of a 4:46 run video). After transcribing, the
voice detector that ships with faster-whisper looks for stretches of 1.5 s or
more with at least 1 s of speech and no word over it (a word counts for at
most 1 s); each is transcribed again on its own, without carry-over or the
vocabulary hint, and confident words are added. The sentences around it end at
its edges. A warning lists the times filled, to check; recovered words carry
`"recovered": true` in the Word JSON.

## Precise word timing

**Precise word timing (for captions)** pins every word to the audio after
Whisper: wav2vec2 forced alignment (`align.py`, English only), one segment at a
time with 0.25 s of margin, in steps of about 20 ms. On a test recording with
known word times, starts were typically 37 ms off (worst 0.27 s) where
Whisper's own were 198 ms off and up to 1.2 s early after pauses; ends were
about the same (56 ms). The Word JSON then says `"word_timing": "aligned"`,
gives each word an `alignment` score and keeps Whisper's estimates as
`whisper_start` and `whisper_end`; sentence edges follow their first and last
words, so SRT and VTT tighten too. Numbers are spelled the way they're said
before aligning ("2025" as twenty twenty five, "100%", "13.1", "5:30", "21st");
a word still left without letters is placed between its aligned neighbours.

It runs in Clean Voice's environment (it needs PyTorch), so Clean Voice must be
installed; first use downloads a 360 MB model to PyTorch's cache (retried, as
download.pytorch.org sometimes drops the connection). If it fails, the
transcript keeps Whisper's times with a warning; `data/<job-id>/align.log`
says why. Edited text still isn't re-aligned.

## Installation and models

The launcher uses Python 3.12 and an isolated `.venv-transcribe` directory in the
repository root. It installs pinned faster-whisper/PyAV versions if needed.
PyAV 16.0.1 is pinned because version 19 removed an argument used by this
faster-whisper release. No standalone FFmpeg installation is needed.

Fast uses `small.en`; Higher quality uses `medium.en`. Detect language uses the
multilingual equivalents. A model is downloaded on first use and cached under
the user's Hugging Face cache. Cached models allow offline processing. No
recordings are sent to a transcription API; initial dependency/model downloads
need internet access. There are no per-minute processing charges.

For NVIDIA acceleration, run **Enable NVIDIA GPU.cmd** once, then restart the
tool. Its CUDA 12 cuBLAS and cuDNN 9 DLLs stay inside the virtual environment.
Automatic mode tries CUDA when detected, with a reported CPU fallback on runtime
failure. Explicit NVIDIA mode reports failures instead of switching devices.
CPU mode uses int8; CUDA uses float16. Only one transcription runs at a time.

This PC was configured with the NVIDIA libraries and the Fast English model.
GPU recognition was verified on an RTX 3080 using a synthetic spoken sample.

## Local files

Inputs and exports are kept under `data/<job-id>/` (excluded from Git). Exports
are written automatically after transcription and again after edits. The browser
session's job list is in memory: after restarting the service, retrieve previous
exports directly from the data folders. Re-select media after refreshing the
page. Remove unwanted job folders manually when you no longer need them.

The server binds only to 127.0.0.1, checks Host/Origin and requires a per-launch
token for writes. It is a local companion, not a GitHub Pages service. Maximum
input size is 8 GB. Browser playback depends on the media codecs even when the
transcriber can decode the file.

## Validation

Run `node --test local-transcriber/ai-prompt.test.cjs` for prompt/data consistency,
original-word preservation, corrected-text labeling and invalid-time checks.

Start the server, then run `node local-transcriber/check-browser.cjs` with a
spoken sample at `data/test/sample.wav`. Set `TRANSCRIBE_SAMPLE` (relative to this
folder) and `TRANSCRIBE_DEVICE` to check another fixture/device. This checks real
recognition, nonempty word timings, editable exports, missing-token rejection,
mobile overflow and browser errors. Screenshots are written under `data/`.

Run `.venv-transcribe/Scripts/python.exe local-transcriber/check_api.py` for
invalid-media and request validation checks. The test fixtures are generated
locally and are not committed. Higher-quality and multilingual models require
their own first-use download; quality on your real recordings still needs review.
