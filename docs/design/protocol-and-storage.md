# Protocol v3 and storage

## Protocol

`PROTOCOL_VERSION` goes from 2 to 3, so a stale client is asked to reload by
the existing mechanism. New frames keep the `t` discriminator. Each one is
parsed field by field in `parseClientMessage`, unknown fields are dropped, and
all text goes through `sanitizeText`. `SERVER_TYPES` gains the new types. The
4 KB frame cap stays.

### Client to server

| `t` | Fields | Checked by the server |
| --- | --- | --- |
| `join` (extended) | existing fields + `session?: string` | Fixed length; an unknown token means a new player |
| `wish` | `well`, `topic`, `providers` | Within 2 tiles of the well; topic 2 to 30 characters; daily limit |
| `houseEnter` | `house` | Within 1 tile of the door; house is active |
| `houseLeave` | `house` | — |
| `comment` | `house`, `text` | Sender is inside; 200 characters; 5 per 10 seconds |

### Server to client

| `t` | Fields | Sent to |
| --- | --- | --- |
| `session` | `token` | A new player, on join |
| `welcome` (extended) | existing fields + `houses: HouseState[]` | The joining player |
| `statusShow` / `statusHide` | `id`, `status?: StatusPost` | Both players in a pair that entered or left range |
| `wishResult` | `ok`, `house?`, `reason?` | The wisher |
| `houseUpdate` | `HouseState` | Everyone |
| `houseInfo` | `house`, `articles`, `comments`, `members` | The player entering |
| `houseArticles` | `house`, `articles` | The house's members |
| `commentRelay` | `house`, `id`, `nick`, `text`, `at` | The house's members |

`HouseState` is `{ id, active, level, topic?, members }`. There are 28, so all
of them go in `welcome`.

`ServerErrorCode` gains `wish_limit`, `town_full` and `not_in_house`.

## HTTP

`/auth/:provider/start` and `/auth/:provider/callback` join `/healthz` on the
game server's HTTP handler. nginx and Caddy forward `/auth/`. Both return
redirects only; neither renders a page.

## Storage

Positions and proximity stay in memory, as now. Everything that must outlive a
restart goes through one interface in `packages/server/src/store/`.

```ts
// packages/server/src/store/store.ts
export interface Store {
  getSession(tokenHash: string): Promise<SessionRecord | null>;
  putSession(record: SessionRecord): Promise<void>;
  bindings(sessionId: string): Promise<Binding[]>;
  putBinding(sessionId: string, binding: Binding): Promise<void>;
  latestPosts(sessionId: string): Promise<Post[]>;
  putLatestPost(sessionId: string, post: Post): Promise<void>;
  houses(): Promise<HouseRecord[]>;
  putHouse(record: HouseRecord): Promise<void>;
  topic(id: string): Promise<TopicRecord | null>;
  putTopic(record: TopicRecord): Promise<void>;
  articles(topicId: string, limit: number): Promise<ArticleRecord[]>;
  /** Returns how many were new. */
  addArticles(topicId: string, articles: ArticleRecord[]): Promise<number>;
  comments(topicId: string, limit: number): Promise<CommentRecord[]>;
  addComment(record: CommentRecord): Promise<void>;
}
```

- **`JsonFileStore` first.** Held in memory and written to `DATA_DIR` every 30
  seconds and on shutdown, through a temporary file and a rename so a crash
  never leaves half a file. Enough for a group of friends, and no dependency.
- **SQLite later**, behind the same interface. Whether `node:sqlite` still
  needs a flag on Node 22 has to be checked then; `better-sqlite3` is the
  alternative, but it is a native module, so the Debian-only `node_modules`
  rule in the README applies.
- `docker-compose.yml` mounts a volume at `DATA_DIR` for the game service, or a
  rebuilt container loses everything.
- Comments belong to a topic, not a house, so an archived topic's comments are
  still there after its house is recycled.

## New configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATA_DIR` | `./data` | Where `JsonFileStore` writes |
| `SOCIAL_PROVIDERS` | `fake` | Comma-separated providers to enable |
| `PUBLIC_BASE_URL` | unset | Public origin of the game server, for OAuth redirects |
| `THREADS_APP_ID` / `THREADS_APP_SECRET` | unset | Threads OAuth app |
| `TOKEN_KEY` | unset | 32-byte key, base64, for encrypting stored tokens. Required once any OAuth provider is enabled |
| `SUMMARIZER` | `truncate` | Which summarizer the article agent uses |
