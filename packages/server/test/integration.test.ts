import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  PROTOCOL_VERSION,
  PROXIMITY_ENTER_RADIUS,
  PROXIMITY_EXIT_RADIUS,
  TICK_MS,
  TILE_SIZE,
  getTownMap,
  type ClientMessage,
  type ServerMessage,
} from '@tland/shared';
import { findPath } from '@tland/shared';
import { createGameServer, type GameServer } from '../src/server.ts';

/**
 * Two real clients against the real server.
 *
 * The browser suite covers one player on one device; this covers the part the
 * browser cannot reach here — Playwright's Linux WebKit will not drive a
 * second page — and pins the proximity radii far more precisely than two
 * browser tabs could.
 */

const map = getTownMap();

/** A scripted client: sends real frames, records everything it is sent. */
class TestClient {
  readonly received: ServerMessage[] = [];
  private readonly socket: WebSocket;
  id: string | null = null;
  position = { x: 0, y: 0 };

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      this.received.push(message);
      if (message.t === 'welcome') {
        this.id = message.selfId;
        this.position = { ...message.you };
      }
      // The server rejected a claimed position. Follow it, or this client's
      // idea of where it is drifts away from the truth and every distance
      // measured from it becomes fiction.
      if (message.t === 'correction') {
        this.position = { x: message.x, y: message.y };
      }
    });
  }

  static async connect(port: number): Promise<TestClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return new TestClient(socket);
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  /** Wait for the next message of a given type, or fail the test. */
  async next<T extends ServerMessage['t']>(
    type: T,
    timeoutMs = 2000,
  ): Promise<Extract<ServerMessage, { t: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.received.find((message) => message.t === type);
      if (found !== undefined) {
        this.received.splice(this.received.indexOf(found), 1);
        return found as Extract<ServerMessage, { t: T }>;
      }
      if (Date.now() > deadline) throw new Error(`timed out waiting for "${type}"`);
      await sleep(10);
    }
  }

  /** Every message of a type received so far. */
  all<T extends ServerMessage['t']>(type: T): Extract<ServerMessage, { t: T }>[] {
    return this.received.filter((m) => m.t === type) as Extract<
      ServerMessage,
      { t: T }
    >[];
  }

  clear(): void {
    this.received.length = 0;
  }

  async join(nick: string): Promise<void> {
    this.send({ t: 'hello', protocol: PROTOCOL_VERSION });
    await this.next('ready');
    this.send({
      t: 'join',
      nick,
      avatar: { body: 0, shirt: 0 },
    });
    await this.next('welcome');
  }

  /** Claim a position and remember it. */
  moveTo(x: number, y: number): void {
    this.position = { x, y };
    this.send({ t: 'move', x, y, dir: 'down', moving: true });
  }

  close(): void {
    this.socket.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait long enough for the server to have ticked at least `count` times. */
function ticks(count: number): Promise<void> {
  return sleep(TICK_MS * count + 40);
}

const tileOf = (p: { x: number; y: number }) => ({
  x: Math.floor(p.x / TILE_SIZE),
  y: Math.floor(p.y / TILE_SIZE),
});
const centreOf = (t: { x: number; y: number }) => ({
  x: t.x * TILE_SIZE + TILE_SIZE / 2,
  y: t.y * TILE_SIZE + TILE_SIZE / 2,
});

/**
 * Walk a client somewhere, by the route the game's own pathfinder would take.
 *
 * Pushing in a straight line is not good enough: wherever a player happens to
 * arrive, a building is usually a few tiles away, and a walk that stops short
 * makes a proximity test pass for the wrong reason. Returns how far it got, so
 * the caller can refuse to conclude anything from a walk that was blocked.
 */
async function walkTo(
  client: TestClient,
  target: { x: number; y: number },
): Promise<number> {
  const start = client.position;
  const route = findPath(map.width, map.height, tileOf(start), target, {
    isWalkable: map.isWalkable,
    maxNodes: 20_000,
  });
  for (const step of route ?? []) {
    const to = centreOf(step);
    client.moveTo(to.x, to.y);
    // Long enough that a diagonal step is inside the server's speed limit.
    await ticks(4);
  }
  return Math.hypot(client.position.x - start.x, client.position.y - start.y);
}

/** A walkable tile roughly `tiles` away from a point, for walking tests. */
function tileAbout(from: { x: number; y: number }, tiles: number) {
  const origin = tileOf(from);
  let best: { x: number; y: number } | null = null;
  let bestError = Infinity;
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (!map.isWalkable(x, y)) continue;
      const error = Math.abs(Math.hypot(x - origin.x, y - origin.y) - tiles);
      if (error < bestError) {
        bestError = error;
        best = { x, y };
      }
    }
  }
  return best as { x: number; y: number };
}

