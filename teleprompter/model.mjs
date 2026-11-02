// Pure timing helpers for the teleprompter. No DOM, so they can be unit tested.

export const WPM_MIN = 60;
export const WPM_MAX = 260;
export const WPM_DEFAULT = 140;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Words in a script. Any run of whitespace separates words.
export function wordCount(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
}

// Seconds needed to read the script aloud at a steady speed.
export function estimateSeconds(text, wpm) {
  if (!(wpm > 0)) return 0;
  return (wordCount(text) / wpm) * 60;
}

// "m:ss", for example 2:05. Never negative; rounds to whole seconds.
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// Pixels to scroll per second so the text keeps pace with the chosen speed.
// scrollable is the distance the text can move, in pixels.
export function scrollPxPerSecond(wpm, totalWords, scrollable) {
  if (!(wpm > 0) || !(totalWords > 0) || !(scrollable > 0)) return 0;
  return (wpm / 60) * (scrollable / totalWords);
}
