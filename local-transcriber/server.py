"""Local-only video transcription. Run with the supplied Windows launcher."""
import argparse
import json
import math
import os
from pathlib import Path
import secrets
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote
import webbrowser
import sys

# Keep optional NVIDIA runtime DLLs inside this tool's virtual environment.
DLL_HANDLES = []
if os.name == 'nt':
    for component in ['cublas', 'cudnn', 'cuda_nvrtc']:
        folder = Path(sys.prefix) / 'Lib' / 'site-packages' / 'nvidia' / component / 'bin'
        if folder.exists():
            os.environ['PATH'] = str(folder) + os.pathsep + os.environ.get('PATH', '')
            DLL_HANDLES.append(os.add_dll_directory(str(folder)))

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()
JOBS = {}
MODELS = {}
MAX_UPLOAD = 8 * 1024 ** 3
# Clean Voice (../local-voice) runs in its own environment; it cleans the sound first when asked.
CLEANER_PYTHON = ROOT.parent / '.venv-clean-voice' / 'Scripts' / 'python.exe'
CLEANER = ROOT.parent / 'local-voice' / 'clean_file.py'
CLEAN_CHOICES = {'off': None, 'light': ('denoise', 'light'), 'medium': ('denoise', 'medium'),
                 'strong': ('denoise', 'strong'), 'isolate': ('isolate', 'medium')}
CLEANED_TYPES = {'cleaned.mp4': 'video/mp4', 'cleaned.mkv': 'video/x-matroska', 'cleaned.wav': 'audio/wav'}
CLEAN_SHARE = 30  # Progress bar share for cleaning.


