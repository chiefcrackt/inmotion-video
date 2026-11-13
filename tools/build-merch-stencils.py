"""Build the Merch Stencils tool: Cricut cut files (SVG) and the tool page.

    python3 tools/build-merch-stencils.py

Writes merch-stencils/files/*.svg and merch-stencils/index.html (from
merch-stencils/template.html, with the glyph data and file list inlined so the
page works on its own). Needs numpy, scipy, scikit-image, opencv-python and
fontTools. Fonts come from shared/fonts; the waves are traced from favicon.svg.

Cut files: viewBox in 1/100 inch, width/height in inches, so Cricut Design
Space imports them at true size. Every shape is a filled path (no strokes,
no text, no transforms). Not mirrored: they're for adhesive vinyl stencils.
"""
import json, math, os, re
import numpy as np, cv2
from scipy import ndimage
from skimage import measure
from fontTools.ttLib import TTFont
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOL = os.path.join(ROOT, 'merch-stencils')
OUT = os.path.join(TOOL, 'files')
U = 100      # SVG units per inch
M = 0.25     # margin around each design, inches
STEM = {'Bold': 0.141, 'Black': 0.188}  # vertical stem of 'l', in em
NAME_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789._-'
CAPS_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,·’\'&-/#:'
ROUTE = {'line': 0.22, 'size': 10.0, 'cap': 0.085, 'detail': 0.66, 'gap': 0.35}  # shared with the page's route maker

_fonts = {}
def font(w):
    if w not in _fonts:
        _fonts[w] = TTFont(os.path.join(ROOT, 'shared/fonts', f'BarlowCondensed-{w}.ttf'))
    return _fonts[w]

def fnum(v):
    return f'{v:.2f}'.rstrip('0').rstrip('.')

# ---------- text
def line_glyphs(text, w, track):
    """Glyphs of one line at 1 unit = 1 font unit, baseline y=0, y down."""
    f = font(w); cmap = f.getBestCmap(); gs = f.getGlyphSet(); hm = f['hmtx']; upm = f['head'].unitsPerEm
    x = 0; out = []
    for i, ch in enumerate(text):
        g = cmap[ord(ch)]
        bp = BoundsPen(gs); gs[g].draw(TransformPen(bp, (1, 0, 0, -1, 0, 0)))
        if bp.bounds:
            b = bp.bounds; out.append((g, x, (b[0] + x, b[1], b[2] + x, b[3])))
        x += hm[g][0] + (track * upm if i < len(text) - 1 else 0)
    bb = (min(o[2][0] for o in out), min(o[2][1] for o in out), max(o[2][2] for o in out), max(o[2][3] for o in out))
    return out, bb

def draw_line(w, glyphs, s, ox, oy):
    gs = font(w).getGlyphSet(); ds = []
    for g, x, _ in glyphs:
        pen = SVGPathPen(gs, ntos=fnum)
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, ox + x * s, oy)))
        ds.append(pen.getCommands())
    return ' '.join(ds)

def text_block(lines, w, track=0.0, width_in=None, em_in=None, align='center', gap_em=0.22, x0=0.0, y0=0.0):
    """Lay out lines at one em size. Give width_in (widest line's ink) or em_in.
    Returns (path d, (x0, y0, x1, y1) in units, em_in). x0/y0 = top-left of ink, units."""
    upm = font(w)['head'].unitsPerEm
    laid = [line_glyphs(t, w, track) for t in lines]
    widest = max(bb[2] - bb[0] for _, bb in laid)
    s = (width_in * U / widest) if width_in else (em_in * U / upm)
    block_w = widest * s
    y = y0; ds = []
    for glyphs, bb in laid:
        lw = (bb[2] - bb[0]) * s
        lx = x0 + {'left': 0, 'center': (block_w - lw) / 2, 'right': block_w - lw}[align]
        ox = lx - bb[0] * s; oy = y - bb[1] * s
        ds.append(draw_line(w, glyphs, s, ox, oy))
        y += (bb[3] - bb[1]) * s + gap_em * upm * s
    y -= gap_em * upm * s
    return ' '.join(ds), (x0, y0, x0 + block_w, y), s * upm / U

# ---------- waves, traced from the real logo (favicon.svg)
def logo_waves():
    s = open(os.path.join(ROOT, 'favicon.svg')).read()
    g = re.search(r'<g fill="#128AA3" transform="translate\(0,(\d+)\)">(.*?)</g>', s, re.S)
    dy = float(g.group(1)); polys = []
    for d in re.findall(r'd="([^"]+)"', g.group(2)):
        pts = [(float(a), float(b) + dy) for a, b in re.findall(r'(-?\d+\.?\d*),(-?\d+\.?\d*)', d)]
        polys.append(np.array(pts))
    return polys  # logo units; badge circle centre (588.5, 592), ring r 577.5

