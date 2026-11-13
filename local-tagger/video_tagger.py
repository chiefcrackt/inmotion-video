"""Video Tagger: transcribe, tag and describe a folder of videos, all on this PC.

Run with Transcribe Video's Python (Start Video Tagger.cmd does this):
    python video_tagger.py [FOLDER] [--home DATA_FOLDER]     no FOLDER: a folder picker opens

Original videos are only read. Results (library.json, transcripts) and your
tags.json and config.json live in the data folder: D:\\VideoTagger by default,
or local-tagger\\data on a PC without a D: drive.
"""
import argparse
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent            # local-tagger (code and defaults)
ENGINE = ROOT.parent / 'local-transcriber'         # Transcribe Video, used as-is
DEFAULT_HOME = Path('D:/VideoTagger') if Path('D:/').exists() else ROOT / 'data'


def set_home(home):
    """Point every output path at the data folder."""
    global HOME, LIBRARY, STATE, WORK, TRANSCRIPTS
    HOME = Path(home).resolve()
    LIBRARY = HOME / 'library.json'
    WORK = HOME / 'work'
    STATE = WORK / 'state.json'   # Videos transcribed but not tagged yet.
    TRANSCRIPTS = HOME / 'transcripts'


set_home(DEFAULT_HOME)
VIDEO_TYPES = {'.mp4', '.mov', '.m4v', '.mkv'}
NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
LOG = None


def say(text, live=False):
    """live: a progress line that the next line overwrites (not logged)."""
    if live:
        print('\r' + text[:150].ljust(150), end='', flush=True)
        return
    print('\r' + text.ljust(150) if sys.stdout.isatty() else text, flush=True)
    if LOG: LOG.write(text + '\n'); LOG.flush()


def now():
    return dt.datetime.now().astimezone().isoformat(timespec='seconds')


def write_json(path, data):
    """Write to a temp file first, then replace: a crash never leaves half a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    with temp.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush(); os.fsync(f.fileno())
    os.replace(temp, path)


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return default


# ---------- setup checks ----------

def load_tags():
    """tags.json: a list of names, or {"tag": name, "hint": what it means} objects."""
    items = read_json(HOME / 'tags.json', None)
    if not isinstance(items, list) or not items:
        sys.exit('tags.json is missing or empty. It should be a list like ["race", "gear", "other"].')
    tags, hints = [], {}
    for item in items:
        name = item.get('tag') if isinstance(item, dict) else item
        if not isinstance(name, str) or not name.strip():
            sys.exit(f'tags.json has an entry that is not a tag name: {item!r}')
        tags.append(name.strip())
        if isinstance(item, dict) and item.get('hint'): hints[name.strip()] = str(item['hint'])
    if 'other' not in tags: tags.append('other')
    return tags, hints


def ollama(config, path, payload=None, timeout=600):
    request = urllib.request.Request(config['ollama_url'].rstrip('/') + path,
                                     data=json.dumps(payload).encode() if payload is not None else None,
                                     headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())


def check_ollama(config):
    model = config['ollama_model']
    try:
        names = [m['name'] for m in ollama(config, '/api/tags', timeout=5)['models']]
    except (urllib.error.URLError, OSError):
        installed = shutil.which('ollama') or (Path(os.environ.get('LOCALAPPDATA', '')) / 'Programs' / 'Ollama' / 'ollama.exe').exists()
        if installed:
            sys.exit('Ollama is installed but not running. Start "Ollama" from the Start menu, then run Video Tagger again.')
        sys.exit('Ollama is not installed. Install it from https://ollama.com/download (or: winget install Ollama.Ollama),\n'
                 f'then run:  ollama pull {model}\nand run Video Tagger again.')
    if model not in names and model + ':latest' not in names:
        sys.exit(f'Ollama is running but the model "{model}" is not downloaded. Run:  ollama pull {model}')


def load_engine(config):
    """Transcribe Video's own engine (local-transcriber/server.py), used as-is."""
    if not (ENGINE / 'server.py').exists():
        sys.exit(f'Transcribe Video was not found at {ENGINE}. Video Tagger must stay in the inmotion-video repo.')
    sys.path.insert(0, str(ENGINE))
    import server as engine
    engine.DATA = WORK  # Its job folders go here instead of local-transcriber/data.
    return engine


