import { WS_PATH } from '@tland/shared';
import { config } from './config.ts';
import { createGameServer } from './server.ts';

const server = createGameServer({
  maxPlayers: config.maxPlayers,
  tickHz: config.tickHz,
});

await server.listen(config.port, config.host);
console.log(
  `[game] listening on http://${config.host}:${config.port}` +
    ` (ws ${WS_PATH}, max ${config.maxPlayers} players, ${config.tickHz} Hz)`,
);

async function shutdown(signal: string): Promise<void> {
  console.log(`[game] ${signal} received, shutting down`);
  const forced = setTimeout(() => process.exit(0), 3000);
  forced.unref();
  await server.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
