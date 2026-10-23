import { MAX_PLAYERS, TICK_HZ } from '@tland/shared';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: intFromEnv('GAME_PORT', 3000),
  host: process.env['GAME_HOST'] ?? '0.0.0.0',
  maxPlayers: intFromEnv('MAX_PLAYERS', MAX_PLAYERS),
  tickHz: intFromEnv('TICK_HZ', TICK_HZ),
} as const;
