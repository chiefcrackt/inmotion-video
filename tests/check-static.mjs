import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const files = [
  'social-post-studio/index.html',
  'social-post-studio/studio.js',
  'runner-animator/index.html',
  'runner-animator/studio.js',
  'publishing-studio/index.html',
  'publishing-studio/studio.js',
  'content-studio/index.html',
  'content-studio/studio.js',
  'text-and-titles/index.html',
  'text-and-titles/studio.js',
  'celebration-studio/index.html',
  'celebration-studio/studio.js',
  'brand-assets/index.html',
  'brand-assets/app.mjs',
  'brand-assets/audio.mjs',
  'brand-assets/render.mjs',
  'shared/project-sync.mjs',
  'shared/project-store.mjs',
  'shared/project-drive.mjs',
  'shared/drive-controls.mjs',
  'shared/drive-export.mjs',
  'content-planner/index.html',
  'content-planner/app.mjs',
  'shoot-planner/index.html',
  'teleprompter/index.html',
  'before-after/index.html',
  'before-after/model.mjs',
  'teleprompter/model.mjs',
  'text-motion/index.html',
  'text-motion/app.js',
  'text-motion/alpha-video.js',
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
  'beat-bed/index.html',
  'tier-list/index.html',
  'shared/sound/beat.mjs',
  'sound-forge/app.mjs',
  'shared/sound/engine.mjs',
  'shared/sound/model.mjs',
  'shared/sound/storage.mjs',
  'shared/sound/picker.mjs',
  'title-maker/index.html',
  'video-framer/index.html',
];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const m of text.matchAll(
    /(?:src|href)="([^"#]+)"|(?:from\s*|import\()'([^']+)'/g,
  )) {
    const url = m[1] || m[2];
    if (/^(https?:|data:)/.test(url)) continue;
    await access(resolve(dirname(file), url.split(/[?#]/)[0]));
  }
}
console.log(
  'GitHub Pages static entry points and relative module/assets verified. No compilation required.',
);
