import { spawn, type ChildProcess } from 'node:child_process';
import { expect, type Page } from '@playwright/test';
import { WebSocket } from 'ws';

/**
 * Helpers for the 3D end-to-end specs.
 *
 * Playwright's Linux WebKit cannot automate a second page or context, so the
 * "other player" in these tests is a bot: a plain WebSocket client speaking
 * the same protocol the browser does. Bots and the browser share a private
 * game server pinned to one spawn tile, so they arrive within earshot of
 * each other; the shared suite's server scatters arrivals, which is right
 * for play and useless for a test about who can hear whom.
 */

declare global {
  interface Window {
    __town?: {
      view(): '2d' | '3d';
      position(): { x: number; y: number };
      zone(): string | null;
      connection(): string;
      playerCount(): number;
      others(): string[];
      bubbles(): string[];
      joined(): boolean;
      walkable(x: number, y: number): boolean;
      tileToScreen(x: number, y: number): { x: number; y: number } | null;
      stats(): { fps: number; drawCalls: number; triangles: number } | null;
    };
  }
}

export const TILE = 32;

/** Surface anything the page throws; a silent failure is a wasted run. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Open the page, build an avatar, pick a name and walk in. */
export async function joinTown(page: Page, url: string, nickname: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#join')).toBeVisible();
  const button = page.locator('#join-button');
  await expect(button).toHaveText('進入小鎮', { timeout: 20_000 });
  await page.locator('#nickname').fill(nickname);
  await page.locator('#pick-hat .chip').nth(2).click();
  await page.locator('#pick-shirt .swatch').nth(3).click();
  await button.click();
  await expect(page.locator('#join')).toBeHidden();
  await page.waitForFunction(() => window.__town?.joined() === true, null, { timeout: 20_000 });
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

interface Message {
  t: string;
  [key: string]: unknown;
}

export class Bot {
  private readonly socket: WebSocket;
  private readonly inbox: Message[] = [];
  private readonly waiters: Array<{ type: string; resolve(message: Message): void }> = [];
  id = '';
  x = 0;
  y = 0;

  private constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on('message', (data) => {
      const message = JSON.parse(String(data)) as Message;
      const waiter = this.waiters.findIndex((w) => w.type === message.t);
      if (waiter !== -1) {
        const [w] = this.waiters.splice(waiter, 1);
        w?.resolve(message);
      } else {
        this.inbox.push(message);
      }
    });
  }

  /** Connect, say hello, and join with a name and a look. */
  static async join(url: string, nick: string, look = 0): Promise<Bot> {
    const bot = new Bot(url);
    await new Promise<void>((resolve, reject) => {
      bot.socket.once('open', () => resolve());
      bot.socket.once('error', reject);
    });
    bot.send({ t: 'hello', protocol: 2 });
    await bot.next('ready');
    bot.send({
      t: 'join',
      nick,
      avatar: {
        body: look % 8,
        shirt: (look * 3) % 8,
        hat: ['none', 'cap', 'sunhat', 'beanie', 'bloom'][look % 5],
        accessory: ['none', 'scarf', 'glasses', 'satchel', 'bowtie'][(look >> 1) % 5],
      },
    });
    const welcome = (await bot.next('welcome')) as Message & {
      selfId: string;
      you: { x: number; y: number };
    };
    bot.id = welcome.selfId;
    bot.x = welcome.you.x;
    bot.y = welcome.you.y;
    return bot;
  }

  send(message: Message): void {
    this.socket.send(JSON.stringify(message));
  }

  say(text: string): void {
    this.send({ t: 'chat', text });
  }

  emote(kind: 'wave' | 'heart' | 'laugh' | 'sleep'): void {
    this.send({ t: 'emote', kind });
  }

  next(type: string, timeoutMs = 10_000): Promise<Message> {
    const queued = this.inbox.findIndex((message) => message.t === type);
    if (queued !== -1) return Promise.resolve(this.inbox.splice(queued, 1)[0] as Message);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${type} within ${timeoutMs} ms`)), timeoutMs);
      this.waiters.push({
        type,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      });
    });
  }

  close(): void {
    this.socket.close();
  }
}

/* ------------------------------------------------------------------ */
/* A private stack                                                     */
/* ------------------------------------------------------------------ */

export interface Stack {
  readonly baseURL: string;
  readonly wsURL: string;
  /**
   * Whether the server currently has two players in earshot. Earshot is
   * refreshed on the server's tick, and chat only reaches whoever is in it,
   * so a test about hearing waits for this rather than for a fixed time.
   */
  canHear(a: string, b: string): boolean;
  close(): Promise<void>;
}

async function waitForHttp(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${url} did not come up`);
}

/**
 * A game server with every arrival pinned near one tile, and the static
 * client in front of it on its own port. Both are the real built code: the
 * server through its own `fixedSpawn` option, which the server's integration
 * tests use for the same reason.
 */
export async function startStack(gamePort: number, webPort: number, fixedSpawn?: { x: number; y: number }): Promise<Stack> {
  const [{ createGameServer }, { getTownMap }] = await Promise.all([
    import('../packages/server/dist/server.js'),
    import('@tland/shared'),
  ]);
  const server = createGameServer({ maxPlayers: 50, tickHz: 20, fixedSpawn: fixedSpawn ?? getTownMap().spawn });
  await server.listen(gamePort, '127.0.0.1');

  const web: ChildProcess = spawn(process.execPath, ['e2e/preview-server.mjs', 'packages/client/dist'], {
    env: { ...process.env, E2E_WEB_PORT: String(webPort), E2E_GAME_PORT: String(gamePort) },
    stdio: 'ignore',
  });
  const baseURL = `http://127.0.0.1:${webPort}`;
  await waitForHttp(`${baseURL}/`);

  return {
    baseURL,
    wsURL: `ws://127.0.0.1:${gamePort}/ws`,
    canHear: (a, b) => server.room.canHear(a, b),
    async close() {
      web.kill();
      await server.close();
    },
  };
}
