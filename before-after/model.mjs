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

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Scale and crop an image to cover a frame, centred. Returns the source rectangle and the destination rectangle.
export function coverRects(imgW, imgH, frameW, frameH) {
  if (!(imgW > 0) || !(imgH > 0) || !(frameW > 0) || !(frameH > 0)) {
    return { src: { x: 0, y: 0, w: 0, h: 0 }, dst: { x: 0, y: 0, w: frameW || 0, h: frameH || 0 } };
  }
  const scale = Math.max(frameW / imgW, frameH / imgH);
  const srcW = frameW / scale;
  const srcH = frameH / scale;
  return {
    src: { x: (imgW - srcW) / 2, y: (imgH - srcH) / 2, w: srcW, h: srcH },
    dst: { x: 0, y: 0, w: frameW, h: frameH },
  };
}

// Where the divider sits, from 0 (far left) to 1 (far right). The Before image shows left of it, After right of it.
export const SPLIT_DEFAULT = 0.5;

// Timeline for the animated version: hold on Before, sweep the divider from the right edge to the left
// revealing After, then hold on After until the total length is reached.
export function timelineTimes(totalSeconds) {
  const total = clamp(Number(totalSeconds) || DEFAULT_LENGTH, MIN_LENGTH, MAX_LENGTH);
  const hold = 1.0;
  const sweep = Math.min(1.6, Math.max(0.8, total * 0.3));
  return { total, holdBefore: hold, sweep, holdAfter: Math.max(0.5, total - hold - sweep) };
}

// Divider position at time t (seconds from the start of the animation).
export function splitAt(t, totalSeconds) {
  const { holdBefore, sweep, total } = timelineTimes(totalSeconds);
  if (t <= holdBefore) return 1;
  if (t >= holdBefore + sweep || t >= total) return 0;
  const k = (t - holdBefore) / sweep;
  const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // ease in-out cubic
  return 1 - eased;
}

// Chosen frame for a label chip: a clear space at the top of the frame, scaled to the frame width.
export function labelSize(frameWidth) {
  return { font: Math.round(frameWidth * 0.042), pad: Math.round(frameWidth * 0.024) };
}
