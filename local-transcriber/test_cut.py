"""Checks the Cut the video step. Run: python -m unittest test_cut -v (from local-transcriber).

The end-to-end test needs FFmpeg (FFMPEG_PATH or on PATH) and is skipped without it.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import server


class KeepRanges(unittest.TestCase):
    def test_cuts_become_keep_ranges(self):
        self.assertEqual(server.keep_ranges([{'start': 2, 'end': 4}], 10), [(0.0, 2.0), (4.0, 10.0)])

    def test_overlapping_and_unsorted_cuts_merge(self):
        cuts = [{'start': 6, 'end': 8}, {'start': 1, 'end': 3}, {'start': 2.5, 'end': 5}]
        self.assertEqual(server.keep_ranges(cuts, 10), [(0.0, 1.0), (5.0, 6.0), (8.0, 10.0)])

    def test_cut_running_to_the_end_keeps_only_the_start(self):
        self.assertEqual(server.keep_ranges([{'start': 7, 'end': 99}], 10), [(0.0, 7.0)])

    def test_bad_cuts_are_refused(self):
        for bad in ([], [{'start': 3, 'end': 3}], [{'start': 5, 'end': 4}], [{'start': 10, 'end': 11}],
                    [{'start': 0, 'end': 10}], ['nope']):
            with self.subTest(cuts=bad), self.assertRaises(ValueError):
                server.keep_ranges(bad, 10)


class FilterText(unittest.TestCase):
    def test_filter_joins_each_kept_section_in_order(self):
        text = server.cut_filter([(0.0, 2.0), (4.0, 10.0)])
        self.assertIn('[0:v]trim=start=0.000:end=2.000,setpts=PTS-STARTPTS[v0];', text)
        self.assertIn('[0:a]atrim=start=4.000:end=10.000,asetpts=PTS-STARTPTS[a1];', text)
        self.assertTrue(text.endswith('[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]'))


def find_ffmpeg():
    try:
        return server.find_ffmpeg()
    except RuntimeError:
        return None


@unittest.skipUnless(find_ffmpeg(), 'FFmpeg not installed')
class EndToEnd(unittest.TestCase):
    def test_cut_file_has_the_expected_length_and_original_is_untouched(self):
        ffmpeg = find_ffmpeg()
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            job_id = 'testjob'
            (data / job_id).mkdir()
            media = data / job_id / 'media'
            subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
                            'testsrc=size=320x240:rate=25:duration=10', '-f', 'lavfi', '-i',
                            'sine=frequency=440:duration=10', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', '-f', 'mp4',
                            '-y', str(media)], check=True)
            before = media.read_bytes()
            original_data = server.DATA
            server.DATA = data
            try:
                job = {'id': job_id, 'filename': 'sample.mp4', 'status': 'complete', 'duration': 10.0}
                result = server.cut_video(job, [{'start': 2, 'end': 4}])
            finally:
                server.DATA = original_data
            self.assertEqual(result['removed_seconds'], 2.0)
            cut = data / job_id / 'cut' / result['file']
            probe = subprocess.run([ffmpeg, '-hide_banner', '-i', str(cut)], capture_output=True, text=True)
            self.assertTrue(cut.exists())
            self.assertEqual(media.read_bytes(), before)
            # The cut should be about 8 seconds long (ffmpeg prints Duration: 00:00:08.xx).
            self.assertIn('Duration: 00:00:08.', probe.stderr)


if __name__ == '__main__':
    unittest.main()
