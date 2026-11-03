import { assets } from './assets.mjs';
import { toys } from '../weird-motion/artwork.mjs';
export const templates = new Map(assets.map((a) => ['spotlight:' + a.id, a]));
templates.set('signature:spot-it', { name: 'Spot it · signature callout' });
for (const toy of toys) templates.set('toy:' + toy.id, toy);
export function templateScene(id) {
  if (id.startsWith('toy:') && templates.has(id)) {
    const toy = templates.get(id),
      base = {
        x: 50,
        y: 50,
        size: 150,
        rotation: 0,
        opacity: 100,
        visible: true,
      };
    return {
      format: 'landscape',
      duration: 6,
      mode: 'transparent',
      exit: 'fade',
      layers: [
        {
          ...base,
          id: toy.id + '-graphic',
          kind: 'asset',
          asset: id,
          motion: 'perform',
          delay: 0,
          entrance: 2.8,
        },
        {
          ...base,
          id: toy.id + '-label',
          kind: 'text',
          text: toy.label,
          color: '#f6f4ef',
          fontSize: 48,
          x: 65,
          y: 50,
          size: 38,
          motion: 'type',
          delay: 2.8,
          entrance: 0.4,
        },
      ],
    };
  }
  if (id === 'signature:spot-it')
    return {
      format: 'landscape',
      duration: 6,
      mode: 'transparent',
      exit: 'fade',
      layers: [
        {
          id: 'spot-it-graphic',
          kind: 'asset',
          asset: id,
          x: 50,
          y: 50,
          size: 150,
          rotation: 0,
          opacity: 100,
          motion: 'spot',
          visible: true,
          delay: 0,
          entrance: 2.6,
        },
        {
          id: 'spot-it-label',
          kind: 'text',
          text: 'LOOK CLOSER',
          color: '#f6f4ef',
          fontSize: 52,
          x: 65.8,
          y: 30,
          size: 36,
          rotation: 0,
          opacity: 100,
          motion: 'type',
          visible: true,
          delay: 2.2,
          entrance: 0.4,
        },
      ],
    };
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
