"""Build the links page's flat Hooper from parts-atlas.png (handoff A9).

Cuts the 3x3 atlas, removes stray flecks and colored edge fringes, and writes
each piece at the exact size of the links page's previous Hooper piece, so the
rig in links-inMotion scene/runner.js (DOGPARTS pivots, ends, scales) keeps
working with no changes:

- Legs, paws and head have the same framing as before (joint caps at the same
  ends), so each is fitted to the old piece's size. The hind shank is the
  exception: the old one was short and wide, so the new one is scaled evenly
  and centered on the bone line rather than stretched.
- The torso is different on purpose: the old one included the tops of the
  legs, so its frame reaches below the belly. The new torso is scaled evenly
  to the old width and lined up at the top, which puts its belly on the old
  belly line instead of stretching it down to the old leg stumps.

Run from the repo root:  python3 shared/characters/hooper/build.py
Needs Pillow, NumPy and SciPy. Output: shared/characters/hooper/links/
Copy the .webp files to links-inMotion scene/hooper/.
"""

import pathlib
import sys

import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'river-run' / 'artwork' / 'hires'))
import build as hires  # noqa: E402  (shared clean() and premultiplied resize())

OUT = HERE / 'links'
GRID = [['torso', 'head', None], ['fu', 'fl', 'fp'], ['hu', 'hl', 'hp']]
# Size of each previous Hooper piece on the links page (scene/hooper/*.webp).
SIZE = {
    'torso': (139, 98), 'head': (88, 113),
    'fu': (36, 72), 'fl': (33, 82), 'fp': (33, 32),
    'hu': (44, 77), 'hl': (38, 53), 'hp': (38, 47),
}
TORSO_TOP = 2   # row where the old torso's back starts
# Pieces whose shape changed too much to stretch: scale evenly to the old
# height and center on the bone's x (DOGPARTS pivot x * 0.3, in stored px).
KEEP_ASPECT = {'hl': 12}


def cut(cell):
    piece = hires.clean(cell.astype(np.float64))
    piece[..., 3] = np.where(piece[..., 3] > 240, 255, piece[..., 3])
    ys, xs = np.where(piece[..., 3] > 0)
    return piece[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def main():
    OUT.mkdir(exist_ok=True)
    atlas = np.asarray(Image.open(HERE / 'parts-atlas.png').convert('RGBA'))
    cell = atlas.shape[0] // 3
    for r, row in enumerate(GRID):
        for c, name in enumerate(row):
            if not name:
                continue
            piece = cut(atlas[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell])
            w, h = SIZE[name]
            if name == 'torso':
                k = w / piece.shape[1]
                body = hires.resize(piece, (w, round(piece.shape[0] * k)))
                out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
                out.alpha_composite(body.crop((0, 0, w, min(body.size[1], h - TORSO_TOP))), (0, TORSO_TOP))
            elif name in KEEP_ASPECT:
                pw = round(piece.shape[1] * h / piece.shape[0])
                out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
                out.alpha_composite(hires.resize(piece, (pw, h)), (max(0, KEEP_ASPECT[name] - pw // 2), 0))
            else:
                out = hires.resize(piece, (w, h))
            out.save(OUT / f'{name}.webp', 'WEBP', lossless=True, method=6)
            print(f'{name:6s} {w}x{h}  new aspect {piece.shape[1] / piece.shape[0]:.2f}  old {w / h:.2f}')


if __name__ == '__main__':
    main()
