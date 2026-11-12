"""Kokoro text-to-speech for Voiceover: the script, voices and blends, pronunciation fixes,
speech with word timings, and the files it writes. server.py runs it; tests/ check it.

The script, pronunciation and caption helpers need only the standard library, so they can be
unit tested without the model. Everything that needs numpy, the model or misaki imports inside.
"""
import hashlib
import json
import re
import urllib.request
from pathlib import Path

MODEL_RATE = 24000  # Kokoro's output.
RATE = 48000  # What Voiceover writes, like the rest of the site's sound.
MAX_PHONEMES = 400  # Kokoro rushes past about 400 (it can take 510).
LEAD_IN = 0.15  # Seconds of silence before the first word.
MARGIN = 0.05  # Silence kept around each line when its edges are trimmed.

# Kokoro v1.0 as ONNX (the same weights as hexgrad/Kokoro-82M), from the kokoro-onnx releases.
MODEL_URL = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'
MODEL_FILES = {
    'kokoro-v1.0.onnx': '7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5',
    'voices-v1.0.bin': 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d',
}
TIMED_MODEL = 'kokoro-v1.0-timed.onnx'
# The node holding each phoneme's length in frames (pred_dur in the PyTorch model).
DURATION_NODE = '/encoder/Gather_output_0'

# The English voices, with the overall grades from Kokoro's VOICES.md.
VOICES = [
    ('af_heart', 'Heart', 'American', 'female', 'A'),
    ('af_bella', 'Bella', 'American', 'female', 'A-'),
    ('af_nicole', 'Nicole', 'American', 'female', 'B-'),
    ('af_aoede', 'Aoede', 'American', 'female', 'C+'),
    ('af_kore', 'Kore', 'American', 'female', 'C+'),
    ('af_sarah', 'Sarah', 'American', 'female', 'C+'),
    ('af_alloy', 'Alloy', 'American', 'female', 'C'),
    ('af_nova', 'Nova', 'American', 'female', 'C'),
    ('af_sky', 'Sky', 'American', 'female', 'C-'),
    ('af_jessica', 'Jessica', 'American', 'female', 'D'),
    ('af_river', 'River', 'American', 'female', 'D'),
    ('am_fenrir', 'Fenrir', 'American', 'male', 'C+'),
    ('am_michael', 'Michael', 'American', 'male', 'C+'),
    ('am_puck', 'Puck', 'American', 'male', 'C+'),
    ('am_echo', 'Echo', 'American', 'male', 'D'),
    ('am_eric', 'Eric', 'American', 'male', 'D'),
    ('am_liam', 'Liam', 'American', 'male', 'D'),
    ('am_onyx', 'Onyx', 'American', 'male', 'D'),
    ('am_santa', 'Santa', 'American', 'male', 'D-'),
    ('am_adam', 'Adam', 'American', 'male', 'F+'),
    ('bf_emma', 'Emma', 'British', 'female', 'B-'),
    ('bf_isabella', 'Isabella', 'British', 'female', 'C'),
    ('bf_alice', 'Alice', 'British', 'female', 'D'),
    ('bf_lily', 'Lily', 'British', 'female', 'D'),
    ('bm_fable', 'Fable', 'British', 'male', 'C'),
    ('bm_george', 'George', 'British', 'male', 'C'),
    ('bm_lewis', 'Lewis', 'British', 'male', 'D+'),
    ('bm_daniel', 'Daniel', 'British', 'male', 'D'),
]
VOICE_IDS = {v[0] for v in VOICES}
DEFAULT_VOICE = 'af_heart'  # A voice a blend falls back to when it can't be found.
# Tristan's pick from the trial samples (12 November 2026): 60% Puck + 40% Michael.
DEFAULT_PRESET = {'name': 'T.im narrator', 'mix': [{'voice': 'am_puck', 'weight': 0.6}, {'voice': 'am_michael', 'weight': 0.4}]}

