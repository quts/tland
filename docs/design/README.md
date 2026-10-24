# Design: social status, wishing wells, topic houses

Status: planned, not built. Written 2026-10-24 against main at 23a28d8.

This extends Riverside Town for a friends-only group. Three features, each
buildable on its own, in this order:

1. **Social status** — a player's latest post from Threads, PTT or X floats
   above their head, visible only to people standing nearby.
   See [social-status.md](social-status.md).
2. **Wishing wells** — three wells spread evenly across the island. Standing at
   one, a player names a topic, and a house opens for it.
   See [wishing-wells.md](wishing-wells.md).
3. **Topic houses** — the 28 existing building plots become topic houses. An
   empty house keeps its current shape, drawn in greyscale. A house with a
   topic is in colour and grows through five levels as people visit and
   comment, then shrinks again as interest fades. Inside is a panel of
   summarized articles and a comment board. See [topic-houses.md](topic-houses.md).

The wire protocol, persistence and test plan are in
[protocol-and-storage.md](protocol-and-storage.md) and [testing.md](testing.md).

## What changes about the project

The original brief ([agent.md](../../agent.md)) says no accounts, no
persistence, no database, no secrets. These features need all four in a small
way, so this is a deliberate change of scope:

| Original rule | After this work |
| --- | --- |
| No accounts | Still no sign-up. The server hands out an opaque session token kept in `localStorage`; social accounts attach to it. Playing without one works exactly as today. |
| State in memory only | Positions and proximity stay in memory. Sessions, social bindings, latest posts, topics, articles, comments and house heat persist through a `Store`. |
| No database | The first `Store` is a JSON file. SQLite is a later swap behind the same interface. |
| No secrets | `THREADS_APP_SECRET`, `TOKEN_KEY` and an LLM API key, in `deploy/tland.env`. |
| (Implicit today) the server makes no outbound calls | The game server calls Threads, PTT, X and an LLM. The browser still never does. |

The IP rule still holds: **no platform logos**. A status card names its source
in text ("Threads", "PTT", "X"); it does not draw anyone's logo.

## Decisions

- **TypeScript throughout**, inside the existing three workspaces. No separate
  service. The protocol, the map, the well positions and the heat formula are
  shared by client and server, which is what `@tland/shared` is for.
- **All 28 building plots are topic houses.** Empty ones keep their current
  variant (including the two towers, at tiles 72,48 and 68,56) and only change
  colour to greyscale. When a topic opens, the house becomes a level 1 single
  storey house in colour and grows from there.
- **Entering a house opens a DOM panel**, not an interior scene. The avatar
  stays at the door.
- **Proximity reuses the chat radii**: enter 3 tiles, exit 4.
- **The client never talks to a social platform.** Everything external goes
  through the server's provider layer, so swapping or adding a platform touches
  one server directory.
- **Comments stay in the game.** Nothing is posted back to Threads or X.

## Architecture

```
browser ──HTTP──> web (nginx) ──/ws──────> game (node + ws)
                               ──/auth/*──>   Room          (existing: tick, proximity)
                               ──/healthz─>   wells, houses, heat
                                              scheduler     (post refresh, agent, heat tick)
                                              Store         (JSON file -> SQLite)
                                              social/       providers: fake, threads, ptt, x
                                              topics/       agent, summarizer
                                                   │
                                                   └──> Threads API, PTT web, X API, LLM API
```

## Milestones

Each is a run of PRs that can merge on its own, and each leaves something a
friend can try. The fake provider comes first so nothing waits on a platform's
API review. Every PR passes the existing CI: lint, typecheck, Vitest and the
WebKit smoke test.

| # | Scope | Done when |
| --- | --- | --- |
| M1 | Session token, `Store` + `JsonFileStore`, provider interface + `FakeProvider`, `PostService`, proximity diff, status card in both views | Two phones within 3 tiles see each other's status; it disappears past 4 without blinking; a server restart keeps the session |
| M2 | Threads provider, `/auth/threads/*`, token encryption, "link account" on the join screen | A new Threads post shows above the head within 10 minutes; a network drop does not clear the card |
| M3 | `buildingPlots` moved to shared, wells in `build-map.mjs`, wish / enter / leave / comment, greyscale vs colour, signs, house panel (level 1 only) | A wish turns the nearest empty house to colour; a comment reaches another player in the house; wishing the same topic twice opens one house |
| M4 | `heat.ts`, heat events, five-minute tick, archive, level heights in both views | With an injected clock, 72 hours of silence steps a house down one level at a time, then archives it |
| M5 | Article agent, `Summarizer`, PTT provider | A baseball topic shows at least five distinct summarized articles with links |

The X provider is not scheduled until its API plan is settled.

## Open questions

These do not block M1.

- Is a 12-tile skyscraper too much on a portrait phone? Measure in M4 with
  `scripts/bots.mjs` and 30 players.
- Apply for Threads keyword search, or use PTT alone for topic search? Needed by M5.
- Which LLM for summaries, and what monthly budget? Needed by M5.
- Production host for OAuth: the existing EC2 + Caddy setup? The redirect URI
  needs HTTPS on that domain. Needed by M2.
