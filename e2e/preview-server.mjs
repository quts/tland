// Static client plus a WebSocket proxy, for the end-to-end suite.
//
// `vite preview` does not forward protocol upgrades, so `/ws` never reaches
// the game server under it. This stands in for nginx: the same two routes,
// the same origin, no extra dependencies.
import { createReadStream, promises as fs } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? 'packages/client/dist');
const PORT = Number(process.env.E2E_WEB_PORT ?? 4173);
const GAME_HOST = process.env.E2E_GAME_HOST ?? '127.0.0.1';
// Loopback is right for the test runner; override to reach it from outside.
const BIND_HOST = process.env.E2E_BIND_HOST ?? '127.0.0.1';
const GAME_PORT = Number(process.env.E2E_GAME_PORT ?? 3100);

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
]);

/** Resolve a request path inside ROOT, refusing anything that escapes it. */
async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = resolve(join(ROOT, normalize(decoded)));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + '/')) return null;
  try {
    const stats = await fs.stat(candidate);
    if (stats.isDirectory()) return resolveFile(join(decoded, 'index.html'));
    return candidate;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = req.url ?? '/';

  if (url.startsWith('/healthz')) {
    const proxied = httpRequest(
      { host: GAME_HOST, port: GAME_PORT, path: url, method: req.method },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxied.on('error', () => {
      res.writeHead(502).end('game server unreachable');
    });
    req.pipe(proxied);
    return;
  }

  const file = (await resolveFile(url)) ?? (await resolveFile('/index.html'));
  if (file === null) {
    res.writeHead(404).end('not found');
    return;
  }
  // The font alone is a couple of megabytes; letting a second tab reuse it
  // from cache is the difference between a fast suite and a timing-out one.
  const cacheable = url.startsWith('/assets/') || url.startsWith('/fonts/');
  res.writeHead(200, {
    'content-type': CONTENT_TYPES.get(extname(file)) ?? 'application/octet-stream',
    'cache-control': cacheable ? 'public, max-age=3600' : 'no-cache',
  });
  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
});

// Forward the upgrade handshake byte for byte, then pipe both directions.
server.on('upgrade', (req, socket, head) => {
  if (!(req.url ?? '').startsWith('/ws')) {
    socket.destroy();
    return;
  }

  const upstream = connect(GAME_PORT, GAME_HOST, () => {
    const headers = Object.entries(req.headers)
      .map(([key, value]) =>
        Array.isArray(value)
          ? value.map((item) => `${key}: ${item}`).join('\r\n')
          : `${key}: ${value}`,
      )
      .join('\r\n');
    upstream.write(`GET ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(PORT, BIND_HOST, () => {
  console.log(`[e2e] serving ${ROOT} on http://${BIND_HOST}:${PORT}`);
});
