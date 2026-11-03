import { byId } from './catalog.mjs';
import {
  formats,
  transform,
  entranceMotions,
  entranceProgress,
} from './model.mjs';
import { prepareNative, drawNative } from './native-motion.mjs';
import '../shared/exits.js';
import { frame as spotFrame, svg as spotSVG } from '../spot-it/artwork.mjs';
const spotFrames = [];
let spotReady;
function prepareSpot() {
  return (spotReady ||= Promise.all(
    Array.from({ length: 79 }, async (_, i) => {
      const im = new Image();
      im.src =
        'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(spotSVG(spotFrame(i / 30)));
      await im.decode();
      spotFrames[i] = im;
    }),
  ));
}
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
      .map(async (l) => {
        readyImages.set(l.asset, await image(l.asset));
        await prepareNative(l.asset);
        if (l.asset === 'signature:spot-it') await prepareSpot();
      }),
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
  // Apply the suite's shared exit to the complete transparent composition.
  // The background is drawn separately, so green screen never gets sliced.
  const exitOptions = {
    exStyle: state.exit ?? 'original',
    exLen: 0.6,
    exEase: 'linear',
    exHold: 0.1,
    exOrder: 'together',
  };
  const exitProgress = still
    ? 0
    : window.TimExits.progress(seconds, state.duration, exitOptions, 0, 1);
  window.TimExits.draw(
    c,
    exitProgress,
    exitOptions,
    { x: 0, y: 0, w, h },
    { W: w, H: h },
    () => {
      for (const l of state.layers) {
        if (!l.visible) continue;
        const b = box(l, w, h),
          t = transform(l, seconds, state.duration, still),
          unit = Math.min(w, h);
        const entrance = !still && entranceMotions.includes(l.motion),
          progress = entrance
            ? entranceProgress(l, seconds, state.duration)
            : 1;
        c.save();
        c.translate(b.x + t.x * unit, b.y + t.y * unit);
        c.rotate(t.rotation);
        c.scale(t.scale, t.scale);
        c.globalAlpha = t.alpha;
        if (entrance && l.motion === 'wipe') {
          c.beginPath();
          c.rect(-b.w / 2 - 2, -b.h / 2 - 3, (b.w + 4) * progress, b.h + 6);
          c.clip();
        }
        if (l.kind === 'asset') {
          const im = readyImages.get(l.asset);
          const native =
            entrance &&
            l.motion !== 'wipe' &&
            (progress < 1 || l.motion === 'break');
          if (entrance && l.motion === 'spot') {
            const spot = spotFrames[Math.min(78, Math.floor(progress * 78))];
            if (spot) c.drawImage(spot, -b.w / 2, -b.h / 2, b.w, b.h);
          } else if (native)
            drawNative(c, l.asset, l.motion, progress, b.w, b.h);
          else if (im) c.drawImage(im, -b.w / 2, -b.h / 2, b.w, b.h);
        } else {
          const size = (l.fontSize * unit) / 1080;
          c.font = `800 ${size}px "Barlow Condensed",Arial,sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillStyle = l.color;
          const lines = wrap(c, l.text, b.w);
          let remaining = Math.floor(
            lines.reduce((n, line) => n + [...line].length, 0) * progress,
          );
          lines.forEach((line, i) => {
            const chars = [...line],
              shown =
                entrance && l.motion === 'type'
                  ? chars.slice(0, Math.max(0, remaining)).join('')
                  : line;
            remaining -= chars.length;
            // Position partial text at the complete line's left edge, so it types in place.
            if (entrance && l.motion === 'type') {
              c.textAlign = 'left';
              c.fillText(
                shown,
                -c.measureText(line).width / 2,
                (i - (lines.length - 1) / 2) * size * 1.15,
              );
            } else
              c.fillText(shown, 0, (i - (lines.length - 1) / 2) * size * 1.15);
          });
        }
        c.restore();
      }
    },
  );
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
