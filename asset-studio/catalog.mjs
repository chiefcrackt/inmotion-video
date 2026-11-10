import { icons } from '../icon-pack/icons.mjs?v=c85119a0';
import { assets } from '../motion-stats/assets.mjs?v=45b9e83c';
import { assets as spotlight } from '../product-spotlight/assets.mjs?v=8b7a8ff8';
import { toys } from '../weird-motion/artwork.mjs?v=0496a43e';
export const catalog = Object.freeze([
  ...toys
    .flatMap((a) => [
      a,
      { ...a, id: a.id + '-solo', name: a.name + ' · standalone' },
    ])
    .map((a) => ({
      id: 'toy:' + a.id,
      name: a.name,
      pack: 'weird',
      category: 'motion toys',
      width: 960,
      height: 540,
      src: new URL('../weird-motion/files/' + a.id + '.svg', import.meta.url)
        .href,
    })),
  {
    id: 'signature:spot-it',
    name: 'Spot it · signature callout',
    pack: 'spotlight',
    category: 'signature',
    width: 960,
    height: 540,
    src: new URL('../spot-it/complete-blank.svg', import.meta.url).href,
  },
  ...spotlight.map((a) => ({
    id: 'spotlight:' + a.id,
    name: a.name,
    pack: 'spotlight',
    category: a.category,
    width: a.width,
    height: a.height,
    src: new URL(
      '../product-spotlight/files/svg/' + a.id + '.svg',
      import.meta.url,
    ).href,
    parts: a.layers.map((l) => ({
      id: 'spotlight-part:' + a.id + ':' + l.id,
      name: a.name + ' / ' + l.id.replaceAll('-', ' '),
      pack: 'spotlight',
      category: a.category,
      width: a.width,
      height: a.height,
      src: new URL(
        '../product-spotlight/files/layers/' + a.id + '/' + l.id + '.svg',
        import.meta.url,
      ).href,
    })),
  })),
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
