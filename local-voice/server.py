"""Local-only voice cleanup. Run with the supplied Windows launcher."""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote
import webbrowser

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()
JOBS = {}
MODELS = {}
MAX_UPLOAD = 8 * 1024 ** 3
RATE = 48000
# Light/Medium/Strong: the share of the noise kept (-12 dB, -24 dB, none).
KEEP = {'light': 0.25, 'medium': 0.063, 'strong': 0.0}
MP4_VIDEO = {'h264', 'hevc', 'av1', 'mpeg4', 'vp9'}
OUTPUTS = {'cleaned.wav': 'audio/wav', 'cleaned.mp4': 'video/mp4', 'cleaned.mkv': 'video/x-matroska'}


def safe_stem(name):
    stem = re.sub(r'[^\w\- .]+', '', Path(name).stem).strip()[:80]
    return stem or 'recording'


def device_for(choice):
    import torch
    if choice == 'cpu': return 'cpu'
    if torch.cuda.is_available(): return 'cuda'
    if choice == 'cuda':
        raise RuntimeError('No NVIDIA GPU is available to PyTorch. Run Enable NVIDIA GPU.cmd, then restart Clean Voice.')
    return 'cpu'


def read_audio(path, rate, channels):
    """Decode every audio frame to float32 [channels, samples] at the given rate."""
    import av
    import numpy as np
    layout = 'mono' if channels == 1 else 'stereo'
    with av.open(str(path)) as container:
        if not container.streams.audio:
            raise ValueError('This file has no sound track.')
        stream = container.streams.audio[0]
        resampler = av.AudioResampler(format='fltp', layout=layout, rate=rate)
        chunks = []
        for frame in container.decode(stream):
            for out in resampler.resample(frame):
                chunks.append(out.to_ndarray())
        for out in resampler.resample(None):
            chunks.append(out.to_ndarray())
        has_video = bool(container.streams.video)
    if not chunks:
        raise ValueError('The sound track is empty.')
    return np.concatenate(chunks, axis=1).astype(np.float32), has_video


def load_mossformer(device):
    key = ('mossformer', device)
    if key not in MODELS:
        import torch
        from clearvoice.network_wrapper import network_wrapper
        from clearvoice.networks import CLS_MossFormer2_SE_48K
        wrapper = network_wrapper()
        wrapper.model_name = 'MossFormer2_SE_48K'
        wrapper.load_args_se()
        args = wrapper.args
        args.task, args.network = 'speech_enhancement', 'MossFormer2_SE_48K'
        folder = ROOT / 'models' / 'MossFormer2_SE_48K'
        args.checkpoint_dir = str(folder)
        # ClearerVoice hides a failed download and runs untrained, so fetch it here.
        if not (folder / 'last_best_checkpoint').is_file():
            from huggingface_hub import snapshot_download
            try:
                snapshot_download(repo_id='alibabasglab/MossFormer2_SE_48K', local_dir=str(folder))
            except Exception as error:
                raise ValueError('Could not download the voice model (first use needs internet). ' + str(error)[:200])
        network = CLS_MossFormer2_SE_48K(args)
        MODELS[key] = (network.model.to(device).eval(), args)
    return MODELS[key]


def load_demucs(device):
    key = ('demucs', device)
    if key not in MODELS:
        from demucs.pretrained import get_model
        MODELS[key] = get_model('htdemucs').to(device).eval()
    return MODELS[key]


