import { MAX_PLAYERS, TICK_HZ } from '@tland/shared';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Origins allowed to open a socket, as a comma-separated list.
 *
 * Empty means "anyone", which is right behind the nginx deployment: the
 * client is served from the same origin and the game server is not reachable
 * from outside the container network. Once the server is on its own public
 * host, set this — WebSocket is not covered by CORS, so without it any page
 * anywhere could point itself at your room.
 */
function originsFromEnv(): readonly string[] {
  const raw = process.env['ALLOWED_ORIGINS'];
  if (raw === undefined) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
}

export const config = {
  port: intFromEnv('GAME_PORT', 3000),
  host: process.env['GAME_HOST'] ?? '0.0.0.0',
  maxPlayers: intFromEnv('MAX_PLAYERS', MAX_PLAYERS),
  tickHz: intFromEnv('TICK_HZ', TICK_HZ),
  allowedOrigins: originsFromEnv(),
} as const;