# ---------- per video ----------

def fingerprint(path):
    st = path.stat()
    return {'full_path': str(path), 'file_size': st.st_size, 'file_modified': st.st_mtime}


def same(entry, fp):
    return (entry.get('full_path') == fp['full_path'] and entry.get('file_size') == fp['file_size']
            and abs(entry.get('file_modified', 0) - fp['file_modified']) < 0.001)


def video_id(full_path):
    return hashlib.sha1(full_path.lower().encode('utf-8')).hexdigest()[:10]


def safe_stem(path):
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]+', '_', path.stem).strip(' .')[:80] or 'video'


def ratio(w, h):
    r = w / h
    for name, value in (('9:16', 9 / 16), ('16:9', 16 / 9), ('1:1', 1), ('4:5', 4 / 5), ('4:3', 4 / 3), ('3:4', 3 / 4), ('21:9', 21 / 9)):
        if abs(r - value) / value < 0.03: return name
    return f'{r:.2f}:1'


def parse_date(text):
    try:
        value = dt.datetime.fromisoformat(text.strip().replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        return None
    return None if value.year < 2000 else value  # Cameras with no clock set write 1904/1970.


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', str(path)],
                         capture_output=True, text=True, encoding='utf-8', creationflags=NO_WINDOW)
    if out.returncode != 0:
        raise RuntimeError('ffprobe could not read this file: ' + out.stderr.strip()[:300])
    info = json.loads(out.stdout)
    fmt = info.get('format', {})
    video = next((s for s in info.get('streams', []) if s.get('codec_type') == 'video'
                  and not s.get('disposition', {}).get('attached_pic')), None)
    if not video: raise RuntimeError('No video stream in this file')
    has_audio = any(s.get('codec_type') == 'audio' for s in info.get('streams', []))
    w, h = int(video.get('width', 0)), int(video.get('height', 0))
    rotation = video.get('tags', {}).get('rotate')
    for side in video.get('side_data_list', []):
        if 'rotation' in side: rotation = side['rotation']
    if rotation is not None and abs(int(float(rotation))) % 180 == 90:
        w, h = h, w  # Phones store portrait video sideways with a rotation flag.
    num, _, den = (video.get('avg_frame_rate') or video.get('r_frame_rate') or '0/1').partition('/')
    fps = round(float(num) / float(den or 1), 2) if float(den or 1) else None
    duration = float(fmt.get('duration') or video.get('duration') or 0)
    recorded, source = None, 'file modified'
    for tags in (fmt.get('tags', {}), video.get('tags', {})):
        for key in ('com.apple.quicktime.creationdate', 'creation_time', 'date'):
            value = next((v for k, v in tags.items() if k.lower() == key), None)
            if value and parse_date(value):
                recorded, source = parse_date(value), 'metadata'
                break
        if recorded: break
    if not recorded:
        recorded = dt.datetime.fromtimestamp(path.stat().st_mtime)
    recorded = recorded.astimezone()  # This PC's time zone, whatever the source.
    orientation = 'square' if w and h and abs(w / h - 1) < 0.05 else ('vertical' if h > w else 'horizontal')
    return {'duration_seconds': round(duration, 2), 'duration': clock(duration), 'orientation': orientation,
            'aspect_ratio': ratio(w, h) if w and h else None, 'resolution': f'{w}x{h}', 'fps': fps,
            'recorded_date': recorded.isoformat(timespec='seconds'), 'recorded_date_source': source,
            'has_audio': has_audio}


def clock(seconds):
    seconds = round(seconds)
    h, rest = divmod(seconds, 3600)
    return f'{h}:{rest // 60:02}:{rest % 60:02}' if h else f'{rest // 60}:{rest % 60:02}'


NOISE_PHRASES = {'thank you', 'thank you very much', 'thanks', 'thanks for watching', 'thank you for watching',
                 'thank you so much for watching', 'bye', 'you', 'please subscribe', 'subscribe'}


