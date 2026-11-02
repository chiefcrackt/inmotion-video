import { assets } from './assets.mjs';
export const templates = new Map(assets.map((a) => ['spotlight:' + a.id, a]));
export function templateScene(id) {
  const a = templates.get(id);
  if (!a) throw Error('Unknown Product Spotlight template.');
  const size = 88,
    x = 50,
    y = a.height / a.width > 0.7 ? 46 : 64,
    scale = (1080 * size) / 100 / a.width;
  const base = {
    x,
    y,
    size,
    rotation: 0,
    opacity: 100,
    motion: 'none',
    visible: true,
  };
  return {
    format: 'portrait',
    duration: 4,
    mode: 'transparent',
    layers: [
      { ...base, id: a.id + '-graphic', kind: 'asset', asset: id },
      ...a.texts.map((t, i) => ({
        ...base,
        id: a.id + '-text-' + i,
        kind: 'text',
        text: t.value,
        color: t.color,
        fontSize: Math.max(12, Math.round(t.fontSize * scale)),
        x: x + (((t.x - a.width / 2) * scale) / 1080) * 100,
        y: y + (((t.y - a.height / 2) * scale) / 1920) * 100,
        size: ((t.width * scale) / 1080) * 100,
      })),
    ],
  };
}
