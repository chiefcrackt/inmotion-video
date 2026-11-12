"""Local-only voiceover studio (Kokoro text-to-speech). Run with the supplied Windows launcher."""
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
from urllib.parse import urlparse
import webbrowser

import engine as tts

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
MODELS = ROOT / 'models'
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()  # One script at a time.
LOAD = threading.Lock()  # Loading the model.
ENGINE = {}
JOBS = {}
SETTINGS_FILE = DATA / 'presets.json'
MAX_SCRIPT = 200_000  # Characters: well over an hour of speech.
MAX_BODY = 1024 * 1024
PREVIEW_TEXT = "Hi, I'm your voiceover. Here's how I sound reading a line from your script."
OUTPUTS = {
    'voiceover.wav': ('audio/wav', '.wav'),
    'words.json': ('application/json', ' (word timing).json'),
    'captions.srt': ('application/x-subrip', '.srt'),
    'captions.vtt': ('text/vtt', '.vtt'),
}
STATIC = {'/app.js': ('app.js', 'text/javascript; charset=utf-8')}


def safe_stem(name):
    stem = re.sub(r'[^\w\- .]+', '', str(name)).strip()[:80]
    return stem or 'voiceover'


def get_engine(report=lambda message: None):
    with LOAD:
        if 'engine' not in ENGINE:
            ENGINE['engine'] = tts.Engine(MODELS, report)
        return ENGINE['engine']


def number(value, low, high, fallback):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return fallback
    return min(high, max(low, value)) if value == value else fallback


def read_options(data):
    """Validate a generate request. Raises ValueError with a message for the page."""
    script = str(data.get('script', ''))
    if len(script) > MAX_SCRIPT:
        raise ValueError('The script is too long (200,000 characters at most).')
    lines = tts.parse_script(script)
    if not any(line['kind'] == 'speech' for line in lines):
        raise ValueError('Paste a script first.')
    default = tts.normalize_mix(data.get('voice') or tts.DEFAULT_PRESET['mix'])
    voices = {}
    for name in tts.speakers(lines):
        chosen = (data.get('speakers') or {}).get(name)
        voices[name] = tts.normalize_mix(chosen) if chosen else default
    overrides = data.get('overrides') if isinstance(data.get('overrides'), dict) else {}
    return {
        'lines': lines,
        'default': default,
        'voices': voices,
        'speed': number(data.get('speed'), 0.7, 1.3, 1.0),
        'pause': number(data.get('pause'), 0.0, 5.0, 0.4),
        'loudness': bool(data.get('loudness', True)),
        'pronunciations': tts.clean_pronunciations(data.get('pronunciations')),
        'overrides': {str(k)[:2000]: v for k, v in overrides.items() if isinstance(v, dict)},
        'filename': safe_stem(data.get('filename') or 'voiceover'),
    }


def cached_line(engine, text, mix, speed, pronunciations):
    """One line's speech, from the cache when nothing about it changed."""
    import numpy as np
    key = tts.line_key(text, mix, speed, pronunciations)
    path = DATA / 'cache' / (key + '.npz')
    if path.is_file():
        try:
            with np.load(path) as stored:
                return stored['audio'], json.loads(str(stored['words'])), True
        except Exception:
            path.unlink(missing_ok=True)
    audio, words = engine.speak(text, mix, speed, pronunciations)
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_suffix('.part.npz')
    np.savez(part, audio=audio, words=json.dumps(words))
    part.replace(path)
    return audio, words, False


