# Social status

A player's latest post on a linked platform floats above their head as a small
card. Only players within earshot see it, using the same hysteresis as chat
(enter 3 tiles, exit 4).

This phase builds the interface and a `MockProvider` only. Real platforms come
later and plug in behind the same interface.

Adding or swapping a platform is one file in `packages/server/src/social/providers/`,
one entry in `SOCIAL_PROVIDERS`, and a pass of the provider contract test. The
client has no idea which platforms exist; it only ever receives a sanitized
`StatusPost`.

## Files

```text
packages/shared/src/status.ts          # StatusPost type + parser, used by both sides
packages/server/src/social/
  provider.ts                          # SocialProvider interface, errors, Capability
  registry.ts                          # register() + buildProviders()
  postService.ts                       # refresh schedule, cache, backoff
  providers/mock.ts                    # this phase: dev, tests and friends' play
packages/server/src/auth/
  session.ts                           # session token issue / verify
```

Later phase, not built now: `providers/threads.ts`, `providers/ptt.ts`,
`providers/x.ts`, `auth/oauth.ts`.

## The provider interface

One interface serves both uses: a player's own latest post (the status card),
and keyword search (the article agent in [topic-houses.md](topic-houses.md)).
A platform that cannot do one of them says so through `capabilities`.

```ts
// packages/server/src/social/provider.ts
export type Capability = 'latestPost' | 'topicSearch';

/** Normalized post. Every provider maps its native shape into this. */
export interface Post {
  provider: string;        // 'mock' now; 'threads' | 'ptt' | 'x' later
  postId: string;          // provider-native id, used for dedupe
  author: string;
  title?: string;          // PTT has titles; most others do not
  text: string;            // raw; sanitized before it reaches any client
  url: string;
  createdAt: number;       // epoch ms
}

/** One player's account on one provider. */
export interface Binding {
  provider: string;
  accountRef: string;                      // handle, or PTT id
  credentials?: Record<string, string>;    // OAuth tokens, encrypted at rest
  options?: { boards?: string[] };         // PTT boards to scan
}

export class AuthExpired extends Error {}

export class RateLimited extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`retry after ${retryAfterMs} ms`);
  }
}

export interface SocialProvider {
  readonly name: string;
  readonly capabilities: ReadonlySet<Capability>;
  /** Needs an OAuth round trip before a binding is usable. */
  readonly usesOAuth: boolean;
  latestPost(binding: Binding, signal: AbortSignal): Promise<Post | null>;
  search(query: string, limit: number, signal: AbortSignal): Promise<Post[]>;
}
```

```ts
// packages/server/src/social/registry.ts
type Factory = (env: NodeJS.ProcessEnv) => SocialProvider;
const factories = new Map<string, Factory>();

export function register(name: string, factory: Factory): void {
  factories.set(name, factory);
}

/** SOCIAL_PROVIDERS=mock picks which ones run. */
export function buildProviders(
  enabled: readonly string[],
  env: NodeJS.ProcessEnv,
): Map<string, SocialProvider> {
  const result = new Map<string, SocialProvider>();
  for (const name of enabled) {
    const factory = factories.get(name);
    if (factory === undefined) throw new Error(`unknown social provider: ${name}`);
    result.set(name, factory(env));
  }
  return result;
}
```

`config.ts` gains `SOCIAL_PROVIDERS` (default `mock`), read the same way as the
existing settings. The later phase adds `THREADS_APP_ID`, `THREADS_APP_SECRET`,
`PUBLIC_BASE_URL` (for the OAuth redirect) and `TOKEN_KEY`.

## The mock provider

`MockProvider` is the only provider in this phase, so it has to be good enough
to play with, not just to test with.

- `name` is `'mock'`, `capabilities` holds both `latestPost` and `topicSearch`,
  `usesOAuth` is false.
- **Linking**: the join screen offers "連結模擬帳號". The binding's `accountRef`
  is a handle the player types, defaulting to their nickname. No network, no
  redirect.
