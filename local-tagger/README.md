# Video Tagger

Goes through a folder of videos (subfolders included), transcribes each one with
your **Transcribe Video** engine, tags and describes it with a local Ollama model,
and writes everything to `library.json`. Everything runs on this PC: nothing is
uploaded, and there are no paid APIs.

Your original videos are only ever **read**. They are never modified, moved,
renamed or deleted.

It calls Transcribe Video's own `transcribe()` from `../local-transcriber/server.py`
(same models, GPU handling, skipped-speech pass and exports), so the engine
is never copied. It runs in Transcribe Video's Python environment
(`.venv-transcribe`) and works without the Transcribe Video studio running.

## Setup (once)

1. **Transcribe Video**: run `local-transcriber/Start Transcribe Video.cmd` once
   so its Python environment exists, and `local-transcriber/Enable NVIDIA GPU.cmd`
   once so it uses the NVIDIA GPU.
2. **FFmpeg** (for `ffprobe` and `ffmpeg`): `winget install Gyan.FFmpeg`.
3. **Ollama**: install it from https://ollama.com/download (or
   `winget install Ollama.Ollama`), then download the model:
   `ollama pull qwen2.5vl:7b`. It reads both the transcripts and video frames.
4. Optional: **Clean Voice** (`local-voice/Start Clean Voice.cmd` in the repo)
   must be installed for precise word timing, which is on by default.

Video Tagger checks all of this when it starts and tells you what's missing.

## Running it

Double-click **local-tagger\Start Video Tagger.cmd**, pick a folder, and leave
it running. The **Video Tagger** page on the tools site shows the same command
to paste into a terminal. You can also pass the folder directly:
`"local-tagger\Start Video Tagger.cmd" "D:\VIDEO CONTENT"`.
Close Transcribe Video's studio page while it runs, so they don't both use the GPU.

It works in two steps, so the GPU only holds one model at a time:

