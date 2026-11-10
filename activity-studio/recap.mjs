// Run recap card: the Video Framer look (navy grid, gold window brackets, condensed
// stat stack) built from an imported activity. render.mjs draws the route inside the
// window with its shared route code; everything else on the card is drawn here.
import { finite, units, duration } from './model.mjs';

// Typed stat values and the background photo belong to one run on this device.
// They live here, outside the saved settings, so presets never store them.
export const recapInputs = { overrides: {}, photo: null };

export const RECAP_STATS = ['distance', 'pace', 'ascent', 'moving', 'heartRate', 'temp'];
export const RECAP_LABELS = {
  distance: 'DISTANCE',
  pace: 'PACE',
  ascent: 'ELEVATION',
  moving: 'TIME',
  heartRate: 'AVG HR',
  temp: 'TEMP',
};
const TAU = Math.PI * 2;

// Where the background photo sits. Fill covers the card (cropping the overflow);
// Whole photo fits it inside. Zoom 1–3. Move X/Y (−100…100) slides the photo the
// way you drag it: +X moves it right, +Y moves it down.
export function photoGeometry(im, W, H, settings) {
  const iw = im.naturalWidth || im.width,
    ih = im.naturalHeight || im.height,
    fitWhole = settings.recapPhotoFit === 'whole',
    base = fitWhole ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih),
    z = Math.max(1, Math.min(3, Number(settings.recapPhotoZoom) || 1)),
    dw = iw * base * z,
    dh = ih * base * z,
    // Fill always covers the card, so it only travels as far as it overflows
    // (zoom in for more room). Whole photo can travel a little past its fit,
    // since the blurred copy fills any gap.
    rangeX = fitWhole ? Math.max(Math.abs(dw - W) / 2, W * 0.15) : Math.max(0, dw - W) / 2,
    rangeY = fitWhole ? Math.max(Math.abs(dh - H) / 2, H * 0.15) : Math.max(0, dh - H) / 2,
    mx = Math.max(-100, Math.min(100, Number(settings.recapPhotoX) || 0)),
    my = Math.max(-100, Math.min(100, Number(settings.recapPhotoY) || 0));
  return {
    x: (W - dw) / 2 + (mx / 100) * rangeX,
    y: (H - dh) / 2 + (my / 100) * rangeY,
    w: dw,
    h: dh,
    rangeX,
    rangeY,
    whole: fitWhole,
  };
}
// A soft, blurred copy that fills the card behind a whole photo. Drawn small and
// scaled up, so it works in every browser (Safari's canvas filter support varies).
const blurCache = new WeakMap();
function blurredCover(im) {
  let c = blurCache.get(im);
  if (c) return c;
  const iw = im.naturalWidth || im.width,
    ih = im.naturalHeight || im.height,
    s = 48 / Math.max(iw, ih);
  c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(iw * s));
  c.height = Math.max(1, Math.round(ih * s));
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  blurCache.set(im, c);
  return c;
}
const COUNTS = ['distance', 'ascent', 'moving'];

export function rgba(hex, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const rand = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const trimNum = (v, d) => String(Number(v.toFixed(d)));
// "05:52" → "5:52", like a watch shows it
const clock = (s) => duration(s).replace(/^0(?=\d:)/, '');

// Per-mile (or per-km) splits from cumulative distance and moving time. A last
// partial split is kept when it covers at least 15% of a unit.
const splitCache = new WeakMap();
export function computeSplits(activity, imperial) {
  if (!activity) return [];
  const key = imperial ? 'mi' : 'km';
  let cached = splitCache.get(activity);
  if (cached?.[key]) return cached[key];
  const unit = units(imperial).distance;
  const useMoving = activity.points.some((p) => p.movingS > 0);
  const tOf = (p) => (useMoving ? p.movingS : p.elapsedS);
  const pts = activity.points.filter((p) => finite(p.distanceM) && finite(tOf(p)));
  const out = [];
  if (pts.length > 1) {
    let next = unit,
      prevD = 0,
      prevT = tOf(pts[0]),
      n = 1;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i];
      while (b.distanceM >= next) {
        const span = b.distanceM - a.distanceM,
          f = span > 0 ? Math.max(0, Math.min(1, (next - a.distanceM) / span)) : 1,
          t = tOf(a) + f * (tOf(b) - tOf(a));
        out.push({ n, distance: unit, seconds: t - prevT, pace: t - prevT, end: next });
        prevD = next;
        prevT = t;
        next += unit;
        n++;
      }
    }
    const last = pts.at(-1),
      rest = last.distanceM - prevD,
      secs = tOf(last) - prevT;
    if (rest >= unit * 0.15 && secs > 0)
      out.push({ n, distance: rest, seconds: secs, pace: secs / (rest / unit), end: last.distanceM, partial: true });
  }
  const result = out.filter((s) => s.seconds > 0);
  splitCache.set(activity, { ...(cached || {}), [key]: result });
  return result;
}

