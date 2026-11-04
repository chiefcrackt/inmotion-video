# Transcribe Video (local)

Double-click **Start Transcribe Video.cmd**. Keep its terminal open and use
http://127.0.0.1:8765 in your browser. Choose a video/audio file, select the model
and press **Transcribe recording**. Sentence Play buttons seek in the recording;
edit text/timings and press **Save edits** before downloading.

Exports: TXT, SRT, VTT, JSON with original word timestamps/confidence, and review
notes for words below 65% confidence. This threshold is a review aid, not an
accuracy guarantee. Sentence edits do not realign individual word timings.
The subtitle cues follow recognition segments; they are not automatically
reflowed into short social-video caption groups. No captions are burned in.

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

Start the server, then run `node local-transcriber/check-browser.cjs` with a
spoken sample at `data/test/sample.wav`. Set `TRANSCRIBE_SAMPLE` (relative to this
folder) and `TRANSCRIBE_DEVICE` to check another fixture/device. This checks real
recognition, nonempty word timings, editable exports, missing-token rejection,
mobile overflow and browser errors. Screenshots are written under `data/`.

Run `.venv-transcribe/Scripts/python.exe local-transcriber/check_api.py` for
invalid-media and request validation checks. The test fixtures are generated
locally and are not committed. Higher-quality and multilingual models require
their own first-use download; quality on your real recordings still needs review.
