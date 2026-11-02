import { byId } from './catalog.mjs';
export const formats = {
  square: [1080, 1080],
  landscape: [1920, 1080],
  portrait: [1080, 1920],
};
export const motions = ['none', 'pulse', 'float', 'nudge', 'spin', 'pop'];
export const initial = () => ({
  format: 'square',
  duration: 4,
  mode: 'transparent',
  layers: [],
});
export const clone = (v) => JSON.parse(JSON.stringify(v));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function number(v, min, max, name) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    throw Error('Invalid ' + name + '.');
  return v;
}
export function validate(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.format !== 'string' ||
    !Object.hasOwn(formats, input.format) ||
    !['transparent', 'green'].includes(input.mode)
  )
    throw Error('Invalid canvas settings.');
  const duration = number(input.duration, 1, 12, 'duration');
  if (![2, 4, 6, 8].includes(duration))
    throw Error('Choose a 2, 4, 6 or 8 second animation.');
  if (!Array.isArray(input.layers) || input.layers.length > 12)
    throw Error('Use at most 12 layers.');
  const ids = new Set();
  const layers = input.layers.map((l) => {
    if (
      !l ||
      typeof l.id !== 'string' ||
      !/^[a-z0-9-]{1,80}$/i.test(l.id) ||
      ids.has(l.id)
    )
      throw Error('Invalid layer ID.');
    ids.add(l.id);
    if (
      !['asset', 'text'].includes(l.kind) ||
      !motions.includes(l.motion) ||
      typeof l.visible !== 'boolean'
    )
      throw Error('Invalid layer settings.');
    const out = {
      id: l.id,
      kind: l.kind,
      x: number(l.x, 0, 100, 'horizontal position'),
      y: number(l.y, 0, 100, 'vertical position'),
      size: number(l.size, 5, 160, 'size'),
      rotation: number(l.rotation, -180, 180, 'rotation'),
      opacity: number(l.opacity, 0, 100, 'opacity'),
      motion: l.motion,
      visible: l.visible,
    };
    if (l.kind === 'asset') {
      if (!byId.has(l.asset)) throw Error('Unknown library asset.');
      out.asset = l.asset;
    } else {
      if (
        typeof l.text !== 'string' ||
        l.text.length > 240 ||
        !/^#[0-9a-f]{6}$/i.test(l.color)
      )
        throw Error('Invalid text layer.');
      out.text = l.text;
      out.color = l.color;
      out.fontSize = number(l.fontSize, 12, 240, 'text size');
    }
    return out;
  });
  return { format: input.format, duration, mode: input.mode, layers };
}
export function newLayer(kind, asset) {
  const l = {
    id: crypto.randomUUID(),
    kind,
    x: 50,
    y: 50,
    size: 45,
    rotation: 0,
    opacity: 100,
    motion: 'none',
    visible: true,
  };
  return kind === 'asset'
    ? { ...l, asset }
    : { ...l, text: 'YOUR TEXT', fontSize: 80, color: '#f6f4ef' };
}
export function splitLayer(state, id) {
  const index = state.layers.findIndex((l) => l.id === id),
    l = state.layers[index],
    parts = l?.kind === 'asset' ? byId.get(l.asset)?.parts : null;
  if (!parts) throw Error('Choose a layered Motion + Stats graphic.');
  if (state.layers.length - 1 + parts.length > 12)
    throw Error('Remove a layer first to make room for these parts.');
  return [
    ...state.layers.slice(0, index),
    ...parts.map((p) => ({ ...l, id: crypto.randomUUID(), asset: p.id })),
    ...state.layers.slice(index + 1),
  ];
}
export function transform(layer, seconds, duration, still = false) {
  const p = (((seconds % duration) + duration) % duration) / duration,
    s = Math.sin(p * Math.PI * 2);
  const out = {
    x: 0,
    y: 0,
    scale: 1,
    rotation: (layer.rotation * Math.PI) / 180,
    alpha: layer.opacity / 100,
  };
  if (still) return out;
  if (layer.motion === 'pulse') out.scale = 1 + 0.08 * s;
  if (layer.motion === 'float') out.y = -0.025 * s;
  if (layer.motion === 'nudge') out.x = 0.035 * s;
  if (layer.motion === 'spin') out.rotation += p * Math.PI * 2;
  if (layer.motion === 'pop') {
    const ease = (t) => 1 - (1 - t) ** 3;
    const k = ease(Math.min(1, p / 0.18, (1 - p) / 0.18));
    out.scale = 0.7 + 0.3 * k;
    out.alpha *= k;
  }
  return out;
}
