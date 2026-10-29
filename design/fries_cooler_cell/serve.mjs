#!/usr/bin/env node
// Zero-dependency static server for the fries cooler cell. Serves design/ so
// the scene can reuse ../coffee_bar_3d/{vendor,editor,robot-library}.
//   node serve.mjs [--host 127.0.0.1] [--port 8770]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const app = '/' + path.basename(here) + '/';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const host = option('--host', '127.0.0.1');
const port = Number(option('--port', 8770));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname === '/') {
    res.writeHead(302, {Location: app}).end();
    return;
  }
  let file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (error, stat) => {
    if (!error && stat.isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, {Location: pathname + '/'}).end();
        return;
      }
      file = path.join(file, 'index.html');
    }
    fs.readFile(file, (readError, data) => {
      if (readError) {
        res.writeHead(404, {'Content-Type': 'text/plain'}).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  });
});

server.listen(port, host, () => {
  const {port: actual} = server.address();
  const shown = host.includes(':') ? `[${host}]` : host;
  console.log(`Fries cooler cell: http://${shown}:${actual}${app}`);
  console.log('Press Ctrl+C to stop.');
});
