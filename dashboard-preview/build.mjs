import { writeFile } from 'node:fs/promises';
import { renderDashboard, renderHomepage } from './render.mjs';
await writeFile(new URL('index.html', import.meta.url), renderDashboard());
await writeFile(new URL('../index.html', import.meta.url), renderHomepage());
console.log('Homepage and dashboard preview generated from the tool registry.');
