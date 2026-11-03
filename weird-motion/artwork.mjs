// Original T.im motion toys. One deterministic vector scene for SVG and canvas.
export const toys = [
  {
    id: 'water-flask',
    name: 'Water flask',
    actions: ['Bounce + splash', 'Sip + refill'],
    label: 'HYDRATION STOP',
  },
  {
    id: 'running-gel',
    name: 'Running gel',
    actions: ['Sprint + tear open', 'Squeeze + cheer'],
    label: 'POCKET FUEL',
  },
  {
    id: 'aid-station',
    name: 'Aid station tent',
    actions: ['Pitch + welcome', 'Checkpoint celebration'],
    label: 'NEXT AID STATION',
  },
  {
    id: 'pancake-pal',
    name: 'Pancake pal',
    actions: ['Flip + catch', 'Stack + butter bounce'],
    label: 'FLIPPIN GOOD',
  },
  {
    id: 'sizzling-skillet',
    name: 'Sizzling skillet',
    actions: ['Sizzle + toss', 'Chef shake'],
    label: 'HOT LITTLE FIND',
  },
  {
    id: 'noodle-buddy',
    name: 'Noodle buddy',
    actions: ['Lift + slurp', 'Noodle twirl'],
    label: 'BOWL OF JOY',
  },
  {
    id: 'whisk-wizard',
    name: 'Whisk wizard',
    actions: ['Whip + reveal', 'Batter swirl'],
    label: 'WHIP IT UP',
  },
  {
    id: 'delivery-bot',
    name: 'Tiny delivery bot',
    actions: ['Roll + deliver', 'Express delivery + salute'],
    label: 'SPECIAL DELIVERY',
  },
  {
    id: 'shy-star',
    name: 'Shy star',
    actions: ['Peek + sparkle', 'Hide + happy hop'],
    label: 'A LITTLE GEM',
  },
  {
    id: 'dumpling-chef',
    name: 'Dumpling chef',
    actions: ['Hop + serve', 'Steamer surprise'],
    label: 'FRESH LITTLE FIND',
  },
  {
    id: 'magnetic-assembly',
    name: 'Magnetic assembly',
    actions: ['Snap frame together', 'Polarity flip'],
    label: 'IT CLICKS',
  },
  {
    id: 'inspection-drone',
    name: 'Inspection drone',
    actions: ['Fly in + scan', 'Orbit + project'],
    label: 'DETAIL DETECTED',
  },
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
  } else if (id === 'magnetic-assembly') {
    const k = ease((p - 0.12) / 0.76),
      settle = back((p - 0.7) / 0.3);
    const corners = [
      [-64, -64, 0],
      [64, -64, Math.PI / 2],
      [64, 64, Math.PI],
      [-64, 64, -Math.PI / 2],
    ];
    corners.forEach(([x, y, r], i) => {
      const q = ease((p - i * 0.07) / 0.65),
        scatter = 1 - q,
        angle = r + scatter * (remix ? Math.PI * 3 : (i % 2 ? 1 : -1) * 2);
      group(
        290 + x + scatter * (i % 2 ? 170 : -170),
        270 + y + scatter * (i < 2 ? -120 : 120),
        Math.max(0.001, Math.min(1, p * 8)),
        angle,
        () => path('M22 0H0V22', 'none', i % 2 ? T : G, 10),
      );
    });
    group(
      290,
      270,
      Math.max(0.001, settle),
      remix ? (1 - k) * Math.PI : 0,
      () => {
        path('M-25-23V8Q-25 33 0 33T25 8V-23', 'none', T, 13);
        path('M-25-23v16M25-23v16', 'none', G, 14);
        path('M-8 8H8M0 0V16', 'none', G, 3);
      },
    );
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + p * 3;
      const radius = 100 * (1 - k) + 26;
      spark(
        290 + Math.cos(a) * radius,
        270 + Math.sin(a) * radius,
        (1 - k) * 0.8,
      );
    }
    if (!solo)
      path(`M365 270H${365 + 105 * ease((p - 0.68) / 0.25)}`, 'none', G, 5);
    panel(470, 270, Math.max(0.001, back((p - 0.65) / 0.35)));
    burst(290, 270, clamp((p - 0.75) / 0.25));
  } else if (id === 'inspection-drone') {
    const arrive = ease(p / 0.42),
      orbit = remix
        ? Math.sin(p * Math.PI * 1.5) * (1 - ease((p - 0.65) / 0.35))
        : 0;
    const x = 80 + 210 * arrive + 65 * orbit,
      y = 130 + 15 * arrive - 35 * Math.sin(p * Math.PI) * (1 - p);
    const scan = clamp((p - 0.32) / 0.5),
      target = back((p - 0.38) / 0.35);
    if (scan > 0) {
      // Open scan cone keeps the underlying footage visible.
      path(
        `M${x - 16} ${y + 24}L${230 + 100 * scan} 312M${x + 16} ${y + 24}L${270 + 100 * scan} 312`,
        'none',
        T,
        3,
      );
      path(`M${230 + 100 * scan} 312h40`, 'none', G, 5);
    }
    group(290, 280, Math.max(0.001, target), 0, () => {
      path(
        'M-40-20v-20h20M20-40h20v20M40 20v20H20M-20 40h-20V20',
        'none',
        T,
        5,
      );
      ellipse(0, 0, 5, 5, G);
    });
    group(
      x,
      y,
      Math.max(0.001, Math.min(1, p * 8)),
      (1 - arrive) * -0.25 + orbit * 0.12,
      () => {
        path('M-29-4-65-18M29-4 65-18', 'none', T, 9);
        for (const rotor of [-65, 65]) {
          ellipse(rotor, -23, 34, 7, 'none', G, 4);
          path(`M${rotor - 25} -23h${50 * Math.cos(p * 65)}`, 'none', T, 4);
        }
        path('M-35-15H24L39 0 24 26H-25L-39 4Z', N, G, 5);
        ellipse(4, 6, 13, 13, T, N, 3);
        ellipse(4, 6, 5, 5, P);
        path('M-22 27v12h15M21 27v12h-15', 'none', T, 4);
      },
    );
    if (!solo)
      path(
        `M335 280L400 270H${400 + 70 * ease((p - 0.6) / 0.3)}`,
        'none',
        G,
        5,
      );
    panel(470, 270, Math.max(0.001, back((p - 0.62) / 0.38)));
    burst(290, 280, clamp((p - 0.8) / 0.2));
  } else if (id === 'delivery-bot') {
    const arrive = ease(p / 0.72),
      salute = ease((p - 0.6) / 0.4),
      x = 70 + 240 * arrive;
    const bob = (remix ? 12 : 5) * Math.sin(p * 22) * (1 - salute);
    panel(470, 270, Math.max(0.001, back((p - 0.5) / 0.5)));
    group(x, 270 + bob, 1, (remix ? -0.1 : 0) * (1 - arrive), () => {
      for (const wheel of [-27, 27]) {
        ellipse(wheel, 42, 17, 17, N, T, 5);
        group(wheel, 42, 1, p * (remix ? 28 : 16), () =>
          path('M-9 0H9M0-9V9', 'none', G, 3),
        );
      }
      path('M-49-22Q-49-39-32-39H32Q49-39 49-22V26H-49Z', T, N, 5);
      path('M-32-24H32V10H-32Z', N, G, 4);
      ellipse(-13, -8, 5, 7, G);
      ellipse(13, -8, 5, 7, G);
      path('M-9 3q9 8 18 0', 'none', P, 3);
      path('M0-40V-63l17-9', 'none', G, 5);
      ellipse(19, -74, 6, 6, T, G, 2);
      path(`M49 9L76 ${9 - 30 * salute}l18 ${-18 * salute}`, 'none', G, 8);
      path('M-49 12l-21 10', 'none', G, 8);
      rect(-21, 17, 42, 15, N);
      path('M-11 24H11', 'none', G, 3);
    });
    burst(310, 180, clamp((p - 0.76) / 0.24));
  } else if (id === 'shy-star') {
    const reveal = ease((p - 0.12) / 0.7),
      happy = ease((p - 0.65) / 0.35);
    const x = remix ? 250 + 60 * reveal : 260 + 50 * reveal,
      y = remix
        ? 325 - 55 * reveal - 55 * Math.sin(Math.PI * reveal)
        : 300 - 30 * reveal;
    // The little navy pocket reads as its hiding place, not a background plate.
    path('M220 330q90 35 180 0l-20 40H240Z', N, T, 5);
    group(
      x,
      y,
      Math.max(0.001, 0.3 + 0.7 * reveal),
      Math.sin(p * 12) * (1 - happy) * 0.25,
      () => {
        path(
          'M0-60 18-21 60-17 29 12 38 55 0 34-38 55-29 12-60-17-18-21Z',
          G,
          N,
          5,
        );
        ellipse(-13, -2, 4, 6, N);
        ellipse(13, -2, 4, 6, N);
        path('M-8 12q8 9 16 0', 'none', N, 3);
        ellipse(-26, 11, 7, 3, T);
        ellipse(26, 11, 7, 3, T);
        path(`M39 25l${18 + 10 * happy} ${-22 * happy}`, 'none', T, 7);
      },
    );
    panel(470, 270, Math.max(0.001, back((p - 0.55) / 0.45)));
    for (let i = 0; i < 3; i++)
      spark(
        235 + i * 70,
        190 + (i % 2) * -30,
        happy * (remix ? 1.2 : 0.8),
        p * 0.5 + i,
      );
    burst(310, 250, clamp((p - 0.7) / 0.3));
  } else if (id === 'dumpling-chef') {
    const arrive = ease(p / 0.6),
      serve = ease((p - 0.45) / 0.55);
    const x = remix ? 310 : 120 + 190 * arrive,
      y = remix
        ? 310 - 45 * serve
        : 270 - 65 * Math.abs(Math.sin(arrive * Math.PI * 2)) * (1 - serve);
    // Steamer base and lifted lid share the same transparent stage.
    path('M220 325H400L384 362H236Z', N, G, 5);
    path('M242 340H378M255 352H365', 'none', T, 4);
    group(
      310,
      remix ? 245 - 85 * serve : 200 - 10 * serve,
      1,
      remix ? -0.18 * serve : 0,
      () => {
        path('M-87 0Q-65-32 0-32T87 0Z', N, G, 5);
        path('M-18-32v-12h36v12', 'none', T, 5);
      },
    );
    group(
      x,
      y,
      Math.max(0.001, Math.min(1, p * 7)),
      (1 - serve) * Math.sin(p * 14) * 0.12,
      () => {
        path(
          'M-58 20Q-58-15-35-28Q-20-49 0-38Q20-49 35-28Q58-15 58 20Q35 49 0 45Q-35 49-58 20Z',
          G,
          N,
          5,
        );
        path('M-35-28l17 22M-13-38l6 28M13-38 7-10M35-28 18-6', 'none', N, 3);
        ellipse(-16, 10, 4, 6, N);
        ellipse(16, 10, 4, 6, N);
        path('M-8 25q8 7 16 0', 'none', N, 3);
        path('M-58 13l-18-14M58 13l22-19', 'none', T, 7);
      },
    );
    for (let i = 0; i < 3; i++) {
      const sx = 270 + i * 40,
        sy = 145 - 22 * serve;
      path(`M${sx} ${sy}q-10-12 0-23t0-23`, 'none', T, 3);
    }
    panel(470, 270, Math.max(0.001, back((p - 0.6) / 0.4)));
    burst(310, 270, clamp((p - 0.75) / 0.25));
  } else if (id === 'pancake-pal') {
    const land = ease((p - 0.65) / 0.35),
      flip = clamp((p - 0.12) / 0.65);
    const py = remix
      ? 280 - 32 * Math.sin(p * 9) * (1 - land)
      : 280 - 145 * Math.sin(flip * Math.PI);
    path('M210 325q100 35 200 0', 'none', T, 8);
    for (let i = 0; i < (remix ? 3 : 2); i++) {
      const stack = ease((p - i * 0.12) / 0.5);
      group(
        310,
        py + 18 - i * 16,
        Math.max(0.001, stack),
        remix
          ? Math.sin(p * 11 + i) * 0.05 * (1 - land)
          : i === 1
            ? (1 - flip) * Math.PI * 2
            : 0,
        () => {
          ellipse(0, 0, 72, 22, G, N, 4);
          path('M-55 1q55 18 110 0', 'none', N, 3);
          if (i === (remix ? 2 : 1)) {
            ellipse(-17, -4, 4, 5, N);
            ellipse(17, -4, 4, 5, N);
            path('M-7 6q7 7 14 0', 'none', N, 3);
            rect(
              -13,
              -27 - 14 * Math.abs(Math.sin(p * 9)) * (1 - land),
              26,
              13,
              P,
              N,
              3,
            );
          }
        },
      );
    }
    path('M219 283l-36 19 13 19M397 283l33 17-10 20', 'none', T, 7);
    panel(470, 270, Math.max(0.001, back((p - 0.55) / 0.45)));
    burst(310, 240, clamp((p - 0.75) / 0.25));
  } else if (id === 'sizzling-skillet') {
    const settle = ease((p - 0.65) / 0.35),
      shake = Math.sin(p * (remix ? 30 : 12)) * (1 - settle),
      toss = clamp((p - 0.18) / 0.6);
    group(
      300,
      300 + shake * 8,
      Math.max(0.001, ease(p / 0.18)),
      shake * 0.1,
      () => {
        path('M-70 0h140q-8 39-70 39T-70 0Z', N, T, 6);
        ellipse(0, 0, 70, 21, N, G, 5);
        path('M65 8l72-18 9 16-75 17Z', T, N, 4);
        const hop = (remix ? 35 : 110) * Math.sin(toss * Math.PI);
        ellipse(-9, -8 - hop, 32, 18, P, N, 3);
        ellipse(-7, -11 - hop, 12, 10, G, N, 2);
        ellipse(-21, -9 - hop, 2, 3, N);
        ellipse(4, -9 - hop, 2, 3, N);
        for (let i = 0; i < 3; i++) {
          const x = -37 + i * 37;
          path(`M${x} -40q-9-10 0-20t0-20`, 'none', T, 3);
        }
        path('M-25 22q25 17 50 0', 'none', G, 3);
      },
    );
    panel(470, 270, Math.max(0.001, back((p - 0.57) / 0.43)));
    burst(300, 260, clamp((p - 0.76) / 0.24));
  } else if (id === 'noodle-buddy') {
    const lift = ease(p / 0.65),
      settle = ease((p - 0.65) / 0.35),
      twirl = remix ? Math.sin(p * 14) * (1 - settle) * 22 : 0;
    const top = 265 - 95 * lift;
    path('M225 285H395Q387 365 310 365T225 285Z', N, T, 6);
    ellipse(310, 285, 85, 21, G, N, 4);
    for (let i = 0; i < 5; i++) {
      const x = 278 + i * 15;
      path(
        `M${x} 285C${x - 20 + twirl} 248 ${x + 20 + twirl} ${top + 30} ${x + twirl} ${top}`,
        'none',
        G,
        5,
      );
    }
    path(`M245 ${top - 9}l139-19M248 ${top - 1}l139-11`, 'none', T, 6);
    ellipse(288, 320, 4, 6, G);
    ellipse(332, 320, 4, 6, G);
    path('M300 336q10 9 20 0', 'none', G, 3);
    path('M237 325l-20 8M383 325l20-8', 'none', G, 7);
    panel(470, 270, Math.max(0.001, back((p - 0.58) / 0.42)));
    burst(310, 250, clamp((p - 0.78) / 0.22));
  } else if (id === 'whisk-wizard') {
    const settle = ease((p - 0.65) / 0.35),
      mix = Math.sin(p * (remix ? 28 : 18)) * (1 - settle),
      rise = ease((p - 0.45) / 0.55);
    const x = 310 + mix * 28,
      y = 210 - 30 * rise;
    path('M220 300H400Q388 372 310 372T220 300Z', N, T, 6);
    ellipse(310, 300, 90, 22, G, N, 4);
    for (let i = 0; i < 3; i++)
      ellipse(310, 300, 65 - i * 16, 12 - i * 3, 'none', T, 2);
    group(x, y, Math.max(0.001, ease(p / 0.15)), mix * 0.25, () => {
      path('M0-65v65', 'none', G, 15);
      ellipse(0, -72, 9, 9, N, G, 4);
      path(
        'M0 0C-62 65-29 110 0 90C29 110 62 65 0 0M0 0C-25 70-12 105 0 90C12 105 25 70 0 0',
        'none',
        T,
        5,
      );
      ellipse(-3, -42, 2, 3, N);
      ellipse(3, -42, 2, 3, N);
    });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const k = clamp((p - 0.35) / 0.65);
      ellipse(
        310 + Math.cos(a) * (40 + 65 * k),
        275 - Math.abs(Math.sin(a + p * 8)) * 45 * (1 - settle),
        4,
        6,
        G,
      );
    }
    panel(470, 270, Math.max(0.001, back((p - 0.58) / 0.42)));
    burst(310, 240, clamp((p - 0.78) / 0.22));
  } else if (id === 'water-flask') {
    const arrive = ease(p / 0.6),
      settle = ease((p - 0.65) / 0.35),
      bounce = remix
        ? 18 * Math.sin(p * 15) * (1 - settle)
        : 65 * Math.abs(Math.sin(arrive * Math.PI * 2)) * (1 - settle);
    group(
      310,
      280 - bounce,
      Math.max(0.001, ease(p / 0.18)),
      Math.sin(p * (remix ? 13 : 9)) * (1 - settle) * 0.16,
      () => {
        path(
          'M-20-64v-20h40v20M-30-64h60l12 32 8 78q0 20-50 20t-50-20l8-78Z',
          N,
          G,
          5,
        );
        path('M-39 8q39-15 78 0l6 34q0 15-45 15T-45 42Z', T);
        path('M-17-92h34v10h-34Z', T, N, 3);
        path('M-22-40q-12 20-10 37', 'none', P, 3);
        ellipse(-12, 23, 4, 5, N);
        ellipse(12, 23, 4, 5, N);
        path('M-6 36q6 7 12 0', 'none', N, 3);
        path('M-48 15l-20 10M48 15l18-15', 'none', T, 7);
      },
    );
    const splash = clamp((p - 0.45) / 0.5);
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI + (i * Math.PI) / 3;
      const r = 35 + 60 * splash;
      group(
        310 + Math.cos(a) * r,
        200 - Math.sin(i + 1) * 40 * splash,
        Math.max(0.001, (1 - splash) * ease(p / 0.2)),
        a,
        () => path('M0-12Q-16 7 0 12Q16 7 0-12Z', T),
      );
    }
    panel(470, 270, Math.max(0.001, back((p - 0.57) / 0.43)));
    burst(310, 270, clamp((p - 0.78) / 0.22));
  } else if (id === 'running-gel') {
    const arrive = ease(p / 0.62),
      settle = ease((p - 0.65) / 0.35),
      tear = ease((p - 0.45) / 0.4);
    const x = remix ? 310 : 90 + 220 * arrive,
      hop = remix
        ? 14 * Math.sin(p * 18) * (1 - settle)
        : 25 * Math.abs(Math.sin(p * 22)) * (1 - settle);
    group(
      x,
      270 - hop,
      Math.max(0.001, ease(p / 0.14)),
      (1 - settle) * Math.sin(p * 12) * 0.12,
      () => {
        path('M-39-61l9-9h60l9 9-8 116h-62Z', G, N, 5);
        path('M-31-36h62v62h-62Z', N, T, 3);
        path('M-12-22h22L-2-1H12L-12 21-4 3H-16Z', T);
        ellipse(-12, 42, 3, 4, N);
        ellipse(12, 42, 3, 4, N);
        path('M-6 52q6 5 12 0', 'none', N, 3);
        group(20 + tear * 35, -72 - tear * 30, 1, tear * 0.9, () =>
          path('M-38-10h61l15 10H-38Z', T, N, 3),
        );
        path(
          `M-25 56l${-12 - 12 * Math.sin(p * 22) * (1 - settle)} 25h20M25 56l${12 + 12 * Math.sin(p * 22) * (1 - settle)} 25h-20`,
          'none',
          T,
          7,
        );
        path('M-34 6l-20 20M34 6l22-25', 'none', T, 7);
      },
    );
    if (!remix)
      for (let i = 0; i < 3; i++)
        path(
          `M${55 + i * 9} ${245 + i * 18}h${55 * (1 - arrive)}`,
          'none',
          T,
          4,
        );
    panel(470, 270, Math.max(0.001, back((p - 0.58) / 0.42)));
    burst(330, 200, clamp((p - 0.6) / 0.4));
  } else if (id === 'aid-station') {
    const pitch = back(p / 0.65),
      settle = ease((p - 0.65) / 0.35),
      cheer = Math.sin(p * (remix ? 22 : 10)) * (1 - settle);
    group(
      300,
      320,
      Math.max(0.001, pitch),
      cheer * (remix ? 0.035 : 0.015),
      () => {
        path('M-102-58V45M102-58V45', 'none', T, 8);
        path('M-120-58 0-142 120-58Z', N, G, 5);
        path('M-120-58H120V-36H-120Z', T, N, 4);
        path('M-50-104 0-138 50-104', 'none', T, 6);
        path('M-85 9H85v24H-85Z', N, G, 4);
        path('M-65 33v14M65 33v14', 'none', T, 5);
        for (let i = 0; i < 3; i++) {
          const x = -45 + i * 45;
          path(`M${x - 8} -11h16l-3 18h-10Z`, G, N, 2);
        }
        path('M-16-83h32M0-99v32', 'none', G, 7);
        path('M102-58v-66l39 12-39 13', 'none', T, 4);
        if (remix) {
          for (let i = 0; i < 5; i++)
            spark(-90 + i * 45, -165 - 14 * Math.sin(p * 9 + i), 0.5, i + p);
        }
      },
    );
    panel(470, 270, Math.max(0.001, back((p - 0.6) / 0.4)));
    burst(300, 245, clamp((p - 0.75) / 0.25));
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
