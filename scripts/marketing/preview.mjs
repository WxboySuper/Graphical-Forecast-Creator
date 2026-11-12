/**
 * Local preview server for the built marketing site (marketing/dist). It maps
 * clean URLs such as /pricing/ to their index.html files. Run
 * `pnpm run marketing:build && pnpm run marketing:preview`.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKETING_CSP } from '../../cloudflare/marketing-worker-response.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'marketing', 'dist');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.ico': 'image/x-icon' };

const resolveFile = (pathname) => {
  const direct = path.join(ROOT, decodeURIComponent(pathname));
  if (!direct.startsWith(ROOT)) return path.join(ROOT, '404.html');
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  const index = path.join(direct, 'index.html');
  return existsSync(index) ? index : path.join(ROOT, '404.html');
};

const port = Number(process.env.PORT) || 4173;
createServer((request, response) => {
  const file = resolveFile(new URL(request.url, 'http://localhost').pathname);
  response.writeHead(file.endsWith('404.html') ? 404 : 200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'content-security-policy': MARKETING_CSP });
  response.end(readFileSync(file));
}).listen(port, () => process.stdout.write(`Marketing preview on http://localhost:${port}\n`));
