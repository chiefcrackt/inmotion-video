"""Clean one file without the web page; Transcribe Video runs this for its clean-first step.

python clean_file.py <input> <output folder> --mode denoise --strength medium --device auto

Prints the job as one JSON line each half second while it works and once at the end;
the folder then holds cleaned.wav, plus cleaned.mp4 (or .mkv) for a video.
"""
import argparse
import json
from pathlib import Path
import sys
import threading

sys.path.insert(0, str(Path(__file__).resolve().parent))
import server  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    parser.add_argument('folder')
    parser.add_argument('--mode', choices=['denoise', 'isolate'], default='denoise')
    parser.add_argument('--strength', choices=list(server.KEEP), default='medium')
    parser.add_argument('--device', choices=['auto', 'cpu', 'cuda'], default='auto')
    parser.add_argument('--no-highpass', action='store_true')
    parser.add_argument('--no-loudness', action='store_true')
    args = parser.parse_args()
    folder = Path(args.folder)
    folder.mkdir(parents=True, exist_ok=True)
    job = {'id': folder.name, 'folder': str(folder), 'media': str(Path(args.input)), 'status': 'queued',
           'progress': 0, 'warnings': [], 'outputs': []}
    options = {'mode': args.mode, 'strength': args.strength, 'device': args.device,
               'highpass': not args.no_highpass, 'loudness': not args.no_loudness}
    done = threading.Event()

    def report():
        while not done.wait(0.5):
            print(json.dumps(job), flush=True)

    threading.Thread(target=report, daemon=True).start()
    server.LOCK.acquire()
    server.clean(job, options)
    done.set()
    print(json.dumps(job), flush=True)
    sys.exit(0 if job['status'] == 'complete' else 1)


if __name__ == '__main__':
    main()
