import { COLORS as C, dimensions, beatAt } from './model.mjs?v=7067edd4';

const FONT = 'Barlow Condensed';
const easeOut = (x) => 1 - (1 - x) ** 3;
// Matches the reference art: heavy headline, leaning right, set edge to edge.
const SKEW = -0.16;
const LAYOUT = {
  eyebrowY: 370,
  headTop: 440, // top of the first line's caps
  headMaxW: 960,
  headMaxBottom: 1010,
  headSize: 330,
  capRatio: 0.72,
  leadRatio: 0.83,
  subGap: 92, // baseline gap from the last headline line to the subline
  subSize: 58,
  waveY: 1340,
  waveSize: 96, // ribbon thickness
  waveGap: 24,
  waveAmp: 120,
};

// Headline sizing shared by the renderer and the tests. `widthAt100` returns
// a line's rendered width at font size 100, so the widest line can fill the
// frame without the others changing size.
export function textLayout(lines, widthAt100, factor = 1) {
  const n = Math.max(1, lines.length),
    widest = Math.max(1e-6, ...lines.map((l) => widthAt100(l) / 100));
  const byWidth = LAYOUT.headMaxW / widest,
    byHeight =
      (LAYOUT.headMaxBottom - LAYOUT.headTop) /
      (LAYOUT.capRatio + LAYOUT.leadRatio * (n - 1));
  const size = Math.min(LAYOUT.headSize, byWidth, byHeight) * factor,
    lead = size * LAYOUT.leadRatio,
    baselines = lines.map(
      (_, i) => LAYOUT.headTop + size * LAYOUT.capRatio + i * lead,
    ),
    subY = baselines[baselines.length - 1] + LAYOUT.subGap * factor;
  return { size, baselines, subY };
}

function text(
  c,
  str,
  x,
  y,
  size,
  color,
  weight = 700,
  track = 0,
  max = 950,
  center = false,
  style = 'normal',
) {
  c.save();
  c.fillStyle = color;
  const font = (sz) => `${style} ${weight} ${sz}px "${FONT}"`;
  c.font = font(size);
  const width = () =>
    c.measureText(str).width + Math.max(0, str.length - 1) * track;
  if (width() > max) {
    const f = max / width();
    size *= f;
    track *= f;
    c.font = font(size);
  }
  if (center) x -= width() / 2;
  for (const ch of str) {
    c.fillText(ch, x, y);
    x += c.measureText(ch).width + track;
  }
  c.restore();
}

// Lean a line of text about its own baseline.
function leaning(c, y, draw) {
  c.save();
  c.translate(0, y);
  c.transform(1, 0, SKEW, 1, 0, 0);
  draw();
  c.restore();
}

function wave(c, W, y, amp, phase, color, thickness) {
  c.beginPath();
  for (let x = -20; x <= W + 20; x += 8) {
    const v = y + Math.sin((x / W) * Math.PI * 2 + phase) * amp;
    if (x === -20) c.moveTo(x, v);
    else c.lineTo(x, v);
  }
  c.strokeStyle = color;
  c.lineWidth = thickness;
  c.stroke();
}

// Two parallel teal ribbons with gold hairlines outside each edge, matching
// the reference art. Both ribbons share one phase so they stay parallel.
function ribbons(c, W, yc, th, gap, amp, phase) {
  const edge = (i, dy, x) =>
    yc + i * (th + gap) + dy + amp * Math.sin((x / W) * Math.PI * 2 * 1.1 + phase);
  for (let i = 0; i < 2; i++) {
    c.beginPath();
    for (let x = -20; x <= W + 20; x += 10) {
      const v = edge(i, -th / 2, x);
      if (x === -20) c.moveTo(x, v);
      else c.lineTo(x, v);
    }
    for (let x = W + 20; x >= -20; x -= 10) c.lineTo(x, edge(i, th / 2, x));
    c.closePath();
    c.fillStyle = C.teal;
    c.fill();
    c.beginPath();
    for (let x = -20; x <= W + 20; x += 10) {
      const v = edge(i, 0, x);
      if (x === -20) c.moveTo(x, v);
      else c.lineTo(x, v);
    }
    c.save();
    c.strokeStyle = C.paper;
    c.globalAlpha = 0.22;
    c.lineWidth = th * 0.14;
    c.stroke();
    c.restore();
  }
  for (const [i, sign] of [
    [0, -1],
    [1, 1],
  ]) {
    c.beginPath();
    for (let x = -20; x <= W + 20; x += 10) {
      const v = edge(i, sign * (th / 2 + 18), x);
      if (x === -20) c.moveTo(x, v);
      else c.lineTo(x, v);
    }
    c.strokeStyle = C.gold;
    c.lineWidth = 4;
    c.stroke();
  }
}

