import { writeFile } from 'node:fs/promises';
import { renderDashboard } from './render.mjs';
await writeFile(new URL('index.html', import.meta.url), renderDashboard());
console.log('Dashboard preview generated from the tool registry.');