def render(job, options):
    import numpy as np
    folder = DATA / job['id']
    job.update(status='working', message='Loading the voice model…')
    engine = get_engine(lambda message: job.update(message=message))
    started = time.time()
    speech = [n for n, line in enumerate(options['lines']) if line['kind'] == 'speech']
    pieces = [np.zeros(int(tts.LEAD_IN * tts.MODEL_RATE), np.float32)]
    position = tts.LEAD_IN
    words, timeline, reused = [], [], 0
    last_speech = speech[-1]
    for n, line in enumerate(options['lines']):
        if line['kind'] == 'pause':
            pieces.append(np.zeros(int(line['seconds'] * tts.MODEL_RATE), np.float32))
            timeline.append({'index': n, 'kind': 'pause', 'start': round(position, 3),
                             'end': round(position + line['seconds'], 3)})
            position += line['seconds']
            continue
        done = speech.index(n)
        job.update(progress=round(5 + 85 * done / len(speech)),
                   message=f'Speaking line {done + 1} of {len(speech)}…')
        override = options['overrides'].get(line['text'], {})
        speed = number(override.get('speed'), 0.7, 1.3, options['speed'])
        pause = number(override.get('pause'), 0.0, 5.0, options['pause'])
        mix = options['voices'].get(line['speaker'], options['default']) if line['speaker'] else options['default']
        audio, line_words, hit = cached_line(engine, line['text'], mix, speed, options['pronunciations'])
        reused += hit
        length = len(audio) / tts.MODEL_RATE
        pieces.append(audio)
        for word in line_words:
            words.append({'word': word['word'], 'start': round(word['start'] + position, 3),
                          'end': round(word['end'] + position, 3), 'line': n})
        timeline.append({'index': n, 'kind': 'speech', 'speaker': line['speaker'], 'text': line['text'],
                         'voice': tts.describe_mix(mix), 'speed': speed, 'pause': pause,
                         'start': round(position, 3), 'end': round(position + length, 3)})
        position += length
        gap = pause if n != last_speech else 0.3
        pieces.append(np.zeros(int(gap * tts.MODEL_RATE), np.float32))
        position += gap
    job.update(progress=92, message='Finishing the sound…')
    audio = tts.finish(tts.to_output(np.concatenate(pieces)), options['loudness'])
    tts.write_wav(folder / 'voiceover.wav', audio)
    cues = tts.caption_cues(words)
    (folder / 'words.json').write_text(json.dumps({
        'source': 'Voiceover (Kokoro TTS)', 'word_timing': 'kokoro', 'duration': round(len(audio) / tts.RATE, 3),
        'words': words, 'lines': timeline}, ensure_ascii=False, indent=1), encoding='utf-8')
    (folder / 'captions.srt').write_text(tts.srt(cues), encoding='utf-8')
    (folder / 'captions.vtt').write_text(tts.vtt(cues), encoding='utf-8')
    seconds = time.time() - started
    made = len(speech) - reused
    note = f' {reused} unchanged line{"s" if reused != 1 else ""} reused.' if reused else ''
    job.update(status='complete', progress=100, outputs=list(OUTPUTS), lines=timeline,
               duration=round(len(audio) / tts.RATE, 2), seconds=round(seconds, 1),
               message=f'{len(audio) / tts.RATE:.1f} s of voiceover: {made} line{"s" if made != 1 else ""} '
                       f'spoken in {seconds:.0f} s.{note}')


def run(job, options):
    try:
        render(job, options)
    except Exception as error:
        traceback.print_exc()
        job.update(status='error', message=str(error)[:1000])
    finally:
        LOCK.release()


def load_settings():
    try:
        data = json.loads(SETTINGS_FILE.read_text(encoding='utf-8'))
        return {'presets': data.get('presets', []), 'pronunciations': data.get('pronunciations', [])}
    except Exception:
        return {'presets': [tts.DEFAULT_PRESET], 'pronunciations': [{'word': 'T.im', 'say': 'Tim'}, {'word': 'km', 'say': 'kilometers'}]}


