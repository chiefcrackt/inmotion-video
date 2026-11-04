"""Exit 0 when Clean Voice's pinned engines are installed (the launcher runs pip otherwise)."""
from importlib.metadata import version
import sys

PINNED = {'torch': '2.5.1', 'torchaudio': '2.5.1', 'clearvoice': '0.1.2', 'demucs': '4.0.1', 'av': '16.0.1'}
try:
    for name, wanted in PINNED.items():
        # The NVIDIA build reads 2.5.1+cu124; either build is fine.
        if version(name).split('+')[0] != wanted:
            sys.exit(1)
    import av, clearvoice, demucs, soundfile, torch  # noqa: F401
except Exception:
    sys.exit(1)
