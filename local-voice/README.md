# Clean Voice (local)

Removes background noise from a video or audio recording, or pulls the voice
away from music, then evens out the volume. It runs on this computer's NVIDIA
GPU (or the CPU).

Double-click **Start Clean Voice.cmd**. Keep its window open and use
http://127.0.0.1:8766 in your browser (it opens by itself). Choose a recording,
pick a mode and press **Clean voice**. When it's done, switch between
**Original** and **Cleaned** while it plays to compare, then download:

- **Video (MP4)**: the original picture, copied untouched (not re-encoded), with
  the cleaned sound as 192 kbps AAC. Videos whose codec MP4 can't hold come out
  as MKV.
- **Sound only (WAV)**: 48 kHz, 24-bit stereo.

## Modes

- **Remove noise**: ClearerVoice's MossFormer2 48 kHz speech model takes out
  fans, hum, wind, traffic, hiss and room noise. **Strength** sets how much
  noise is left: Light keeps it 12 dB down (a little room tone), Medium 24 dB
  down, Strong removes all it can. The model masks the noise in the spectrum,
  so Light and Medium mix that share of the original back in, in step with the
  voice.
- **Isolate voice**: Demucs (htdemucs) keeps the vocal stem, separating speech
  from music or a busy background, then MossFormer2 removes the noise left.
- **Cut low rumble**: an 80 Hz high-pass filter.
- **Even out the volume**: loudness to −16 LUFS (measured on the stereo file),
  with a 5 ms peak limiter holding peaks under −1 dBFS.

The voice is processed in mono and written to both channels.

## Installation and models

The launcher uses Python 3.12 and its own `.venv-clean-voice` folder in the
repository root, and installs the pinned engines on first start
(`requirements.txt`, a few minutes). That PyTorch runs on the CPU. For the
GPU, run **Enable NVIDIA GPU.cmd** once (it downloads PyTorch's CUDA 12.4 build,
about 2.5 GB), then restart Clean Voice. The page's header names the GPU when
PyTorch can use it.

**Processing**: Automatic uses the GPU when there is one and moves to the CPU
(with a note) if the GPU fails mid-run, for example out of memory. NVIDIA GPU
reports the failure instead. On an RTX 3080, a 15 s clip cleans in under a
second once the model is loaded (the first run of a session loads it, about
8 s); 90 s of audio took 11 s including that.

Models download on first use: MossFormer2 (220 MB) to `local-voice/models/`,
Demucs (80 MB) to PyTorch's cache in your user folder. After that it works
offline. Nothing is sent anywhere else.

DeepFilterNet was the first choice, but its helper library has no Windows build
for Python 3.12, which the transcriber already uses.

## Local files

Inputs and results are kept under `data/<job-id>/` (excluded from Git). The job
list is in memory: after a restart, find earlier results in those folders.
Remove old job folders when you no longer need them.

The server binds only to 127.0.0.1, checks Host/Origin and needs a per-launch
token for uploads. Maximum input size is 8 GB. One recording is cleaned at a
time.

## Validation

1. `.venv-clean-voice\Scripts\python.exe local-voice\tests\make_samples.py`
   makes noisy test recordings (a WAV and a vertical H.264 MP4) from
   `data/test/speech.wav`, any short spoken WAV you put there.
2. `.venv-clean-voice\Scripts\python.exe local-voice\tests\check_engine.py`
   runs each mode without the page and prints device, time, loudness and the
   noise floor in the silence before the speech (Strong reached −78 dBFS from a
   5 dB SNR mix; add `cpu` to test the CPU).
3. Start the server, then `node local-voice/check-browser.cjs`: uploads the MP4
   at 400 px and 1280 px, checks both downloads, the A/B switch, token
   rejection, sideways scrolling and page errors, and saves screenshots under
   `data/`.
