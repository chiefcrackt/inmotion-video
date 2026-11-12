"""Exit 0 when Voiceover's pinned engines are installed (the launcher runs pip otherwise)."""
from importlib.metadata import version
import sys

PINNED = {'kokoro-onnx': '0.6.1', 'onnxruntime': '1.31.1', 'onnx': '1.23.2', 'misaki': '0.9.4',
          'en-core-web-sm': '3.8.0', 'pyloudnorm': '0.2.0', 'espeakng-loader': '0.2.4'}
try:
    for name, wanted in PINNED.items():
        if version(name) != wanted:
            sys.exit(1)
    import espeakng_loader, kokoro_onnx, misaki.en, onnx, pyloudnorm, scipy, soundfile  # noqa: F401
except Exception:
    sys.exit(1)
