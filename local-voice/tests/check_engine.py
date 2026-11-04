"""Run each mode on data/test/noisy.mp4 without the web page and report timings and levels."""
import shutil, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import numpy as np
import soundfile
import server

device = sys.argv[1] if len(sys.argv) > 1 else 'auto'
source = server.DATA / 'test' / 'noisy.mp4'
for mode, strength in [('denoise', 'strong'), ('denoise', 'light'), ('isolate', 'medium')]:
    job_id = f'check-{mode}-{strength}'
    folder = server.DATA / job_id
    shutil.rmtree(folder, ignore_errors=True); folder.mkdir(parents=True)
    shutil.copy(source, folder / 'media')
    job = {'id': job_id, 'filename': 'noisy.mp4', 'status': 'queued', 'progress': 0, 'warnings': [], 'outputs': []}
    server.LOCK.acquire()
    began = time.time()
    server.clean(job, {'mode': mode, 'strength': strength, 'device': device, 'highpass': True, 'loudness': True})
    assert job['status'] == 'complete', job['message']
    audio, rate = soundfile.read(folder / 'cleaned.wav')
    import torchaudio.functional as F, torch
    lufs = float(F.loudness(torch.from_numpy(audio.T.astype(np.float32)), rate))
    # The test speech starts after 1 s of silence: what is left there is noise.
    floor = 20 * np.log10(np.sqrt(np.mean(audio[: rate // 2, 0] ** 2)) + 1e-9)
    print(f"{mode}/{strength}: {job['device']} {time.time() - began:.1f}s, outputs {job['outputs']}, {lufs:.1f} LUFS, noise floor {floor:.0f} dBFS, warnings {job['warnings']}")
