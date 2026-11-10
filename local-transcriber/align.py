"""Pin each recognized word to the audio with wav2vec2 forced alignment (English).

Runs in Clean Voice's environment (.venv-clean-voice), which has PyTorch:
python align.py <audio> <groups.json> <result.json> [--device auto|cpu|cuda]

groups.json: {"groups": [{"start": s, "end": s, "words": ["Hi,", "I'm", ...]}, ...]}, one per
Whisper segment. result.json: {"groups": [[{"start", "end", "score"} or null, ...], ...]}: null
where a word has no letters to align (numbers, symbols) or its segment could not be aligned.
Prints a JSON progress line per segment.
"""
import argparse
import json
import re
import sys

RATE = 16000
PAD = 0.25  # Seconds around each segment: Whisper's segment edges can clip a word.


def read_audio(path):
    import av
    import numpy as np
    with av.open(str(path)) as container:
        stream = container.streams.audio[0]
        resampler = av.AudioResampler(format='fltp', layout='mono', rate=RATE)
        chunks = [out.to_ndarray()[0] for frame in container.decode(stream) for out in resampler.resample(frame)]
        chunks += [out.to_ndarray()[0] for out in resampler.resample(None)]
    return np.concatenate(chunks).astype(np.float32)


ONES = ('ZERO ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN ELEVEN TWELVE THIRTEEN FOURTEEN FIFTEEN '
        'SIXTEEN SEVENTEEN EIGHTEEN NINETEEN').split()
TENS = 'ZERO TEN TWENTY THIRTY FORTY FIFTY SIXTY SEVENTY EIGHTY NINETY'.split()
ORDINAL = {'ONE': 'FIRST', 'TWO': 'SECOND', 'THREE': 'THIRD', 'FIVE': 'FIFTH', 'EIGHT': 'EIGHTH', 'NINE': 'NINTH', 'TWELVE': 'TWELFTH'}


def say(n):
    """A whole number as words, up to the millions."""
    if n < 20: return ONES[n]
    if n < 100: return TENS[n // 10] + ('' if n % 10 == 0 else ' ' + ONES[n % 10])
    if n < 1000: return ONES[n // 100] + ' HUNDRED' + ('' if n % 100 == 0 else ' ' + say(n % 100))
    for size, name in ((10 ** 6, 'MILLION'), (1000, 'THOUSAND')):
        if n >= size:
            return say(n // size) + ' ' + name + ('' if n % size == 0 else ' ' + say(n % size))


def say_number(text, year=False):
    if year and len(text) == 4 and 1100 <= int(text) <= 2099 and not 2000 <= int(text) <= 2009:
        n = int(text)  # Years by pairs: 2025 is "twenty twenty five", 1990 "nineteen ninety", 1900 "nineteen hundred".
        return say(n // 100) + ' ' + ('HUNDRED' if n % 100 == 0 else ('OH ' if n % 100 < 10 else '') + say(n % 100))
    return say(int(text))


def spoken(word):
    """Whisper writes numbers as digits ("2025", "100%", "100k", "13.1", "5:30"); the model only
    knows letters, so spell them the way they are said."""
    word = word.replace(',', '') if re.search(r'\d,\d', word) else word
    word = re.sub(r'\$(\d+)', lambda m: m.group(1) + ' DOLLARS', word)
    word = re.sub(r'(\d+):(\d\d)', lambda m: say_number(m.group(1)) + ('' if m.group(2) == '00' else ' ' + ('OH ' if m.group(2)[0] == '0' else '') + say_number(m.group(2))), word)
    word = re.sub(r'(\d+)\.(\d+)', lambda m: say_number(m.group(1)) + ' POINT ' + ' '.join(ONES[int(d)] for d in m.group(2)), word)
    def ordinal(m):
        words = say_number(m.group(1)).split()
        last = words[-1]
        words[-1] = ORDINAL.get(last, last[:-1] + 'IETH' if last.endswith('Y') else last + 'TH')
        return ' '.join(words)
    word = re.sub(r'(\d+)(?:st|nd|rd|th)\b', ordinal, word, flags=re.I)
    word = re.sub(r'\d+', lambda m: say_number(m.group(0), year=True), word)
    return word.replace('%', ' PERCENT').replace('&', ' AND ').replace('+', ' PLUS ')


def letters(word):
    """The word as the model spells it: capitals and apostrophes only."""
    word = spoken(word).upper().replace('’', "'").replace('‘', "'")
    return re.sub(r"[^A-Z']", '', word).strip("'")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('audio')
    parser.add_argument('groups')
    parser.add_argument('result')
    parser.add_argument('--device', choices=['auto', 'cpu', 'cuda'], default='auto')
    args = parser.parse_args()
    import torch
    import torchaudio
    import torchaudio.functional as F

    device = 'cuda' if args.device != 'cpu' and torch.cuda.is_available() else 'cpu'
    if args.device == 'cuda' and device != 'cuda':
        sys.exit('No NVIDIA GPU is available to PyTorch for word alignment.')
    bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H  # Downloads about 360 MB on first use.
    for attempt in range(5):
        try:
            model = bundle.get_model().to(device).eval()
            break
        except OSError:  # download.pytorch.org sometimes resets the connection mid-download.
            if attempt == 4: raise
            print(json.dumps({'warning': 'model download interrupted, retrying'}), flush=True)
    index = {label: n for n, label in enumerate(bundle.get_labels())}
    audio = torch.from_numpy(read_audio(args.audio))
    groups = json.load(open(args.groups, encoding='utf-8'))['groups']
    results = []
    for number, group in enumerate(groups, 1):
        spelled = [letters(word) for word in group['words']]
        out = [None] * len(spelled)
        first = max(0, int((group['start'] - PAD) * RATE))
        last = min(len(audio), int((group['end'] + PAD) * RATE))
        tokens = [index[c] for word in spelled for c in word]
        if tokens and last - first > RATE // 10:
            try:
                with torch.inference_mode():
                    emission, _ = model(audio[first:last][None].to(device))
                    emission = torch.log_softmax(emission, dim=-1)
                    path, scores = F.forced_align(emission, torch.tensor([tokens], dtype=torch.int32, device=device), blank=0)
                spans = F.merge_tokens(path[0].cpu(), scores[0].exp().cpu())
                if len(spans) == len(tokens):
                    seconds = (last - first) / emission.shape[1] / RATE  # Per model frame (about 20 ms).
                    position = 0
                    for n, word in enumerate(spelled):
                        if not word: continue
                        mine = spans[position:position + len(word)]
                        position += len(word)
                        out[n] = {'start': round(first / RATE + mine[0].start * seconds, 3),
                                  'end': round(first / RATE + mine[-1].end * seconds, 3),
                                  'score': round(sum(s.score for s in mine) / len(mine), 3)}
            except RuntimeError as error:
                # Too little audio for the letters (a clipped segment): keep Whisper's times there.
                print(json.dumps({'warning': f'segment {number}: {str(error)[:120]}'}), flush=True)
        results.append(out)
        print(json.dumps({'done': number, 'total': len(groups)}), flush=True)
    json.dump({'groups': results, 'device': device}, open(args.result, 'w', encoding='utf-8'))


if __name__ == '__main__':
    main()
