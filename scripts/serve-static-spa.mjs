// Serve a built directory the way Firebase Hosting serves dist/: files as they
// are, and anything that does not exist answered with index.html (the SPA
// rewrite in firebase.json) — including a request for a deleted chunk, which
// is how a tab that outlived a deploy fails. For local timing and recovery
// checks only; never exposed beyond 127.0.0.1.
//
//   node scripts/serve-static-spa.mjs <dir> [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3] || 5303);
const TYPES = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon',
};

http.createServer((request, response) => {
  const pathname = decodeURIComponent(String(request.url || '/').split('?')[0]);
  let file = path.join(directory, pathname);
  const exists = file.startsWith(directory) && fs.existsSync(file) && fs.statSync(file).isFile();
  if (!exists) file = path.join(directory, 'index.html');
  if (!fs.existsSync(file)) {
    response.writeHead(404);
    response.end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`serving ${directory} on http://127.0.0.1:${port}`));