# ---------------------------------------------------------------- script

PAUSE_LINE = re.compile(r'^\[\s*pause\s+(\d+(?:\.\d+)?)\s*s?\s*\]$', re.I)
# "Coach: Keep it easy." Up to three capitalised words before the colon, so "Step 1: ..." and
# "4:30 pace" stay speech.
SPEAKER_LINE = re.compile(r"^([A-Z][\w'’.-]*(?: [A-Z][\w'’.-]*){0,2}):\s+(\S.*)$")


def parse_script(text):
    """One entry per non-empty line: {'kind': 'speech', 'text', 'speaker'} or {'kind': 'pause', 'seconds'}.

    speaker is None for an untagged line, which uses the default voice."""
    lines = []
    for raw in str(text or '').splitlines():
        line = raw.strip()
        if not line:
            continue
        pause = PAUSE_LINE.match(line)
        if pause:
            lines.append({'kind': 'pause', 'seconds': min(10.0, float(pause.group(1)))})
            continue
        tagged = SPEAKER_LINE.match(line)
        if tagged:
            lines.append({'kind': 'speech', 'speaker': tagged.group(1), 'text': tagged.group(2).strip()})
        else:
            lines.append({'kind': 'speech', 'speaker': None, 'text': line})
    return lines


def speakers(lines):
    """Tagged speakers in order of first appearance."""
    seen = []
    for line in lines:
        if line.get('speaker') and line['speaker'] not in seen:
            seen.append(line['speaker'])
    return seen


# ---------------------------------------------------------------- voices and blends

def normalize_mix(mix):
    """A voice id or a list of {'voice', 'weight'} -> [(voice, weight)] summing to 1. Raises ValueError."""
    if isinstance(mix, str):
        mix = [{'voice': mix, 'weight': 1}]
    if not isinstance(mix, list) or not 1 <= len(mix) <= 3:
        raise ValueError('A voice mix has one to three voices.')
    parts = {}
    for part in mix:
        voice, weight = part.get('voice'), float(part.get('weight', 0))
        if voice not in VOICE_IDS:
            raise ValueError(f'Unknown voice: {voice}')
        if weight < 0:
            raise ValueError('Voice weights cannot be negative.')
        parts[voice] = parts.get(voice, 0.0) + weight
    total = sum(parts.values())
    if total <= 0:
        raise ValueError('Give at least one voice some weight.')
    return [(v, w / total) for v, w in sorted(parts.items(), key=lambda p: (-p[1], p[0])) if w > 0]


def is_british(mix):
    """The heaviest voice sets the accent the words are spelled out in."""
    return mix[0][0].startswith('b')


def describe_mix(mix):
    if len(mix) == 1:
        return mix[0][0]
    return ' + '.join(f'{round(w * 100)}% {v}' for v, w in mix)


# ---------------------------------------------------------------- pronunciation

def clean_pronunciations(entries):
    """[{'word', 'say'}] with blanks dropped. say is a respelling ("Tim") or /phonemes/."""
    out = []
    for entry in entries or []:
        word = str(entry.get('word', '')).strip()[:60]
        say = str(entry.get('say', '')).strip()[:120]
        if word and say and not any(c in word for c in '[]()'):
            out.append({'word': word, 'say': say})
    return out


def apply_pronunciations(text, entries, phonemize):
    """Mark each listed word with the phonemes to use, in misaki's [word](/phonemes/) form.

    phonemize(respelling) -> phonemes. The word itself stays in the text, so captions show it."""
    entries = sorted(clean_pronunciations(entries), key=lambda e: -len(e['word']))
    if not entries:
        return text
    sounds = {}
    for entry in entries:
        say = entry['say']
        if len(say) > 2 and say.startswith('/') and say.endswith('/'):
            sounds[entry['word'].lower()] = say.strip('/').replace(' ', '')
        else:
            sounds[entry['word'].lower()] = phonemize(say).replace(' ', '')
    pattern = re.compile(r'(?<![\w\[])(' + '|'.join(re.escape(e['word']) for e in entries) + r')(?![\w\]])', re.I)
    return pattern.sub(lambda m: f'[{m.group(1)}](/{sounds[m.group(1).lower()]}/)', text)


