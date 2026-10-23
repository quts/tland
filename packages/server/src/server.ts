import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
  WS_PATH,
  parseClientMessage,
  type ServerMessage,
} from '@tland/shared';
import { Room, type Connection } from './room.ts';
import { normalizeNickname } from './validation.ts';

export interface GameServerOptions {
  maxPlayers: number;
  tickHz: number;
  /** How often to sweep for sockets that stopped answering. */
  heartbeatMs?: number;
  /**
   * Origins permitted to open a socket. Empty allows any, which is right
   * when the server is only reachable from behind its own reverse proxy.
   */
  allowedOrigins?: readonly string[];
  /**
   * Pin arrivals to one tile rather than scattering them across the island.
   * Tests that need two players in earshot set this; the game does not.
   */
  fixedSpawn?: { x: number; y: number };
}

export interface GameServer {
  readonly room: Room;
  listen(port: number, host: string): Promise<number>;
  close(): Promise<void>;
}

/** How many malformed frames a client may send before we hang up. */
const MAX_BAD_FRAMES = 12;

/** A socket that never says hello is dropped rather than left hanging. */
const HELLO_TIMEOUT_MS = 10_000;

/**
 * Build the game server.
 *
 * Separated from the entrypoint so tests can start one on an ephemeral port,
 * talk to it with real sockets, and shut it down again.
 */
