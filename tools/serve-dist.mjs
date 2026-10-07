// Servidor estático mínimo para e2e y pruebas locales del build de producción.
// Sirve dist/ con las mismas cabeceras de seguridad que debe aplicar el hosting
// (ver docs/security/headers.md). Sin dependencias externas.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve('dist/astrofinance/browser');
const PORT = Number(process.env.PORT ?? 4300);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; " +
    "base-uri 'self'; form-action 'none'; manifest-src 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  let file = normalize(join(ROOT, urlPath));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    // Fallback SPA: rutas de Angular → index.html.
    file = join(ROOT, 'index.html');
  }
  const type = MIME[extname(file)] ?? 'application/octet-stream';
  const cache = file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable';
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': cache });
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.error(`Sirviendo ${ROOT} en http://127.0.0.1:${PORT}`);
});
