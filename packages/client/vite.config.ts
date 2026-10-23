import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

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
    proxy: {
      // In dev the game server runs separately; mirror the nginx route so the
      // client code is identical in dev and in the container build.
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      '/healthz': 'http://localhost:3000',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
