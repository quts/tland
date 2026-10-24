# Testing plan

Everything runs on the existing Vitest and Playwright setup and in the existing
CI workflow. Nothing calls a real platform or LLM in CI.

- **Provider contract test** — `server/test/socialProvider.contract.test.ts`
  runs `describe.each` over every provider: all `Post` fields present,
  `createdAt` plausible, an unsupported capability throws a clear error, HTTP
  401 and 429 become `AuthExpired` and `RateLimited`. A provider joins
  `SOCIAL_PROVIDERS` only after passing it.
- **Mock provider** — deterministic output for the same seed and time bucket;
  the post changes across buckets; search returns its planted duplicates; each
  fault injects the right error.
- **No network for real platforms (later phase)** — Threads runs against recorded JSON
  fixtures in place of `fetch`; PTT against saved HTML snapshots, so a markup
  change breaks the test before it breaks the game.
- **Proximity diff** — `shared/test/proximity.test.ts` grows cases inside 3
  tiles, between 3 and 4, beyond 4, and crossing back and forth; `entered` and
  `left` each appear exactly once per crossing.
- **Heat** — `shared/test/heat.test.ts` with an injected clock: half-life,
  hysteresis, one level per tick, archive condition.
- **Map** — `shared/test/map.test.ts` asserts the three wells are at least 25%
  of the diagonal apart; the existing reachability test covers wells blocking
  nothing.
- **Protocol** — `shared/test/protocol.test.ts` gets valid and invalid cases for
  each new frame: over-long topics, control characters, unknown fields dropped.
- **Integration** — `server/test/integration.test.ts`, using `fixedSpawn` as
  today, drives two real sockets through join, seeing each other's status,
  wishing, entering, and commenting.
- **Store** — `JsonFileStore` survives a write interrupted between the
  temporary file and the rename.
- **End to end** — the WebKit smoke test gains one case: two pages, one wishes,
  both see the house turn to colour.
- **Manual** — [TESTING.md](../../TESTING.md) gains a section for the status
  card, the well button and the house panel with the iOS keyboard open.
