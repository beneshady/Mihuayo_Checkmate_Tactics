// US011 验收用只读静态服务器：仅本地回环，不写入仓库。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.map': 'application/json; charset=utf-8',
};

function startServer(root) {
  const base = path.resolve(root);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
      catch (e) { res.writeHead(400); res.end('bad request'); return; }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.join(base, pathname.replace(/^[/\\]+/, ''));
      if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      server, port: server.address().port,
      close: () => new Promise((done) => server.close(() => done())),
    }));
  });
}

module.exports = { startServer };
