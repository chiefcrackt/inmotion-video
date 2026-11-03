export const COLORS = Object.freeze({
  navy: '#0E1A2E',
  gold: '#E8C96A',
  teal: '#2E9BAD',
  paper: '#F6F4EF',
});
export const PRESETS = Object.freeze({
  moving: {
    name: 'Keep Moving',
    theme: 'navy',
    eyebrow: 'T.im / IN MOTION',
    headline: 'KEEP\nMOVING',
    subline: 'One more wave. One more mile.',
  },
  flow: {
    name: 'Find Your Flow',
    theme: 'paper',
    eyebrow: 'T.im / OUT THERE',
    headline: 'FIND\nYOUR\nFLOW',
    subline: 'Go where the good energy goes.',
  },
  banner: {
    name: 'YouTube Banner',
    theme: 'navy',
    eyebrow: '',
    headline: '',
    subline: '',
  },
});
export const LAYERS = [
  'eyebrow',
  'headline',
  'subline',
  'footer',
  'waves',
  'stripes',
  'slash',
  'border',
  'hud',
];
export function create(id = 'moving') {
  const p = PRESETS[id] || PRESETS.moving;
  return {
    version: 1,
    preset: PRESETS[id] ? id : 'moving',
    ...p,
    handle: 'tristan.inmotion',
    motion: 'flow',
    duration: 6,
    speed: 1,
    sound: 'none',
    volume: 35,
    textSize: 100,
    waveSize: 100,
    waveY: 0,
    stripeOpacity: 5,
    textY: 0,
    layers: Object.fromEntries(LAYERS.map((k) => [k, true])),
  };
}
export function validate(raw) {
  if (!raw || raw.version !== 1 || !PRESETS[raw.preset])
    throw Error('Choose a T.im Brand Assets project (version 1).');
  const s = create(raw.preset);
  for (const key of ['eyebrow', 'headline', 'subline', 'handle']) {
    if (typeof raw[key] !== 'string' || raw[key].length > 240)
      throw Error('Invalid text in project.');
    s[key] = raw[key];
  }
  for (const [key, options] of Object.entries({
    theme: ['navy', 'paper'],
    motion: ['none', 'flow', 'reveal', 'glitch'],
    sound: ['none', 'whoosh', 'pulse'],
  })) {
    if (!options.includes(raw[key])) throw Error('Invalid ' + key + '.');
    s[key] = raw[key];
  }
  for (const [key, min, max] of [
    ['duration', 2, 15],
    ['speed', 0.25, 3],
    ['volume', 0, 100],
    ['textSize', 50, 125],
    ['waveSize', 50, 150],
    ['waveY', -20, 15],
    ['stripeOpacity', 0, 15],
    ['textY', -5, 5],
  ]) {
    if (!Number.isFinite(raw[key]) || raw[key] < min || raw[key] > max)
      throw Error('Invalid ' + key + '.');
    s[key] = raw[key];
  }
  for (const key of LAYERS) {
    if (typeof raw.layers?.[key] !== 'boolean') throw Error('Invalid layers.');
    s.layers[key] = raw.layers[key];
  }
  return s;
}
export function dimensions(s) {
  return s.preset === 'banner' ? [2560, 1440] : [1080, 1920];
}
export function cueTimes(s) {
  return s.preset === 'banner'
    ? [0]
    : Array.from(
        { length: Math.max(1, s.headline.split('\n').filter(Boolean).length) },
        (_, i) =>
          0.05 +
          (i * s.duration) /
            Math.max(1, s.headline.split('\n').filter(Boolean).length),
      );
}
// The loop is split evenly between headline lines. `elapsed` is seconds since
// the current line appeared; every word-level effect is keyed to it.
export function beatAt(s, t) {
  const lines = s.headline.toUpperCase().split('\n').filter(Boolean);
  const count = Math.max(1, lines.length);
  const length = s.duration / count;
  const clamped = Math.min(Math.max(0, t), s.duration - 1e-9);
  const index = Math.min(count - 1, Math.floor(clamped / length));
  return {
    line: lines[index] || '',
    index,
    count,
    length,
    elapsed: clamped - index * length,
  };
}
export function headlineAt(s, t) {
  return beatAt(s, t).line;
}