def stamp(seconds, separator=','):
    ms = max(0, round(seconds * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f'{h:02}:{m:02}:{s:02}{separator}{ms:03}'


def subtitles(segments, vtt=False):
    rows = ['WEBVTT\n'] if vtt else []
    for n, segment in enumerate(segments, 1):
        rows.append(f"{n}\n{stamp(segment['start'], '.' if vtt else ',')} --> "
                    f"{stamp(segment['end'], '.' if vtt else ',')}\n{segment['text'].strip()}\n")
    return '\n'.join(rows)


def validate_segments(items):
    if not isinstance(items, list) or len(items) > 100000:
        raise ValueError('Invalid transcript')
    result = []
    for item in items:
        start, end = float(item['start']), float(item['end'])
        text = item['text']
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
            raise ValueError('Each end time must follow its start time')
        if not isinstance(text, str) or len(text) > 20000:
            raise ValueError('Invalid transcript text')
        result.append({'start': start, 'end': end, 'text': text.strip()})
    return result


def export(job, segments):
    folder = DATA / job['id']
    # Word alignment refers to recognized speech, not manually revised text.
    result = {k: job.get(k) for k in ['id', 'filename', 'language', 'duration', 'device', 'model', 'warnings']}
    result.update(segments=segments, original_segments=job.get('original_segments', []), original_words=job.get('words', []),
                  word_timing_note='Original recognition timings; text edits do not realign words.')
    (folder / 'transcript.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    (folder / 'transcript.txt').write_text('\n'.join(s['text'] for s in segments), encoding='utf-8')
    (folder / 'transcript.srt').write_text(subtitles(segments), encoding='utf-8')
    (folder / 'transcript.vtt').write_text(subtitles(segments, True), encoding='utf-8')
    uncertain = [w for w in job.get('words', []) if w['probability'] < .65]
    notes = ['Words to review (confidence is a heuristic, not a guarantee)', '']
    notes += [f"{stamp(w['start'], '.')}  {w['word'].strip()}  ({w['probability']:.0%})" for w in uncertain]
    (folder / 'review.txt').write_text('\n'.join(notes), encoding='utf-8')


def clean_voice(job, options):
    """Run Clean Voice on the upload and return the cleaned WAV to transcribe."""
    if not CLEANER_PYTHON.exists():
        raise RuntimeError('Clean Voice is not installed yet. Run local-voice/Start Clean Voice.cmd once, or choose Clean voice first: Off.')
    mode, strength = CLEAN_CHOICES[options['clean']]
    folder = DATA / job['id'] / 'clean'
    job.update(status='cleaning', progress=0, message='Cleaning the voice first…')
    command = [str(CLEANER_PYTHON), str(CLEANER), str(DATA / job['id'] / 'media'), str(folder),
               '--mode', mode, '--strength', strength, '--device', options['device']]
    log = (DATA / job['id'] / 'clean.log').open('w', encoding='utf-8')
    with log, subprocess.Popen(command, stdout=subprocess.PIPE, stderr=log, text=True, encoding='utf-8',
                               creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)) as process:
        state = {}
        for line in process.stdout:
            try:
                state = json.loads(line)
            except ValueError:
                continue  # Model download notes.
            job['progress'] = round(state.get('progress', 0) * CLEAN_SHARE / 100)
            if state.get('message'): job['message'] = 'Cleaning: ' + state['message']
    if state.get('status') != 'complete':
        raise RuntimeError('Clean Voice failed: ' + (state.get('message') or 'see local-transcriber/data/' + job['id'] + '/clean.log'))
    job['warnings'].extend('Clean Voice: ' + w for w in state.get('warnings', []))
    job['cleaned'] = [name for name in state['outputs'] if name in CLEANED_TYPES]
    return folder / 'cleaned.wav'


def transcribe(job, options):
    try:
        source, base = DATA / job['id'] / 'media', 0
        if options['clean'] != 'off':
            source, base = clean_voice(job, options), CLEAN_SHARE
        from faster_whisper import WhisperModel
        model_name = 'small' if options['quality'] == 'fast' else 'medium'
        if options['language'] == 'en': model_name += '.en'
        job.update(status='loading', message='Loading model. First use downloads it; later runs use the local cache.', model=model_name)
        device = options['device']
        if device == 'auto':
            import ctranslate2
            device = 'cuda' if ctranslate2.get_cuda_device_count() else 'cpu'
        def recognize(selected):
            key = (model_name, selected)
            if key not in MODELS:
                MODELS.clear()
                MODELS[key] = WhisperModel(model_name, device=selected, compute_type='float16' if selected == 'cuda' else 'int8', cpu_threads=8)
            job.update(device=selected, message=f'Transcribing on {selected.upper()}…')
            stream, info = MODELS[key].transcribe(str(source),
                language='en' if options['language'] == 'en' else None,
                word_timestamps=True, vad_filter=True, initial_prompt=options['vocabulary'] or None)
            job.update(status='transcribing', language=info.language, duration=info.duration, segments=[], words=[])
            for segment in stream:
                job['segments'].append({'start': segment.start, 'end': segment.end, 'text': segment.text.strip()})
                job['words'].extend({'start': w.start, 'end': w.end, 'word': w.word, 'probability': w.probability} for w in (segment.words or []))
                job['progress'] = min(99, base + round(segment.end / max(info.duration, 1) * (100 - base)))
        try:
            recognize(device)
        except RuntimeError as error:
            if options['device'] == 'auto' and device == 'cuda':
                job['warnings'].append('GPU unavailable for this run; used CPU. ' + str(error)[:250])
                MODELS.clear()
                recognize('cpu')
            else:
                raise
        job['original_segments'] = [dict(segment) for segment in job['segments']]
        export(job, job['segments'])
        job.update(status='complete', progress=100, message='Transcript ready.' if job['segments'] else 'No speech detected.')
    except Exception as error:
        job.update(status='error', message=str(error)[:1000])
    finally:
        LOCK.release()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send(self, data, status=200, content_type='application/json', disposition=None):
        body = json.dumps(data).encode() if content_type == 'application/json' else data
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if disposition: self.send_header('Content-Disposition', disposition)
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
        if path == '/ai-prompt.js':
            return self.send((ROOT / 'ai-prompt.js').read_bytes(), content_type='text/javascript; charset=utf-8')
        if path == '/api/status':
            return self.send({'cleaner': CLEANER_PYTHON.exists()})
        if path.startswith('/api/job/'):
            job = JOBS.get(path.rsplit('/', 1)[-1])
            return self.send(job if job else {'error': 'Job not found'}, 200 if job else 404)
        if path.startswith('/download/') or path.startswith('/media/'):
            parts = path.split('/')
            job = JOBS.get(parts[2]) if len(parts) == 4 else None
            if job and parts[3] in job.get('cleaned', []):
                # The cleaned recording: played in the page (/media/) or saved (/download/).
                file = DATA / parts[2] / 'clean' / parts[3]
                name = Path(job['filename']).stem[:120].replace('"', '') + ' (clean voice)' + file.suffix
                return self.send(file.read_bytes(), content_type=CLEANED_TYPES[parts[3]],
                                 disposition=f'attachment; filename="{name}"' if parts[1] == 'download' else None)
            if parts[1] == 'media': return self.send({'error': 'Not found'}, 404)
            if len(parts) != 4 or parts[2] not in JOBS or parts[3] not in ['transcript.txt', 'transcript.srt', 'transcript.vtt', 'transcript.json', 'review.txt']:
                return self.send({'error': 'Not found'}, 404)
            file = DATA / parts[2] / parts[3]
            if not file.exists(): return self.send({'error': 'Not ready'}, 404)
            return self.send(file.read_bytes(), content_type='application/octet-stream')
        self.send({'error': 'Not found'}, 404)

    def do_POST(self):
        if not self.allowed(): return
        if self.headers.get('X-Local-Token') != TOKEN:
            return self.send({'error': 'Reload this local page'}, 403)
        path = urlparse(self.path).path
        if path == '/api/quit':
            # The page's Stop button: the server runs without a window to close.
            self.send({'stopping': True})
            return threading.Thread(target=self.server.shutdown, daemon=True).start()
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > (MAX_UPLOAD if path == '/api/transcribe' else 20 * 1024 ** 2):
                return self.send({'error': 'File is empty or too large (maximum 8 GB)'}, 413)
            if path == '/api/transcribe':
                if not LOCK.acquire(blocking=False):
                    return self.send({'error': 'Another transcription is running'}, 409)
                try:
                    options = json.loads(unquote(self.headers.get('X-Options', '{}')))
                    if options.get('quality') not in ['fast', 'quality'] or options.get('device') not in ['auto', 'cpu', 'cuda'] or options.get('language') not in ['en', 'auto']:
                        raise ValueError('Invalid transcription options')
                    options['vocabulary'] = str(options.get('vocabulary', ''))[:1000]
                    options['clean'] = options.get('clean', 'off')
                    if options['clean'] not in CLEAN_CHOICES:
                        raise ValueError('Invalid clean voice option')
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
                    job = {'id': job_id, 'filename': str(options.get('filename', 'video'))[:255], 'status': 'queued', 'progress': 0, 'warnings': [], 'segments': [], 'words': [], 'cleaned': []}
                    JOBS[job_id] = job
                    threading.Thread(target=transcribe, args=(job, options), daemon=True).start()
                except Exception:
                    LOCK.release()
                    raise
                return self.send({'id': job_id})
            if path.startswith('/api/save/'):
                job = JOBS.get(path.rsplit('/', 1)[-1])
                if not job or job['status'] != 'complete': return self.send({'error': 'Transcript is not ready'}, 409)
                segments = validate_segments(json.loads(self.rfile.read(size))['segments'])
                export(job, segments)
                job['segments'] = segments
                return self.send({'saved': True})
            self.send({'error': 'Not found'}, 404)
        except (ValueError, KeyError, TypeError) as error:
            self.send({'error': str(error)}, 400)
        except Exception as error:
            self.send({'error': str(error)}, 500)


class Server(ThreadingHTTPServer):
    # Windows' SO_REUSEADDR would let a second copy share the port; refuse instead.
    allow_reuse_address = os.name != 'nt'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
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
        print(f'Transcribe Video is already running at {url}', flush=True)
        if not args.no_browser: webbrowser.open(url)
        return
    print(f'Transcribe Video: {url} ({time.strftime("%Y-%m-%d %H:%M")}). Stop it from the page.', flush=True)
    if not args.no_browser: webbrowser.open(url)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()


if __name__ == '__main__': main()