def noise_phrase(text):
    """A line Whisper commonly invents over noise or silence."""
    return re.sub(r'[^a-z ]+', '', text.lower()).strip() in NOISE_PHRASES


def transcribe(engine, config, path, vid, meta, show):
    """Run Transcribe Video's transcribe() on the video's audio track; copy its TXT/SRT/JSON out."""
    job_id = 'tagger-' + vid
    folder = WORK / job_id
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir(parents=True)
    job = {'id': job_id, 'filename': path.name, 'status': 'queued', 'progress': 0, 'warnings': [],
           'segments': [], 'words': [], 'cleaned': []}
    if meta['has_audio']:
        # The audio track only, as Whisper hears it (16 kHz mono): no copy of the video is made.
        out = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(path), '-map', '0:a:0', '-vn', '-ac', '1',
                              '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', str(folder / 'media')],
                             capture_output=True, text=True, encoding='utf-8', creationflags=NO_WINDOW)
        if out.returncode != 0: raise RuntimeError('Could not read the audio: ' + out.stderr.strip()[:300])
        options = {'quality': config['quality'], 'device': config['device'], 'language': config['language'],
                   'vocabulary': config.get('vocabulary', ''), 'align': bool(config['precise_word_timing']),
                   'clean': config['clean_voice']}
        engine.LOCK.acquire()  # transcribe() releases it when done, as in the studio.
        worker = threading.Thread(target=engine.transcribe, args=(job, options), daemon=True)
        worker.start()
        last = None
        while worker.is_alive():
            worker.join(1)
            step = {'cleaning': 'cleaning voice', 'loading': 'loading model', 'aligning': 'pinning word times'}.get(job['status'], 'transcribing')
            label = f"{step} {job.get('progress', 0)}%"
            if label != last: show(label, live=sys.stdout.isatty()); last = label
        if job['status'] != 'complete':
            raise RuntimeError('Transcription failed: ' + job.get('message', 'unknown error'))
    else:
        job.update(duration=meta['duration_seconds'], language=None, device=None, model=None)
        job['warnings'].append('This video has no audio track.')
        engine.export(job, [])
    TRANSCRIPTS.mkdir(exist_ok=True)
    base = f'{safe_stem(path)}__{vid}'
    files = {}
    for kind in ('txt', 'srt', 'json'):
        target = TRANSCRIPTS / f'{base}.{kind}'
        shutil.copyfile(folder / f'transcript.{kind}', target)
        files[kind] = str(target)
    words = job['words']
    spoken = sum(s['end'] - s['start'] for s in job['segments'])
    coverage = spoken / meta['duration_seconds'] if meta['duration_seconds'] else 0
    speech = 'none' if len(words) <= 3 else ('little' if len(words) < 25 or coverage < 0.15 else 'lots')
    text = ' '.join(s['text'] for s in job['segments']).strip()
    if text and all(noise_phrase(s['text']) for s in job['segments']):
        # Whisper "hears" stock phrases in wind and footsteps: nothing was really said.
        job['warnings'].append(f'Only "{text[:60]}" was heard, which Whisper often invents over noise; treated as no speech.')
        speech, text = 'none', ''
    shutil.rmtree(folder, ignore_errors=True)  # Its working copy of the audio.
    return {'speech': speech, 'transcript': files, 'transcript_text': text, 'word_count': len(words),
            'language': job.get('language'), 'transcribed_on': job.get('device'), 'whisper_model': job.get('model'),
            'transcript_warnings': job['warnings']}


def frames(path, vid, meta, count):
    """A few stills across the video, for the vision model."""
    images = []
    folder = WORK / 'frames'
    folder.mkdir(parents=True, exist_ok=True)
    for n in range(count):
        at = meta['duration_seconds'] * (n + 0.5) / count
        out = folder / f'{vid}-{n}.jpg'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{at:.2f}', '-i', str(path), '-frames:v', '1',
                        '-vf', 'scale=640:640:force_original_aspect_ratio=decrease', '-q:v', '4', str(out)],
                       capture_output=True, creationflags=NO_WINDOW)
        if out.exists():
            images.append(base64.b64encode(out.read_bytes()).decode())
            out.unlink()
    return images


