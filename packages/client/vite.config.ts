import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/** Where the game server is, when running outside the containers. */
const gamePort = Number(process.env['E2E_GAME_PORT'] ?? process.env['GAME_PORT'] ?? 3000);

/**
 * Mirror the nginx routes so the client code is identical in dev, in preview
 * (which the end-to-end tests drive) and in the container build.
 */
const proxy = {
  '/ws': { target: `ws://127.0.0.1:${gamePort}`, ws: true },
  '/healthz': `http://127.0.0.1:${gamePort}`,
};

export default defineConfig({
  resolve: {
    alias: {
      '@tland/shared': fileURLToPath(
        new URL('../shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