// The value each stat shows with nothing typed, already formatted for the card.
export function recapDefaults(activity, settings) {
  const u = units(settings.imperial),
    s = activity?.summary || {},
    dl = u.distanceLabel.toUpperCase(),
    el = u.elevationLabel.toUpperCase();
  const time = finite(s.moving) ? s.moving : s.elapsed;
  return {
    distance: finite(s.distance) ? `${trimNum(s.distance / u.distance, 2)} ${dl}` : '',
    pace: finite(s.pace) ? `${clock((s.pace * u.distance) / 1000)} /${dl}` : '',
    ascent: finite(s.ascent) ? `${Math.round(s.ascent / u.elevation).toLocaleString('en-US')} ${el}` : '',
    moving: finite(time) ? clock(time) : '',
    heartRate: finite(s.heartRate) ? `${Math.round(s.heartRate)} BPM` : '',
    temp: '',
  };
}

// Typed values: bare numbers get the unit the card would use.
export function typedValue(key, raw, imperial) {
  const v = String(raw || '').trim().toUpperCase();
  if (!v) return '';
  const u = units(imperial),
    bare = /^[\d,]+(\.\d+)?$/.test(v),
    clock = /^\d+:\d{2}(:\d{2})?$/.test(v);
  if (key === 'distance' && bare) return `${v} ${u.distanceLabel.toUpperCase()}`;
  if (key === 'ascent' && bare) return `${v} ${u.elevationLabel.toUpperCase()}`;
  if (key === 'heartRate' && bare) return `${v} BPM`;
  if (key === 'temp' && /^-?\d+(\.\d+)?$/.test(v)) return `${v}°${imperial ? 'F' : 'C'}`;
  if (key === 'pace' && clock) return `${v} /${u.distanceLabel.toUpperCase()}`;
  return v;
}

// Counts a value up during the race-time reveal: "13.1 MI" at f=0.5 is "6.6 MI".
export function scaleText(str, f) {
  f = Math.max(0, Math.min(1, f));
  return String(str).replace(/\d+(?::\d{2}){1,2}|\d[\d,]*(?:\.\d+)?/, (m) => {
    if (m.includes(':')) {
      const parts = m.split(':').map(Number),
        total = Math.round(parts.reduce((a, b) => a * 60 + b, 0) * f),
        pad = (n) => String(n).padStart(2, '0');
      return parts.length === 3
        ? `${Math.floor(total / 3600)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`
        : `${Math.floor(total / 60)}:${pad(total % 60)}`;
    }
    const dec = (m.split('.')[1] || '').length,
      v = parseFloat(m.replace(/,/g, '')) * f;
    return m.includes(',')
      ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
      : v.toFixed(dec);
  });
}

export function recapStats(activity, settings) {
  const defaults = recapDefaults(activity, settings),
    o = recapInputs.overrides || {},
    on = settings.recapStats || RECAP_STATS;
  return RECAP_STATS.filter((k) => on.includes(k))
    .map((k) => {
      const typed = typedValue(k, o[k], settings.imperial);
      return { key: k, label: RECAP_LABELS[k], value: typed || defaults[k], typed: !!typed };
    })
    .filter((s) => s.value);
}

