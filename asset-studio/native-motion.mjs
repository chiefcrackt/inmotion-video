// Compile trusted library SVG geometry once. Frames then render synchronously on
// the same canvas clock used by PNG, MediaRecorder and offline alpha encoding.
import { icons, svg as iconSVG } from '../icon-pack/icons.mjs';
import { assets as motion, svg as motionSVG } from '../motion-stats/assets.mjs';
import {
  assets as spotlight,
  svg as spotlightSVG,
} from '../product-spotlight/assets.mjs';
const sources = new Map(icons.map((a) => ['icon:' + a.id, () => iconSVG(a)]));
import { frame as spotFrame, svg as spotSVG } from '../spot-it/artwork.mjs';
sources.set('signature:spot-it', () => spotSVG(spotFrame(3)));
for (const [prefix, items, svg, partPrefix] of [
  ['motion', motion, motionSVG, 'part'],
  ['spotlight', spotlight, spotlightSVG, 'spotlight-part'],
]) {
  for (const a of items) {
    sources.set(prefix + ':' + a.id, () => svg(a));
    for (const l of a.layers)
      sources.set(partPrefix + ':' + a.id + ':' + l.id, () =>
        svg(a, { layerId: l.id }),
      );
  }
}
const pending = new Map(),
  ready = new Map();
