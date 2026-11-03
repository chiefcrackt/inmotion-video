import { COLORS as C, dimensions, beatAt } from './model.mjs';
const easeOut = (x) => 1 - (1 - x) ** 3;
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
) {
  c.save();
  c.fillStyle = color;
  c.font = `${weight} ${size}px "Barlow Condensed"`;
  const width = () =>
    c.measureText(str).width + Math.max(0, str.length - 1) * track;
  if (width() > max) {
    const f = max / width();
    size *= f;
    track *= f;
    c.font = `${weight} ${size}px "Barlow Condensed"`;
  }
  if (center) x -= width() / 2;
  for (const ch of str) {
    c.fillText(ch, x, y);
    x += c.measureText(ch).width + track;
  }
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
    c.save();
    const y = (banner ? h / 2 : 1375) + (s.waveY * h) / 100,
      amp = ((banner ? 40 : 82) * s.waveSize) / 100;
    for (let i = 0; i < 2; i++)
      wave(
        c,
        w,
        y + i * (banner ? 160 : 132) - (banner ? 80 : 0),
        amp,
        phase,
        C.teal,
        ((banner ? 40 : 80) * s.waveSize) / 100,
      );
    c.restore();
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
      text(
        c,
        s.handle,
        540,
        h / 2 + 25,
        64 * factor,
        C.gold,
        700,
        6,
        610,
        true,
      );
  } else {
    c.save();
    c.translate(0, (s.textY * h) / 100);
    // The eyebrow never moves or fades.
    if (s.layers.eyebrow)
      text(c, s.eyebrow, 60, 340, 37 * factor, body, 700, 5, 950);
    const beat = video ? beatAt(s, time) : null,
      holdingSubline = video && time >= s.duration * 0.8;
    // The headline builds up: each line takes its still position when it
    // arrives and stays on screen. Only the newest line reveals or glitches.
    if (s.layers.headline) {
      const lines = s.headline.toUpperCase().split('\n').filter(Boolean).slice(0, 6),
        size = Math.min(265 * factor, 650 / Math.max(1, lines.length)),
        newest = video ? beat.index : lines.length - 1;
      lines.forEach((line, i) => {
        if (i > newest) return;
        const y = 450 + size * 0.86 + i * size;
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
        if (glitch) {
          text(c, line, 54, y, size, C.teal, 900, 0, 950);
          text(c, line, 66, y + 3, size, C.gold, 900, 0, 950);
        } else text(c, line, 60, y, size, fg, 900, 0, 950);
        c.restore();
      });
    }
    // Subline takes over the last 20% of the loop and fades in over 0.4 s.
    if (s.layers.subline && (!video || holdingSubline)) {
      const k = video
        ? easeOut(Math.min(1, (time - s.duration * 0.8) / 0.4))
        : 1;
      c.save();
      c.globalAlpha = k;
      text(c, s.subline, 60, 1130, 42 * factor, body, 700, 0, 950);
      c.restore();
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