// Regions for every card size. Portrait sizes stack; square and 16:9 put the route
// on the right. 9:16 keeps the top 250 px and bottom 400 px clear for TikTok's UI.
export function recapLayout(W, H, { stats = 0, elevation = false, splits = false, route = true } = {}) {
  const k = Math.min(W, H) / 1080,
    portrait = H >= W * 1.15,
    twoCol = !portrait && route,
    top = H / W > 1.6 ? 250 * k : 80 * k,
    bottom = H / W > 1.6 ? 400 * k : 80 * k,
    pad = (W > H * 1.5 ? 100 : 70) * k,
    gap = 34 * k,
    charts = (elevation ? 1 : 0) + (splits ? 1 : 0);
  const col = twoCol
    ? { x: pad, w: W * (W > H * 1.5 ? 0.5 : 0.5) - pad - 24 * k }
    : { x: pad, w: W - pad * 2 };
  const cols = twoCol ? (col.w > 700 * k ? 3 : 2) : 3,
    rows = Math.ceil(stats / cols),
    sideBySide = charts === 2 && col.w >= 700 * k;
  let headerH = 214 * k,
    statsH = rows * 132 * k,
    chartH = charts ? (sideBySide || charts === 1 ? 220 : 340) * k : 0,
    handleH = 40 * k;
  const blocks = [headerH, statsH, chartH, handleH].filter((h) => h > 0).length;
  const avail = H - top - bottom;
  const fixed = headerH + statsH + chartH + handleH + (blocks - 1) * gap;
  let routeH = 0,
    fs = 1;
  if (!twoCol && route) {
    routeH = avail - fixed - gap;
    if (routeH < 220 * k) routeH = 0;
  }
  const used = fixed + (routeH ? routeH + gap : 0);
  if (used > avail) fs = avail / used; // shrink everything to fit
  headerH *= fs;
  statsH *= fs;
  chartH *= fs;
  handleH *= fs;
  routeH *= fs;
  const g = gap * fs,
    total = used * fs;
  let y = top + Math.max(0, (avail - total) / 2);
  const out = { k, fs, portrait, twoCol, cols, align: twoCol ? 'left' : 'center' };
  out.header = { x: col.x, y, w: col.w, h: headerH };
  y += headerH + g;
  if (routeH) {
    out.route = { x: col.x, y, w: col.w, h: routeH };
    y += routeH + g;
  }
  out.stats = { x: col.x, y, w: col.w, h: statsH, rows };
  y += statsH + (statsH ? g : 0);
  if (chartH) {
    out.charts = [];
    if (charts === 2 && sideBySide) {
      const w2 = (col.w - g) / 2;
      out.charts.push({ x: col.x, y, w: w2, h: chartH }, { x: col.x + w2 + g, y, w: w2, h: chartH });
    } else if (charts === 2) {
      const h2 = (chartH - g / 2) / 2;
      out.charts.push({ x: col.x, y, w: col.w, h: h2 }, { x: col.x, y: y + h2 + g / 2, w: col.w, h: h2 });
    } else out.charts.push({ x: col.x, y, w: col.w, h: chartH });
    y += chartH + g;
  }
  out.handle = { x: col.x, y, w: col.w, h: handleH };
  if (twoCol) {
    const x = W * 0.5 + 24 * k;
    out.route = { x, y: top, w: W - pad - x, h: H - top - bottom };
  }
  return out;
}

