const { chromium } = require('@playwright/test');
const { existsSync, mkdtempSync } = require('node:fs');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const types = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
};

async function launchBrowser() {
  if (process.env.CHROME_PATH) {
    return chromium.launch({
      headless: true,
      executablePath: process.env.CHROME_PATH,
    });
  }
  if (existsSync(chromium.executablePath())) {
    return chromium.launch({ headless: true });
  }
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ headless: true, channel });
    } catch (error) {
      // Only fall back when the browser is absent; surface launch failures.
      if (!/doesn't exist|not found|not installed/i.test(error.message))
        throw error;
    }
  }
  throw new Error(
    'Install Chromium with npx playwright install chromium, or set CHROME_PATH to your browser executable.',
  );
}

function server(port = 0) {
  return createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(
        new URL(req.url, 'http://localhost').pathname,
      );
      if (pathname.endsWith('/')) pathname += 'index.html';
      const filename = path.resolve(root, '.' + pathname);
      if (!filename.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const data = await readFile(filename);
      res.writeHead(200, {
        'Content-Type':
          types[path.extname(filename)] || 'application/octet-stream',
      });
      res.end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }).listen(port, '127.0.0.1');
}

function artifactDirectory(name) {
  const directory = mkdtempSync(path.join(tmpdir(), `tim-${name}-`));
  console.log('Browser test artifacts: ' + directory);
  return directory;
}

module.exports = { launchBrowser, server, artifactDirectory };