def save_settings(data):
    presets = []
    for preset in data.get('presets', [])[:50]:
        name = str(preset.get('name', '')).strip()[:40]
        if name:
            mix = tts.normalize_mix(preset.get('mix'))
            presets.append({'name': name, 'mix': [{'voice': v, 'weight': round(w, 4)} for v, w in mix]})
    value = {'presets': presets, 'pronunciations': tts.clean_pronunciations(data.get('pronunciations'))[:200]}
    DATA.mkdir(exist_ok=True)
    part = SETTINGS_FILE.with_suffix('.part')
    part.write_text(json.dumps(value, ensure_ascii=False, indent=1), encoding='utf-8')
    part.replace(SETTINGS_FILE)
    return value


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send(self, data, status=200, content_type='application/json', filename=None):
        body = data if isinstance(data, bytes) else json.dumps(data).encode()
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
        if path in STATIC:
            name, kind = STATIC[path]
            return self.send((ROOT / name).read_bytes(), content_type=kind)
        if path == '/api/status':
            return self.send({'voices': [dict(zip(('id', 'name', 'accent', 'gender', 'grade'), v)) for v in tts.VOICES],
                              'default': 'preset:' + tts.DEFAULT_PRESET['name'], 'loaded': 'engine' in ENGINE,
                              'model': all((MODELS / name).is_file() for name in tts.MODEL_FILES), **load_settings()})
        if path.startswith('/api/job/'):
            job = JOBS.get(path.rsplit('/', 1)[-1])
            return self.send(job if job else {'error': 'Job not found'}, 200 if job else 404)
        if path.startswith('/preview/'):
            file = DATA / 'previews' / path.rsplit('/', 1)[-1]
            if not re.fullmatch(r'[0-9a-f]{32}\.wav', file.name) or not file.is_file():
                return self.send({'error': 'Not found'}, 404)
            return self.send(file.read_bytes(), content_type='audio/wav')
        if path.startswith('/file/') or path.startswith('/download/'):
            parts = path.split('/')
            job = JOBS.get(parts[2]) if len(parts) == 4 else None
            if not job or parts[3] not in job.get('outputs', []):
                return self.send({'error': 'Not found'}, 404)
            kind, suffix = OUTPUTS[parts[3]]
            name = job['filename'] + suffix if parts[1] == 'download' else None
            return self.send((DATA / parts[2] / parts[3]).read_bytes(), content_type=kind, filename=name)
        self.send({'error': 'Not found'}, 404)

    def body(self):
        size = int(self.headers.get('Content-Length', '0'))
        if size <= 0 or size > MAX_BODY:
            raise ValueError('The request is empty or too large.')
        return json.loads(self.rfile.read(size).decode('utf-8'))

    def do_POST(self):
        if not self.allowed(): return
        if self.headers.get('X-Local-Token') != TOKEN:
            return self.send({'error': 'Reload this local page'}, 403)
        path = urlparse(self.path).path
        try:
            if path == '/api/quit':
                # The page's Stop button: the server runs without a window to close.
                self.send({'stopping': True})
                return threading.Thread(target=self.server.shutdown, daemon=True).start()
            data = self.body()
            if path == '/api/parse':
                lines = tts.parse_script(str(data.get('script', ''))[:MAX_SCRIPT])
                return self.send({'lines': lines, 'speakers': tts.speakers(lines)})
            if path == '/api/settings':
                return self.send(save_settings(data))
            if path == '/api/preview':
                return self.preview(data)
            if path == '/api/generate':
                return self.generate(data)
            self.send({'error': 'Not found'}, 404)
        except (ValueError, KeyError, TypeError) as error:
            self.send({'error': str(error)}, 400)
        except Exception as error:
            traceback.print_exc()
            self.send({'error': str(error)[:500]}, 500)

    def preview(self, data):
        mix = tts.normalize_mix(data.get('voice') or tts.DEFAULT_PRESET['mix'])
        text = str(data.get('text') or PREVIEW_TEXT)[:300]
        speed = number(data.get('speed'), 0.7, 1.3, 1.0)
        pronunciations = tts.clean_pronunciations(data.get('pronunciations'))
        key = tts.line_key(text, mix, speed, pronunciations)
        file = DATA / 'previews' / (key + '.wav')
        if not file.is_file():
            engine = get_engine()
            audio, _ = engine.speak(text, mix, speed, pronunciations)
            file.parent.mkdir(parents=True, exist_ok=True)
            tts.write_wav(file, tts.finish(tts.to_output(audio)))
        return self.send({'url': f'/preview/{file.name}'})

    def generate(self, data):
        options = read_options(data)
        if not LOCK.acquire(blocking=False):
            return self.send({'error': 'Another script is being spoken'}, 409)
        try:
            job_id = secrets.token_hex(12)
            (DATA / job_id).mkdir(parents=True)
            job = {'id': job_id, 'filename': options['filename'], 'status': 'queued', 'progress': 0,
                   'message': 'Starting…', 'outputs': []}
            JOBS[job_id] = job
            threading.Thread(target=run, args=(job, options), daemon=True).start()
        except Exception:
            LOCK.release()
            raise
        return self.send({'id': job_id})


class Server(ThreadingHTTPServer):
    # Windows' SO_REUSEADDR would let a second copy share the port; refuse instead.
    allow_reuse_address = os.name != 'nt'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8767)
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
        print(f'Voiceover is already running at {url}', flush=True)
        if not args.no_browser: webbrowser.open(url)
        return
    print(f'Voiceover: {url} ({time.strftime("%Y-%m-%d %H:%M")}). Stop it from the page.', flush=True)
    if not args.no_browser: webbrowser.open(url)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()


if __name__ == '__main__': main()