export function makeRecap(ctx, W, H, settings, family) {
  const k = Math.min(W, H) / 1080;
  const C = {
    bg: settings.background,
    paper: settings.text,
    gold: settings.accent,
    teal: settings.route,
  };
  const font = (weight, px, track = 0) => {
    ctx.font = `${weight} ${px}px ${family}`;
    try {
      ctx.letterSpacing = `${track}px`;
    } catch {
      /* older Safari: no tracking */
    }
  };
  const fit = (text, weight, px, track, maxW, min = 12) => {
    font(weight, px, track);
    const w = ctx.measureText(text).width;
    return w > maxW ? Math.max(min, (px * maxW) / w) : px;
  };
  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  };
  const ax = (box, align) => (align === 'left' ? box.x : align === 'right' ? box.x + box.w : box.x + box.w / 2);

  function background(clock) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    const im = settings.recapBg === 'photo' ? recapInputs.photo : null;
    if (im) {
      const g = photoGeometry(im, W, H, settings);
      if (g.whole) {
        const b = blurredCover(im),
          cover = Math.max(W / b.width, H / b.height) * 1.1;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.globalAlpha = 0.75;
        ctx.drawImage(b, (W - b.width * cover) / 2, (H - b.height * cover) / 2, b.width * cover, b.height * cover);
        ctx.restore();
      }
      ctx.drawImage(im, g.x, g.y, g.w, g.h);
      ctx.fillStyle = rgba(C.bg, (Number(settings.recapDim) || 0) / 100);
      ctx.fillRect(0, 0, W, H);
    } else {
      const step = 64 * k;
      ctx.strokeStyle = rgba(C.teal, 0.16);
      ctx.lineWidth = 1.5 * k;
      ctx.beginPath();
      for (let x = (W / 2) % step; x < W; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      }
      for (let y = (H / 2) % step; y < H; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.65);
      vg.addColorStop(0, rgba(C.bg, 0));
      vg.addColorStop(1, rgba(C.bg, 0.85));
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    if (settings.recapSpecks !== false) {
      const p = (clock || 0) / 8;
      for (let i = 0; i < 42; i++) {
        const x0 = rand(i + 1) * W,
          y0 = rand(i + 101) * H,
          ph = rand(i + 201),
          rad = (18 + rand(i + 301) * 46) * k,
          tw = 0.5 + 0.5 * Math.sin(TAU * (2 * p + ph)),
          sz = (1.5 + rand(i + 401) * 2.8) * k;
        ctx.fillStyle = rgba(i % 3 ? C.teal : C.gold, 0.15 + 0.5 * tw);
        ctx.beginPath();
        ctx.arc(x0 + Math.cos(TAU * (p + ph)) * rad, y0 + Math.sin(TAU * (p + ph)) * rad * 0.7, sz, 0, TAU);
        ctx.fill();
      }
    }
  }

  function header(box, title, sub, align, fs) {
    const tag = (settings.recapTag || '').trim().toUpperCase();
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    const x = ax(box, align);
    let y = box.y;
    if (tag) {
      const px = fit(tag, 700, 28 * k * fs, 6 * k * fs, box.w);
      font(700, px, 6 * k * fs);
      ctx.fillStyle = C.gold;
      ctx.fillText(tag, x, y + px * 0.9);
      y += 42 * k * fs;
    } else y += 12 * k * fs;
    const t = (title || '').toUpperCase();
    let px = fit(t, 900, 112 * k * fs, 0, box.w, 1);
    const lines = [t];
    if (px < 72 * k * fs && t.includes(' ')) {
      // too long for one line: break near the middle and set two lines
      const words = t.split(' ');
      let best = 1,
        diff = Infinity;
      for (let i = 1; i < words.length; i++) {
        const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
        if (d < diff) [best, diff] = [i, d];
      }
      lines.splice(0, 1, words.slice(0, best).join(' '), words.slice(best).join(' '));
      px = Math.min(...lines.map((l) => fit(l, 900, 70 * k * fs, 0, box.w, 1)));
    }
    font(900, px, 0);
    ctx.fillStyle = C.paper;
    lines.forEach((l, i) => ctx.fillText(l, x, y + px * 0.8 + i * px * 0.92));
    y += px * 0.8 + (lines.length - 1) * px * 0.92;
    if (sub) {
      const s = sub.toUpperCase(),
        sp = fit(s, 600, 28 * k * fs, 4 * k * fs, box.w);
      font(600, sp, 4 * k * fs);
      ctx.fillStyle = rgba(C.paper, 0.72);
      ctx.fillText(s, x, Math.min(box.y + box.h, y + 46 * k * fs));
    }
    font(700, 10, 0);
    ctx.textAlign = 'left';
  }

  // The gold window with bracket ticks, like the clip window in the Video Framer.
  function windowFrame(box) {
    const r = 22 * k;
    rr(box.x, box.y, box.w, box.h, r);
    ctx.fillStyle = rgba(C.bg, settings.transparent ? 0.55 : 0.62);
    ctx.fill();
    ctx.lineWidth = 2.5 * k;
    ctx.strokeStyle = rgba(C.gold, 0.85);
    ctx.stroke();
    const o = 14 * k,
      len = 46 * k;
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 4 * k;
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [
      [box.x - o, box.y - o, 1, 1],
      [box.x + box.w + o, box.y - o, -1, 1],
      [box.x - o, box.y + box.h + o, 1, -1],
      [box.x + box.w + o, box.y + box.h + o, -1, -1],
    ]) {
      ctx.moveTo(cx + sx * len, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * len);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
    // REC-style chip
    const cp = 22 * k;
    font(700, cp, 4 * k);
    ctx.fillStyle = '#e5484d';
    ctx.beginPath();
    ctx.arc(box.x + 32 * k, box.y + 36 * k, 7 * k, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.paper;
    ctx.textAlign = 'left';
    ctx.fillText('ROUTE', box.x + 48 * k, box.y + 36 * k + cp * 0.36);
  }

  function statGrid(box, list, cols, align, fs, reveal) {
    if (!list.length || !box.h) return;
    const rows = Math.ceil(list.length / cols),
      rowH = box.h / rows,
      lp = 22 * k * fs;
    const cells = list.map((s, i) => {
      const c = i % cols,
        r = Math.floor(i / cols),
        perRow = align === 'center' ? Math.min(cols, list.length - r * cols) : Math.min(cols, list.length),
        w = box.w / perRow,
        x = box.x + c * w,
        inner =
          align === 'center'
            ? { x: x + 10 * k, w: w - 20 * k }
            : { x: x + (c ? 24 * k : 0), w: w - (c ? 48 * k : 24 * k) };
      return { s, c, x, y: box.y + r * rowH, inner };
    });
    // one value size for the whole grid, so every number reads at the same weight
    const vp = Math.min(
      76 * k * fs,
      Math.min(...cells.map((cell) => fit(cell.s.value, 900, 76 * k * fs, 0, cell.inner.w, 1))),
      (rowH - lp * 1.6) / 1.05,
    );
    cells.forEach(({ s, c, x, y, inner }) => {
      if (c) {
        ctx.fillStyle = rgba(C.teal, 0.35);
        ctx.fillRect(x - 1 * k, y + 8 * k * fs, 2 * k, vp + lp * 1.3);
      }
      const value = reveal ? reveal(s) : s.value,
        tx = ax(inner, align);
      ctx.textAlign = align;
      font(900, Math.min(vp, fit(value, 900, vp, 0, inner.w, 1)), 0);
      ctx.fillStyle = C.paper;
      ctx.fillText(value, tx, y + vp * 0.86);
      font(700, lp, 5 * k * fs);
      ctx.fillStyle = C.teal;
      ctx.fillText(s.label, tx, y + vp + lp * 1.05);
    });
    ctx.textAlign = 'left';
  }

  function chartLabel(box, left, right, fs) {
    const lp = 20 * k * fs;
    font(700, lp, 5 * k * fs);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.teal;
    ctx.fillText(left, box.x, box.y + lp);
    if (right) {
      ctx.textAlign = 'right';
      ctx.fillStyle = rgba(C.paper, 0.72);
      ctx.fillText(right, box.x + box.w, box.y + lp);
      ctx.textAlign = 'left';
    }
    return lp + 16 * k * fs;
  }

  function elevation(box, activity, point, fs) {
    const pts = activity.points.filter((p) => finite(p.elevation) && finite(p.distanceM));
    if (pts.length < 2) return;
    const u = units(settings.imperial);
    let low = Infinity,
      high = -Infinity;
    pts.forEach((p) => {
      low = Math.min(low, p.elevation);
      high = Math.max(high, p.elevation);
    });
    const head = chartLabel(
      box,
      'ELEVATION',
      `${Math.round(low / u.elevation).toLocaleString('en-US')}–${Math.round(high / u.elevation).toLocaleString('en-US')} ${u.elevationLabel.toUpperCase()}`,
      fs,
    );
    const area = { x: box.x, y: box.y + head, w: box.w, h: box.h - head },
      end = pts.at(-1).distanceM || 1,
      step = Math.max(1, Math.ceil(pts.length / 600)),
      sample = pts.filter((p, i) => i % step === 0 || i === pts.length - 1),
      range = Math.max(1, high - low),
      xy = (p) => [area.x + (p.distanceM / end) * area.w, area.y + area.h - ((p.elevation - low) / range) * area.h * 0.92];
    ctx.save();
    if (point && finite(point.distanceM)) {
      ctx.beginPath();
      ctx.rect(area.x - 4 * k, area.y - 20 * k, (point.distanceM / end) * area.w + 4 * k, area.h + 24 * k);
      ctx.clip();
    }
    ctx.beginPath();
    sample.forEach((p, i) => {
      const [x, y] = xy(p);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    const line = new Path2D();
    sample.forEach((p, i) => {
      const [x, y] = xy(p);
      if (i) line.lineTo(x, y);
      else line.moveTo(x, y);
    });
    ctx.lineTo(area.x + area.w, area.y + area.h);
    ctx.lineTo(area.x, area.y + area.h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, area.y, 0, area.y + area.h);
    g.addColorStop(0, rgba(C.teal, 0.5));
    g.addColorStop(1, rgba(C.teal, 0.04));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = C.teal;
    ctx.lineWidth = 3 * k;
    ctx.lineJoin = 'round';
    ctx.stroke(line);
    ctx.restore();
    ctx.fillStyle = rgba(C.teal, 0.35);
    ctx.fillRect(area.x, area.y + area.h, area.w, 2 * k);
    if (point && finite(point.distanceM) && finite(point.elevation)) {
      const [x, y] = xy(point);
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.arc(x, y, 8 * k, 0, TAU);
      ctx.fill();
    }
  }

  function splitBars(box, list, point, fs) {
    if (!list.length) return;
    const u = units(settings.imperial),
      full = list.filter((s) => !s.partial),
      scaleSet = full.length ? full : list,
      fast = Math.min(...scaleSet.map((s) => s.pace)),
      slow = Math.max(...scaleSet.map((s) => s.pace)),
      fastest = scaleSet.find((s) => s.pace === fast);
    const head = chartLabel(box, `SPLITS · /${u.distanceLabel.toUpperCase()}`, `FASTEST ${clock(fast)}`, fs);
    const showNums = list.length <= 26,
      np = 16 * k * fs,
      area = { x: box.x, y: box.y + head + 6 * k, w: box.w, h: box.h - head - 6 * k - (showNums ? np + 10 * k : 0) },
      slot = area.w / list.length,
      bw = Math.max(2 * k, slot * (list.length > 40 ? 0.85 : 0.72)),
      minH = area.h * 0.22;
    list.forEach((s, i) => {
      let grow = 1;
      if (point && finite(point.distanceM)) {
        const start = s.end - s.distance;
        grow = Math.max(0, Math.min(1, (point.distanceM - start) / s.distance));
        if (grow <= 0) return;
      }
      const t = slow > fast ? (slow - Math.min(slow, s.pace)) / (slow - fast) : 1,
        h = (minH + (area.h - minH) * t) * grow,
        x = area.x + i * slot + (slot - bw) / 2;
      ctx.fillStyle = s === fastest ? C.gold : rgba(C.teal, s.partial ? 0.4 : 0.8);
      rr(x, area.y + area.h - h, bw, h, Math.min(6 * k, bw / 2));
      ctx.fill();
      if (showNums && (list.length <= 13 || i % 2 === 0 || s === fastest)) {
        font(700, np, 1 * k);
        ctx.textAlign = 'center';
        ctx.fillStyle = s === fastest ? C.gold : rgba(C.paper, 0.6);
        ctx.fillText(String(s.n), x + bw / 2, area.y + area.h + np + 6 * k);
      }
    });
    ctx.textAlign = 'left';
  }

  function handle(box, align, fs) {
    const txt = (settings.recapHandle || '').trim().toUpperCase();
    if (!txt || settings.recapShowHandle === false || !box.h) return;
    const tp = fit(txt, 700, 26 * k * fs, 6 * k * fs, box.w - 40 * k);
    font(700, tp, 6 * k * fs);
    const tw = ctx.measureText(txt).width,
      total = 16 * k + 14 * k + tw,
      x0 = align === 'left' ? box.x : box.x + (box.w - total) / 2,
      base = box.y + box.h / 2 + tp * 0.34;
    ctx.fillStyle = C.teal;
    ctx.beginPath();
    ctx.arc(x0 + 8 * k, base - tp * 0.32, 8 * k, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.paper;
    ctx.textAlign = 'left';
    ctx.fillText(txt, x0 + 30 * k, base);
  }

  return { background, header, windowFrame, statGrid, elevation, splitBars, handle, C, k };
}