# ---------------------------------------------------------------- tokens, chunks and timing

def tokens_to_phonemes(tokens):
    return ''.join(t.phonemes + (' ' if t.whitespace else '') for t in tokens).strip()


def chunk_tokens(tokens, limit=MAX_PHONEMES):
    """Split misaki tokens into pieces of at most `limit` phonemes, preferring sentence ends,
    then other punctuation (Kokoro's own waterfall, with a lower limit)."""
    chunks, current, count = [], [], 0
    for token in tokens:
        size = len(token.phonemes + (' ' if token.whitespace else ''))
        if current and count + size > limit:
            cut = len(current)
            for marks in ('!.?…', ':;', ',—'):
                found = next((i for i in range(len(current) - 1, 0, -1) if current[i].phonemes and current[i].phonemes in marks), None)
                if found is not None:
                    cut = found + 1
                    break
            chunks.append(current[:cut])
            current = current[cut:]
            count = len(tokens_to_phonemes(current))
        current.append(token)
        count += size
    if current:
        chunks.append(current)
    return chunks


def join_timestamps(tokens, durations):
    """Give each token start_ts and end_ts in seconds from the model's frame durations.

    A port of kokoro 0.9.4's KPipeline.join_timestamps: durations has one entry per phoneme
    plus the start and end tokens, in frames of 600 samples; it counts half frames so a space
    can be split between the words on either side."""
    divisor = 80
    for token in tokens:
        token.start_ts = token.end_ts = None
    if not tokens or len(durations) < 3:
        return
    left = right = 2 * max(0, int(durations[0]) - 3)
    i = 1
    for token in tokens:
        if i >= len(durations) - 1:
            break
        if not token.phonemes:
            if token.whitespace:
                i += 1
                left = right + int(durations[i])
                right = left + int(durations[i])
                i += 1
            continue
        j = i + len(token.phonemes)
        if j >= len(durations):
            break
        token.start_ts = left / divisor
        spoken = int(sum(int(d) for d in durations[i:j]))
        space = int(durations[j]) if token.whitespace else 0
        left = right + 2 * spoken + space
        token.end_ts = left / divisor
        right = left + space
        i = j + (1 if token.whitespace else 0)


def words_from_tokens(tokens):
    """Caption words: punctuation joins the word before it (opening quotes the word after),
    as Transcribe Video's Word JSON has it."""
    words, prefix = [], ''
    for token in tokens:
        if token.start_ts is None or token.end_ts is None:
            continue
        text = token.text
        if not any(c.isalnum() for c in text):
            if words and not re.fullmatch(r'[\(\[“"‘]+', text):
                words[-1]['word'] += text
            else:
                prefix += text
            continue
        words.append({'word': prefix + text, 'start': round(float(token.start_ts), 3), 'end': round(float(token.end_ts), 3)})
        prefix = ''
    return words


# ---------------------------------------------------------------- captions

def caption_cues(words, max_words=10):
    """Group words into cues at sentence ends, long pauses or max_words."""
    cues, current = [], []
    for n, word in enumerate(words):
        current.append(word)
        following = words[n + 1] if n + 1 < len(words) else None
        gap = following['start'] - word['end'] if following else 99
        line_end = following is not None and following.get('line') != word.get('line')
        if len(current) >= max_words or gap > 0.6 or line_end or re.search(r'[.?!…]["”’)]*$', word['word']):
            cues.append(current)
            current = []
    if current:
        cues.append(current)
    out = []
    for n, cue in enumerate(cues):
        start, end = cue[0]['start'], cue[-1]['end']
        following = cues[n + 1][0]['start'] if n + 1 < len(cues) else end + 0.3
        out.append({'start': start, 'end': max(start + 0.05, min(following, end + 0.3)),
                    'text': ' '.join(w['word'] for w in cue)})
    return out


