// Original T.im motion toys. One deterministic vector scene for SVG and canvas.
export const toys = [
  {
    id: 'pocket-portal',
    name: 'Pocket portal',
    actions: ['Open + summon', 'Vortex spin'],
    label: 'OUT OF POCKET',
  },
  {
    id: 'elastic-grabber',
    name: 'Elastic grabber',
    actions: ['Stretch + grab', 'Slingshot delivery'],
    label: 'GRAB THIS',
  },
  {
    id: 'orbit-swarm',
    name: 'Orbit swarm',
    actions: ['Orbit + lock on', 'Magnetic scramble'],
    label: 'SPOTTED IT',
  },
  {
    id: 'pixel-critter',
    name: 'Pixel critter',
    actions: ['Run + deliver', 'Peek + celebrate'],
    label: 'MY LITTLE FIND',
  },
];
const N = '#0e1a2e',
  G = '#e8c96a',
  T = '#2e9bad',
  P = '#f6f4ef';
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => 1 - (1 - clamp(x)) ** 3;
const back = (x) => {
  x = clamp(x) - 1;
  return 1 + 2.70158 * x * x * x + 1.70158 * x * x;
};
export function commands(id, progress, remix = false) {
  const solo = id.endsWith('-solo');
  id = id.replace(/-solo$/, '');
  const p = clamp(progress),
    out = [];
  const add = (op, ...a) => out.push([op, ...a]);
  const group = (x, y, s, r, fn) => {
    add('save');
    add('translate', x, y);
    add('rotate', r);
    add('scale', s, s);
    fn();
    add('restore');
  };
  const path = (d, fill = 'none', stroke = 'none', width = 5) =>
    add('path', d, fill, stroke, width);
  const ellipse = (x, y, rx, ry, fill, stroke = 'none', width = 5) =>
    add('ellipse', x, y, rx, ry, fill, stroke, width);
  const rect = (x, y, w, h, fill, stroke = 'none', width = 5) =>
    path(`M${x} ${y}h${w}v${h}h${-w}Z`, fill, stroke, width);
  const spark = (x, y, s, r = 0) =>
    group(x, y, s, r, () => path('M0-12 4-4 12 0 4 4 0 12-4 4-12 0-4-4Z', G));
  const panel = (x, y, s, r = 0) =>
    !solo &&
    group(x, y, s, r, () => {
      path('M0-49H306L330 0 306 49H0Z', N, G, 5);
      path('M16-31v62M286-19 300 0 286 19', 'none', T, 6);
    });
  const burst = (x, y, q) => {
    if (q > 0 && q < 1)
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        spark(
          x + Math.cos(a) * (20 + 60 * q),
          y + Math.sin(a) * (20 + 60 * q),
          (1 - q) * 0.8,
          a,
        );
      }
  };
  if (p <= 0) return out;
  if (id === 'pocket-portal') {
    const open = back(p / 0.3),
      settle = ease((p - 0.4) / 0.6),
      angle = remix ? (1 - settle) * Math.PI * 2 : 0;
    group(290, 282, Math.max(0, open), angle, () => {
      ellipse(0, 0, 50, 118, N, T, 9);
      ellipse(0, 0, 30, 98, 'none', G, 4);
      path('M-6-72 10-42-10-10 10 25-5 69', 'none', T, 5);
    });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.256 + p * 7 * (1 - settle);
      const radius = 95 + 20 * Math.sin(p * 6 + i);
      spark(
        290 + Math.cos(a) * radius,
        282 + Math.sin(a) * 145,
        Math.min(1, p * 5) * (1 - 0.45 * settle),
        a,
      );
    }
    const k = back((p - 0.28) / 0.65);
    panel(
      290 + 180 * clamp(k),
      270,
      Math.max(0.001, clamp(k)),
      (1 - clamp(k)) * (remix ? -1.2 : 0.25),
    );
    burst(350, 270, clamp((p - 0.45) / 0.4));
  } else if (id === 'elastic-grabber') {
    const reach = ease(p / 0.45),
      pull = ease((p - 0.45) / 0.55),
      x = remix
        ? 170 + 500 * reach - 220 * pull
        : 100 + 560 * reach - 190 * pull;
    const y =
      270 +
      (remix
        ? -100 * Math.sin(p * Math.PI)
        : 20 * Math.sin(p * Math.PI * 2) * (1 - p));
    path(
      `M60 380C${120 + 120 * reach} ${420 - 220 * reach} ${x - 160} ${y - 90} ${x} ${y}`,
      'none',
      N,
      30,
    );
    path(
      `M60 380C${120 + 120 * reach} ${420 - 220 * reach} ${x - 160} ${y - 90} ${x} ${y}`,
      'none',
      T,
      19,
    );
    for (let i = 0; i < 3; i++)
      path(`M${55 + i * 16} ${350 + i * 4}l-8 45`, 'none', G, 5);
    const delivered = clamp((p - 0.32) / 0.68);
    panel(
      remix ? 790 - 320 * back(delivered) : 720 - 250 * pull,
      270,
      Math.max(0.001, ease(p / 0.2)),
      (1 - pull) * 0.08,
    );
    group(x, y, 1, 0, () => {
      ellipse(0, 0, 18, 18, G, N, 4);
      const gap = 18 * (1 - ease((p - 0.35) / 0.2));
      path(`M10-8 32 ${-18 - gap}h22M10 8 32 ${18 + gap}h22`, 'none', G, 10);
    });
    burst(470, 270, clamp((p - 0.78) / 0.22));
  } else if (id === 'orbit-swarm') {
    const lock = ease((p - 0.48) / 0.52);
    ellipse(290, 270, 22 * back(p / 0.3), 22 * back(p / 0.3), 'none', T, 5);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + (remix ? -1 : 1) * p * 9;
      const r =
        (remix ? 145 + 35 * Math.sin(i * 3 + p * 12) : 125) * (1 - lock);
      const x = 290 + Math.cos(a) * r + lock * (i < 4 ? i * 11 - 16 : 5),
        y =
          270 + Math.sin(a) * r * (remix ? 0.8 : 1) + lock * (i < 4 ? -28 : 28);
      group(x, y, 0.9 - 0.45 * lock, a * (1 - lock), () =>
        path('M-12-8H3L14 0 3 8H-12L-3 0Z', i % 2 ? G : T, N, 2),
      );
    }
    const line = ease((p - 0.55) / 0.35);
    if (!solo) path(`M320 270H${320 + 150 * line}`, 'none', G, 5);
    panel(470, 270, Math.max(0.001, back((p - 0.6) / 0.4)));
    burst(290, 270, clamp((p - 0.5) / 0.45));
  } else if (id === 'pixel-critter') {
    const arrival = ease(p / 0.65),
      land = ease((p - 0.65) / 0.35);
    const x = remix ? 310 : 70 + 240 * arrival,
      y = remix
        ? 370 - 100 * arrival
        : 270 - 22 * Math.abs(Math.sin(p * 18)) * (1 - land);
    const gait = Math.sin(p * 30) * (1 - land),
      bounce = 1 + 0.08 * Math.sin(p * 18) * (1 - land);
    panel(
      470,
      270,
      Math.max(0.001, back((p - 0.45) / 0.55)),
      (1 - land) * 0.06,
    );
    group(x, y, bounce, remix ? (1 - land) * -0.15 : 0, () => {
      path(
        `M-28 34l${-15 - 12 * gait} 28h34M24 34l${15 + 12 * gait} 28h-34`,
        'none',
        T,
        13,
      );
      path('M-48-30H-30V-48H21V-30H46V28H28V44H-30V28H-48Z', G, N, 5);
      rect(-25, -16, 13, 18, N);
      rect(7, -16, 13, 18, N);
      path('M-12 16h22v-9', 'none', N, 5);
      path('M-9-49v-24l19-9', 'none', T, 7);
      ellipse(12, -84, 7, 7, G);
      path(
        `M44 5L${remix ? 80 : 100} ${remix ? -45 * land : 0}`,
        'none',
        T,
        11,
      );
      ellipse(remix ? 80 : 100, remix ? -45 * land : 0, 10, 10, G, N, 3);
      path('M-48 0l-24 15-9-13', 'none', T, 10);
    });
    burst(310, 190, clamp((p - 0.7) / 0.3));
  } else throw Error('Unknown motion toy');
  return out;
}
export function svg(id, p = 1, remix = false) {
  let body = '';
  for (const [op, ...a] of commands(id, p, remix)) {
    if (op === 'save') body += '<g>';
    else if (op === 'restore') body += '</g>';
    else if (op === 'translate')
      body += `<g transform="translate(${a.join(' ')})">`;
    else if (op === 'rotate')
      body += `<g transform="rotate(${(a[0] * 180) / Math.PI})">`;
    else if (op === 'scale') body += `<g transform="scale(${a.join(' ')})">`;
    else if (op === 'path')
      body += `<path d="${a[0]}" fill="${a[1]}" stroke="${a[2]}" stroke-width="${a[3]}" stroke-linecap="round" stroke-linejoin="round"/>`;
    else if (op === 'ellipse')
      body += `<ellipse cx="${a[0]}" cy="${a[1]}" rx="${Math.max(0, a[2])}" ry="${Math.max(0, a[3])}" fill="${a[4]}" stroke="${a[5]}" stroke-width="${a[6]}"/>`;
    // Each transform opens a nested group, closed with its saved group below.
    if (op === 'restore') body += '</g></g></g>';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">${body}</svg>`;
}
export function draw(ctx, id, p, w, h, remix = false) {
  ctx.save();
  ctx.translate(-w / 2, -h / 2);
  ctx.scale(w / 960, h / 540);
  for (const [op, ...a] of commands(id, p, remix)) {
    if (['save', 'restore', 'translate', 'rotate', 'scale'].includes(op))
      ctx[op](...a);
    else {
      let shape, fill, stroke, width;
      if (op === 'path') {
        shape = new Path2D(a[0]);
        [fill, stroke, width] = a.slice(1);
      } else {
        shape = new Path2D();
        shape.ellipse(
          a[0],
          a[1],
          Math.max(0, a[2]),
          Math.max(0, a[3]),
          0,
          0,
          Math.PI * 2,
        );
        [fill, stroke, width] = a.slice(4);
      }
      if (fill !== 'none') {
        ctx.fillStyle = fill;
        ctx.fill(shape);
      }
      if (stroke !== 'none') {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(shape);
      }
    }
  }
  ctx.restore();
}