def excerpt(text, limit=200):
    if len(text) <= limit: return text
    cut = text[:limit].rsplit(' ', 1)[0]
    return cut + '…'


def clip_transcript(text, limit=6000):
    """Long transcripts: the start, middle and end, so the model sees the whole arc."""
    if len(text) <= limit: return text
    third = limit // 3
    middle = len(text) // 2
    return text[:third] + ' […] ' + text[middle - third // 2:middle + third // 2] + ' […] ' + text[-third:]


def tag(config, tags, hints, path, entry, images):
    tag_lines = '\n'.join(f'- {t}' + (f': {hints[t]}' if t in hints else '') for t in tags)
    facts = (f"File: {path.name}\nFolder: {path.parent.name}\nLength: {entry['duration']}\n"
             f"Orientation: {entry['orientation']} ({entry['aspect_ratio']})\nSpeech: {entry['speech']}")
    if entry['transcript_text']:
        facts += '\nTranscript:\n' + clip_transcript(entry['transcript_text'])
    else:
        facts += '\nTranscript: (no speech)'
    if images:
        facts += (f'\n\n{len(images)} frames from across the video are attached, in order.'
                  + {'little': ' There is little speech, so the frames are the main evidence.',
                     'lots': ' Use them to see who is on screen and where (for example someone talking to the camera).'}
                  .get(entry['speech'], ''))
    rules = (
        "You catalogue a runner's video library. Reply with JSON only.\n"
        f"Allowed tags:\n{tag_lines}\n\n"
        "Rules:\n"
        "- tags: the 1 to 4 allowed tags that best fit the video's main content. Do not add a tag just because "
        "something appears in the background.\n"
        '- Use "other" only when the main content fits none of the allowed tags. Then other_note is a 1-3 word '
        'label for a new tag (for example "drone shot" or "injury update"). Otherwise other_note is "".\n'
        + ('- "talking to camera": use it when someone speaks and the frames show them facing the camera '
           "(including while walking or running with a handheld or 360 camera).\n" if 'talking to camera' in tags else '') +
        '- topic: one short plain sentence on what the speaker talks about, from the transcript '
        '(for example "Talks about why he dropped out of the race."). "" if there is no transcript.\n'
        "- scene: one short plain sentence on what is visible: who, doing what, where.\n"
        "- topic and scene: only what the transcript or frames show. No guessed names, places or results, and "
        "no comments about tags, confidence or the video's purpose.\n"
        '- confidence: "high" if the evidence is clear, "medium" if mostly sure, "low" if guessing.')
    schema = {'type': 'object', 'properties': {
        'topic': {'type': 'string'},
        'scene': {'type': 'string'},
        'tags': {'type': 'array', 'items': {'type': 'string', 'enum': tags}},
        'other_note': {'type': 'string'},
        'confidence': {'type': 'string', 'enum': ['high', 'medium', 'low']}},
        'required': ['topic', 'scene', 'tags', 'other_note', 'confidence']}
    message = {'role': 'user', 'content': facts}
    if images: message['images'] = images
    reply = ollama(config, '/api/chat', {'model': config['ollama_model'], 'stream': False,
                                         'messages': [{'role': 'system', 'content': rules}, message],
                                         'format': schema, 'keep_alive': '10m',
                                         'options': {'temperature': 0, 'num_ctx': 8192}})
    try:
        answer = json.loads(reply['message']['content'])
    except (KeyError, ValueError):
        raise RuntimeError('The model did not return valid tags: ' + str(reply)[:300])
    chosen, other_note = [], str(answer.get('other_note', '')).strip()
    for t in answer.get('tags', []):
        if t in tags and t not in chosen: chosen.append(t)
        elif t not in tags:  # Not in tags.json: it becomes "other".
            other_note = other_note or str(t)
            if 'other' not in chosen: chosen.append('other')
    # The model sometimes writes one of the allowed tags as its "other" label ("race recap" for
    # "race recap / DNF"): use that tag instead.
    note = re.sub(r'[^a-z0-9/& ]+', '', other_note.lower()).strip(' /')
    match = next((t for t in tags if t != 'other' and note and
                  (note == t.lower() or t.lower().startswith(note + ' ') or note.startswith(t.lower()))), None)
    if match:
        if match not in chosen: chosen.append(match)
        other_note = ''
        if 'other' in chosen: chosen.remove('other')
    if other_note and 'other' not in chosen: chosen.append('other')
    if entry['speech'] == 'none' and 'B-roll' in tags and 'B-roll' not in chosen:
        chosen.append('B-roll')  # No speech at all: B-roll by definition.
    if entry['speech'] == 'none' and 'talking to camera' in chosen:
        chosen.remove('talking to camera')  # Nobody talks in it.
    reasons = []
    if 'other' in chosen and not other_note: other_note = 'unlabelled'
    if 'other' not in chosen: other_note = ''
    if len(other_note.split()) > 4:
        reasons.append('other_note is long')
        other_note = ' '.join(other_note.split()[:4])
    if answer.get('confidence') == 'low': reasons.append('model unsure')
    if not chosen: reasons.append('no tags chosen')
    if chosen == ['other']: reasons.append('only "other" fits')
    def first_sentence(text):
        text = re.split(r'(?<=[.!?])\s+', str(text or '').strip())[0]
        return text[:1].upper() + text[1:] + ('.' if text and text[-1] not in '.!?' else '')
    # What is said leads; what is seen follows. (Asked separately so the frames don't crowd out the transcript.)
    topic = first_sentence(answer.get('topic')) if entry['transcript_text'] else ''
    description = ' '.join(s for s in (topic, first_sentence(answer.get('scene'))) if s)
    if not description: reasons.append('no description')
    return {'tags': chosen, 'other_note': other_note, 'description': description,
            'model_confidence': answer.get('confidence'), 'review_reasons': reasons}


# ---------- run ----------

def transcribed_from(entry, fp):
    """A library entry turned back into a step-1 result, for --retag."""
    text = '' if entry['speech'] == 'none' else Path(entry['transcript']['txt']).read_text(encoding='utf-8').strip()
    reasons = entry.get('review_reasons') or []
    keep = ('duration', 'duration_seconds', 'orientation', 'aspect_ratio', 'resolution', 'fps', 'recorded_date',
            'recorded_date_source', 'speech', 'transcript', 'word_count', 'language')
    return {**fp, **{k: entry.get(k) for k in keep}, 'transcript_text': text,
            'transcribed_on': 'cpu' if any('CPU' in r for r in reasons) else 'cuda',
            'transcript_warnings': [r for r in reasons if 'skipped speech' in r]}


def pick_folder():
    import tkinter
    from tkinter import filedialog
    root = tkinter.Tk(); root.withdraw(); root.attributes('-topmost', True)
    folder = filedialog.askdirectory(title='Choose the folder of videos to tag (subfolders included)', mustexist=True)
    root.destroy()
    return folder


def main():
    global LOG
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('folder', nargs='?', help='folder of videos (subfolders included)')
    parser.add_argument('--home', default=str(DEFAULT_HOME), help=f'data folder (default {DEFAULT_HOME})')
    parser.add_argument('--retag', action='store_true',
                        help='tag and describe videos already in the library again (after editing tags.json), '
                             'using their saved transcripts')
    args = parser.parse_args()
    set_home(args.home)
    HOME.mkdir(parents=True, exist_ok=True)
    # Your own tags.json and config.json live in the data folder; first run copies the defaults there.
    for name in ('tags.json', 'config.json'):
        if not (HOME / name).exists():
            shutil.copyfile(ROOT / 'defaults' / name, HOME / name)
            say(f'Created {HOME / name} (edit it to change your {"tags" if name == "tags.json" else "settings"}).')
    # Settings added in later versions fall back to their defaults.
    config = {**read_json(ROOT / 'defaults' / 'config.json', {}), **read_json(HOME / 'config.json', {})}
    tags, hints = load_tags()
    for tool in ('ffprobe', 'ffmpeg'):
        if not shutil.which(tool): sys.exit(f'{tool} was not found. Install FFmpeg (winget install Gyan.FFmpeg) and try again.')
    check_ollama(config)
    folder = args.folder or pick_folder()
    if not folder: sys.exit('No folder chosen.')
    folder = Path(folder).resolve()
    if not folder.is_dir(): sys.exit(f'Not a folder: {folder}')

    WORK.mkdir(exist_ok=True)
    LOG = (HOME / 'last-run.log').open('w', encoding='utf-8')
    say(f'Video Tagger – {folder} – {now()}')
    videos = sorted(p for p in folder.rglob('*') if p.is_file() and p.suffix.lower() in VIDEO_TYPES)
    library = read_json(LIBRARY, {'version': 1, 'videos': []})
    by_path = {v['full_path']: v for v in library['videos']}
    state = read_json(STATE, {})
    todo, skipped = [], 0
    retagging = 0
    for path in videos:
        fp = fingerprint(path.resolve())
        entry = by_path.get(fp['full_path'])
        if entry and same(entry, fp) and args.retag and Path(entry['transcript']['txt']).exists():
            # Tag again from the saved transcript: step 1 sees it as already transcribed.
            state[fp['full_path']] = transcribed_from(entry, fp)
            todo.append((path.resolve(), fp)); retagging += 1
        elif entry and same(entry, fp): skipped += 1
        else: todo.append((path.resolve(), fp))
    say(f'{len(videos)} videos found: {len(todo) - retagging} new or changed, '
        + (f'{retagging} to tag again, ' if args.retag else '') + f'{skipped} already done and unchanged.')
    failed, reviewed, done = [], 0, 0
    if not todo:
        return summary(done, skipped, failed, reviewed)

    def save_library():
        library['generated'] = now()
        library['videos'].sort(key=lambda v: v.get('recorded_date') or '')
        write_json(LIBRARY, library)

    # Pass 1: metadata + transcripts (Whisper on the GPU). Pass 2 tags them, once Whisper has left the GPU.
    engine = None
    say('\nStep 1 of 2: reading and transcribing')
    for n, (path, fp) in enumerate(todo, 1):
        vid = video_id(fp['full_path'])
        prior = state.get(fp['full_path'])
        if prior and same(prior, fp) and all(Path(f).exists() for f in prior['transcript'].values()):
            say(f'video {n} of {len(todo)} – {path.name} – already transcribed'); continue
        show = lambda step, live=False: say(f'video {n} of {len(todo)} – {path.name} – {step}', live)
        try:
            show('reading metadata')
            meta = probe(path)
            if engine is None:
                engine = load_engine(config)
            result = transcribe(engine, config, path, vid, meta, show)
            state[fp['full_path']] = {**fp, **meta, **result}
            write_json(STATE, state)
            show(f"speech: {result['speech']} ({result['word_count']} words)")
        except Exception as error:
            failed.append((path.name, str(error)[:300]))
            say(f'video {n} of {len(todo)} – {path.name} – FAILED: {str(error)[:300]}')
    if engine is not None:
        engine.MODELS.clear()  # Free the GPU for the tagging model.

    say('\nStep 2 of 2: tagging and describing')
    for n, (path, fp) in enumerate(todo, 1):
        entry = state.get(fp['full_path'])
        if not entry or not same(entry, fp): continue  # Failed in step 1.
        show = lambda step, live=False: say(f'video {n} of {len(todo)} – {path.name} – {step}', live)
        try:
            images = []
            wanted = int(config.get('frames_for_speech', 3) if entry['speech'] == 'lots'
                         else config.get('frames_for_low_speech', 5))
            if wanted:
                show('sampling frames')
                images = frames(path, video_id(fp['full_path']), entry, wanted)
            show('tagging' + (f' (looking at {len(images)} frames)' if images else ''))
            result = tag(config, tags, hints, path, entry, images)
            reasons = result.pop('review_reasons')
            if wanted and not images and entry['speech'] != 'lots':
                reasons.append('no frames could be read')
            if entry.get('transcribed_on') == 'cpu' and entry['speech'] != 'none':
                reasons.append('transcribed on CPU (GPU unavailable)')
            reasons += [w for w in entry['transcript_warnings'] if 'skipped speech' in w]
            record = {
                'file_name': path.name, 'full_path': fp['full_path'], 'folder': str(path.parent),
                'duration': entry['duration'], 'duration_seconds': entry['duration_seconds'],
                'orientation': entry['orientation'], 'aspect_ratio': entry['aspect_ratio'],
                'resolution': entry['resolution'], 'fps': entry['fps'],
                'recorded_date': entry['recorded_date'], 'recorded_date_source': entry['recorded_date_source'],
                'speech': entry['speech'], 'tags': result['tags'], 'other_note': result['other_note'],
                'description': result['description'], 'transcript': entry['transcript'],
                'transcript_excerpt': excerpt(entry['transcript_text']),
                'needs_review': bool(reasons), 'review_reasons': reasons,
                'processed_date': now(),
                'language': entry['language'], 'word_count': entry['word_count'],
                'tagged_with': config['ollama_model'] + (' + frames' if images else ''),
                'file_size': fp['file_size'], 'file_modified': fp['file_modified'],
            }
            library['videos'] = [v for v in library['videos'] if v['full_path'] != fp['full_path']] + [record]
            save_library()
            state.pop(fp['full_path'], None)
            write_json(STATE, state)
            done += 1
            reviewed += record['needs_review']
            show('done' + (' – needs review: ' + ', '.join(reasons) if reasons else ''))
        except Exception as error:
            failed.append((path.name, str(error)[:300]))
            say(f'video {n} of {len(todo)} – {path.name} – FAILED: {str(error)[:300]}')
    summary(done, skipped, failed, reviewed)


def write_ai_file():
    """library-for-ai.md: every video's details, tags, description and full transcript in one
    file to paste into or attach to ChatGPT or Claude. Rebuilt from library.json each run."""
    videos = read_json(LIBRARY, {'videos': []})['videos']
    if not videos: return None
    total = sum(v.get('duration_seconds') or 0 for v in videos)
    out = [f'# Video library ({len(videos)} videos, {clock(total)} in total)', '',
           'Each video below has its file name, details, tags, a short description and the full transcript. '
           'Tags come from a fixed list; "other" means none fit, with a suggested label. '
           'Videos marked "(no speech)" are B-roll or footage without talking.', '']
    for n, v in enumerate(videos, 1):
        text = ''
        try:
            text = Path(v['transcript']['txt']).read_text(encoding='utf-8').strip()
        except (OSError, KeyError, TypeError):
            text = v.get('transcript_excerpt', '')
        if v.get('speech') == 'none': text = ''  # Includes noise Whisper wrote down as "Thank you."
        tags = ', '.join(v.get('tags') or []) + (f" (other: {v['other_note']})" if v.get('other_note') else '')
        out += [f"## {n}. {v['file_name']}", '',
                f"- Recorded: {(v.get('recorded_date') or '')[:10]}",
                f"- Length: {v.get('duration')}, {v.get('orientation')} ({v.get('aspect_ratio')})",
                f"- Folder: {v.get('folder')}",
                f"- Speech: {v.get('speech')}",
                f'- Tags: {tags}',
                f"- Description: {v.get('description')}"]
        if v.get('needs_review'): out.append('- Needs review: ' + '; '.join(v.get('review_reasons') or []))
        out += ['', '### Transcript', '', text if text else '(no speech)', '']
    path = HOME / 'library-for-ai.md'
    temp = path.with_name(path.name + '.tmp')
    temp.write_text('\n'.join(out), encoding='utf-8')
    os.replace(temp, path)
    return path


def summary(done, skipped, failed, reviewed):
    ai_file = write_ai_file()
    say(f'\nFinished {now()}: {done} done, {skipped} skipped (unchanged), {len(failed)} failed, {reviewed} need review.')
    for name, why in failed:
        say(f'  failed: {name} – {why}')
    if failed: say('Run it again to retry the failed videos; finished ones are kept.')
    say(f'Library: {LIBRARY}')
    if ai_file: say(f'For AI (titles, tags, descriptions, full transcripts in one file): {ai_file}')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        say('\nStopped. Finished videos are saved; run it again to carry on where it left off.')
