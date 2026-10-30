import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const files = [
  'text-motion/index.html',
  'text-motion/app.js',
  'carousel-maker/positioning.mjs',
  'carousel-maker/editor.mjs',
  'carousel-maker/elements.mjs',
  'carousel-maker/photo.mjs',
  'carousel-maker/index.html',
  'carousel-maker/app.js',
  'carousel-maker/render.mjs',
  'carousel-maker/model.mjs',
  'index.html',
  'sound-forge/index.html',
  'sound-forge/app.mjs',
  'shared/sound/engine.mjs',
  'shared/sound/model.mjs',
  'shared/sound/storage.mjs',
  'shared/sound/picker.mjs',
  'title-maker/index.html',
];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const m of text.matchAll(
    /(?:src|href)="([^"#]+)"|(?:from\s*|import\()'([^']+)'/g,
  )) {
    const url = m[1] || m[2];
    if (/^(https?:|data:)/.test(url)) continue;
    await access(resolve(dirname(file), url));
  }
}
console.log(
  'GitHub Pages static entry points and relative module/assets verified. No compilation required.',
);
