import { icons } from '../icon-pack/icons.mjs';
import { assets } from '../motion-stats/assets.mjs';
export const catalog = Object.freeze([
  ...icons.map((a) => ({
    id: 'icon:' + a.id,
    name: a.name,
    pack: 'icons',
    category: a.category,
    width: 128,
    height: 128,
    src: new URL('../icon-pack/files/svg/' + a.id + '.svg', import.meta.url)
      .href,
  })),
  ...assets.map((a) => ({
    id: 'motion:' + a.id,
    name: a.name,
    pack: 'motion',
    category: a.category,
    width: a.width,
    height: a.height,
    src: new URL('../motion-stats/files/svg/' + a.id + '.svg', import.meta.url)
      .href,
    parts: a.layers.map((l) => ({
      id: 'part:' + a.id + ':' + l.id,
      name: a.name + ' / ' + l.id.replaceAll('-', ' '),
      pack: 'motion',
      category: a.category,
      width: a.width,
      height: a.height,
      src: new URL(
        '../motion-stats/files/layers/' + a.id + '/' + l.id + '.svg',
        import.meta.url,
      ).href,
    })),
  })),
]);
export const byId = new Map(
  catalog.flatMap((a) => [a, ...(a.parts || [])]).map((a) => [a.id, a]),
);
