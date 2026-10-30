/* Deterministic, seekable artwork. No timers, remote assets or random state. */
window.essentials = (() => {
  const canvas = document.getElementById('scene');
  const c = canvas.getContext('2d');
  const navy = '#0e1a2e',
    gold = '#e8c96a',
    teal = '#2e9bad',
    white = '#f6f4ef';
  const items = [
    ['easy-run', 'Easy run', 'CONVERSATIONAL PACE', 'label', 3],
    ['tempo', 'Tempo', 'FIND YOUR RHYTHM', 'label', 3],
    ['intervals', 'Intervals', 'WORK / RECOVER / REPEAT', 'label', 3],
    ['long-run', 'Long run', 'TIME ON FEET', 'label', 3],
    ['recovery', 'Recovery', 'KEEP IT EASY', 'label', 3],
    ['race-day', 'Race day', 'TRUST THE TRAINING', 'label', 3],
    ['track-wipe', 'Track wipe', 'Cut at 0.70s', 'transition', 1.4],
    [
      'footstrike-ripple',
      'Footstrike ripple',
      'Cut at 0.70s',
      'transition',
      1.4,
    ],
    ['trail-dust', 'Trail dust', 'Cut at 0.70s', 'transition', 1.4],
    ['finish-tape', 'Finish tape', 'Cut at 0.70s', 'transition', 1.4],
    ['1-km', '1 KM', 'ONE STEP FURTHER', 'distance', 3.2],
    ['5-km', '5 KM', 'FIVE KILOMETRES', 'distance', 3.2],
    ['10-km', '10 KM', 'TEN KILOMETRES', 'distance', 3.2],
    ['half-marathon', '21.1 KM', 'HALF MARATHON', 'distance', 3.2],
    ['marathon', '42.2 KM', 'MARATHON', 'distance', 3.2],
  ].map(([id, title, subtitle, kind, duration]) => ({
    id,
    title,
    subtitle,
    kind,
    duration,
  }));
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
  function rect(x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  }
  function text(s, x, y, size, color = white, italic = false) {
    c.font = `${italic ? 'italic 900' : '700'} ${size}px Barlow`;
    c.fillStyle = color;
    c.fillText(s, x, y);
  }
  function draw(item, t, format = '16x9', background = 'alpha') {
    const portrait = format === '9x16';
    const W = portrait ? 1080 : 1920,
      H = portrait ? 1920 : 1080;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.clearRect(0, 0, W, H);
    if (background !== 'alpha')
      rect(0, 0, W, H, background === 'green' ? '#00ff00' : navy);
    // All overlays start and finish clear; the final encoded frame is clear too.
    if (t <= 0 || t >= item.duration - 1 / 30) return;
    const unit = Math.min(W, H) / 1080;
    c.save();
    c.scale(unit, unit);
    const w = W / unit,
      h = H / unit;
    if (item.kind !== 'transition') {
      const enter = ease(t / 0.5),
        leave = ease((t - (item.duration - 0.5)) / 0.46);
      const visibility = enter * (1 - leave);
      c.globalAlpha = visibility;
      const bw = portrait ? 900 : 1060,
        bh = item.kind === 'distance' ? 420 : 300;
      const x = (w - bw) / 2 + (1 - enter) * -100 + leave * 100;
      const y = portrait ? h * 0.6 : h * 0.63;
      c.translate(x, y - bh / 2);
      c.fillStyle = navy;
      c.beginPath();
      c.roundRect(0, 0, bw, bh, 18);
      c.fill();
      rect(0, 0, 10, bh, gold);
      rect(10, 0, bw - 28, 4, teal);
      text(
        item.kind === 'distance' ? 'DISTANCE / T.im' : 'TRAINING / T.im',
        48,
        55,
        29,
        gold,
      );
      const title = item.title.toUpperCase();
      let size = item.kind === 'distance' ? 156 : 120;
      c.font = `italic 900 ${size}px Barlow`;
      if (c.measureText(title).width > bw - 100)
        size *= (bw - 100) / c.measureText(title).width;
      text(title, 44, item.kind === 'distance' ? 226 : 181, size, white, true);
      text(item.subtitle, 48, item.kind === 'distance' ? 289 : 237, 30, white);
      if (item.kind === 'distance') {
        const progress = ease((t - 0.3) / 0.7);
        for (let i = 0; i < 20; i++)
          rect(
            48 + (i * (bw - 96)) / 20,
            336,
            (bw - 96) / 20 - 8,
            20,
            i / 20 < progress ? gold : '#243953',
          );
      }
    } else {
      const p = clamp(t / item.duration),
        cover = clamp(1 - Math.abs(p - 0.5) / 0.16);
      if (item.id === 'track-wipe') {
        const left = (-1.6 + 3.2 * p) * w;
        c.save();
        c.transform(1, 0, -0.25, 1, 0, 0);
        rect(left, 0, w * 1.1 + h * 0.25, h, navy);
        for (let i = 0; i < 4; i++)
          rect(left + 30 + i * 32, 0, 10, h, i % 2 ? teal : gold);
        c.restore();
      }
      if (item.id === 'footstrike-ripple') {
        const r = ease(p) * Math.hypot(w, h);
        c.strokeStyle = gold;
        c.lineWidth = 20;
        c.beginPath();
        c.ellipse(w * 0.5, h * 0.7, r, r * 0.58, 0, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = teal;
        c.lineWidth = 8;
        c.beginPath();
        c.ellipse(w * 0.5, h * 0.7, r * 0.8, r * 0.46, 0, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = cover;
        rect(0, 0, w, h, navy);
        c.globalAlpha = 1;
      }
      if (item.id === 'trail-dust') {
        for (let i = 0; i < 95; i++) {
          const seed = (i * 137.508) % 360,
            rad = (seed * Math.PI) / 180;
          const travel = ease(p) * Math.hypot(w, h) * 0.65;
          c.globalAlpha = Math.sin(p * Math.PI) * 0.88;
          c.fillStyle = i % 3 === 0 ? gold : i % 3 === 1 ? teal : navy;
          c.beginPath();
          c.arc(
            w * 0.5 + Math.cos(rad) * travel,
            h * 0.55 + Math.sin(rad) * travel * 0.7,
            (20 + (i % 8) * 9) * (1 + p),
            0,
            Math.PI * 2,
          );
          c.fill();
        }
        c.globalAlpha = cover;
        rect(0, 0, w, h, navy);
        c.globalAlpha = 1;
      }
      if (item.id === 'finish-tape') {
        const growth = ease(p / 0.42),
          exit = ease((p - 0.55) / 0.42);
        c.save();
        c.translate(w * 0.5, h * 0.5);
        c.rotate(-0.1 + exit * 0.18);
        const bh = 110 + growth * h * 1.2;
        c.globalAlpha = 1 - exit;
        rect(-w, -bh * 0.5, w * 2, bh, gold);
        for (let i = -20; i < 25; i++) rect(i * 110, -bh * 0.5, 54, 24, navy);
        c.textAlign = 'center';
        text('FINISH', 0, 45, 120, navy, true);
        c.textAlign = 'left';
        c.restore();
      }
      // A short fully opaque bridge guarantees a clean cut behind every transition.
      if (Math.abs(t - 0.7) <= 1 / 30)
        rect(0, 0, w, h, item.id === 'finish-tape' ? gold : navy);
    }
    c.restore();
    c.globalAlpha = 1;
  }
  return { items, draw, canvas };
})();
