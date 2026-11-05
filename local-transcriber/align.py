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


def letters(word):
    """The word as the model spells it: capitals and apostrophes only."""
    word = word.upper().replace('’', "'").replace('‘', "'")
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
