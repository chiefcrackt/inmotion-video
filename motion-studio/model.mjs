// Motion Studio 2: pure model. No DOM, no network. Builds the spec that the
// browser preview reads and that the Remotion render project in ./render reads.
// Hybrid by design: the page previews and exports spec.json; rendering happens
// on the computer with `npm run render` inside ./render.

export const FPS = 30;

// Brand defaults come from the T.im brand kit (tim_brand_kit). Keep in sync.
export const BRAND = Object.freeze({
  navy: '#0E1A2E',
  gold: '#E8C96A',
  teal: '#2E9BAD',
  paper: '#F6F4EF',
  font: 'Barlow Condensed',
  headlineWeight: 900,
  eyebrowWeight: 700,
});

// Timings follow the kit's title card (5s) and lower third (4.5s). Events are in
// seconds from the start of the piece.
export const PIECE_TYPES = Object.freeze({
  'title-card': {
    label: 'Title card',
    duration: 5,
    aspects: ['16:9'],
    events: [
      { at: 0.5, type: 'hit' },
      { at: 3.7, type: 'glitch' },
      { at: 4.55, type: 'crt-off' },
    ],
  },
  'lower-third': {
    label: 'Lower third',
    duration: 4.5,
    aspects: ['16:9', '9:16'],
    events: [{ at: 0.3, type: 'hit' }],
  },
  custom: {
    label: 'Custom text',
    duration: 6,
    aspects: ['16:9', '9:16'],
    events: [{ at: 0.5, type: 'hit' }],
  },
});

const ASPECTS = Object.freeze({
  '16:9': { width: 1920, height: 1080, safeZone: { top: 0, bottom: 0 } },
  // Kit safe zone for 9:16: keep the top ~250px and bottom ~400px clear.
  '9:16': { width: 1080, height: 1920, safeZone: { top: 250, bottom: 400 } },
});

const BACKGROUNDS = Object.freeze(['navy', 'green']);
const LIMITS = Object.freeze({
  duration: { min: 2, max: 30 },
  bpm: { min: 60, max: 200 },
  headline: 60,
  eyebrow: 40,
  sub: 120,
});

function clampNumber(value, { min, max }, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanText(value, max) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Validates and normalizes user input into a full spec. Throws on input that
// cannot be rendered (unknown piece type, unsupported aspect, empty headline).
export function buildSpec(input = {}) {
  const type = input.type ?? 'title-card';
  const piece = PIECE_TYPES[type];
  if (!piece) throw new Error(`Unknown piece type: ${type}`);

  const aspect = input.aspect ?? piece.aspects[0];
  if (!ASPECTS[aspect]) throw new Error(`Unknown aspect: ${aspect}`);
  if (!piece.aspects.includes(aspect)) {
    throw new Error(`${piece.label} does not support ${aspect}`);
  }

  const background = input.background ?? 'navy';
  if (!BACKGROUNDS.includes(background)) {
    throw new Error(`Unknown background: ${background}`);
  }

  const headline = cleanText(input.headline, LIMITS.headline);
  if (!headline) throw new Error('A headline is required');

  const duration = clampNumber(
    input.duration ?? piece.duration,
    LIMITS.duration,
    piece.duration,
  );
  const bpm = clampNumber(input.bpm ?? 120, LIMITS.bpm, 120);
  const dims = ASPECTS[aspect];
  const brandOn = input.brand !== false;

  return {
    version: 1,
    type,
    aspect,
    width: dims.width,
    height: dims.height,
    fps: FPS,
    duration,
    frames: Math.round(duration * FPS),
    bpm,
    background,
    // Events beyond the chosen duration are dropped so custom lengths stay valid.
    events: piece.events.filter((e) => e.at < duration),
    scene: {
      eyebrow: cleanText(input.eyebrow, LIMITS.eyebrow),
      headline,
      sub: cleanText(input.sub, LIMITS.sub),
    },
    brand: {
      enabled: brandOn,
      ...BRAND,
      // The safe zone only applies when the brand layer is on, so text stays
      // clear of platform UI in vertical pieces.
      safeZone: brandOn ? dims.safeZone : { top: 0, bottom: 0 },
    },
  };
}

// State of every animated element at a given frame, for the preview and for
// checking the render. Times are in seconds.
export function frameState(spec, frame) {
  const t = Math.min(Math.max(frame, 0), spec.frames) / spec.fps;
  const ramp = (start, length) =>
    Math.min(1, Math.max(0, (t - start) / length));
  const glitch = spec.events.some(
    (e) => e.type === 'glitch' && Math.abs(t - e.at) < 0.1,
  );
  const crtOff = spec.events.some((e) => e.type === 'crt-off' && t >= e.at);
  return {
    t,
    eyebrowOpacity: ramp(0.2, 0.3),
    headlineProgress: ramp(0.5, 0.4),
    subOpacity: ramp(1.0, 0.4),
    glitch,
    crtOff,
  };
}

// Serialises a spec for download. Stable key order keeps diffs readable.
export function specToJson(spec) {
  return JSON.stringify(spec, null, 2) + '\n';
}

export { LIMITS, ASPECTS, BACKGROUNDS };