- **Latest post**: picked deterministically from a built-in corpus of about 50
  short, original Traditional Chinese posts, seeded by `accountRef` and a time
  bucket of `MOCK_ROTATE_MS` (default 10 minutes). Two players see different
  posts, and a player's post changes on its own, so refreshing can be watched.
  `createdAt` is the start of the bucket; `url` points at
  `https://example.invalid/mock/<postId>`.
- **Search**: returns 15 posts for any query, deterministic from the query,
  each mentioning it in the title and text, newest first. Three of them are
  deliberate duplicates (same `postId`, or same URL with different tracking
  query parameters, or a near-identical title) so the agent's dedupe has
  something to do.
- **Failure injection, for tests only**: the constructor takes an optional
  `faults` hook that can make the next call throw `RateLimited`, throw
  `AuthExpired`, hang until aborted, or return `null`. It is a constructor
  argument, not an environment variable, so it cannot be switched on in a
  running game.
- **Latency**: an optional `delayMs` (default 0, 300 in development) so loading
  states get exercised.
- The corpus contains no real people, brands or news; it is invented filler.

## Platforms

| Provider | Linking | Own latest post | Keyword search | Check before building |
| --- | --- | --- | --- | --- |
| Mock | "連結模擬帳號" on the join screen | Rotating built-in corpus | Generated from the query | Nothing; built in M1 |
| Threads | OAuth | Official API, own posts | May need permission review | Token lifetime and refresh; the redirect must be HTTPS |
| PTT | PTT id plus 1 to 3 boards | Scrape the web board, filter by author | Scrape the web board search | Over-18 cookie, HTML changes, request rate |
| X | OAuth | Official API | Official API | Current paid tier and quota |

Only Mock is built in this phase. PTT has no "this user's latest post anywhere"
query, which is why linking it will ask for boards.

## Identity and OAuth

- On join the server issues a `session` token: 32 random bytes, stored by the
  server as a hash. The client keeps it in `localStorage` and sends it with
  `join` on reconnect. No token means a new player, who plays exactly as today
  without a status card.
- The join screen (`ui/joinScreen.ts`) gets a "link account" section. In this
  phase it offers only the mock account.
- *Later phase:* OAuth is
  a full-page redirect: `/auth/threads/start?session=…` → Threads →
  `/auth/threads/callback` → store the token → back to the game.
- *Later phase:* `server.ts` routes `/auth/*` beside `/healthz`. `docker/nginx.conf.template`
  and the Caddy config in [DEPLOY-EC2.md](../../DEPLOY-EC2.md) forward
  `/auth/` as well. In the split deployment the redirect URI points at the game
  server's domain.
- *Later phase:* tokens are encrypted with AES-GCM from `node:crypto`, keyed by `TOKEN_KEY`.

## Refreshing posts

- `PostService` refreshes each online player with a binding every 5 to 10
  minutes. Offline players are skipped, to save API quota.
- Only the latest post per player per platform is kept. A failed fetch keeps
  the previous one. `RateLimited` waits `retryAfterMs`. `AuthExpired` marks the
  binding for relinking, and the join screen asks next time.
- Posts older than seven days are not shown.
- Text goes through `sanitizeText(text, 140)` before it is sent, like chat; the
  client renders it with `textContent` only.

## Showing it only nearby

`ProximityTracker.update()` returns nothing today. It changes to return the
pairs that crossed a threshold this tick:

```ts
// packages/shared/src/proximity.ts (change)
export interface ProximityDiff {
  entered: [string, string][];
  left: [string, string][];
}

update(entities: readonly PositionedEntity[]): ProximityDiff
```

`Room.advanceTick()` uses the diff: a pair entering range sends each the
other's `statusShow`; a pair leaving sends `statusHide`. When a player's post
changes, only their current `listeners(id)` hear about it. A client never
receives the status of someone out of range.

Players inside the same topic house see each other's status regardless of
distance.

## Drawing it

- 3D: each `WorldOverlay` entry gets a `status` element above the name tag. A
  chat bubble pushes it up while showing.
- 2D: `BubbleLayer` gets a persistent `StatusCard` that follows its avatar
  through the existing `follow()`.
- Content: the platform's name as text, the first 40 characters, and a relative
  time. A tap expands the full text and a link to the original, opened with
  `rel="noopener noreferrer"`.