1. **Reading and transcribing**: metadata via ffprobe, then speech to text with
   Transcribe Video's engine. TXT, SRT and word-timing JSON are saved to
   `transcripts\`.
2. **Tagging and describing**: Ollama reads the transcript and looks at frames
   from across the video: 5 for videos with little or no speech, and 3 for
   videos with lots of speech (so it can see, for example, that you're talking
   to the camera). Then it picks tags and writes a description. Two fixed
   rules apply: a video with no speech always gets "B-roll", and never gets
   "talking to camera".

Progress shows as `video 4 of 37 – name – step`, with a summary at the end
(done, skipped, failed, needs review). The full output is also saved to `last-run.log`.

**Re-runs:** videos that are already in `library.json` and unchanged (same path,
size and modified time) are skipped. New or changed files are processed. If it
crashes or you close the window, run it again: finished videos are kept, and
videos that were transcribed but not yet tagged skip straight to tagging.
`library.json` is always written to a temp file first and then swapped in, so it
is never left half-written. Videos from different folders all go into the same
`library.json`. Deleting a video doesn't remove its entry.

## Editing tags

Edit `tags.json` in the data folder (`D:\VideoTagger\tags.json`). It's a plain list:

```json
["trail review", "race", "gear", "other"]
```

The model may only use these tags. Anything that doesn't fit becomes `"other"`,
with a short suggested label in `other_note`, which is a good hint for a tag to add.
A tag can carry a hint to help the model:

```json
[{"tag": "Hooper", "hint": "describe who or what Hooper is here"}, "race", "other"]
```

Existing entries keep their old tags. To re-tag a video, remove its entry from
`library.json` (or delete `library.json` to redo everything) and run again.

## Settings (`config.json` in the data folder)

| Setting | Default | Meaning |
|---|---|---|
| `quality` | `quality` | `quality` = medium.en model, `fast` = small.en |
| `language` | `en` | `en`, or `auto` to detect the language |
| `device` | `auto` | `auto` (GPU, CPU if it fails), `cuda` or `cpu` |
| `clean_voice` | `off` | `off`, `light`, `medium`, `strong`, `isolate` (Clean Voice first: slower) |
| `precise_word_timing` | `true` | Pin word times to the audio (needs Clean Voice installed) |
| `vocabulary` | `Hooper, RRC` | Spelling hint for Whisper |
| `ollama_model` | `qwen2.5vl:7b` | Local model for tags and descriptions |
| `frames_for_low_speech` | `5` | Frames shown to the model for videos with little or no speech (0 = none) |
| `frames_for_speech` | `3` | Frames shown to the model for videos with lots of speech (0 = transcript only) |

## One file for AI: library-for-ai.md

After every run, Video Tagger also writes `library-for-ai.md` in the data folder:
every video in the library, oldest first, with its file name, recorded date,
length, orientation, folder, speech level, tags, description and **full
transcript**, in one Markdown file. Paste it into ChatGPT or Claude, or attach
it, and ask things like "which clips talk about Oil Creek?" or "plan a video
from these takes". It's rebuilt from `library.json` each time, so don't edit it
by hand. Spoken words run about 150 a minute, so 40 five-minute videos come to
roughly 30,000 words.

## library.json fields

`library.json` is `{"version": 1, "generated": <date>, "videos": [...]}`, with
one entry per video, sorted by recorded date:

| Field | Meaning |
|---|---|
| `file_name` | The video's file name |
| `full_path` | Full path on this PC |
| `folder` | The folder it is in |
| `duration` / `duration_seconds` | Length as `m:ss` (or `h:mm:ss`) and in seconds |
| `orientation` | `vertical`, `horizontal` or `square` (phone rotation is accounted for) |
| `aspect_ratio` | e.g. `9:16`, `16:9`, `1:1`, `4:5` |
| `resolution` | Width x height as displayed, e.g. `1080x1920` |
| `fps` | Frames per second |
| `recorded_date` | When it was recorded (ISO 8601) |
| `recorded_date_source` | `metadata` (from the file's own data) or `file modified` (fallback) |
| `speech` | `none` (no words or no audio), `little` (fewer than 25 words or under 15% of the video), `lots` |
| `tags` | Tags from `tags.json` |
| `other_note` | Suggested label when `"other"` is in `tags`; otherwise empty |
| `description` | 1–2 sentence plain description of what happens |
| `transcript` | Paths to the `txt`, `srt` and `json` (word timings) files in `transcripts\` |
| `transcript_excerpt` | First ~200 characters of the transcript |
| `needs_review` | `true` when something is uncertain; see `review_reasons` |
| `review_reasons` | Why: `model unsure`, `only "other" fits`, `no tags chosen`, transcription fell back to CPU, Whisper skipped speech, etc. |
| `processed_date` | When this entry was made |
| `language` | Transcript language (`null` with no audio) |
| `word_count` | Words recognised |
| `tagged_with` | Model used, plus `+ frames` if it looked at frames |
| `file_size` / `file_modified` | Used to skip unchanged videos on re-runs |

Transcript files are named `<video name>__<id>.txt/.srt/.json`. The id comes from
the video's full path, so videos with the same name in different folders never
clash. The formats are exactly what Transcribe Video exports.

## Data folder

Everything Video Tagger makes or that you edit lives in the data folder, outside
the repo: **`D:\VideoTagger`**, or `local-tagger\data` (ignored by Git) on a PC
without a D: drive. Choose another with `--home "E:\Somewhere"`. On the first
run, `tags.json` and `config.json` are copied there from `local-tagger\defaults\`;
after that, edit the copies in the data folder. Settings missing from your
`config.json` use the defaults.

- `library.json`: the results
- `library-for-ai.md`: every video's details, tags, description and full transcript in one file for AI
- `tags.json`, `config.json`: your tags and settings
- `transcripts\`: transcript files
- `work\`: temporary audio and frames, plus `state.json` (videos transcribed but
  not yet tagged). Safe to delete when no run is in progress.
- `last-run.log`: output of the latest run
