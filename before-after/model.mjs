// Pure layout and timing helpers for the Before & After maker. No DOM, so they can be unit tested.

// Output frames, in pixels. Vertical for Reels, TikTok and Shorts; square and 4:5 for posts.
export const ASPECTS = Object.freeze({
  '9:16': { label: 'Vertical 9:16', width: 1080, height: 1920 },
  '4:5': { label: 'Portrait 4:5', width: 1080, height: 1350 },
  '1:1': { label: 'Square 1:1', width: 1080, height: 1080 },
  '16:9': { label: 'Widescreen 16:9', width: 1920, height: 1080 },
});

export const DEFAULT_ASPECT = '9:16';
export const DEFAULT_LENGTH = 5; // seconds for the animated version
export const MIN_LENGTH = 3;
export const MAX_LENGTH = 10;

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
export const SPLIT_DEFAULT = 0.5;

// Per-photo adjustments. Defaults show the photo filling the frame, centred, unrotated.
export const PHOTO_DEFAULTS = Object.freeze({ zoom: 1, panX: 0, panY: 0, rotation: 0, fit: 'fill' });

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Where a photo is drawn inside the frame. Returns the destination rectangle, in frame pixels.
// fill: the photo covers the frame and the overflow can be panned. fit: the whole photo shows,
// with bars where it does not reach the edges. zoom multiplies the fill/fit scale. pan runs from -1 to 1
// and moves the photo to its edge of available overflow, so 0 is centred.
export function placeImage(imgW, imgH, frameW, frameH, adjust = {}) {
  const a = { ...PHOTO_DEFAULTS, ...adjust };
  const rot = ((Math.round(a.rotation / 90) % 4) + 4) % 4;
  // Rotating a photo a quarter turn swaps its width and height.
  const w = rot % 2 ? imgH : imgW;
  const h = rot % 2 ? imgW : imgH;
  if (!(w > 0) || !(h > 0) || !(frameW > 0) || !(frameH > 0)) {
    return { x: 0, y: 0, w: 0, h: 0, rotation: rot * 90 };
  }
  const zoom = clamp(Number(a.zoom) || 1, ZOOM_MIN, ZOOM_MAX);
  const base = a.fit === 'fit' ? Math.min(frameW / w, frameH / h) : Math.max(frameW / w, frameH / h);
  const scale = base * zoom;
  const dw = w * scale;
  const dh = h * scale;
  const overX = Math.max(0, (dw - frameW) / 2);
  const overY = Math.max(0, (dh - frameH) / 2);
  return {
    x: (frameW - dw) / 2 + clamp(Number(a.panX) || 0, -1, 1) * overX,
    y: (frameH - dh) / 2 + clamp(Number(a.panY) || 0, -1, 1) * overY,
    w: dw,
    h: dh,
    rotation: rot * 90,
  };
}

// How far, in frame pixels, a photo can move in each direction before its edge shows. Used to turn
// a drag into pan values.
export function panRange(imgW, imgH, frameW, frameH, adjust = {}) {
  const r = placeImage(imgW, imgH, frameW, frameH, { ...adjust, panX: 0, panY: 0 });
  return { x: Math.max(0, (r.w - frameW) / 2), y: Math.max(0, (r.h - frameH) / 2) };
}

// Timeline for the animated version: hold on Before, change to After, then hold on After until the total length.
export function timelineTimes(totalSeconds) {
  const total = clamp(Number(totalSeconds) || DEFAULT_LENGTH, MIN_LENGTH, MAX_LENGTH);
  const hold = 1.0;
  const sweep = Math.min(1.6, Math.max(0.8, total * 0.3));
  return { total, holdBefore: hold, sweep, holdAfter: Math.max(0.5, total - hold - sweep) };
}

// Wipe: divider position at time t, from 1 (all Before) to 0 (all After), eased in and out.
export function splitAt(t, totalSeconds) {
  const { holdBefore, sweep, total } = timelineTimes(totalSeconds);
  if (t <= holdBefore) return 1;
  if (t >= holdBefore + sweep || t >= total) return 0;
  const k = (t - holdBefore) / sweep;
  const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  return 1 - eased;
}

// "Both" ending: after the reveal, the two photos move into their own halves and stay there.
// Pause on After alone first, then slide the divider from the edge to the middle.
const PANEL_PAUSE = 0.4;
const PANEL_MOVE = 1.0;
export function panelStart(totalSeconds) {
  const { holdBefore, sweep } = timelineTimes(totalSeconds);
  return holdBefore + sweep + PANEL_PAUSE;
}

// Returns where the divider sits (0 = After fills the frame, 0.5 = each photo has half), or null before the move starts.
export function panelAt(t, totalSeconds) {
  const { total } = timelineTimes(totalSeconds);
  const start = panelStart(totalSeconds);
  if (t < start) return null;
  const move = Math.min(PANEL_MOVE, (total - start) * 0.6);
  if (t >= start + move) return 0.5;
  const k = (t - start) / move;
  const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  return 0.5 * eased;
}

// Fade: how much After shows at time t, from 0 (all Before) to 1 (all After).
export function fadeAt(t, totalSeconds) {
  const { holdBefore, sweep, total } = timelineTimes(totalSeconds);
  if (t <= holdBefore) return 0;
  if (t >= holdBefore + sweep || t >= total) return 1;
  const k = (t - holdBefore) / sweep;
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

// Label chip sizes, scaled to the frame's shorter side so they stay proportionate in every format.
export function labelSize(frameWidth, frameHeight = frameWidth) {
  const s = Math.min(frameWidth, frameHeight);
  return { font: Math.round(s * 0.042), pad: Math.round(s * 0.024) };
}
