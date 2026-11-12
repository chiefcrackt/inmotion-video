"""Voiceover's script, voice, pronunciation, timing and caption helpers. No model needed:
python -m unittest discover -s local-voiceover/tests"""
from pathlib import Path
from types import SimpleNamespace as Token
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import engine  # noqa: E402


class Script(unittest.TestCase):
    def test_lines_speakers_and_pauses(self):
        lines = engine.parse_script('Hello there.\n\nCoach: Keep it easy.\n[pause 1.5]\n  Mary Ann: Hi!  \n')
        self.assertEqual(lines, [
            {'kind': 'speech', 'speaker': None, 'text': 'Hello there.'},
            {'kind': 'speech', 'speaker': 'Coach', 'text': 'Keep it easy.'},
            {'kind': 'pause', 'seconds': 1.5},
            {'kind': 'speech', 'speaker': 'Mary Ann', 'text': 'Hi!'},
        ])
        self.assertEqual(engine.speakers(lines), ['Coach', 'Mary Ann'])

    def test_colons_that_are_not_speakers(self):
        for text in ['4:30 pace today.', 'Step 1: warm up.', 'the plan: go', 'Note:no space']:
            self.assertIsNone(engine.parse_script(text)[0]['speaker'], text)

    def test_pause_is_capped(self):
        self.assertEqual(engine.parse_script('[Pause 30s]')[0], {'kind': 'pause', 'seconds': 10.0})


class Voices(unittest.TestCase):
    def test_mix_normalizes(self):
        self.assertEqual(engine.normalize_mix('af_heart'), [('af_heart', 1.0)])
        mix = engine.normalize_mix([{'voice': 'af_bella', 'weight': 30}, {'voice': 'af_heart', 'weight': 70}])
        self.assertEqual([v for v, _ in mix], ['af_heart', 'af_bella'])
        self.assertAlmostEqual(sum(w for _, w in mix), 1.0)
        self.assertEqual(engine.describe_mix(mix), '70% af_heart + 30% af_bella')

    def test_mix_rejects_bad_input(self):
        for bad in ['nope', [], [{'voice': 'af_heart', 'weight': 0}], [{'voice': 'af_heart', 'weight': -1}],
                    [{'voice': 'af_heart', 'weight': 1}] * 4]:
            with self.assertRaises(ValueError):
                engine.normalize_mix(bad)

    def test_accent_follows_the_heaviest_voice(self):
        self.assertTrue(engine.is_british(engine.normalize_mix([{'voice': 'bf_emma', 'weight': 6}, {'voice': 'af_heart', 'weight': 4}])))
        self.assertFalse(engine.is_british(engine.normalize_mix('af_heart')))

    def test_every_voice_listed_once(self):
        self.assertEqual(len(engine.VOICE_IDS), len(engine.VOICES))
        self.assertEqual(len(engine.VOICES), 28)


class Pronunciation(unittest.TestCase):
    def test_respelling_and_phonemes(self):
        entries = [{'word': 'T.im', 'say': 'Tim'}, {'word': 'km', 'say': '/kˈɪləmˌiTəɹz/'}, {'word': '', 'say': 'x'}]
        text = engine.apply_pronunciations('This is T.im, 10 km. t.im again, kms no.', entries, lambda s: 'tˈɪm')
        self.assertEqual(text, 'This is [T.im](/tˈɪm/), 10 [km](/kˈɪləmˌiTəɹz/). [t.im](/tˈɪm/) again, kms no.')

    def test_nothing_to_do(self):
        self.assertEqual(engine.apply_pronunciations('Hello', [], None), 'Hello')


def tokens(*parts):
    return [Token(text=t, phonemes=p, whitespace=w) for t, p, w in parts]


class Timing(unittest.TestCase):
    def test_join_timestamps_matches_kokoro(self):
        # "Hi, you." -> phonemes "hˈI, jˈu." ; durations: start, h ˈ I , space j ˈ u . end
        toks = tokens(('Hi', 'hˈI', ''), (',', ',', ' '), ('you', 'jˈu', ''), ('.', '.', ''))
        durations = [5, 2, 2, 4, 6, 2, 3, 1, 5, 8, 4]
        engine.join_timestamps(toks, durations)
        self.assertEqual([(t.start_ts, t.end_ts) for t in toks],
                         [(0.05, 0.25), (0.25, 0.425), (0.425, 0.675), (0.675, 0.875)])

    def test_words_attach_punctuation(self):
        toks = tokens(('“', '', ''), ('Go', 'ɡO', ''), ('”', '', ' '), ('now', 'nW', ''), ('!', '!', ''))
        for t, (s, e) in zip(toks, [(None, None), (0.1, 0.3), (None, None), (0.3, 0.5), (0.5, 0.6)]):
            t.start_ts, t.end_ts = s, e
        toks[2].start_ts = toks[2].end_ts = 0.3
        toks[0].start_ts = toks[0].end_ts = 0.1
        self.assertEqual(engine.words_from_tokens(toks), [
            {'word': '“Go”', 'start': 0.1, 'end': 0.3}, {'word': 'now!', 'start': 0.3, 'end': 0.5}])

    def test_chunks_break_at_sentences(self):
        toks = tokens(('a', 'a' * 150, ''), ('.', '.', ' '), ('b', 'b' * 150, ''), (',', ',', ' '),
                      ('c', 'c' * 150, ''), ('.', '.', ''))
        chunks = engine.chunk_tokens(toks, limit=400)
        self.assertEqual([[t.text for t in c] for c in chunks], [['a', '.'], ['b', ',', 'c', '.']])
        self.assertTrue(all(len(engine.tokens_to_phonemes(c)) <= 400 for c in chunks))


class Captions(unittest.TestCase):
    words = [{'word': 'Hey,', 'start': 0.2, 'end': 0.4, 'line': 0}, {'word': 'there.', 'start': 0.4, 'end': 0.8, 'line': 0},
             {'word': 'Run', 'start': 1.5, 'end': 1.7, 'line': 1}, {'word': 'easy', 'start': 1.7, 'end': 2.0, 'line': 1}]

    def test_cues_split_at_sentences_and_lines(self):
        cues = engine.caption_cues(self.words)
        self.assertEqual([c['text'] for c in cues], ['Hey, there.', 'Run easy'])
        self.assertEqual(cues[0]['end'], 1.1)

    def test_srt_and_vtt(self):
        cues = engine.caption_cues(self.words)
        self.assertEqual(engine.srt(cues).splitlines()[:3], ['1', '00:00:00,200 --> 00:00:01,100', 'Hey, there.'])
        self.assertTrue(engine.vtt(cues).startswith('WEBVTT\n\n00:00:00.200 --> 00:00:01.100\nHey, there.'))


if __name__ == '__main__':
    unittest.main()
