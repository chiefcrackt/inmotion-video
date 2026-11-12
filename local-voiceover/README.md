# Voiceover (local)

Turns a script into a voiceover with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M),
an open 82M-parameter text-to-speech model. It runs on this computer's CPU, with no GPU needed,
and nothing is sent anywhere.

Double-click **Start Voiceover.cmd**. The studio opens at http://127.0.0.1:8767 in your
browser. Paste a script, pick a voice and press **Make voiceover**. Then download:

- **Voiceover (WAV)**: 48 kHz, 24-bit stereo. Its loudness is set to −16 LUFS, with peaks held
  under −1 dBFS, the same as Clean Voice.
- **Word timing (JSON)**: the same Word JSON format as Transcribe Video. Load it in Caption
  Maker and each word lights up as it is spoken. Its `lines` list has each line's start and
  end times.
- **Captions (SRT / VTT)**: one caption per sentence, or per 10 words for long sentences.

It runs in the background with no window. The launcher's window shows only while it installs
or starts, then closes. **Stop** at the bottom of the page ends it. Opening the launcher again
while it runs just opens the page. If it can't start, the window stays open with the reason.
Its messages go to `data/server.log`.

## Script

Each non-empty line is spoken separately. Long lines are split at sentence ends (Kokoro starts
to rush past about 400 phonemes) and joined back with no gap.

- `Coach: Keep it easy.` gives the line to the speaker **Coach**. A speaker name is up to three
  capitalised words before a colon and a space, so `4:30 pace` and `Step 1: warm up` stay
  speech. Untagged lines use the main voice.
- A line of `[pause 1.5]` adds 1.5 seconds of silence (10 s at most).
- **Speed** (0.7–1.3×) and **Pause between lines** apply to the whole script. After a run, each
  line can have its own speed and pause, and a ▶ button plays just that line.
- Making it again only speaks the lines whose text, voice, speed or pronunciation changed. The
  rest come from the cache in `data/cache/`.

## Voices and blends

All 28 English voices (20 American, 8 British) are listed with the overall grade from
Kokoro's [VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md). Each has a
▶ Preview.

**Blend voices** mixes two or three voices by weight. Kokoro voices are style vectors, so a
blend is their weighted average: a new voice that stays the same on every line. Saved blends
appear at the top of every voice list. The default is **T.im narrator**: 60% Puck and
40% Michael, picked from the trial samples on 12 November 2026. The heaviest voice in a blend
sets the accent (American or British) that words are spelled out in.

## Pronunciation

Each word in the list is said the way you write it: a respelling (`T.im` → `Tim`) or exact
phonemes between slashes (`/kˈOkəɹO/`, in Kokoro's [misaki](https://github.com/hexgrad/misaki)
symbols). The word as written stays in the captions. Matching ignores case and whole words
only. Blends and the pronunciation list are saved in `data/presets.json`.

Words outside misaki's dictionary (names, brands) are spelled out by espeak-ng, which comes
with the `espeakng-loader` package.

## Installation and model

The launcher uses Python 3.12 and its own `.venv-voiceover` folder in the repository root. On
first start it installs the pinned engine from `requirements.txt` (about 550 MB, a few
minutes). This uses ONNX Runtime, not PyTorch, so it doesn't share or need Clean Voice's
environment.

The first voiceover downloads Kokoro v1.0 as ONNX from the
[kokoro-onnx releases](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0):
`kokoro-v1.0.onnx` (325 MB) and `voices-v1.0.bin` (28 MB), into `models/`. Their SHA-256 is
checked. It then saves `kokoro-v1.0-timed.onnx`, the same graph with one extra output: each
phoneme's length in frames. `engine.join_timestamps` turns those lengths into word times, as
the official `kokoro` Python package does (ported from kokoro 0.9.4). After that it works
offline.

On the CPU of the cloud machine it was built on, 6 seconds of speech took about 1.3 s.

## Licences

- Kokoro's model and voices are Apache-2.0, so voiceovers can be used commercially. kokoro-onnx
  (MIT) and misaki (Apache-2.0) are permissive too.
- espeak-ng, used only for out-of-dictionary words, is GPL-3.0. That matters only if you
  redistribute software that includes it. It doesn't apply to audio you make.
- TikTok, YouTube and Instagram ask for realistic AI-generated audio to be labelled, so turn on
  the AI-content toggle when you post.

## Local files

Results are kept under `data/<job-id>/`, with the line cache in `data/cache/` and previews in
`data/previews/` (all excluded from Git). The job list is in memory: after a restart, find
earlier results in those folders. Remove old ones when you no longer need them.

The server binds only to 127.0.0.1, checks Host and Origin, and needs a per-launch token for
every request that changes something. It speaks one script at a time, up to 200,000 characters.

## Validation

1. `python -m unittest discover -s local-voiceover/tests` (or `npm run test:voiceover`) checks
   the script parser, blends, pronunciation, word timing, chunking and captions. It needs no
   model.
2. Start the server, then run `node local-voiceover/check-browser.cjs`
   (`npm run test:voiceover:browser`). At 400 px and 1280 px it makes a two-speaker
   voiceover. It checks the four downloads (48 kHz stereo WAV, word times inside the audio,
   the `[pause]` line, the pronunciation keeping the written word, the default blend and a
   saved blend), the per-line player, line reuse, token rejection, sideways scrolling and page
   errors. It saves screenshots under `data/`.