def denoise(audio, job, device, keep, start, span):
    """MossFormer2 on mono 48 kHz audio, in 60 s pieces crossfaded over 0.5 s.

    The model masks the spectrum, so cleaned + keep * (original - cleaned) brings
    back that share of the noise in step with the voice: Light and Medium."""
    import numpy as np
    import torch
    from clearvoice.utils.decode import decode_one_audio_mossformer2_se_48k
    model, args = load_mossformer(device)
    piece, fade = 60 * RATE, RATE // 2
    total = audio.shape[1]
    result = np.zeros_like(audio)
    ramp = np.linspace(0, 1, fade, dtype=np.float32)
    position = 0
    while position < total:
        begin = max(0, position - fade)
        end = min(total, position + piece)
        segment = audio[:, begin:end]
        with torch.no_grad():
            cleaned = np.asarray(decode_one_audio_mossformer2_se_48k(model, torch.device(device), segment.astype(np.float64), args), np.float32)
        cleaned = cleaned.reshape(1, -1)[:, :end - begin]
        if cleaned.shape[1] < end - begin:
            cleaned = np.pad(cleaned, ((0, 0), (0, end - begin - cleaned.shape[1])))
        cleaned = cleaned + keep * (segment - cleaned)
        if begin < position:
            overlap = position - begin
            result[:, begin:position] = result[:, begin:position] * (1 - ramp[:overlap]) + cleaned[:, :overlap] * ramp[:overlap]
            result[:, position:end] = cleaned[:, overlap:]
        else:
            result[:, begin:end] = cleaned
        position = end
        job['progress'] = round(start + span * position / total)
    return result


def isolate(path, job, device):
    """Keep Demucs' vocals stem, as mono 48 kHz."""
    import torch
    import torchaudio.functional as F
    from demucs.apply import apply_model
    model = load_demucs(device)
    audio, _ = read_audio(path, model.samplerate, 2)
    job.update(progress=15, message=f'Separating the voice on {device.upper()}…')
    mix = torch.from_numpy(audio)
    ref = mix.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        sources = apply_model(model, ((mix - mean) / std)[None], device=device, split=True, overlap=0.25, progress=False)[0]
    vocals = sources[model.sources.index('vocals')].cpu() * std + mean
    vocals = F.resample(vocals.mean(0, keepdim=True), model.samplerate, RATE)
    return vocals.numpy()


def finish(audio, options):
    """Rumble filter and loudness to -16 LUFS, keeping peaks under -1 dBFS."""
    import numpy as np
    import torch
    import torchaudio.functional as F
    wave = torch.from_numpy(audio)
    if options['highpass']:
        wave = F.highpass_biquad(wave, RATE, 80.0)
    if options['loudness']:
        # Measured as the stereo file it becomes: two equal channels read 3 dB louder.
        loudness = float(F.loudness(wave.repeat(2, 1) if wave.shape[0] == 1 else wave, RATE))
        if np.isfinite(loudness):
            wave = wave * 10 ** ((-16.0 - loudness) / 20)
    return limit(wave.numpy())


def limit(audio, ceiling=10 ** (-1 / 20)):
    """Pull single peaks under the ceiling instead of turning the whole clip down."""
    import numpy as np
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    window = RATE // 200  # 5 ms: starts early enough to catch the peak, short enough not to pump.
    gain = np.minimum(1.0, ceiling / np.maximum(np.abs(audio).max(axis=0), 1e-9))
    gain = minimum_filter1d(gain, 2 * window + 1)
    gain = np.minimum(gain, uniform_filter1d(gain, 2 * window + 1))
    return np.clip(audio * gain, -ceiling, ceiling).astype(np.float32)


def write_wav(path, audio):
    import numpy as np
    import soundfile
    stereo = np.repeat(audio, 2, axis=0) if audio.shape[0] == 1 else audio
    soundfile.write(str(path), stereo.T, RATE, subtype='PCM_24')


def write_video(source, target, audio):
    """Copy the picture untouched and put the cleaned sound beside it as AAC."""
    import av
    import numpy as np
    stereo = np.repeat(audio, 2, axis=0) if audio.shape[0] == 1 else audio
    with av.open(str(source)) as inp, av.open(str(target), 'w') as out:
        video_in = inp.streams.video[0]
        video_out = out.add_stream_from_template(video_in)
        if video_in.codec_context.name == 'hevc' and target.suffix == '.mp4':
            video_out.codec_tag = 'hvc1'  # Apple players need this tag for HEVC in MP4.
        audio_out = out.add_stream('aac', rate=RATE, layout='stereo')
        audio_out.bit_rate = 192000
        # Encode the sound first (it is small), then interleave it with the video by time.
        packets = []
        step = 1024
        for offset in range(0, stereo.shape[1], step):
            frame = av.AudioFrame.from_ndarray(np.ascontiguousarray(stereo[:, offset:offset + step]), format='fltp', layout='stereo')
            frame.sample_rate = RATE
            frame.pts = offset
            packets.extend(audio_out.encode(frame))
        packets.extend(audio_out.encode(None))
        queue = [(float(p.pts * p.time_base) if p.pts is not None else 0.0, p) for p in packets]
        index = 0
        for packet in inp.demux(video_in):
            if packet.dts is None: continue
            when = float(packet.dts * packet.time_base)
            while index < len(queue) and queue[index][0] <= when:
                out.mux(queue[index][1]); index += 1
            packet.stream = video_out
            out.mux(packet)
        for _, packet in queue[index:]:
            out.mux(packet)


