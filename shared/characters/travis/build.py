"""Build Travis's link-page pieces from v2/parts-atlas.png (handoff A8b) and props-atlas.png (A8).

Cuts each atlas, removes stray flecks, colored edge fringes and the soft glow
the props came with, and fits every body piece to the exact pixel size of the
matching Tristan piece on the links page (30% of source), so Travis runs on
Tristan's rig and joints with no rig changes. v2 was drawn inside Tristan's
outlines (v2/shape-template.png), so each piece maps straight onto his.

The sandwich states are saved at a fixed width; the open-hand forearms in the
props atlas are not used (the handoff is done fist to fist, which matches the
puppet's flat style).

Run from the repo root:  python3 shared/characters/travis/build.py
Needs Pillow, NumPy and SciPy. Output: shared/characters/travis/links/
Copy the .webp files to links-inMotion scene/travis/.
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
GRID = [
    ['head', 'torso', 'shorts'],
    ['thigh', 'shin', 'shoe'],
    ['upperarm', 'forearm', 'forearm_far'],
]
# Size of each of Tristan's pieces on the links page (scene/runner/*.webp).
SIZE = {
    'head': (50, 69), 'torso': (72, 108), 'shorts': (53, 53),
    'thigh': (52, 111), 'shin': (29, 90), 'shoe': (64, 36),
    'upperarm': (30, 82), 'forearm': (29, 98), 'forearm_far': (29, 98),
}
SANDWICH_W = 72      # px; drawn at 0.6 image scale on the page
SANDWICH = ['pbj-0', 'pbj-1', 'pbj-2', 'pbj-3']   # whole, one bite, two bites, crust


def cut(cell, glow=False):
    rgba = cell.astype(np.float64)
    if glow:
        # The props were generated with a wide soft glow: drop it and re-ramp
        # the remaining edge so it stays anti-aliased.
        a = rgba[..., 3]
        rgba[..., 3] = np.where(a > 200, np.clip((a - 200) / 50 * 255, 0, 255), 0)
    piece = hires.clean(rgba)
    piece[..., 3] = np.where(piece[..., 3] > 240, 255, piece[..., 3])
    ys, xs = np.where(piece[..., 3] > 0)
    return piece[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def save(img, name):
    img.save(OUT / f'{name}.webp', 'WEBP', lossless=True, method=6)
    print(f'{name:12s} {img.size[0]}x{img.size[1]}')


def main():
    OUT.mkdir(exist_ok=True)
    atlas = np.asarray(Image.open(HERE / 'v2' / 'parts-atlas.png').convert('RGBA'))
    cell = atlas.shape[0] // 3
    for r, row in enumerate(GRID):
        for c, name in enumerate(row):
            piece = cut(atlas[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell])
            if name == 'torso' and (HERE / 'v2' / 'torso.png').exists():
                # A8c: the redrawn torso replaces the atlas cell
                piece = cut(np.asarray(Image.open(HERE / 'v2' / 'torso.png').convert('RGBA')))
            save(hires.resize(piece, SIZE[name]), name)

    props = np.asarray(Image.open(HERE / 'props-atlas.png').convert('RGBA'))
    ch, cw = props.shape[0] // 2, props.shape[1] // 3
    cells = [(0, 0), (0, 1), (0, 2), (1, 0)]
    whole = cut(props[0:ch, 0:cw], glow=True)
    k = SANDWICH_W / whole.shape[1]   # one scale for every state, so the crust stays small
    for name, (r, c) in zip(SANDWICH, cells):
        piece = cut(props[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw], glow=True)
        size = (max(1, round(piece.shape[1] * k)), max(1, round(piece.shape[0] * k)))
        save(hires.resize(piece, size), name)


if __name__ == '__main__':
    main()