def stamp(seconds, separator):
    ms = max(0, round(seconds * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}{separator}{ms % 1000:03d}'


def srt(cues):
    return ''.join(f'{n}\n{stamp(c["start"], ",")} --> {stamp(c["end"], ",")}\n{c["text"]}\n\n'
                   for n, c in enumerate(cues, 1))


def vtt(cues):
    return 'WEBVTT\n\n' + ''.join(f'{stamp(c["start"], ".")} --> {stamp(c["end"], ".")}\n{c["text"]}\n\n' for c in cues)


# ---------------------------------------------------------------- model files

def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def ensure_model(folder, report=lambda message: None):
    """Download and check the model files once, then add the duration output to the graph."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    for name, digest in MODEL_FILES.items():
        target = folder / name
        if target.is_file():
            continue
        part = target.with_suffix(target.suffix + '.part')
        try:
            with urllib.request.urlopen(MODEL_URL + name, timeout=60) as response, part.open('wb') as out:
                total = int(response.headers.get('Content-Length') or 0)
                done = 0
                for block in iter(lambda: response.read(1 << 20), b''):
                    out.write(block)
                    done += len(block)
                    if total:
                        report(f'Downloading the voice model, first use only: {name} {done * 100 // total}%')
        except Exception as error:
            part.unlink(missing_ok=True)
            raise ValueError('Could not download the voice model (first use needs internet). ' + str(error)[:200])
        if sha256(part) != digest:
            part.unlink(missing_ok=True)
            raise ValueError(f'The downloaded {name} is damaged (checksum mismatch). Try again.')
        part.replace(target)
    timed = folder / TIMED_MODEL
    if not timed.is_file():
        report('Preparing the voice model for word timing…')
        import onnx
        from onnx import TensorProto, helper
        model = onnx.load(str(folder / 'kokoro-v1.0.onnx'))
        model.graph.node.append(helper.make_node('Identity', [DURATION_NODE], ['duration']))
        model.graph.output.append(helper.make_tensor_value_info('duration', TensorProto.INT64, None))
        part = timed.with_suffix('.part')
        onnx.save(model, str(part))
        part.replace(timed)
    return timed, folder / 'voices-v1.0.bin'


# ---------------------------------------------------------------- speech

class Engine:
    """Loads Kokoro and the English G2P once; makes one line of speech at a time."""

    def __init__(self, model_folder, report=lambda message: None):
        import espeakng_loader
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
        # misaki's fallback for words outside its dictionary (names, brands) uses espeak-ng.
        EspeakWrapper.set_library(espeakng_loader.get_library_path())
        EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
        from kokoro_onnx import Kokoro
        from misaki import en, espeak
        model, voices = ensure_model(model_folder, report)
        report('Loading the voice model…')
        self.kokoro = Kokoro(str(model), str(voices))
        if not self.kokoro.has_timings:
            raise RuntimeError('The voice model has no duration output; delete the models folder and try again.')
        self.vocab = self.kokoro.tokenizer.vocab
        self.g2p = {british: en.G2P(trf=False, british=british, fallback=espeak.EspeakFallback(british=british))
                    for british in (False, True)}

    def style(self, mix):
        return sum(self.kokoro.get_voice_style(voice) * weight for voice, weight in mix)

    def phonemize(self, text, british=False):
        return self.g2p[british](text)[0]

    def speak(self, text, mix, speed=1.0, pronunciations=()):
        """One line -> (float32 mono audio at 24 kHz, words with times in seconds from its start).

        Silence at the line's edges is trimmed to MARGIN; word times follow the trim."""
        import numpy as np
        british = is_british(mix)
        marked = apply_pronunciations(text, pronunciations, lambda say: self.phonemize(say, british))
        _, tokens = self.g2p[british](marked)
        for token in tokens:
            # The model skips symbols outside its vocabulary (misaki's ❓ for an unknown word);
            # dropping them here keeps the durations lined up with the tokens.
            token.phonemes = ''.join(c for c in (token.phonemes or '') if c in self.vocab)
        style = self.style(mix)
        pieces, words, offset = [], [], 0.0
        for chunk in chunk_tokens(tokens):
            phonemes = tokens_to_phonemes(chunk)
            if not phonemes:
                continue
            ids = [self.vocab[c] for c in phonemes]
            audio, durations = self.kokoro._infer(ids, style[min(len(ids), len(style)) - 1], float(speed))
            join_timestamps(chunk, durations)
            for word in words_from_tokens(chunk):
                words.append({**word, 'start': round(word['start'] + offset, 3), 'end': round(word['end'] + offset, 3)})
            pieces.append(np.asarray(audio, np.float32))
            offset += len(audio) / MODEL_RATE
        if not pieces:
            return np.zeros(0, np.float32), []
        audio = np.concatenate(pieces)
        return trim(audio, words)


def trim(audio, words, threshold=0.004):
    """Cut leading and trailing silence to MARGIN and move the word times with it."""
    import numpy as np
    loud = np.flatnonzero(np.abs(audio) > threshold)
    if not len(loud):
        return audio, words
    pad = int(MARGIN * MODEL_RATE)
    start = max(0, loud[0] - pad)
    if words:
        start = min(start, int(words[0]['start'] * MODEL_RATE))
    end = min(len(audio), loud[-1] + pad)
    if words:
        end = max(end, int(words[-1]['end'] * MODEL_RATE))
    shift = float(start) / MODEL_RATE
    length = float(end - start) / MODEL_RATE
    moved = [{**w, 'start': round(max(0.0, w['start'] - shift), 3), 'end': round(min(length, w['end'] - shift), 3)}
             for w in words]
    return audio[start:end], moved


def line_key(text, mix, speed, pronunciations):
    """Cache key for one line: anything that changes how it sounds."""
    payload = json.dumps([text, [[v, round(w, 4)] for v, w in mix], round(float(speed), 3),
                          clean_pronunciations(pronunciations), 'kokoro-v1.0'], ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()[:32]


# ---------------------------------------------------------------- finishing

def to_output(audio):
    """24 kHz mono -> 48 kHz mono."""
    import numpy as np
    from scipy.signal import resample_poly
    return resample_poly(audio, RATE // MODEL_RATE, 1).astype(np.float32)


def finish(audio, loudness=True):
    """Loudness to -16 LUFS (measured on the stereo file it becomes) with peaks under -1 dBFS."""
    import numpy as np
    if loudness and len(audio) > RATE // 2:
        import pyloudnorm
        measured = pyloudnorm.Meter(RATE).integrated_loudness(np.stack([audio, audio], axis=1))
        if np.isfinite(measured):
            audio = audio * 10 ** ((-16.0 - measured) / 20)
    return limit(audio)


def limit(audio, ceiling=10 ** (-1 / 20)):
    """Pull single peaks under the ceiling instead of turning the whole clip down (as Clean Voice)."""
    import numpy as np
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    window = RATE // 200
    gain = np.minimum(1.0, ceiling / np.maximum(np.abs(audio), 1e-9))
    gain = minimum_filter1d(gain, 2 * window + 1)
    gain = np.minimum(gain, uniform_filter1d(gain, 2 * window + 1))
    return np.clip(audio * gain, -ceiling, ceiling).astype(np.float32)


def write_wav(path, audio):
    import numpy as np
    import soundfile
    soundfile.write(str(path), np.stack([audio, audio], axis=1), RATE, subtype='PCM_24')