def process(job, options, device):
    # clean_file.py (Transcribe Video's clean-first step) names its own input and folder.
    folder = Path(job.get('folder') or DATA / job['id'])
    media = Path(job.get('media') or folder / 'media')
    job.update(status='working', device=device, warnings=job['warnings'],
               message='Loading models. First use downloads them; later runs use the local cache.')
    started = time.time()
    if options['mode'] == 'isolate':
        voice = isolate(media, job, device)
        _, has_video = read_audio(media, 8000, 1)
        start = 55
    else:
        job.update(progress=5, message='Reading the sound track…')
        voice, has_video = read_audio(media, RATE, 1)
        start = 10
    job['duration'] = voice.shape[1] / RATE
    job['message'] = f'Removing noise on {device.upper()}…'
    voice = denoise(voice, job, device, KEEP[options['strength']], start, 85 - start)
    job.update(progress=87, message='Finishing the sound…')
    voice = finish(voice, options)
    write_wav(folder / 'cleaned.wav', voice)
    outputs = ['cleaned.wav']
    if has_video:
        import av
        job.update(progress=92, message='Putting the cleaned sound back into the video…')
        with av.open(str(media)) as probe:
            codec = probe.streams.video[0].codec_context.name
        name = 'cleaned.mp4' if codec in MP4_VIDEO else 'cleaned.mkv'
        try:
            write_video(media, folder / name, voice)
            outputs.append(name)
        except Exception as error:
            job['warnings'].append('The video could not be rebuilt, so only the WAV is ready. ' + str(error)[:250])
    seconds = time.time() - started
    job.update(status='complete', progress=100, outputs=outputs, seconds=round(seconds, 1),
               message=f'Cleaned on {device.upper()} in {seconds:.0f} s.')