const clamp = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => 1 - (1 - clamp(v)) ** 3;
const back = (v) => {
  v = clamp(v) - 1;
  return 1 + 2.4 * v ** 3 + 1.4 * v ** 2;
};
const attrs = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'fill-rule',
  'opacity',
];
function geometry(el) {
  const n = (k) => Number(el.getAttribute(k) || 0),
    p = new Path2D(),
    tag = el.localName;
  if (tag === 'path') return new Path2D(el.getAttribute('d') || '');
  if (tag === 'circle') {
    p.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2);
    p.closePath();
  } else if (tag === 'ellipse') {
    p.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, Math.PI * 2);
    p.closePath();
  } else if (tag === 'rect') {
    const rx = n('rx') || n('ry'),
      ry = n('ry') || rx;
    p.roundRect(n('x'), n('y'), n('width'), n('height'), [{ x: rx, y: ry }]);
  } else if (tag === 'line') {
    p.moveTo(n('x1'), n('y1'));
    p.lineTo(n('x2'), n('y2'));
  } else if (tag === 'polygon' || tag === 'polyline') {
    const nums = (el.getAttribute('points') || '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    for (let i = 0; i < nums.length; i += 2)
      i ? p.lineTo(nums[i], nums[i + 1]) : p.moveTo(nums[i], nums[i + 1]);
    if (tag === 'polygon') p.closePath();
  } else throw Error('Unsupported asset geometry: ' + tag);
  return p;
}
function shape(el, inherited) {
  const style = { ...inherited };
  for (const k of attrs) if (el.hasAttribute(k)) style[k] = el.getAttribute(k);
  const length = el.getTotalLength(),
    steps = Math.max(8, Math.min(800, Math.ceil(length / 3))),
    points = [];
  for (let i = 0; i <= steps; i++) {
    const p = el.getPointAtLength((length * i) / steps),
      previous = points.at(-1);
    points.push({
      x: p.x,
      y: p.y,
      start:
        !previous ||
        Math.hypot(p.x - previous.x, p.y - previous.y) >
          (length / steps) * 2 + 0.1,
    });
  }
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  return {
    path: geometry(el),
    length,
    points,
    steps,
    style,
    bounds: {
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      y0: Math.min(...ys),
      y1: Math.max(...ys),
    },
  };
}
function collect(node, inherited, result = []) {
  const style = { ...inherited };
  for (const k of attrs)
    if (node.hasAttribute(k)) style[k] = node.getAttribute(k);
  if (node.localName === 'g') {
    for (const child of node.children) collect(child, style, result);
  } else if (!['title', 'desc', 'style'].includes(node.localName))
    result.push(shape(node, style));
  return result;
}
async function compile(id) {
  const source = sources.get(id);
  if (!source) throw Error('Unknown animation asset.');
  const root = new DOMParser().parseFromString(
    source(),
    'image/svg+xml',
  ).documentElement;
  if (
    root.localName !== 'svg' ||
    root.querySelector('parsererror,script,image,foreignObject')
  )
    throw Error('Invalid library vector.');
  const box = root
      .getAttribute('viewBox')
      .split(/[\s,]+/)
      .map(Number),
    units = [];
  const defaults = {
    fill: 'black',
    stroke: 'none',
    'stroke-width': '1',
    'stroke-linecap': 'butt',
    'stroke-linejoin': 'miter',
    'fill-rule': 'nonzero',
    opacity: '1',
  };
  for (const k of attrs)
    if (root.hasAttribute(k)) defaults[k] = root.getAttribute(k);
  // Browsers measure SVG geometry only while it belongs to a rendered document.
  // Keep the measuring SVG off-screen; frames use cached points after removal.
  root.style.cssText =
    'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  root.setAttribute('aria-hidden', 'true');
  document.body.append(root);
  try {
    for (const child of root.children) {
      if (['title', 'desc', 'style'].includes(child.localName)) continue;
      const shapes = collect(child, defaults);
      if (!shapes.length) continue;
      const fragment = root.cloneNode(false);
      fragment.removeAttribute('style');
      fragment.append(child.cloneNode(true));
      const image = new Image();
      image.src =
        'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(new XMLSerializer().serializeToString(fragment));
      await image.decode();
      const bounds = {
        x0: Math.min(...shapes.map((s) => s.bounds.x0)),
        x1: Math.max(...shapes.map((s) => s.bounds.x1)),
        y0: Math.min(...shapes.map((s) => s.bounds.y0)),
        y1: Math.max(...shapes.map((s) => s.bounds.y1)),
      };
      units.push({
        id: child.id || 'shape-' + units.length,
        shapes,
        image,
        bounds,
      });
    }
    const value = { id, width: box[2], height: box[3], units };
    ready.set(id, value);
    return value;
  } finally {
    root.remove();
  }
}
export function prepareNative(id) {
  if (!pending.has(id))
    pending.set(
      id,
      compile(id).catch((e) => {
        pending.delete(id);
        throw e;
      }),
    );
  return pending.get(id);
}
function pointAt(s, p) {
  const t = clamp(p) * s.steps,
    i = Math.min(s.steps, Math.floor(t)),
    j = Math.min(s.steps, i + 1),
    a = s.points[i],
    b = s.points[j],
    k = t - i;
  if (b.start && i !== j) return k < 0.5 ? a : b;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}
