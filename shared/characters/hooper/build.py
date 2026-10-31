"""Build the links page's flat Hooper from parts-atlas.png (handoff A9).

Cuts the 3x3 atlas, removes stray flecks and colored edge fringes, and writes
each piece at the exact size of the links page's previous Hooper piece, so the
rig in links-inMotion scene/runner.js keeps its gallop:

- The head has the same framing as before, so it is fitted to the old size.
- Legs and paws keep their own proportions, with hinges at the centers of
  their rounded ends; the script prints the new DOGPARTS pivot/end/s for them
  (bone lengths unchanged, so the gallop is the same). Paste those into
  scene/runner.js.
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


# Leg pieces: the old rig's bone lengths in dog units (|end - pivot| * s), and
# where the hinge sits in each piece. Legs are not squeezed into the old boxes:
# each keeps its own proportions, its hinges go at the centers of its own
# rounded ends, and its scale makes the bone the same length as before, so the
# gallop is unchanged. Thighs (fu, hu) keep the old pivot's place down the wide
# top; paws (fp, hp) end at the bottom of the toes, where they touch the ground.
OLD = {
    'fu': ([58, 40], [55, 212], 0.94), 'fl': ([38, 26], [40, 246], 0.85),
    'fp': ([40, 28], [64, 98], 0.85), 'hu': ([72, 44], [70, 232], 0.82),
    'hl': ([40, 28], [37.5, 150], 1.02), 'hp': ([37.5, 28], [77, 151], 1.02),
}
K = 0.3   # links page stores pieces at 30% of rig pixels


def cap(alpha, top):
    """Center of the rounded end at the top (or bottom) of a piece."""
    rows = range(alpha.shape[0]) if top else range(alpha.shape[0] - 1, -1, -1)
    rows = [y for y in rows if alpha[y].any()]
    span = max(1, len(rows) // 5)
    width = max(np.ptp(np.where(alpha[y])[0]) + 1 for y in rows[:span])
    y = rows[min(len(rows) - 1, int(width / 2))]
    xs = np.where(alpha[y])[0]
    return np.array([(xs.min() + xs.max()) / 2, y], float)


def leg(name, piece):
    a = piece[..., 3] > 128
    pv0, en0, s0 = OLD[name]
    length = np.hypot(en0[0] - pv0[0], en0[1] - pv0[1]) * s0
    ys = np.where(a.any(1))[0]
    if name in ('fu', 'hu'):
        pivot = cap(a, True)
        pivot[1] = ys.min() + (ys.max() - ys.min()) * 0.17
        xs = np.where(a[int(pivot[1])])[0]
        pivot[0] = (xs.min() + xs.max()) / 2
    else:
        pivot = cap(a, True)
    if name in ('fp', 'hp'):
        bottom = ys.max()
        xs = np.where(a[bottom - 2:bottom + 1].any(0))[0]
        end = np.array([(xs.min() + xs.max()) / 2, bottom], float)
    else:
        end = cap(a, False)
    f = length / np.hypot(*(end - pivot))   # atlas px -> rig px, with s = 1
    w, h = round(piece.shape[1] * f * K), round(piece.shape[0] * f * K)
    out = hires.resize(piece, (w, h))
    pv, en = pivot * f, end * f
    return out, {'s': 1, 'pivot': [round(pv[0], 1), round(pv[1], 1)], 'end': [round(en[0], 1), round(en[1], 1)]}


def main():
    OUT.mkdir(exist_ok=True)
    atlas = np.asarray(Image.open(HERE / 'parts-atlas.png').convert('RGBA'))
    cell = atlas.shape[0] // 3
    rig = {}
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
            elif name in OLD:
                out, rig[name] = leg(name, piece)
                w, h = out.size
            elif name in KEEP_ASPECT:
                pw = round(piece.shape[1] * h / piece.shape[0])
                out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
                out.alpha_composite(hires.resize(piece, (pw, h)), (max(0, KEEP_ASPECT[name] - pw // 2), 0))
            else:
                out = hires.resize(piece, (w, h))
            out.save(OUT / f'{name}.webp', 'WEBP', lossless=True, method=6)
            print(f'{name:6s} {w}x{h}')
    import json
    print('DOGPARTS legs:', json.dumps(rig))


if __name__ == '__main__':
    main()