def clean(job, options):
    try:
        device = device_for(options['device'])
        try:
            process(job, options, device)
        except RuntimeError as error:
            # Automatic mode falls back to the CPU when the GPU fails (out of memory, driver).
            if options['device'] != 'auto' or device != 'cuda':
                raise
            job['warnings'].append('The GPU failed for this run, so the CPU was used. ' + str(error)[:250])
            MODELS.clear()
            process(job, options, 'cpu')
    except Exception as error:
        traceback.print_exc()
        job.update(status='error', message=str(error)[:1000])
    finally:
        LOCK.release()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send(self, data, status=200, content_type='application/json', filename=None):
        body = json.dumps(data).encode() if content_type == 'application/json' else data
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if filename:
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        expected = f'127.0.0.1:{self.server.server_port}'
        if self.headers.get('Host') != expected:
            self.send({'error': 'Invalid host'}, 403)
            return False
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + expected:
            self.send({'error': 'Invalid origin'}, 403)
            return False
        return True

    def do_GET(self):
        if not self.allowed(): return
        path = urlparse(self.path).path
        if path == '/':
            html = (ROOT / 'ui.html').read_text(encoding='utf-8').replace('__TOKEN__', TOKEN)
            return self.send(html.encode(), content_type='text/html; charset=utf-8')
        if path == '/app.js':
            return self.send((ROOT / 'app.js').read_bytes(), content_type='text/javascript; charset=utf-8')
        if path == '/api/status':
            return self.send(gpu_status())
        if path.startswith('/api/job/'):
            job = JOBS.get(path.rsplit('/', 1)[-1])
            return self.send(job if job else {'error': 'Job not found'}, 200 if job else 404)
        if path.startswith('/file/') or path.startswith('/download/'):
            parts = path.split('/')
            job = JOBS.get(parts[2]) if len(parts) == 4 else None
            if not job or parts[3] not in job.get('outputs', []):
                return self.send({'error': 'Not found'}, 404)
            file = DATA / parts[2] / parts[3]
            name = None
            if parts[1] == 'download':
                name = safe_stem(job['filename']) + ' (clean voice)' + file.suffix
            return self.send(file.read_bytes(), content_type=OUTPUTS[parts[3]], filename=name)
        self.send({'error': 'Not found'}, 404)

    def do_POST(self):
        if not self.allowed(): return
        if self.headers.get('X-Local-Token') != TOKEN:
            return self.send({'error': 'Reload this local page'}, 403)
        if urlparse(self.path).path == '/api/quit':
            # The page's Stop button: the server runs without a window to close.
            self.send({'stopping': True})
            return threading.Thread(target=self.server.shutdown, daemon=True).start()
        if urlparse(self.path).path != '/api/clean':
            return self.send({'error': 'Not found'}, 404)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > MAX_UPLOAD:
                return self.send({'error': 'File is empty or too large (maximum 8 GB)'}, 413)
            if not LOCK.acquire(blocking=False):
                return self.send({'error': 'Another recording is being cleaned'}, 409)
            try:
                options = json.loads(unquote(self.headers.get('X-Options', '{}')))
                if (options.get('mode') not in ['denoise', 'isolate'] or options.get('strength') not in KEEP
                        or options.get('device') not in ['auto', 'cpu', 'cuda']):
                    raise ValueError('Invalid options')
                options['highpass'] = bool(options.get('highpass', True))
                options['loudness'] = bool(options.get('loudness', True))
                job_id = secrets.token_hex(12)
                folder = DATA / job_id
                folder.mkdir(parents=True)
                remaining = size
                with (folder / 'media').open('wb') as output:
                    while remaining:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        if not chunk: raise ValueError('Upload interrupted')
                        output.write(chunk)
                        remaining -= len(chunk)
                job = {'id': job_id, 'filename': str(options.get('filename', 'recording'))[:255], 'status': 'queued',
                       'progress': 0, 'warnings': [], 'outputs': [], 'mode': options['mode']}
                JOBS[job_id] = job
                threading.Thread(target=clean, args=(job, options), daemon=True).start()
            except Exception:
                LOCK.release()
                raise
            return self.send({'id': job_id})
        except (ValueError, KeyError, TypeError) as error:
            self.send({'error': str(error)}, 400)
        except Exception as error:
            self.send({'error': str(error)}, 500)


def gpu_status():
    try:
        import torch
        if torch.cuda.is_available():
            return {'gpu': torch.cuda.get_device_name(0)}
        return {'gpu': None, 'note': 'PyTorch has no CUDA support here. Run Enable NVIDIA GPU.cmd for GPU speed.'}
    except Exception as error:
        return {'gpu': None, 'note': str(error)[:200]}


class Server(ThreadingHTTPServer):
    # Windows' SO_REUSEADDR would let a second copy share the port; refuse instead.
    allow_reuse_address = os.name != 'nt'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    DATA.mkdir(exist_ok=True)
    if sys.stdout is None:
        # Started with pythonw (no window): keep messages and errors in a log.
        sys.stdout = sys.stderr = open(DATA / 'server.log', 'a', encoding='utf-8', buffering=1)
    url = f'http://127.0.0.1:{args.port}'
    try:
        server = Server(('127.0.0.1', args.port), Handler)
    except OSError:
        # Already running (the launcher was opened again): just show it.
        print(f'Clean Voice is already running at {url}', flush=True)
        if not args.no_browser: webbrowser.open(url)
        return
    print(f'Clean Voice: {url} ({time.strftime("%Y-%m-%d %H:%M")}). Stop it from the page.', flush=True)
    if not args.no_browser: webbrowser.open(url)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()


if __name__ == '__main__': main()