function partial(s, p, reverse = false) {
  if (p >= 1) return s.path;
  const path = new Path2D(),
    end = Math.min(s.steps, Math.floor(p * s.steps));
  for (let i = 0; i <= end; i++) {
    const index = reverse ? s.steps - i : i,
      v = s.points[index];
    if (!i || (reverse ? s.points[index + 1]?.start : v.start))
      path.moveTo(v.x, v.y);
    else path.lineTo(v.x, v.y);
  }
  const last = pointAt(s, reverse ? 1 - p : p),
    prev = s.points[reverse ? s.steps - end : end];
  if (
    Math.hypot(last.x - prev.x, last.y - prev.y) >
    (s.length / s.steps) * 2 + 0.1
  )
    path.moveTo(last.x, last.y);
  else path.lineTo(last.x, last.y);
  return path;
}
function drawShape(c, s, p = 1, trace = false, reverse = false) {
  if (p <= 0) return;
  const st = s.style,
    fill = st.fill && st.fill !== 'none',
    stroke = st.stroke && st.stroke !== 'none',
    base = c.globalAlpha;
  c.save();
  c.globalAlpha = base * Number(st.opacity || 1);
  c.lineCap = st['stroke-linecap'];
  c.lineJoin = st['stroke-linejoin'];
  const fillP = trace ? ease((p - 0.58) / 0.42) : 1;
  if (fill && fillP > 0) {
    c.globalAlpha = base * fillP;
    c.fillStyle = st.fill;
    c.fill(s.path, st['fill-rule']);
  }
  if (stroke || (trace && fill)) {
    c.globalAlpha = base * (stroke ? 1 : 1 - fillP);
    c.strokeStyle = stroke ? st.stroke : st.fill;
    c.lineWidth = stroke
      ? Number(st['stroke-width'])
      : Math.max(
          2,
          Math.min(s.bounds.x1 - s.bounds.x0, s.bounds.y1 - s.bounds.y0) *
            0.035,
        );
    c.setLineDash(
      stroke && st['stroke-dasharray']
        ? st['stroke-dasharray'].split(/[\s,]+/).map(Number)
        : [],
    );
    c.lineDashOffset = Number(st['stroke-dashoffset'] || 0);
    c.stroke(trace ? partial(s, p, reverse) : s.path);
  }
  c.restore();
}
function unitImage(c, u, a) {
  c.drawImage(u.image, 0, 0, a.width, a.height);
}
function order(a) {
  let priority = [];
  if (a.id.includes('route-trail')) priority = ['start', 'trail', 'finish'];
  else if (/feature-(left|right|pin)/.test(a.id))
    priority = ['point', 'leader', 'panel'];
  return [...a.units].sort((x, y) => {
    const xi = priority.indexOf(x.id),
      yi = priority.indexOf(y.id);
    return (xi < 0 ? 99 : xi) - (yi < 0 ? 99 : yi);
  });
}
function drawOn(c, a, p) {
  const units = order(a),
    count = units.length;
  units.forEach((u, i) => {
    const q = clamp(p * count - i);
    if (q >= 1) {
      unitImage(c, u, a);
      return;
    }
    const total = u.shapes.reduce((n, s) => n + s.length, 0);
    let offset = 0;
    for (const s of u.shapes) {
      const part = clamp((q * total - offset) / Math.max(1, s.length));
      drawShape(c, s, part, true);
      offset += s.length;
    }
  });
}
function build(c, a, p) {
  const units = order(a);
  units.forEach((u, i) => {
    const q = clamp((p * (units.length + 0.5) - i) / 1.5);
    if (q <= 0) return;
    if (q >= 1) {
      unitImage(c, u, a);
      return;
    }
    const b = u.bounds,
      cx = (b.x0 + b.x1) / 2,
      cy = (b.y0 + b.y1) / 2;
    if (/trail|leader|curve|divider|underline|stripe/.test(u.id)) {
      for (const s of u.shapes)
        drawShape(c, s, q, true, /feature-/.test(a.id) && u.id === 'leader');
      return;
    }
    c.save();
    if (/panel|card|label|shaft|fill|track/.test(u.id)) {
      c.beginPath();
      c.rect(
        b.x0 - 20,
        b.y0 - 20,
        (b.x1 - b.x0 + 40) * ease(q),
        b.y1 - b.y0 + 40,
      );
      c.clip();
    } else {
      const k = 0.45 + 0.55 * back(q);
      c.translate(cx, cy - (1 - ease(q)) * a.height * 0.08);
      c.scale(k, k);
      c.translate(-cx, -cy);
      c.globalAlpha *= clamp(q * 4);
    }
    unitImage(c, u, a);
    c.restore();
  });
}
function trace(c, a, p) {
  let target = null,
    score = -1;
  for (const u of a.units)
    for (const s of u.shapes) {
      if (!s.style.stroke || s.style.stroke === 'none') continue;
      const n =
        s.length + (/trail|leader|curve|progress|ring/.test(u.id) ? 100000 : 0);
      if (n > score) {
        score = n;
        target = { u, s };
      }
    }
  if (!target) {
    drawOn(c, a, p);
    return;
  }
  for (const u of a.units) {
    for (const s of u.shapes) {
      if (s === target.s)
        drawShape(c, s, clamp(p / 0.85), true, /feature-/.test(a.id));
      else {
        let q = 1;
        if (/panel|label|finish/.test(u.id)) q = ease((p - 0.7) / 0.3);
        c.save();
        c.globalAlpha *= q;
        drawShape(c, s);
        c.restore();
      }
    }
  }
  if (p < 0.99) {
    const s = target.s,
      point = pointAt(
        s,
        /feature-/.test(a.id) ? 1 - clamp(p / 0.85) : clamp(p / 0.85),
      ),
      r = Math.max(4, Number(s.style['stroke-width'] || 4) * 0.8);
    c.beginPath();
    c.arc(point.x, point.y, r, 0, Math.PI * 2);
    c.fillStyle = '#e8c96a';
    c.strokeStyle = '#0e1a2e';
    c.lineWidth = Math.max(2, r * 0.3);
    c.fill();
    c.stroke();
  }
}
function burst(c, a, p) {
  const spread = back(p),
    cx = a.width / 2,
    cy = a.height / 2;
  let index = 0;
  for (const u of a.units)
    for (const s of u.shapes) {
      const b = s.bounds,
        x = (b.x0 + b.x1) / 2,
        y = (b.y0 + b.y1) / 2,
        turn = (index++ % 2 ? 1 : -1) * Math.PI * 2 * ease(p),
        scale = 0.2 + 0.8 * ease(p);
      c.save();
      c.translate(cx + (x - cx) * spread, cy + (y - cy) * spread);
      c.rotate(turn);
      c.scale(scale, scale);
      c.translate(-x, -y);
      c.globalAlpha *= clamp(p * 5);
      drawShape(c, s);
      c.restore();
    }
}
function breakTape(c, a, p) {
  for (const u of a.units) {
    c.save();
    if (u.id.includes('tape')) {
      const side = u.id.startsWith('left') ? -1 : 1,
        q = ease((p - 0.22) / 0.78),
        b = u.bounds,
        x = (b.x0 + b.x1) / 2,
        y = (b.y0 + b.y1) / 2;
      c.translate(x + side * a.width * 0.27 * q, y + a.height * 0.16 * q);
      c.rotate(side * 0.35 * q);
      c.translate(-x, -y);
    } else c.globalAlpha *= ease(p / 0.18);
    unitImage(c, u, a);
    c.restore();
  }
}
function drop(c, a, p) {
  for (const u of a.units) {
    c.save();
    if (u.id === 'halo') {
      const q = clamp((p - 0.42) / 0.58),
        b = u.bounds,
        x = (b.x0 + b.x1) / 2,
        y = (b.y0 + b.y1) / 2,
        k = q === 1 ? 1 : 0.3 + 1.1 * Math.sin(q * Math.PI * 0.65);
      c.translate(x, y);
      c.scale(k, k);
      c.translate(-x, -y);
      c.globalAlpha *= ease(q);
    } else {
      c.translate(0, -a.height * 0.65 * (1 - back(clamp(p / 0.75))));
      c.globalAlpha *= ease(p / 0.12);
    }
    unitImage(c, u, a);
    c.restore();
  }
}
export function drawNative(c, id, mode, p, width, height) {
  const a = ready.get(id);
  if (!a) return false;
  if (p <= 0) return true;
  c.save();
  c.translate(-width / 2, -height / 2);
  c.scale(width / a.width, height / a.height);
  if (mode === 'draw') drawOn(c, a, p);
  else if (mode === 'build') build(c, a, p);
  else if (mode === 'trace') trace(c, a, p);
  else if (mode === 'burst') burst(c, a, p);
  else if (mode === 'break') breakTape(c, a, p);
  else if (mode === 'drop') drop(c, a, p);
  else {
    c.restore();
    return false;
  }
  c.restore();
  return true;
}
