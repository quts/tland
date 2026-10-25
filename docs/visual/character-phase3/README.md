# Phase 3 — scarf

**Status: waiting on review. No hat.**

Validated on 2026-10-25 in Apple Container on macOS arm64. Every image is a
render of the same geometry the game uses, in the same resting pose, under the
town's own lighting, through an `OrthographicCamera`.

## Seven views

![Turnaround](turnaround.png)

## Close-ups

Front neck wrap, left neck and shoulder, right neck and shoulder, back neck
wrap, and the tail's attachment.

![Scarf close-ups](scarf-closeups.png)

## The scarf

**The neck wrap** is a tube swept round the neck, not a torus. Its radius,
thickness and height each wander with three slow waves that do not share a
period, so the loop never repeats itself going round and never closes back
into a circle. `waver` in the config controls how much.

Its inner half sits inside the head. That is the point: it is what hides the
head-to-torso junction without putting anything in front of the face — the
loop's top ends at 0.655 and the face patch starts at 0.675.

It rests **on** the shoulders rather than through them. The shoulder ball's top
reaches 0.553 and out to 0.250 at the height where the loop passes; the loop is
thick enough (0.075 half-thickness at radius 0.21) that the shoulder passes
inside its surface instead of poking through it. The first attempt was thinner,
and the lavender came through the coral on both sides. **No base geometry was
changed to fix that** — the scarf got thicker, which is also what the brief
asks of it.

**The tail** is a capsule scaled to a strap: 0.154 wide, 0.056 deep, 0.21 long,
with the rounded end that comes from the capsule. It hangs off-centre at
x −0.075, starts inside the loop so the two read as one piece of cloth, and
leans 0.12 radians forward so its lower end clears the belly. It is short
enough that the torso reads as a torso.

## Performance

Run with the existing thirty-character test, which has bots wearing a mix of
outfits including scarves:

| | Phase 1 | Phase 3 | Change |
| --- | --- | --- | --- |
| iPhone | 126 | **126** | 0 |
| iPhone landscape | 144 | **144** | 0 |
| iPad | 120 | **120** | 0 |
| iPad landscape | 158 | **158** | 0 |

**No new draw calls and no new material.** The scarf is merged into the body
mesh like every other fixed part and painted with the existing `SCARF` colour
through the shared character material. The new geometry is two surfaces per
scarfed character — a 72 × 14 swept tube and a capsule — inside geometry that
was already being built and cached per outfit, so there is no new allocation
per character either.

### The budget

`DRAW_CALL_BUDGET` is back to **150**, its original value. The Phase 1 overage
is recorded beside it as `KNOWN_DRAW_CALL_DEVIATION = 162`, an explicitly
accepted deviation rather than a new budget: the test now reports how far over
the budget a frame is, and still fails on any *further* regression. iPad
landscape is 8 over; every other device is under.

## Modified files

| File | What changed |
| --- | --- |
| `three/character/proportions.ts` | added the `scarf` section: wrap y/radius/thickness/waver/roll, tail x/topY/length/width/depth/round/lean |
| `three/character/scarf.ts` | rewritten: the swept, wavering neck wrap and the strap tail |
| `test/character.test.ts` | the scarf is merged not drawn apart, the loop's radius varies around the neck, it rests on the shoulder ball, the tail is a strap and short |
| `e2e/view3d.spec.ts` | budget restored to 150; the Phase 1 overage recorded as a named deviation |

Nothing in the base character was touched.

## Automated validation

- `npm run typecheck` clean; `npm test` — **198 passed** (1 new).
- Playwright v1.64.1-noble, 4 GB / 6 CPUs — **72 passed** across iPhone,
  iPhone landscape, iPad and iPad landscape.

## Known limitations carried forward

The shoulder's short intersection arc, accepted at the Phase 1 review, is
unchanged — no shoulder geometry was touched in this phase.

## Not in this phase

The hat. It still renders in the game from its own toggle, but it has not been
fitted to the head since the Phase 1 rebuild.
