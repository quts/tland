/**
 * Wandering bots, for load-testing a view by hand.
 *
 *   npm run build -w @tland/shared
 *   node scripts/bots.mjs --url ws://<host>:8080/ws --count 30 --near 68,72
 *
 * Each bot joins with its own look, walks (at a legal speed, along real
 * paths) to somewhere near `--near` — the tile you are standing on, so the
 * crowd comes to you — and then ambles about there, saying something or
 * waving now and then. Ctrl+C sends them all home.
 *
 * Bots are ordinary clients: the server checks their every step exactly as
 * it checks yours, so a crowd here costs the server what a real one would.
 */
import { WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  TILE_SIZE,
  WALK_SPEED,
  findPath,
  getTownMap,
  nearestWalkable,
} from '@tland/shared';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const URL = option('url', 'ws://127.0.0.1:8080/ws');
const COUNT = Number(option('count', '30'));
const NEAR = option('near', null);
const QUIET = process.argv.includes('--quiet');

const map = getTownMap();
const HATS = ['none', 'cap', 'sunhat', 'beanie', 'bloom'];
const ACCESSORIES = ['none', 'scarf', 'glasses', 'satchel', 'bowtie'];
const EMOTES = ['wave', 'heart', 'laugh', 'sleep'];
const LINES = ['今天天氣真好', '要去河邊散步嗎', '這裡好熱鬧', '你好呀', '我迷路了', '晚點見', '那邊有花', '走累了'];
/** A little under the server's limit, so no step is ever refused. */
const SPEED = WALK_SPEED * TILE_SIZE * 0.85;
const TICK_MS = 1000 / 15;

const near = (() => {
  if (NEAR === null) return null;
  const [x, y] = NEAR.split(',').map(Number);
  return nearestWalkable(map.width, map.height, { x, y }, map.isWalkable);
})();

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const tileOf = (px) => Math.floor(px / TILE_SIZE);

/** A walkable tile within `radius` of `centre`, or the centre itself. */
function somewhereNear(centre, radius) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const x = centre.x + Math.round((Math.random() * 2 - 1) * radius);
    const y = centre.y + Math.round((Math.random() * 2 - 1) * radius);
    if (map.isWalkable(x, y)) return { x, y };
  }
  return centre;
}

class Bot {
  constructor(index) {
    this.index = index;
    this.nick = `小鎮居民${index + 1}`;
    this.x = 0;
    this.y = 0;
    this.route = [];
    this.home = null;
    this.moving = false;
    this.corrections = 0;
    this.timer = null;
    this.socket = new WebSocket(URL);
    this.socket.on('open', () => this.send({ t: 'hello', protocol: PROTOCOL_VERSION }));
    this.socket.on('message', (data) => this.receive(JSON.parse(String(data))));
    this.socket.on('close', () => clearInterval(this.timer));
    this.socket.on('error', (error) => console.error(`[${this.nick}]`, error.message));
  }

  send(message) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  receive(message) {
    switch (message.t) {
      case 'ready':
        this.send({
          t: 'join',
          nick: this.nick,
          avatar: {
            body: this.index % 8,
            shirt: (this.index * 3) % 8,
            hat: HATS[this.index % HATS.length],
            accessory: ACCESSORIES[(this.index >> 1) % ACCESSORIES.length],
          },
        });
        return;
      case 'welcome':
        this.x = message.you.x;
        this.y = message.you.y;
        this.home = near ?? { x: tileOf(this.x), y: tileOf(this.y) };
        if (!QUIET) console.log(`[${this.nick}] joined at ${tileOf(this.x)},${tileOf(this.y)}`);
        this.planTo(somewhereNear(this.home, 4));
        this.timer = setInterval(() => this.tick(), TICK_MS);
        return;
      case 'correction':
        this.corrections += 1;
        this.x = message.x;
        this.y = message.y;
        this.route = [];
        return;
      case 'error':
        console.error(`[${this.nick}] ${message.code}: ${message.message ?? ''}`);
        return;
      default:
        return;
    }
  }

  planTo(goal) {
    const route = findPath(map.width, map.height, { x: tileOf(this.x), y: tileOf(this.y) }, goal, {
      isWalkable: map.isWalkable,
      maxNodes: 60_000,
    });
    this.route = route ?? [];
  }

  tick() {
    const step = (SPEED * TICK_MS) / 1000;
    const next = this.route[0];
    if (next === undefined) {
      if (this.moving) this.send({ t: 'move', x: this.x, y: this.y, dir: 'down', moving: false });
      this.moving = false;
      // Linger, then wander somewhere else nearby.
      if (Math.random() < 0.02) this.planTo(somewhereNear(this.home, 4));
      if (Math.random() < 0.004) this.send({ t: 'chat', text: pick(LINES) });
      if (Math.random() < 0.004) this.send({ t: 'emote', kind: pick(EMOTES) });
      return;
    }
    const tx = next.x * TILE_SIZE + TILE_SIZE / 2;
    const ty = next.y * TILE_SIZE + TILE_SIZE / 2;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= step) {
      this.x = tx;
      this.y = ty;
      this.route.shift();
    } else {
      this.x += (dx / distance) * step;
      this.y += (dy / distance) * step;
    }
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    this.moving = true;
    this.send({ t: 'move', x: this.x, y: this.y, dir, moving: true });
  }

  close() {
    clearInterval(this.timer);
    this.socket.close();
  }
}

const bots = [];
for (let i = 0; i < COUNT; i += 1) {
  bots.push(new Bot(i));
  // Stagger arrivals a little, as people do.
  await new Promise((resolve) => setTimeout(resolve, 60));
}
console.log(`${COUNT} bots heading ${near ? `to ${near.x},${near.y}` : 'about their own business'} on ${URL}`);

function goHome() {
  const corrected = bots.reduce((sum, bot) => sum + bot.corrections, 0);
  console.log(`sending ${bots.length} bots home (${corrected} steps refused by the server)`);
  for (const bot of bots) bot.close();
  setTimeout(() => process.exit(0), 200);
}
process.on('SIGINT', goHome);
process.on('SIGTERM', goHome);