export function createGameServer(options: GameServerOptions): GameServer {
  const room = new Room(options.maxPlayers, options.fixedSpawn);
  const heartbeatMs = options.heartbeatMs ?? 30_000;
  const allowedOrigins = options.allowedOrigins ?? [];

  /**
   * WebSocket upgrades are not subject to CORS, so a public game server has
   * to check the origin itself or anyone's page can use it as their backend.
   */
  function originAllowed(origin: string | undefined): boolean {
    if (allowedOrigins.length === 0) return true;
    if (origin === undefined) return false;
    return allowedOrigins.includes(origin.replace(/\/+$/, ''));
  }

  const httpServer: Server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      const body = JSON.stringify({
        status: 'ok',
        protocol: PROTOCOL_VERSION,
        // Which build is actually serving. The deploy script passes this in,
        // so "is my change live?" is answerable from a phone.
        commit: process.env['GIT_COMMIT'] ?? 'unknown',
        tick: room.tick,
        players: room.size,
        maxPlayers: room.capacity,
        uptimeSeconds: Math.round(process.uptime()),
      });
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

  httpServer.on('upgrade', (req, socket, head) => {
    // Only one endpoint speaks WebSocket; anything else is dropped outright.
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) {
      socket.destroy();
      return;
    }
    if (!originAllowed(req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  function sendTo(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  }

  /**
   * Sockets that vanish without a close frame — a phone leaving Wi-Fi, a tab
   * suspended by iOS and then killed — would otherwise hold a room slot
   * forever. Each sweep terminates anyone who missed the previous ping.
   */
  const alive = new WeakMap<WebSocket, boolean>();
  const heartbeatTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, heartbeatMs);
  heartbeatTimer.unref();

  wss.on('connection', (ws: WebSocket) => {
    const id = Room.newId();
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));

    const connection: Connection = { id, send: (message) => sendTo(ws, message) };

    let greeted = false;
    let joined = false;
    let badFrames = 0;

    const helloTimer = setTimeout(() => {
      if (!greeted) ws.close(1002, 'no hello');
    }, HELLO_TIMEOUT_MS);

    const fail = (message: ServerMessage): void => sendTo(ws, message);

    ws.on('message', (data, isBinary) => {
      // Any traffic at all proves the socket is still there.
      alive.set(ws, true);

      if (isBinary) {
        fail({
          t: 'error',
          code: 'bad_message',
          message: 'Binary frames are not supported.',
          fatal: true,
        });
        ws.close(1003, 'binary');
        return;
      }

      const message = parseClientMessage(data.toString());
      if (message === null) {
        badFrames += 1;
        fail({
          t: 'error',
          code: 'bad_message',
          message: 'Unrecognized message.',
          fatal: false,
        });
        if (badFrames >= MAX_BAD_FRAMES) ws.close(1002, 'too many bad frames');
        return;
      }

      const now = Date.now();

      switch (message.t) {
        case 'hello': {
          if (greeted) return;
          if (message.protocol !== PROTOCOL_VERSION) {
            fail({
              t: 'error',
              code: 'bad_protocol',
              message: 'This page is out of date. Please reload.',
              fatal: true,
            });
            ws.close(1002, 'bad protocol');
            return;
          }
          greeted = true;
          clearTimeout(helloTimer);
          sendTo(ws, {
            t: 'ready',
            protocol: PROTOCOL_VERSION,
            playerCount: room.size,
            maxPlayers: room.capacity,
          });
          return;
        }

        case 'join': {
          if (!greeted) return;
          if (joined) {
            fail({
              t: 'error',
              code: 'already_joined',
              message: 'You are already in the town.',
              fatal: false,
            });
            return;
          }
          const nick = normalizeNickname(message.nick);
          if (nick === null) {
            fail({
              t: 'error',
              code: 'bad_nickname',
              message: 'Please pick a name with at least one visible character.',
              fatal: false,
            });
            return;
          }
          if (room.isFull) {
            fail({
              t: 'error',
              code: 'room_full',
              message: 'The town is full right now. Please try again in a bit!',
              fatal: true,
            });
            ws.close(1013, 'room full');
            return;
          }

          const self = room.join(connection, nick, message.avatar, now);
          joined = true;
          sendTo(ws, {
            t: 'welcome',
            selfId: id,
            tick: room.tick,
            you: { x: self.x, y: self.y },
            players: room.roster(id),
          });
          room.broadcast({ t: 'playerJoined', player: self }, id);
          room.broadcast({ t: 'playerCount', playerCount: room.size });
          return;
        }

        case 'move': {
          if (!joined) return;
          const correction = room.applyMove(
            id,
            message.x,
            message.y,
            message.dir,
            message.moving,
            now,
          );
          if (correction !== null) {
            sendTo(ws, { t: 'correction', x: correction.x, y: correction.y });
          }
          return;
        }

        case 'chat': {
          if (!joined) return;
          const wait = room.chatRetryAfter(id, now);
          if (!room.chat(id, message.text, now)) {
            fail({
              t: 'error',
              code: 'rate_limited',
              message: `Slow down a moment — try again in ${Math.ceil(wait / 1000)}s.`,
              fatal: false,
            });
          }
          return;
        }

        case 'emote': {
          if (!joined) return;
          room.emote(id, message.kind, now);
          return;
        }

        case 'ping': {
          sendTo(ws, { t: 'pong', at: message.at, serverTime: now });
          return;
        }
      }
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (!joined) return;
      room.leave(id);
      room.broadcast({ t: 'playerLeft', id });
      room.broadcast({ t: 'playerCount', playerCount: room.size });
    });

    ws.on('error', () => ws.close());
  });

  const tickTimer = setInterval(() => room.advanceTick(), 1000 / options.tickHz);
  tickTimer.unref();

  return {
    room,

    listen(port, host) {
      return new Promise<number>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          const address = httpServer.address();
          resolve(typeof address === 'object' && address !== null ? address.port : port);
        });
      });
    },

    close() {
      clearInterval(tickTimer);
      clearInterval(heartbeatTimer);
      for (const ws of wss.clients) ws.close(1001, 'server shutting down');
      return new Promise<void>((resolve) => {
        wss.close(() => {
          httpServer.close(() => resolve());
          // Sockets lingering in TIME_WAIT must not hold the process open.
          httpServer.closeAllConnections?.();
        });
      });
    },
  };
}
