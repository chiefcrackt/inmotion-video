import {
  finite,
  coordinate,
  privateRoute,
  atTime,
  units,
  duration,
} from './model.mjs';
export const presets = {
  cyber: {
    background: '#0e1a2e',
    text: '#f6f4ef',
    accent: '#e8c96a',
    route: '#2e9bad',
  },
  minimal: {
    background: '#f6f4ef',
    text: '#172332',
    accent: '#28655c',
    route: '#28655c',
  },
  broadcast: {
    background: '#111820',
    text: '#ffffff',
    accent: '#e8c96a',
    route: '#f17152',
  },
};
export const templates = {
  summary: { name: 'Run summary' },
  route: { name: 'Route reveal', requires: 'gps' },
  dashboard: { name: 'Performance dashboard' },
  elevation: { name: 'Elevation profile', requires: 'elevation' },
  splits: { name: 'Recorded laps', requires: 'laps' },
};
const routeCache = new WeakMap();
export function metric(activity, key, settings, point) {
  const u = units(settings.imperial),
    s = activity.summary;
  const distance = point ? point.distanceM : s.distance;
  const pace = point
    ? point.speedMps > 0
      ? u.distance / point.speedMps
      : null
    : s.pace == null
      ? null
      : (s.pace * u.distance) / 1000;
  switch (key) {
    case 'distance':
      return [
        'DISTANCE',
        finite(distance)
          ? (distance / u.distance).toFixed(2) + ' ' + u.distanceLabel
          : '—',
      ];
    case 'moving':
      return ['MOVING TIME', duration(point ? point.movingS : s.moving)];
    case 'elapsed':
      return ['ELAPSED TIME', duration(point ? point.elapsedS : s.elapsed)];
    case 'pace':
      return [
        point ? 'CURRENT PACE' : 'AVG PACE',
        finite(pace) ? duration(pace) + ' /' + u.distanceLabel : '—',
      ];
    case 'heartRate':
      return [
        point ? 'HEART RATE' : 'AVG HEART RATE',
        finite(point ? point.heartRate : s.heartRate)
          ? Math.round(point ? point.heartRate : s.heartRate) + ' bpm'
          : '—',
      ];
    case 'maxHeartRate':
      return [
        'MAX HEART RATE',
        finite(s.maxHeartRate) ? Math.round(s.maxHeartRate) + ' bpm' : '—',
      ];
    case 'ascent':
      return [
        'ELEVATION GAIN',
        finite(s.ascent)
          ? Math.round(s.ascent / u.elevation) + ' ' + u.elevationLabel
          : '—',
      ];
    case 'cadence':
      return [
        'CADENCE',
        finite(point ? point.cadence : s.cadence)
          ? Math.round(point ? point.cadence : s.cadence) + ' spm'
          : '—',
      ];
    case 'power':
      return [
        'RUNNING POWER',
        finite(point ? point.power : s.power)
          ? Math.round(point ? point.power : s.power) + ' W'
          : '—',
      ];
  }
}
export function projectRoute(points, box, rotation = 0) {
  const visible = points.filter((p) => !p.private && coordinate(p));
  if (!visible.length) return [];
  const lat =
      ((visible.reduce((s, p) => s + p.lat, 0) / visible.length) * Math.PI) /
      180,
    origin = visible[0].lon;
  const angle = (rotation * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const xy = (p) => {
    const dx =
        (((p.lon - origin + 540) % 360) - 180) * Math.max(0.01, Math.cos(lat)),
      dy = -p.lat;
    return [dx * c - dy * s, dx * s + dy * c];
  };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  visible.forEach((p) => {
    const [x, y] = xy(p);
    minX = Math.min(x, minX);
    maxX = Math.max(x, maxX);
    minY = Math.min(y, minY);
    maxY = Math.max(y, maxY);
  });
  const scale = Math.min(
    box.w / Math.max(maxX - minX, 0.00001),
    box.h / Math.max(maxY - minY, 0.00001),
  );
  return points.map((p) => {
    if (p.private || !coordinate(p)) return null;
    const [x, y] = xy(p);
    return {
      x: box.x + box.w / 2 + (x - (minX + maxX) / 2) * scale,
      y: box.y + box.h / 2 + (y - (minY + maxY) / 2) * scale,
      point: p,
    };
  });
}
export function render(
  canvas,
  activity,
  settings,
  progress = 1,
  animated = false,
  intro = null,
) {
  const ctx = canvas.getContext('2d'),
    W = canvas.width,
    H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!settings.transparent) {
    ctx.fillStyle = settings.background;
    ctx.fillRect(0, 0, W, H);
  }
  const scale = Math.min(W, H) / 1080,
    pad = 70 * scale,
    tall = H > W * 1.3;
  const font =
    { sans: 'Arial, sans-serif', serif: 'Georgia, serif', mono: 'monospace' }[
      settings.font
    ] || '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  const text = (
    str,
    x,
    y,
    size,
    color = settings.text,
    weight = 700,
    max = W - pad * 2,
  ) => {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size * scale * settings.fontSize}px ${font}`;
    ctx.fillText(String(str), x, y, max);
  };
  if (settings.preset === 'cyber' && !settings.transparent) {
    ctx.strokeStyle = settings.route + '24';
    ctx.lineWidth = scale;
    for (let x = pad; x < W; x += 90 * scale) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = pad; y < H; y += 90 * scale) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }
  // Intro (0..1): the route draws in large, glides into its place on the card, then the card wipes in.
  const ease = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
  const iv =
    intro == null || !activity
      ? null
      : {
          draw: ease(intro / 0.55),
          move: ease((intro - 0.55) / 0.3),
          card:
            settings.introCard === 'cut'
              ? intro >= 0.62
                ? 1
                : 0
              : ease((intro - 0.6) / 0.35),
        };
  let ox = 0,
    oy = 0;
  const cardPart = (fn) => {
    if (!iv) return fn();
    const r = iv.card;
    if (r <= 0) return;
    ctx.save();
    if (r < 1) {
      ctx.beginPath();
      if (settings.introCard === 'rise') {
        ctx.rect(-ox, -oy + H * (1 - r), W, H);
        ctx.clip();
        ctx.translate(0, (1 - r) * 40 * scale);
      } else {
        ctx.rect(-ox, -oy, W * r, H);
        ctx.clip();
      }
    }
    fn();
    ctx.restore();
  };
  cardPart(() =>
    text('T.IM  /  ACTIVITY STUDIO', pad, 70 * scale, 24, settings.accent),
  );
  if (!activity) {
    text('YOUR NEXT STORY', pad, H * 0.44, 76);
    text('STARTS WITH A RUN.', pad, H * 0.44 + 85 * scale, 76);
    text(
      'Import a FIT, GPX or TCX activity to begin.',
      pad,
      H * 0.65,
      29,
      settings.accent,
    );
    return;
  }
  const offsetX = (settings.x / 100) * W,
    offsetY = (settings.y / 100) * H;
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ox = offsetX;
  oy = offsetY;
  ctx.globalAlpha = settings.opacity;
  cardPart(() =>
    text(settings.title || activity.metadata.name, pad, 160 * scale, 62),
  );
  const date = activity.metadata.date
    ? new Date(activity.metadata.date).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';
  cardPart(() =>
    text(date.toUpperCase(), pad, 204 * scale, 24, settings.accent),
  );
  const point = animated ? atTime(activity, progress) : null;
  const selectedKeys = settings.metrics
    .filter((k) => activity.summary[k] != null)
    .slice(0, settings.template === 'dashboard' ? 9 : 6);
  const cols = tall ? 2 : Math.min(3, Math.max(1, selectedKeys.length)),
    rowH = (tall ? 105 : 88) * scale * settings.fontSize;
  const metricY =
    H -
    Math.max(
      (tall ? 420 : 230) * scale,
      Math.ceil(selectedKeys.length / cols) * rowH + 60 * scale,
    );
  let box = {
    x: pad + 25 * scale,
    y: 260 * scale,
    w: W - pad * 2 - 50 * scale,
    h: Math.max(100 * scale, metricY - 300 * scale),
  };
  const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  box = {
    x: center.x - (box.w * settings.scale) / 2,
    y: center.y - (box.h * settings.scale) / 2,
    w: box.w * settings.scale,
    h: box.h * settings.scale,
  };
  const cardRoute =
    settings.template !== 'elevation' &&
    settings.template !== 'splits' &&
    settings.showRoute &&
    activity.availability.gps;
  if (settings.template === 'elevation') cardPart(drawElevation);
  else if (settings.template === 'splits') cardPart(drawSplits);
  else if (cardRoute) {
    const saved = box;
    if (settings.template === 'dashboard' && activity.availability.elevation)
      box = { ...box, w: box.w * 0.56 };
    drawRoute();
    box = saved;
  } else if (settings.template === 'dashboard') cardPart(drawChart);
  // the intro still draws the route on cards that don't show one; it shrinks away as the card arrives
  if (iv && !cardRoute && activity.availability.gps && iv.move < 1)
    drawRoute(true);
  if (
    settings.template === 'dashboard' &&
    activity.availability.elevation &&
    activity.availability.gps
  ) {
    const saved = box;
    box = { x: W * 0.65, y: box.y, w: W * 0.24, h: box.h };
    cardPart(drawElevation);
    box = saved;
  }
  if (settings.showMetrics) {
    cardPart(() =>
      selectedKeys.forEach((k, i) => {
        const [label, value] = metric(activity, k, settings, point),
          x = pad + ((i % cols) * (W - pad * 2)) / cols,
          y = metricY + Math.floor(i / cols) * rowH;
        text(label, x, y, 20, settings.accent);
        text(value, x, y + 47 * scale, 43);
      }),
    );
  }
  if (settings.caption)
    cardPart(() =>
      text(settings.caption, pad, H - 35 * scale, 24, settings.text, 500),
    );
  ctx.restore();
  function drawRoute(vanish = false) {
    const key = JSON.stringify([box, settings.trim, settings.rotation]);
    let cache = routeCache.get(activity);
    if (!cache || cache.key !== key) {
      const pts = privateRoute(activity.points, settings.trim),
        step = Math.max(1, Math.ceil(pts.length / 12000));
      // Keep gap boundaries and privacy transitions even when decimating ultra tracks.
      const reduced = pts.filter(
        (p, i) =>
          i % step === 0 ||
          i === pts.length - 1 ||
          p.breakBefore ||
          pts[i + 1]?.breakBefore ||
          p.private !== pts[i - 1]?.private ||
          p.private !== pts[i + 1]?.private,
      );
      cache = { key, projected: projectRoute(reduced, box, settings.rotation) };
      routeCache.set(activity, cache);
    }
    const projected = cache.projected,
      n = projected.length,
      style = settings.drawStyle || 'line';
    // what's drawn so far: by share of the route in the intro, by race time in the reveal
    const drawing = iv ? iv.draw < 1 : animated && !!point && progress < 1;
    const limit = iv ? Math.floor(iv.draw * (n - 1)) : n - 1,
      cut = !iv && animated && point ? point.time : null;
    const shown = (p, i) =>
      iv
        ? i <= limit
        : !(cut !== null && finite(p.point.time) && p.point.time > cut);
    const runsOf = (test) => {
      const runs = [];
      let cur = null;
      projected.forEach((p, i) => {
        if (!p || !test(p, i)) {
          cur = null;
          return;
        }
        if (!cur || p.point.breakBefore) runs.push((cur = []));
        cur.push(p);
      });
      return runs;
    };
    const runs = runsOf(shown),
      flat = runs.flat(),
      first = flat[0] || null,
      head = flat[flat.length - 1] || null;
    const bc = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    let z = 1;
    ctx.save();
    if (iv) {
      let s0 = 1,
        c = bc;
      if (settings.introPlace !== 'inplace') {
        const ib = {
          x: pad - ox,
          y: pad * 1.6 - oy,
          w: W - pad * 2,
          h: H - pad * 3.2,
        };
        s0 = Math.min(ib.w / box.w, ib.h / box.h);
        c = { x: ib.x + ib.w / 2, y: ib.y + ib.h / 2 };
      }
      const m = iv.move;
      if (vanish) z = s0 * (1 - m);
      else {
        z = s0 + (1 - s0) * m;
        c = { x: c.x + (bc.x - c.x) * m, y: c.y + (bc.y - c.y) * m };
      }
      if (z <= 0.001) {
        ctx.restore();
        return;
      }
      ctx.translate(c.x, c.y);
      ctx.scale(z, z);
      ctx.translate(-bc.x, -bc.y);
    } else if (drawing && settings.zoom > 0 && head) {
      // zoom-follow: ease in on the head after the start, back out before the finish
      const k0 = Math.max(0, Math.min(1, progress / 0.08, (1 - progress) / 0.12)),
        k = k0 * k0 * (3 - 2 * k0);
      z = 1 + settings.zoom * k;
      const f = { x: bc.x + (head.x - bc.x) * k, y: bc.y + (head.y - bc.y) * k };
      ctx.beginPath();
      ctx.rect(box.x - 30 * scale, box.y - 30 * scale, box.w + 60 * scale, box.h + 60 * scale);
      ctx.clip();
      ctx.translate(bc.x, bc.y);
      ctx.scale(z, z);
      ctx.translate(-f.x, -f.y);
    }
    const lw = (settings.thickness * scale) / z,
      hs = settings.headSize || 1;
    const trace = (rs) => {
      ctx.beginPath();
      rs.forEach((r) =>
        r.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))),
      );
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = settings.route;
    ctx.lineWidth = lw;
    if (drawing && style === 'ghost') {
      ctx.save();
      ctx.globalAlpha *= 0.22;
      trace(runsOf(() => true));
      ctx.stroke();
      ctx.restore();
    }
    trace(runs);
    const tailOf = (share) => {
      const keep = Math.max(2, Math.round(n * share));
      return flat.slice(-keep);
    };
    const strokeTail = (pts) => {
      ctx.beginPath();
      pts.forEach((p, i) =>
        i && !p.point.breakBefore ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
      ctx.stroke();
    };
    if (drawing && style === 'comet') {
      ctx.save();
      ctx.globalAlpha *= 0.3;
      ctx.stroke();
      ctx.restore();
      ctx.lineWidth = lw * 1.15;
      strokeTail(tailOf(settings.trail || 0.15));
    } else ctx.stroke();
    const dot = (p, r, color) => {
      if (!p) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (r * scale) / z, 0, Math.PI * 2);
      ctx.fill();
    };
    const ownHead = drawing && head && ['glow', 'comet', 'runner'].includes(style);
    if (ownHead && style === 'glow') {
      ctx.save();
      ctx.shadowColor = settings.accent;
      ctx.shadowBlur = 26 * scale * hs;
      ctx.strokeStyle = settings.accent;
      ctx.lineWidth = lw * 1.3;
      strokeTail(tailOf(0.03));
      ctx.restore();
    }
    if (ownHead && style !== 'runner') {
      ctx.save();
      ctx.shadowColor = settings.accent;
      ctx.shadowBlur = 24 * scale * hs;
      dot(head, 11 * hs, settings.accent);
      ctx.restore();
    }
    if (ownHead && style === 'runner') {
      const ph = ((iv ? iv.draw * 8 : progress * 24) % 1 + 1) % 1;
      ctx.save();
      ctx.strokeStyle = settings.accent;
      ctx.globalAlpha *= 1 - ph;
      ctx.lineWidth = (3 * scale) / z;
      ctx.beginPath();
      ctx.arc(head.x, head.y, ((12 + 26 * ph) * scale * hs) / z, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      dot(head, 12 * hs, settings.accent);
      dot(head, 5 * hs, settings.text);
    }
    if (settings.markers && !vanish) {
      dot(first, 9, settings.text);
      if (!ownHead) dot(head, animated ? 14 : 9, settings.accent);
    }
    ctx.restore();
  }
  function drawElevation() {
    const pts = activity.points.filter((p) => finite(p.elevation)),
      u = units(settings.imperial);
    if (pts.length < 2) return;
    let low = Infinity,
      high = -Infinity;
    pts.forEach((p) => {
      low = Math.min(low, p.elevation);
      high = Math.max(high, p.elevation);
    });
    const end = activity.points.at(-1).distanceM || 1;
    const xy = (p) => [
      box.x + (p.distanceM / end) * box.w,
      box.y + box.h - ((p.elevation - low) / Math.max(1, high - low)) * box.h,
    ];
    ctx.beginPath();
    let prev = null;
    pts.forEach((p) => {
      const [x, y] = xy(p);
      if (!prev || p.breakBefore) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      prev = p;
    });
    ctx.strokeStyle = settings.route;
    ctx.lineWidth = settings.thickness * scale;
    ctx.stroke();
    text(
      `${Math.round(low / u.elevation)}–${Math.round(high / u.elevation)} ${u.elevationLabel}  /  ${(end / u.distance).toFixed(2)} ${u.distanceLabel}`,
      box.x,
      box.y + box.h + 32 * scale,
      22,
      settings.accent,
    );
    if (point && finite(point.elevation)) {
      const [x, y] = xy(point);
      ctx.fillStyle = settings.accent;
      ctx.beginPath();
      ctx.arc(x, y, 10 * scale, 0, 7);
      ctx.fill();
      text(
        `${Math.round(point.elevation / u.elevation)} ${u.elevationLabel}`,
        x,
        Math.max(box.y + 25 * scale, y - 20 * scale),
        24,
        settings.accent,
      );
    }
  }
  function drawChart() {
    const pts = activity.points.filter((p) => finite(p.heartRate));
    if (pts.length < 2) return;
    let max = 1;
    pts.forEach((p) => (max = Math.max(max, p.heartRate)));
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = box.x + (i / (pts.length - 1)) * box.w,
        y = box.y + box.h * (1 - p.heartRate / max);
      if (!i || p.breakBefore) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = settings.route;
    ctx.lineWidth = settings.thickness * scale;
    ctx.stroke();
    text(
      'HEART RATE / BPM',
      box.x,
      box.y + box.h + 30 * scale,
      22,
      settings.accent,
    );
  }
  function drawSplits() {
    const laps = activity.laps.filter((l) => l.distance > 0 && l.duration > 0),
      page = laps.slice(settings.lapPage * 8, settings.lapPage * 8 + 8),
      u = units(settings.imperial);
    const paces = laps.map((l) => l.duration / l.distance),
      fast = Math.min(...paces),
      slow = Math.max(...paces);
    text(
      `RECORDED LAPS · ${settings.lapPage * 8 + 1}–${settings.lapPage * 8 + page.length} OF ${laps.length}`,
      box.x,
      box.y - 15 * scale,
      22,
      settings.accent,
    );
    page.forEach((l, i) => {
      const y = box.y + (i * box.h) / Math.max(1, page.length),
        p = l.duration / l.distance;
      ctx.globalAlpha = settings.opacity * 0.3;
      ctx.fillStyle = p === fast ? settings.accent : settings.route;
      ctx.fillRect(
        box.x,
        y,
        box.w * (p / slow),
        (box.h / Math.max(1, page.length)) * 0.7,
      );
      ctx.globalAlpha = settings.opacity;
      text(
        `${l.label}   ${(l.distance / u.distance).toFixed(2)} ${u.distanceLabel}   ${duration(l.duration)}   ${duration(p * u.distance)} /${u.distanceLabel}${p === fast ? '  FASTEST' : p === slow ? '  SLOWEST' : ''}`,
        box.x + 12 * scale,
        y + 30 * scale,
        24,
      );
    });
  }
}