def fit_polys(polys, width_in, x0, y0):
    a = np.vstack(polys); mn = a.min(0); mx = a.max(0); k = width_in * U / (mx[0] - mn[0])
    return [(p - mn) * k + (x0, y0) for p in polys], (mx - mn) * k

def poly_d(polys):
    return ' '.join('M' + ' L'.join(f'{fnum(x)},{fnum(y)}' for x, y in p) + ' Z' for p in polys)

def outside_outline(polys, stroke_in, ppi=300):
    """A ring just outside each shape (shapes stay hollow), hairline gaps closed."""
    r = ppi / U; a = np.vstack(polys); pad = stroke_in * U * 2
    mn = a.min(0) - pad; mx = a.max(0) + pad
    W, H = int((mx[0] - mn[0]) * r) + 1, int((mx[1] - mn[1]) * r) + 1
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.round((p - mn) * r * 16).astype(np.int32) for p in polys], 1, lineType=cv2.LINE_AA, shift=4)
    inside = m > 0
    sd = np.where(inside, -ndimage.distance_transform_edt(inside), ndimage.distance_transform_edt(~inside))
    ring = (np.minimum(sd, stroke_in * ppi - sd) > 0).astype(np.uint8)
    k = int(0.07 * ppi) | 1
    ring = cv2.morphologyEx(ring, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    field = ndimage.gaussian_filter(ring.astype(float), 1.2)
    out = []
    for c in measure.find_contours(np.pad(field, 1, constant_values=0), 0.5):
        c = measure.approximate_polygon(c, 0.35)
        if len(c) >= 4: out.append(np.stack([c[:, 1] - 1, c[:, 0] - 1], 1) / r + mn)
    return out

def circle(cx, cy, rad, n=360):
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    return np.stack([cx + rad * np.cos(t), cy + rad * np.sin(t)], 1)


# ---------- routes (same rules as the page's route maker)
def project(latlon):
    a = np.array(latlon, float); lat0, lon0 = a[:, 0].mean(), a[:, 1].mean()
    return np.stack([(a[:, 1] - lon0) * 111320 * math.cos(math.radians(lat0)), -(a[:, 0] - lat0) * 110540], 1)

def route_outline(xy_units, line_in, ppi=300):
    """Thick round-capped line along the track, as cut contours (units)."""
    r = ppi / U; pad = line_in * U * 2
    mn = xy_units.min(0) - pad; mx = xy_units.max(0) + pad
    W, H = int((mx[0] - mn[0]) * r) + 1, int((mx[1] - mn[1]) * r) + 1
    m = np.zeros((H, W), np.uint8)
    pts = np.round((xy_units - mn) * r * 16).astype(np.int32)
    t = max(1, int(round(line_in * ppi)))
    cv2.polylines(m, [pts], False, 255, t, lineType=cv2.LINE_AA, shift=4)
    for q in pts[::1]: cv2.circle(m, tuple(int(v) for v in q), t // 2, 255, -1, lineType=cv2.LINE_AA, shift=4)
    k = int(0.07 * ppi) | 1  # close hairline gaps where the route passes close to itself
    m = cv2.morphologyEx((m > 127).astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    field = ndimage.gaussian_filter(m.astype(float), 1.0)
    out = []
    for c in measure.find_contours(np.pad(field, 1, constant_values=0), 0.5):
        c = measure.approximate_polygon(c, 0.35)
        if len(c) >= 4: out.append(np.stack([c[:, 1] - 1, c[:, 0] - 1], 1) / r + mn)
    return out

def route_stencil(file, title, group, desc, latlon, name, detail=None, size_in=ROUTE['size'], line_in=ROUTE['line']):
    xy = project(latlon); ext = xy.max(0) - xy.min(0); k = size_in * U / ext.max()
    xy = (xy - xy.min(0)) * k + (M + line_in / 2) * U
    rings = route_outline(xy, line_in)
    rx0 = min(p[:, 0].min() for p in rings); rx1 = max(p[:, 0].max() for p in rings)
    ry1 = max(p[:, 1].max() for p in rings); rw = (rx1 - rx0) / U
    f = font('Black'); upm = f['head'].unitsPerEm; cap = f['OS/2'].sCapHeight / upm
    em = ROUTE['cap'] * rw / cap
    _, bb, _ = text_block([name], 'Black', 0.05, em_in=em)
    if (bb[2] - bb[0]) / U > rw: em *= rw * U / (bb[2] - bb[0])
    cx = (rx0 + rx1) / 2
    d1, bb1, _ = text_block([name], 'Black', 0.05, em_in=em)
    d1, bb1, _ = text_block([name], 'Black', 0.05, em_in=em, x0=cx - (bb1[2] - bb1[0]) / 2, y0=ry1 + ROUTE['gap'] * U)
    ds = [d1]; bottom = bb1[3]; right = bb1[2]; thin = STEM['Black'] * em
    if detail:
        e2 = em * ROUTE['detail']
        d2, bb2, _ = text_block([detail], 'Black', 0.08, em_in=e2)
        d2, bb2, _ = text_block([detail], 'Black', 0.08, em_in=e2, x0=cx - (bb2[2] - bb2[0]) / 2, y0=bottom + 0.25 * cap * em * U)
        ds.append(d2); bottom = bb2[3]; right = max(right, bb2[2]); thin = STEM['Black'] * e2
    d = poly_d(rings) + ' ' + ' '.join(ds)
    add(file, title, group, desc, d, (M * U, M * U, max(rx1, right), bottom), evenodd=True, thin=round(min(line_in, thin), 2))

# ---------- files
def svg_doc(w_in, h_in, d, title, evenodd=False):
    rule = ' fill-rule="evenodd"' if evenodd else ''
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{w_in:.3f}in" height="{h_in:.3f}in" '
            f'viewBox="0 0 {fnum(w_in * U)} {fnum(h_in * U)}">\n<title>{title}</title>\n'
            f'<path fill="#000"{rule} d="{d}"/>\n</svg>\n')

FILES = []
def add(file, title, group, desc, d, bbox, evenodd=False, thin=None):
    """bbox is the design's ink box in units, drawn with a top-left of (M, M)."""
    w_in = bbox[2] / U + M; h_in = bbox[3] / U + M
    svg = svg_doc(w_in, h_in, d, title, evenodd)
    open(os.path.join(OUT, file), 'w').write(svg)
    FILES.append({'file': file, 'title': title, 'group': group, 'desc': desc,
                  'size': [round(w_in - 2 * M, 2), round(h_in - 2 * M, 2)], 'thin': thin, 'svg': svg})

def wordmark(file, title, group, desc, lines, w, width_in, track, align='center', gap_em=0.22):
    d, bb, em = text_block(lines, w, track, width_in=width_in, align=align, gap_em=gap_em, x0=M * U, y0=M * U)
    add(file, title, group, desc, d, bb, thin=round(STEM[w] * em, 2))

def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.svg'): os.remove(os.path.join(OUT, f))

    # Front
    wordmark('inmotion-center-chest-9in.svg', '.inmotion — center chest', 'front',
             'Bold, 9" wide. The easiest one to bleach cleanly.', ['.inmotion'], 'Bold', 9.0, 0.04)
    # .inmotion over the waves (center chest lockup)
    lw = 9.0
    d_w, bb_w, em_w = text_block(['.inmotion'], 'Bold', 0.04, width_in=lw, x0=M * U, y0=M * U)
    wv, wsize = fit_polys(logo_waves(), lw * 0.9, M * U + lw * 0.05 * U, bb_w[3] + 0.35 * U)
    add('inmotion-waves-lockup-9in.svg', '.inmotion + waves lockup', 'front',
        '.inmotion over the two waves, 9" wide. Center chest, like the splatter shirt.',
        d_w + ' ' + poly_d(wv), (M * U, M * U, M * U + lw * U, bb_w[3] + 0.35 * U + wsize[1]), thin=round(STEM['Bold'] * em_w, 2))

    wordmark('inmotion-left-chest-4in.svg', '.inmotion — left chest', 'front',
             'Black weight, 4" wide, so the lines stay thick at the small size.', ['.inmotion'], 'Black', 4.0, 0.05)
    wordmark('tim-mark-3in.svg', 'T.im short mark', 'small',
             '3" wide. Pocket, sleeve or the back of the neck.', ['T.im'], 'Black', 3.0, 0.02)

    # Back: outline waves + STAY IN MOTION
    stroke = 0.2
    polys, _ = fit_polys(logo_waves(), 10.6, (M + stroke) * U, (M + stroke) * U)  # 11" with the outline: fits an 11.5" cut width
    ring = outside_outline(polys, stroke)
    rx0 = min(p[:, 0].min() for p in ring); rx1 = max(p[:, 0].max() for p in ring)
    ry1 = max(p[:, 1].max() for p in ring)
    tw = 9.2
    d_txt, bb_txt, _ = text_block(['STAY IN MOTION'], 'Black', 0.06, width_in=tw,
                                  x0=(rx0 + rx1) / 2 - tw * U / 2, y0=ry1 + 0.7 * U)
    add('back-waves-stay-in-motion-11in.svg', 'Outline waves + STAY IN MOTION', 'back',
        '11" wide. Waves traced from your logo with a 0.2" outline.',
        poly_d(ring) + ' ' + d_txt, (M * U, M * U, max(rx1, bb_txt[2]), bb_txt[3]), evenodd=True, thin=stroke)

    # Back: mottos
    wordmark('motto-object-in-motion-11in.svg', 'An object in motion…', 'back',
             '"AN OBJECT IN MOTION / STAYS IN MOTION." 11" wide.',
             ['AN OBJECT IN MOTION', 'STAYS IN MOTION.'], 'Black', 11.0, 0.05, gap_em=0.24)
    wordmark('motto-move-slowly-11in.svg', 'Better to move slowly…', 'back',
             '"IT’S BETTER TO MOVE SLOWLY / THAN NOT AT ALL." 11" wide.',
             ['IT’S BETTER TO MOVE SLOWLY', 'THAN NOT AT ALL.'], 'Black', 11.0, 0.05, gap_em=0.24)

    # Distance ladder
    wordmark('distance-ladder-stacked-3.5in.svg', 'Distance ladder — stacked', 'back',
             '13.1 to 100, stacked. 3.5" wide, about 10" tall, down the center of the back.',
             ['13.1', '26.2', '31.1', '62.1', '100'], 'Black', 3.5, 0.03, gap_em=0.3)
    wordmark('distance-ladder-sleeve-10in.svg', 'Distance ladder — sleeve', 'small',
             'One line, 10" long, for down a long sleeve or across the back yoke.',
             ['13.1 / 26.2 / 31.1 / 62.1 / 100'], 'Black', 10.0, 0.03)

    # Badge: ring + waves, one color
    for dia, group, file in ((4.0, 'front', 'badge-4in.svg'), (10.0, 'back', 'badge-10in.svg')):
        t = max(0.18, dia * 0.035)
        k = (dia / 2) * U / 592.5           # logo outer ring edge → badge radius
        cx = cy = M * U + dia / 2 * U
        waves = [(p - (588.5, 592)) * k + (cx, cy) for p in logo_waves()]
        rings = [circle(cx, cy, dia / 2 * U), circle(cx, cy, (dia / 2 - t) * U)[::-1]]
        add(file, f'Round badge — {dia:g}"', group,
            f'Ring and the two waves, one color (bleach can’t do the navy, gold and teal). Ring {t:.2f}" thick.',
            poly_d(rings) + ' ' + poly_d(waves), (M * U, M * U, M * U + dia * U, M * U + dia * U), evenodd=True, thin=round(t, 2))


    # Routes
    pim = json.load(open(os.path.join(TOOL, 'routes', 'pain-in-moraine-loop.json')))
    route_stencil('route-pain-in-moraine-10in.svg', 'Route — Pain in Moraine', 'route',
                  'One 9.9 km loop at Moraine State Park, with the race name and 100K · SEP 2026. 10" on the long side.',
                  pim, 'PAIN IN MORAINE', '100K · SEP 2026')

    # Small solid waves
    polys, size = fit_polys(logo_waves(), 2.75, M * U, M * U)
    add('waves-small-2.75in.svg', 'Waves mark', 'small', '2.75" wide, solid. Sleeve, pocket or hat.',
        poly_d(polys), (M * U, M * U, M * U + size[0], M * U + size[1]))

    # Glyph data for the name maker
    glyphs = {}
    for w in ('Bold', 'Black'):
        f = font(w); cmap = f.getBestCmap(); gs = f.getGlyphSet(); hm = f['hmtx']
        table = {}
        for ch in sorted(set(NAME_CHARS + (CAPS_CHARS if w == 'Black' else ''))):
            g = cmap[ord(ch)]
            pen = SVGPathPen(gs, ntos=fnum); bp = BoundsPen(gs)
            gs[g].draw(TransformPen(pen, (1, 0, 0, -1, 0, 0))); gs[g].draw(TransformPen(bp, (1, 0, 0, -1, 0, 0)))
            table[ch] = {'d': pen.getCommands(), 'adv': hm[g][0], 'bb': [round(v) for v in bp.bounds] if bp.bounds else None}
        glyphs[w] = {'upm': f['head'].unitsPerEm, 'stem': STEM[w], 'cap': f['OS/2'].sCapHeight, 'glyphs': table}

    tpl = open(os.path.join(TOOL, 'template.html')).read()
    page = (tpl.replace('/*__GLYPHS__*/null', json.dumps(glyphs, separators=(',', ':')))
               .replace('/*__FILES__*/[]', json.dumps(FILES, ensure_ascii=False, separators=(',', ':')))
               .replace('/*__ROUTE__*/null', json.dumps({**ROUTE, 'preset': {'name': 'PAIN IN MORAINE', 'detail': '100K · SEP 2026', 'points': pim}}, ensure_ascii=False, separators=(',', ':'))))
    open(os.path.join(TOOL, 'index.html'), 'w').write(page)
    for f in FILES: print(f"{f['file']:42s} {f['size'][0]:5.2f} x {f['size'][1]:5.2f} in  thin {f['thin']}")

if __name__ == '__main__':
    main()
