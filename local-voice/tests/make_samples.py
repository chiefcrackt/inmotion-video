"""Make noisy test recordings from data/test/speech.wav: a WAV and an H.264 MP4."""
from pathlib import Path
import av
import numpy as np
import soundfile
import torch
import torchaudio.functional as F

TEST = Path(__file__).resolve().parent.parent / 'data' / 'test'
speech, rate = soundfile.read(TEST / 'speech.wav', dtype='float32')
speech = F.resample(torch.from_numpy(speech), rate, 48000).numpy()
speech = np.concatenate([np.zeros(48000, np.float32), speech, np.zeros(48000, np.float32)])
rng = np.random.default_rng(1)
t = np.arange(len(speech)) / 48000
white = rng.standard_normal(len(speech)).astype(np.float32)
fan = np.cumsum(white) ; fan -= np.convolve(fan, np.ones(480) / 480, 'same'); fan /= np.abs(fan).max()
hum = 0.6 * np.sin(2 * np.pi * 60 * t) + 0.3 * np.sin(2 * np.pi * 120 * t)
noise = (0.5 * fan + 0.25 * white / 4 + 0.25 * hum).astype(np.float32)
rms = lambda x: np.sqrt(np.mean(x ** 2))
mix = speech + noise * (rms(speech) / rms(noise)) / 10 ** (5 / 20)  # 5 dB SNR
mix = (mix / np.abs(mix).max() * 0.7).astype(np.float32)
soundfile.write(TEST / 'noisy.wav', mix, 48000)
with av.open(str(TEST / 'noisy.mp4'), 'w') as out:
    video = out.add_stream('libx264', rate=30); video.width, video.height, video.pix_fmt = 1080, 1920, 'yuv420p'
    audio = out.add_stream('aac', rate=48000, layout='stereo')
    frames = int(len(mix) / 48000 * 30)
    for n in range(frames):
        img = np.zeros((1920, 1080, 3), np.uint8); img[:] = (14, 26, 46); x = int(n / frames * 1000); img[900:1020, x:x + 80] = (232, 201, 106)
        for p in video.encode(av.VideoFrame.from_ndarray(img, format='rgb24')): out.mux(p)
    stereo = np.ascontiguousarray(np.stack([mix, mix]))
    for i in range(0, stereo.shape[1], 1024):
        f = av.AudioFrame.from_ndarray(np.ascontiguousarray(stereo[:, i:i + 1024]), format='fltp', layout='stereo'); f.sample_rate = 48000; f.pts = i
        for p in audio.encode(f): out.mux(p)
    for s in (video, audio):
        for p in s.encode(None): out.mux(p)
print('noisy.wav and noisy.mp4:', round(len(mix) / 48000, 1), 's')
