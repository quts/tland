import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
  WS_PATH,
  parseClientMessage,
  type ServerMessage,
} from '@tland/shared';
import { config } from './config.ts';
import { Room, type Connection } from './room.ts';

const room = new Room(config.maxPlayers);

const httpServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    const body = JSON.stringify({
      status: 'ok',
      protocol: PROTOCOL_VERSION,
      tick: room.tick,
      players: room.size,
      maxPlayers: config.maxPlayers,
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
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

function sendTo(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

/**
 * Sockets that vanish without a close frame — a phone leaving Wi-Fi, a tab
 * suspended by iOS and then killed — would otherwise hold a room slot forever.
 * Each sweep terminates anyone who missed the previous protocol-level ping.
 */
const HEARTBEAT_MS = 30_000;
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
}, HEARTBEAT_MS);
heartbeatTimer.unref();

wss.on('connection', (ws: WebSocket) => {
  const id = Room.newId();
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
  const connection: Connection = {
    id,
    send: (message) => sendTo(ws, message),
    close: () => ws.close(),
  };

  /** A socket that never sends a valid `hello` is dropped. */
  let greeted = false;
  const helloTimer = setTimeout(() => {
    if (!greeted) ws.close(1002, 'no hello');
  }, 10_000);

  // A connection only occupies a slot once it has been admitted, so a flood of
  // half-open sockets cannot fill the room.
  let admitted = false;

  ws.on('message', (data, isBinary) => {
    // Any traffic at all proves the socket is still there.
    alive.set(ws, true);

    if (isBinary) {
      sendTo(ws, {
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
      sendTo(ws, {
        t: 'error',
        code: 'bad_message',
        message: 'Unrecognized message.',
        fatal: false,
      });
      return;
    }

    switch (message.t) {
      case 'hello': {
        if (greeted) return;
        if (message.protocol !== PROTOCOL_VERSION) {
          sendTo(ws, {
            t: 'error',
            code: 'bad_protocol',
            message: 'This page is out of date. Please reload.',
            fatal: true,
          });
          ws.close(1002, 'bad protocol');
          return;
        }
        if (room.isFull) {
          sendTo(ws, {
            t: 'error',
            code: 'room_full',
            message: 'The town is full right now. Please try again in a bit!',
            fatal: true,
          });
          ws.close(1013, 'room full');
          return;
        }
        greeted = true;
        clearTimeout(helloTimer);
        room.add(connection);
        admitted = true;
        sendTo(ws, {
          t: 'welcome',
          protocol: PROTOCOL_VERSION,
          selfId: id,
          tick: room.tick,
          playerCount: room.size,
        });
        room.broadcast({ t: 'playerCount', playerCount: room.size }, id);
        return;
      }
      case 'ping': {
        sendTo(ws, { t: 'pong', at: message.at, serverTime: Date.now() });
        return;
      }
    }
  });

  ws.on('close', () => {
    clearTimeout(helloTimer);
    if (!admitted) return;
    room.remove(id);
    room.broadcast({ t: 'playerCount', playerCount: room.size });
  });

  ws.on('error', () => ws.close());
});

const tickTimer = setInterval(() => room.advanceTick(), 1000 / config.tickHz);
tickTimer.unref();

httpServer.listen(config.port, config.host, () => {
  console.log(
    `[game] listening on http://${config.host}:${config.port} (ws ${WS_PATH}, max ${config.maxPlayers} players)`,
  );
});

function shutdown(signal: string): void {
  console.log(`[game] ${signal} received, shutting down`);
  clearInterval(tickTimer);
  clearInterval(heartbeatTimer);
  for (const ws of wss.clients) ws.close(1001, 'server shutting down');
  wss.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
