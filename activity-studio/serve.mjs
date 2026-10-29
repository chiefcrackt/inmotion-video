import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd(),
  types = {
    '.html': 'text/html',
    '.mjs': 'text/javascript',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };
export function server(port = 4173) {
  return createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const filename = path.resolve(root, '.' + p);
      if (!filename.startsWith(root + path.sep)) throw Error('Invalid path');
      const data = await readFile(filename);
      res.writeHead(200, {
        'Content-Type':
          types[path.extname(filename)] || 'application/octet-stream',
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }).listen(port, '127.0.0.1');
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve('activity-studio/serve.mjs')
) {
  server();
  console.log('Local: http://127.0.0.1:4173/activity-studio/');
}
