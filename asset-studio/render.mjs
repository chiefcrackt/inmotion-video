import { byId } from './catalog.mjs';
import { formats, transform } from './model.mjs';
const images = new Map();
export async function image(id) {
  if (images.has(id)) return images.get(id);
  const item = byId.get(id);
  if (!item) throw Error('Unknown library asset.');
  const promise = new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => {
      images.delete(id);
      reject(
        Error(
          'Could not load ' +
            item.name +
            '. Check your connection and try again.',
        ),
      );
    };
    im.src = item.src;
  });
  images.set(id, promise);
  return promise;
}
const readyImages = new Map();
let measureContext;
export async function prepare(state) {
  await Promise.all(
    state.layers
      .filter((l) => l.kind === 'asset')
      .map(async (l) => readyImages.set(l.asset, await image(l.asset))),
  );
}
export function box(layer, width, height) {
  const w = (Math.min(width, height) * layer.size) / 100,
    asset = byId.get(layer.asset);
  let h;
  if (layer.kind === 'text') {
    measureContext ||= document.createElement('canvas').getContext('2d');
    const size = (layer.fontSize * Math.min(width, height)) / 1080;
    measureContext.font = `800 ${size}px "Barlow Condensed",Arial,sans-serif`;
    h = size * 1.15 * wrap(measureContext, layer.text, w).length;
  } else h = (w * asset.height) / asset.width;
  return { x: (width * layer.x) / 100, y: (height * layer.y) / 100, w, h };
}
function wrap(ctx, text, width) {
  const result = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const char of para) {
      if (ctx.measureText(line + char).width > width && line) {
        result.push(line);
        line = '';
      }
      line += char;
    }
    result.push(line);
  }
  return result.slice(0, 6);
}
export function render(
  canvas,
  state,
  seconds = 0,
  { still = false, green = false } = {},
) {
  const [w, h] = formats[state.format];
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, w, h);
  if (green) {
    c.fillStyle = '#00ff00';
    c.fillRect(0, 0, w, h);
  }
  for (const l of state.layers) {
    if (!l.visible) continue;
    const b = box(l, w, h),
      t = transform(l, seconds, state.duration, still),
      unit = Math.min(w, h);
    c.save();
    c.translate(b.x + t.x * unit, b.y + t.y * unit);
    c.rotate(t.rotation);
    c.scale(t.scale, t.scale);
    c.globalAlpha = t.alpha;
    if (l.kind === 'asset') {
      const im = readyImages.get(l.asset);
      if (im) c.drawImage(im, -b.w / 2, -b.h / 2, b.w, b.h);
    } else {
      const size = (l.fontSize * unit) / 1080;
      c.font = `800 ${size}px "Barlow Condensed",Arial,sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = l.color;
      const lines = wrap(c, l.text, b.w);
      lines.forEach((line, i) =>
        c.fillText(line, 0, (i - (lines.length - 1) / 2) * size * 1.15),
      );
    }
    c.restore();
  }
}
export function selection(canvas, state, id) {
  const [w, h] = formats[state.format];
  canvas.width = w;
  canvas.height = h;
  const l = state.layers.find((l) => l.id === id);
  if (!l || !l.visible) return;
  const b = box(l, w, h),
    c = canvas.getContext('2d');
  c.translate(b.x, b.y);
  c.rotate((l.rotation * Math.PI) / 180);
  c.strokeStyle = '#ffffff';
  c.lineWidth = Math.min(w, h) / 360;
  c.setLineDash([10, 8]);
  c.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
}
export function hitTest(state, x, y) {
  const [w, h] = formats[state.format];
  return [...state.layers].reverse().find((l) => {
    if (!l.visible || l.opacity === 0) return false;
    const b = box(l, w, h),
      a = (-l.rotation * Math.PI) / 180,
      dx = x - b.x,
      dy = y - b.y,
      xx = dx * Math.cos(a) - dy * Math.sin(a),
      yy = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(xx) <= b.w / 2 && Math.abs(yy) <= b.h / 2;
  });
}
