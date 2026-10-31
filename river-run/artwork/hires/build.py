"""Build River Run's high-res runner pieces from parts-atlas.png (handoff A1).

Cuts the 3x3 atlas, removes stray flecks and colored edge fringes, and scales
each piece to exactly SCALE x the original piece's size, so it lines up with
the original joints (PARTS) with no other changes. River Run loads these with
imgScale = SCALE / 2 (the originals are stored at half the joint units).

Run from the repo root:  python3 river-run/artwork/hires/build.py
Needs Pillow, NumPy and SciPy. Originals are read from river-run/index.html.
"""

import base64
import io
import pathlib
import re

import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = pathlib.Path(__file__).resolve().parents[3]
HERE = pathlib.Path(__file__).resolve().parent
SCALE = 2  # 2x the original pieces; the atlas supports about 2x on the torso and thighs
GRID = [
    ['head', 'torso', 'shorts'],
    ['thigh', 'shin', 'shoe'],
    ['upperarm', 'forearm', 'forearm_far'],
]


def originals():
    html = (ROOT / 'river-run' / 'index.html').read_text()
    start = html.index('var IMGSRC={')
    block = html[start : html.index('};', start)]
    return {
        name: Image.open(io.BytesIO(base64.b64decode(data))).convert('RGBA')
        for name, data in re.findall(
            r'"(\w+)":"data:image/\w+;base64,([^"]+)"', block
        )
    }


def largest(mask):
    lab, n = nd.label(mask)
    if n == 0:
        return mask
    sizes = nd.sum(mask, lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def clean(cell):
    """Keep one solid piece; replace fringe colors with the nearest inside color."""
    rgba = cell.astype(np.float64)
    alpha = rgba[..., 3]
    mask = largest(alpha > 16)
    # Opening removes thin specks and spurs stuck to the edge, then keep the body.
    mask = largest(nd.binary_opening(mask, structure=np.ones((5, 5))))
    keep = nd.binary_dilation(mask, iterations=1)
    alpha = np.where(keep, alpha, 0)
    # Edge pixels take the color of the nearest pixel at least 3px inside, so
    # red/yellow/cyan fringes can't survive while anti-aliasing is kept.
    inner = nd.binary_erosion(mask, iterations=3)
    if inner.any():
        _, (iy, ix) = nd.distance_transform_edt(~inner, return_indices=True)
        edge = keep & ~inner
        for ch in range(3):
            band = rgba[..., ch]
            band[edge] = band[iy[edge], ix[edge]]
    rgba[..., 3] = alpha
    return rgba


def resize(rgba, size):
    """Resize with premultiplied alpha so edges don't pick up dark halos."""
    a = rgba[..., 3:4] / 255.0
    pre = np.concatenate([rgba[..., :3] * a, rgba[..., 3:4]], axis=2)
    img = Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), 'RGBA')
    out = np.asarray(img.resize(size, Image.LANCZOS)).astype(np.float64)
    na = out[..., 3:4] / 255.0
    rgb = np.where(na > 0, out[..., :3] / np.maximum(na, 1e-6), 0)
    return Image.fromarray(
        np.clip(np.concatenate([rgb, out[..., 3:4]], axis=2), 0, 255).astype(
            np.uint8
        ),
        'RGBA',
    )


def main():
    atlas = np.asarray(Image.open(HERE / 'parts-atlas.png').convert('RGBA'))
    cell = atlas.shape[0] // 3
    orig = originals()
    for r, row in enumerate(GRID):
        for c, name in enumerate(row):
            piece = clean(atlas[r * cell : (r + 1) * cell, c * cell : (c + 1) * cell])
            ys, xs = np.where(piece[..., 3] > 0)
            piece = piece[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
            w, h = orig[name].size
            out = resize(piece, (w * SCALE, h * SCALE))
            out.save(HERE / f'{name}.webp', 'WEBP', lossless=True, method=6)
            print(f'{name:12s} {out.size[0]}x{out.size[1]}')


if __name__ == '__main__':
    main()