describe('game server', () => {
  let server: GameServer;
  let port: number;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    // Pinned: most of these need two players able to hear each other, and
    // arrivals are scattered across the island in the real game.
    server = createGameServer({
      maxPlayers: 3,
      tickHz: 20,
      fixedSpawn: map.spawn,
    });
    port = await server.listen(0, '127.0.0.1');
  });

  afterEach(async () => {
    for (const client of clients) client.close();
    clients.length = 0;
    await server.close();
  });

  async function connect(nick?: string): Promise<TestClient> {
    const client = await TestClient.connect(port);
    clients.push(client);
    if (nick !== undefined) await client.join(nick);
    return client;
  }

  it('greets a client and reports how busy the room is', async () => {
    const client = await connect();
    client.send({ t: 'hello', protocol: PROTOCOL_VERSION });
    const ready = await client.next('ready');
    expect(ready).toMatchObject({
      protocol: PROTOCOL_VERSION,
      playerCount: 0,
      maxPlayers: 3,
    });
  });

  it('refuses a client speaking a different protocol', async () => {
    const client = await connect();
    client.send({ t: 'hello', protocol: PROTOCOL_VERSION + 99 });
    const error = await client.next('error');
    expect(error).toMatchObject({ code: 'bad_protocol', fatal: true });
  });

  it('spawns a joining player somewhere they can stand', async () => {
    const client = await connect('小美');
    expect(client.id).not.toBeNull();
    const tileX = Math.floor(client.position.x / TILE_SIZE);
    const tileY = Math.floor(client.position.y / TILE_SIZE);
    expect(map.isWalkable(tileX, tileY)).toBe(true);
  });

  it('drops players in different places rather than all on one tile', async () => {
    // Spawning is random, so this asserts the distribution rather than any
    // particular tile: twenty arrivals landing on one or two spots would mean
    // the randomness is not reaching the room.
    const seen = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const room = createGameServer({ maxPlayers: 50, tickHz: 20 });
      const spawn = room.room.join(
        { id: `p${i}`, send: () => {} },
        `p${i}`,
        { body: 0, shirt: 0 },
        Date.now(),
      );
      seen.add(`${Math.round(spawn.x)},${Math.round(spawn.y)}`);
      await room.close();
    }
    expect(seen.size).toBeGreaterThan(8);
  });

  it('never drops two players on the same tile', async () => {
    const crowd = createGameServer({ maxPlayers: 50, tickHz: 20 });
    const taken = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      const spawn = crowd.room.join(
        { id: `p${i}`, send: () => {} },
        `p${i}`,
        { body: 0, shirt: 0 },
        Date.now(),
      );
      const tile = `${Math.floor(spawn.x / TILE_SIZE)},${Math.floor(spawn.y / TILE_SIZE)}`;
      expect(taken.has(tile)).toBe(false);
      taken.add(tile);
    }
    await crowd.close();
  });

  it('rejects a nickname with nothing visible in it', async () => {
    const client = await connect();
    client.send({ t: 'hello', protocol: PROTOCOL_VERSION });
    await client.next('ready');
    client.send({
      t: 'join',
      nick: '   ',
      avatar: { body: 0, shirt: 0 },
    });
    const error = await client.next('error');
    expect(error).toMatchObject({ code: 'bad_nickname' });
  });

  it('tells each player about the other', async () => {
    const alice = await connect('小美');
    const bob = await connect('阿寬');

    const joined = await alice.next('playerJoined');
    expect(joined.player).toMatchObject({ id: bob.id, nick: '阿寬' });

    // Bob's welcome already listed Alice, so he needs no separate event.
    const welcome = bob.all('welcome');
    expect(welcome).toHaveLength(0); // consumed by join()
    expect(alice.id).not.toBe(bob.id);
  });

  it('relays movement to the other player', async () => {
    const alice = await connect('小美');
    const bob = await connect('阿寬');
    alice.clear();

    const target = { x: bob.position.x + 8, y: bob.position.y };
    bob.moveTo(target.x, target.y);
    await ticks(3);

    const update = alice
      .all('state')
      .flatMap((state) => state.players)
      .find((player) => player.id === bob.id);
    expect(update).toBeDefined();
    expect(update?.x).toBeCloseTo(target.x, 0);
  });

  it('never echoes a player their own position', async () => {
    const alice = await connect('小美');
    await connect('阿寬');
    alice.clear();

    alice.moveTo(alice.position.x + 8, alice.position.y);
    await ticks(3);

    const own = alice
      .all('state')
      .flatMap((state) => state.players)
      .filter((player) => player.id === alice.id);
    expect(own).toEqual([]);
  });

  it('corrects a player who claims to have teleported', async () => {
    const client = await connect('小美');
    const far = { x: client.position.x + 40 * TILE_SIZE, y: client.position.y };
    client.moveTo(far.x, far.y);
    const correction = await client.next('correction');
    // Snapped back to where they actually were.
    expect(Math.hypot(correction.x - far.x, correction.y - far.y)).toBeGreaterThan(
      TILE_SIZE * 10,
    );
  });

  it('corrects a player who claims to be standing in the river', async () => {
    const client = await connect('小美');
    // One tile is a legal distance; the river is still not walkable.
    let water: { x: number; y: number } | null = null;
    for (let y = 0; y < map.height && water === null; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        if (map.terrainAt(x, y) === 'water') {
          water = { x, y };
          break;
        }
      }
    }
    expect(water).not.toBeNull();
    const point = {
      x: (water as { x: number; y: number }).x * TILE_SIZE + TILE_SIZE / 2,
      y: (water as { x: number; y: number }).y * TILE_SIZE + TILE_SIZE / 2,
    };
    client.moveTo(point.x, point.y);
    await expect(client.next('correction')).resolves.toBeDefined();
  });

  /* ---------------------------------------------------------------- */
  /* Proximity chat                                                    */
  /* ---------------------------------------------------------------- */

  it('delivers a nearby line to both the speaker and the listener', async () => {
    const alice = await connect('小美');
    const bob = await connect('阿寬');
    await ticks(2);
    alice.clear();
    bob.clear();

    bob.send({ t: 'chat', text: '有人在嗎' });

    const heard = await alice.next('chat');
    expect(heard).toMatchObject({ id: bob.id, text: '有人在嗎' });
    await expect(bob.next('chat')).resolves.toMatchObject({ text: '有人在嗎' });
  });

  it('does not deliver a line from across the map', async () => {
    const alice = await connect('小美');
    const bob = await connect('阿寬');

    const travelled = await walkTo(bob, tileAbout(bob.position, 12));
    // If the walk was blocked, the rest of this proves nothing.
    expect(travelled).toBeGreaterThan(PROXIMITY_EXIT_RADIUS * TILE_SIZE * 1.5);
    alice.clear();

    bob.send({ t: 'chat', text: '太遠了' });
    await ticks(4);
    expect(alice.all('chat')).toEqual([]);
  });

  it('keeps a listener in earshot between the enter and exit radii', async () => {
    const alice = await connect('小美');
    const bob = await connect('阿寬');

    // They arrive within earshot; drift into the hysteresis band — past the
    // entering radius, not yet past the exiting one.
    await ticks(2);
    expect(server.room.canHear(alice.id as string, bob.id as string)).toBe(true);

    // Drift into the hysteresis band: past entering, not yet past exiting.
    await walkTo(bob, tileAbout(alice.position, PROXIMITY_ENTER_RADIUS + 1));
    await ticks(2);
    alice.clear();

    bob.send({ t: 'chat', text: '還聽得到嗎' });
    await expect(alice.next('chat')).resolves.toMatchObject({ text: '還聽得到嗎' });
  });

  it('strips control characters out of a line before relaying it', async () => {
    const alice = await connect('小美');
    const bob = await connect('阿寬');
    await ticks(2);
    alice.clear();

    bob.send({ t: 'chat', text: `a${String.fromCharCode(0x07)}b   c` });
    const heard = await alice.next('chat');
    expect(heard.text).toBe('ab c');
  });

  it('relays an emote to a nearby listener', async () => {
    const alice = await connect('小美');
    const bob = await connect('阿寬');
    await ticks(2);
    alice.clear();

    bob.send({ t: 'emote', kind: 'wave' });
    await expect(alice.next('emote')).resolves.toMatchObject({
      id: bob.id,
      kind: 'wave',
    });
  });

  /* ---------------------------------------------------------------- */
  /* Limits                                                            */
  /* ---------------------------------------------------------------- */

  it('rate-limits a player who talks too fast', async () => {
    const client = await connect('小美');
    for (let i = 0; i < 6; i += 1) client.send({ t: 'chat', text: `line ${i}` });
    const error = await client.next('error');
    expect(error).toMatchObject({ code: 'rate_limited', fatal: false });
  });

  it('turns away the player who makes the room too full', async () => {
    await connect('one');
    await connect('two');
    await connect('three');

    const extra = await connect();
    extra.send({ t: 'hello', protocol: PROTOCOL_VERSION });
    const ready = await extra.next('ready');
    expect(ready.playerCount).toBe(3);

    extra.send({
      t: 'join',
      nick: 'four',
      avatar: { body: 0, shirt: 0 },
    });
    const error = await extra.next('error');
    expect(error).toMatchObject({ code: 'room_full', fatal: true });
  });

  it('frees the slot again when someone leaves', async () => {
    const alice = await connect('小美');
    const bob = await connect('阿寬');
    expect(server.room.size).toBe(2);

    bob.close();
    await expect(alice.next('playerLeft')).resolves.toMatchObject({ id: bob.id });
    expect(server.room.size).toBe(1);
  });

  it('ignores a move from someone who has not joined', async () => {
    const client = await connect();
    client.send({ t: 'hello', protocol: PROTOCOL_VERSION });
    await client.next('ready');
    client.send({ t: 'move', x: 10, y: 10, dir: 'down', moving: true });
    await ticks(2);
    expect(client.all('correction')).toEqual([]);
    expect(server.room.size).toBe(0);
  });

  it('answers a ping with the timestamp it was given', async () => {
    const client = await connect('小美');
    client.send({ t: 'ping', at: 1234 });
    await expect(client.next('pong')).resolves.toMatchObject({ at: 1234 });
  });

  it('complains about a frame it cannot parse', async () => {
    const client = await connect('小美');
    client.send({ t: 'chat' } as unknown as ClientMessage);
    const error = await client.next('error');
    expect(error).toMatchObject({ code: 'bad_message', fatal: false });
  });

  it('refuses an upgrade from an origin that is not on the list', async () => {
    const guarded = createGameServer({
      maxPlayers: 2,
      tickHz: 20,
      allowedOrigins: ['https://town.example.com'],
    });
    const guardedPort = await guarded.listen(0, '127.0.0.1');
    try {
      const refused = new WebSocket(`ws://127.0.0.1:${guardedPort}/ws`, {
        origin: 'https://evil.example.com',
      });
      await expect(
        new Promise((_resolve, reject) => {
          refused.once('open', () => reject(new Error('should not have opened')));
          refused.once('error', (error) => reject(error));
        }),
      ).rejects.toThrow();

      const accepted = new WebSocket(`ws://127.0.0.1:${guardedPort}/ws`, {
        origin: 'https://town.example.com',
      });
      await new Promise<void>((resolve, reject) => {
        accepted.once('open', () => resolve());
        accepted.once('error', reject);
      });
      accepted.close();
    } finally {
      await guarded.close();
    }
  });

  it('serves a health check', async () => {
    await connect('小美');
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      players: 1,
      maxPlayers: 3,
      // Set by the deploy script; 'unknown' when run from a checkout.
      commit: expect.any(String),
    });
  });
});