// Perspective grid floor from the Cyber kit (Title Maker). Scrolls with `off`.
function grid(c, w, h, hz, off, a) {
  c.save();
  c.lineWidth = 1.5;
  const cx = w / 2,
    sp = w / 9,
    o = ((off % sp) + sp) % sp,
    gh = h - hz;
  for (let k = -14; k <= 14; k++) {
    const xb = cx + k * sp - o;
    c.strokeStyle = `rgba(46,155,173,${(0.4 * a).toFixed(3)})`;
    c.beginPath();
    c.moveTo(cx + (xb - cx) * 0.12, hz);
    c.lineTo(cx + (xb - cx) * 1.8, h);
    c.stroke();
  }
  for (let n = 0; n < 30; n++) {
    const y = hz + gh / (n * 0.7 + 1);
    if (y < hz + 2) break;
    c.strokeStyle = `rgba(46,155,173,${(a * Math.min(0.7, 0.1 + ((y - hz) / gh) * 0.6)).toFixed(3)})`;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
  c.restore();
}

export function render(c, s, { time = 0, video = false, guides = false } = {}) {
  const [W, H] = dimensions(s),
    banner = s.preset === 'banner',
    light = s.theme === 'paper';
  c.save();
  c.fillStyle = light ? C.paper : C.navy;
  c.fillRect(0, 0, W, H);
  const scale = W / 1080;
  c.scale(scale, scale);
  const w = 1080,
    h = H / scale,
    fg = light ? C.navy : C.gold,
    body = light ? C.navy : C.paper;
  const phase = video && s.motion !== 'none' ? time * s.speed : 0;
  if (s.style === 'cyber')
    grid(c, w, h, h * 0.72, phase * 40, 0.9);
  if (s.layers.stripes) {
    c.save();
    c.globalAlpha = s.stripeOpacity / 100;
    c.strokeStyle = light ? C.navy : C.teal;
    c.lineWidth = 2;
    for (let x = -h; x < w; x += 42) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + h, h);
      c.stroke();
    }
    c.restore();
  }
  if (s.layers.border && !banner) wave(c, w, 34, 22, 0, C.gold, 17);
  if (s.layers.slash) {
    c.save();
    c.translate(950, 65);
    c.transform(1, 0, -0.5, 1, 0, 0);
    c.fillStyle = C.gold;
    c.fillRect(37, 15, 24, 100);
    c.fillStyle = C.teal;
    c.fillRect(0, 0, 24, 100);
    c.restore();
  }
  if (s.layers.waves) {
    const k = s.waveSize / 100;
    const yc = (banner ? h / 2 : LAYOUT.waveY) + (s.waveY * h) / 100;
    ribbons(
      c,
      w,
      yc,
      (banner ? 40 : LAYOUT.waveSize) * k,
      (banner ? 14 : LAYOUT.waveGap) * k,
      (banner ? 26 : LAYOUT.waveAmp) * k,
      phase,
    );
  }
  if (s.layers.hud) {
    c.strokeStyle = C.gold;
    c.lineWidth = 3;
    for (const [x, y, dx, dy] of [
      [45, banner ? 220 : 1180, 1, 1],
      [1035, banner ? 220 : 1180, -1, 1],
      [45, banner ? 390 : 1570, 1, -1],
      [1035, banner ? 390 : 1570, -1, -1],
    ]) {
      c.beginPath();
      c.moveTo(x + 40 * dx, y);
      c.lineTo(x, y);
      c.lineTo(x, y + 40 * dy);
      c.stroke();
    }
  }
  const factor = s.textSize / 100;
  if (banner) {
    if (s.layers.footer)
      text(c, s.handle, 540, h / 2 + 25, 64 * factor, C.gold, 700, 6, 610, true);
  } else {
    c.save();
    c.translate(0, (s.textY * h) / 100);
    // The eyebrow never moves or fades.
    if (s.layers.eyebrow)
      text(c, s.eyebrow, 60, LAYOUT.eyebrowY, 37 * factor, body, 700, 5, 950);
    const beat = video ? beatAt(s, time) : null,
      holdingSubline = video && time >= s.duration * 0.8;
    // The headline builds up: each line takes its place when it arrives and
    // stays. Only the newest line reveals or glitches.
    const lines = s.headline.toUpperCase().split('\n').filter(Boolean).slice(0, 6);
    if (lines.length) {
      const measure = (l) => {
        c.save();
        c.font = `900 100px "${FONT}"`;
        const m = c.measureText(l).width;
        c.restore();
        return m;
      };
      const { size, baselines, subY } = textLayout(lines, measure, factor),
        newest = video ? beat.index : lines.length - 1;
      if (s.layers.headline)
        lines.forEach((line, i) => {
          if (i > newest) return;
          let alpha = 1,
            dy = 0,
            glitch = false;
          if (video && i === newest) {
            const k = easeOut(Math.min(1, beat.elapsed / 0.3));
            if (s.motion === 'reveal') {
              alpha = k;
              dy = (1 - k) * 40;
            }
            glitch = s.motion === 'glitch' && beat.elapsed < 0.18 / s.speed;
          }
          c.save();
          c.globalAlpha = alpha;
          c.translate(0, dy);
          if (s.style === 'cyber') {
            c.shadowColor = fg;
            c.shadowBlur = 30;
          }
          const K = globalThis.TimKinetic,
            kinetic = video && i === newest && !!K && K.isKinetic(s.motion);
          leaning(c, baselines[i], () => {
            if (kinetic) {
              // Same size as text() picks, spaced letter by letter like text(),
              // so the line doesn't shift when the next one arrives.
              c.save();
              c.font = `900 ${size}px "${FONT}"`;
              const w = [...line].reduce((sum, ch) => sum + c.measureText(ch).width, 0),
                fit = w > 960 ? (size * 960) / w : size;
              c.font = `900 ${fit}px "${FONT}"`;
              c.fillStyle = fg;
              K.draw(c, { lines: [{ text: line, x: 58, y: 0 }], align: 'left', t: beat.elapsed, len: 0.5 / s.speed, style: s.motion, seed: 121 + i, perChar: true, maxWidth: 1000 });
              c.restore();
            } else if (glitch) {
              text(c, line, 54, 0, size, C.teal, 900, 0, 960);
              text(c, line, 66, 3, size, C.gold, 900, 0, 960);
            } else text(c, line, 58, 0, size, fg, 900, 0, 960);
          });
          c.restore();
        });
      // The subline arrives under the finished stack in the last 20% of the loop.
      if (s.layers.subline && (!video || holdingSubline)) {
        const k = video
          ? easeOut(Math.min(1, (time - s.duration * 0.8) / 0.4))
          : 1;
        c.save();
        c.globalAlpha = k;
        leaning(c, subY, () =>
          text(c, s.subline, 58, 0, LAYOUT.subSize * factor, body, 700, 0, 960, false, 'italic'),
        );
        c.restore();
      }
    }
    c.restore();
    if (s.layers.footer) {
      c.save();
      c.globalAlpha = video ? 0.65 : 1;
      c.fillStyle = C.teal;
      c.beginPath();
      c.arc(video ? 49 : 66, h - (video ? 51 : 70), 9, 0, Math.PI * 2);
      c.fill();
      text(
        c,
        s.handle,
        video ? 70 : 92,
        h - (video ? 40 : 59),
        32,
        body,
        700,
        4,
        900,
      );
      c.restore();
    }
  }
  if (guides) {
    c.save();
    c.strokeStyle = C.teal;
    c.lineWidth = 2;
    c.setLineDash([10, 8]);
    if (banner)
      c.strokeRect(
        (1080 - 1546 / scale) / 2,
        (h - 423 / scale) / 2,
        1546 / scale,
        423 / scale,
      );
    else c.strokeRect(40, 250, 1000, 1270);
    c.restore();
  }
  c.restore();
}
