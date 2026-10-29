export const VERSION = 1;
export const CATEGORIES = [
  'Glitch & Digital',
  'Impacts & Hits',
  'Whooshes & Movement',
  'Mechanical & Industrial',
  'UI & Notifications',
  'Atmosphere & Tension',
];
export const SOURCES = [
  'sine',
  'triangle',
  'sawtooth',
  'square',
  'noise',
  'filtered-noise',
  'sample',
];
export const clamp = (v, min, max) =>
  Math.max(min, Math.min(max, Number.isFinite(+v) ? +v : min));
export function layer(data = {}) {
  const d = {
    name: 'Layer',
    source: 'sine',
    enabled: true,
    mute: false,
    solo: false,
    volume: 0.45,
    start: 0,
    duration: 0.6,
    pitch: 0,
    pan: 0,
    fadeIn: 0.003,
    fadeOut: 0.08,
    reverse: false,
    frequency: 220,
    endFrequency: 80,
    modRate: 0,
    modDepth: 0,
    pulse: 0,
    attack: 0.003,
    decay: 0.12,
    sustain: 0.3,
    release: 0.15,
    lowpass: 18000,
    highpass: 20,
    resonance: 0.7,
    distortion: 0,
    reverb: 0,
    reverbTime: 1,
    delay: 0,
    delayTime: 0.18,
    trim: 0,
    assetId: '',
    assetName: '',
    ...data,
  };
  d.name = String(d.name).slice(0, 80);
  d.source = SOURCES.includes(d.source) ? d.source : 'sine';
  for (const k of ['enabled', 'mute', 'solo', 'reverse']) d[k] = Boolean(d[k]);
  for (const [k, a, b] of [
    ['volume', 0, 1],
    ['start', 0, 20],
    ['duration', 0.02, 12],
    ['pitch', -24, 24],
    ['pan', -1, 1],
    ['fadeIn', 0, 6],
    ['fadeOut', 0, 6],
    ['frequency', 20, 16000],
    ['endFrequency', 20, 16000],
    ['modRate', 0, 2000],
    ['modDepth', 0, 2000],
    ['pulse', 0, 80],
    ['attack', 0, 6],
    ['decay', 0.001, 6],
    ['sustain', 0, 1],
    ['release', 0.001, 6],
    ['lowpass', 30, 20000],
    ['highpass', 20, 18000],
    ['resonance', 0.1, 8],
    ['distortion', 0, 1],
    ['reverb', 0, 1],
    ['reverbTime', 0.1, 3],
    ['delay', 0, 0.8],
    ['delayTime', 0.03, 1],
    ['trim', 0, 600],
  ])
    d[k] = clamp(d[k], a, b);
  d.assetId = String(d.assetId || '').slice(0, 150);
  d.assetName = String(d.assetName || '').slice(0, 150);
  return Object.fromEntries(Object.keys(layerKeys).map((k) => [k, d[k]]));
}
const layerKeys = Object.fromEntries(
  'name source enabled mute solo volume start duration pitch pan fadeIn fadeOut reverse frequency endFrequency modRate modDepth pulse attack decay sustain release lowpass highpass resonance distortion reverb reverbTime delay delayTime trim assetId assetName'
    .split(' ')
    .map((k) => [k, 1]),
);
export function preset(data) {
  if (
    !data ||
    data.version !== VERSION ||
    !Array.isArray(data.layers) ||
    data.layers.length > 4 ||
    !data.layers.length
  )
    throw Error(
      'Unsupported preset: expected version 1 and one to four layers.',
    );
  return {
    version: VERSION,
    id: String(data.id || 'custom').slice(0, 150),
    name: String(data.name || 'Untitled sound').slice(0, 100),
    category: CATEGORIES.includes(data.category)
      ? data.category
      : CATEGORIES[0],
    seed: clamp(data.seed ?? 1, 1, 4294967295) >>> 0,
    layers: Array.from({ length: 4 }, (_, i) =>
      layer(data.layers[i] || { enabled: false, name: `Layer ${i + 1}` }),
    ),
  };
}
export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function activeLayers(p) {
  const solo = p.layers.some((l) => l.enabled && l.solo);
  return p.layers
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.enabled && !l.mute && (!solo || l.solo));
}
export function tail(l) {
  return Math.max(l.reverb ? l.reverbTime : 0, l.delay ? l.delayTime * 8 : 0);
}
export function duration(p) {
  return Math.max(
    0.05,
    ...activeLayers(p).map(({ l }) => l.start + l.duration + tail(l)),
  );
}
export function quickEdit(base, q) {
  const p = preset(base);
  p.layers = p.layers.map((l) =>
    layer({
      ...l,
      start: l.start * q.duration,
      duration: l.duration * q.duration,
      pitch: l.pitch + q.pitch,
      volume: l.volume * q.intensity,
      distortion: l.distortion + q.texture * 0.7,
      modDepth: l.modDepth + q.texture * 60,
    }),
  );
  return p;
}
export const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'sound';
