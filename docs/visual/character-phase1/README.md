# Phase 1 — base character

**Status: waiting on review. No scarf, no hat.**

Validated on 2026-10-25 in Apple Container on macOS arm64. Builds, unit tests
and browser tests ran inside Linux containers; every image is a render of the
same geometry the game uses, under the town's own lighting, through an
`OrthographicCamera` so no view's proportions are bent by perspective.

## Seven views

Head and face, brown bowl cut, rounded torso in lavender, shoulders, sleeves
and hands, shoes. Nothing else.

![Turnaround](turnaround.png)

## Shoulders and arms

![Shoulders and arms](shoulders-and-arms.png)

## What changed, and why

| | Before | Now |
| --- | --- | --- |
| Head | squashed 0.95 | 0.98, nearly spherical, so the face stays full from the side |
| Hair | a shell hugging the skull, hem ending on a rim | a mushroom standing off it, hem rolled back under so the edge has thickness |
| Torso | ball, or ball plus a shoulder ball | one turned profile: egg, drawn in at the shoulders, fullest at the belly |
| Shoulder | a dome stuck on the end of a cylinder | dome, taper and cuff are one turned surface — a dome plus a cylinder leaves a ring where they meet |
| Arm splay | 20° | 22°, and the arm now hangs forward of the body's centre so the sleeve clears the torso's side |
| Hand | 0.078, narrower than the cuff | 0.085 rounded ellipsoid, reading as a ball at the end of the sleeve |
| Neck | a cylinder between head and collar | none — this brief asks for head and collar kept compact |

That last row reverses the previous pass, which added a neck on the strength
of the earlier sheets' `圓領` panel. This brief says `不要增加脖子長度`, so the
neck is gone and the head sits straight on the collar. Worth a word at review:
the two briefs disagree and the newer one won.

## Architecture

```
three/character/proportions.ts   every measurement, one coordinate system
three/character/baseCharacter.ts head, hair, ears, torso, arms, shoes
three/character/scarf.ts         independent component
three/character/hat.ts           independent component, stacked from HEAD_TOP
three/character/accessories.ts   glasses, satchel, bowtie
three/character/index.ts         assembly, showHat / showScarf
```

`avatar3d.ts` keeps its public surface and is now the view's side of it: the
geometry cache and the face texture.

Nothing hard-codes a position of its own; each component reads `PROPORTIONS`.
The scarf and the hats were moved across unchanged — fitting them to the new
head and shoulders is Phase 3 and Phase 4, and neither is allowed to reshape
what Phase 1 settles. The only thing a hat says about the head is whether it
covers the crown, so the hair can leave it off.

### The arm pivot

Each arm is built in its own space with the origin on the shoulder joint,
running down -y, then turned about that origin and set on the body. That is
what puts the pivot on the joint instead of the middle of the sleeve: one
`armTilt` turns the shoulder cap, sleeve, forearm and hand together without
moving where they attach. A test holds it — swinging the arms widens the
figure without lifting or dropping it, and the hand stays one arm's length
from the joint.

Live per-frame arm animation would need the arms split into their own meshes.
They are merged into the single per-character geometry today, which is what
keeps thirty avatars inside the draw-call budget. The geometry and the pivot
are ready for it; the split is not done, and it is not free.

## Automated validation

- `npm run typecheck` clean; `npm test` — **194 passed** (4 new).
- Playwright v1.64.1-noble, 4 GB / 6 CPUs — **72 passed** across iPhone,
  iPhone landscape, iPad and iPad landscape.
- New tests cover the two toggles, the shoulder pivot, and that the character
  is symmetric left to right to six decimal places.
- The existing geometry test still covers all 25 hat/accessory combinations.

## Not in this phase

Scarf (Phase 3) and hat (Phase 4) are untouched beyond being moved into their
own files. They still render in the game, from the same toggles, so nothing a
player has picked has stopped working — they have simply not been fitted to
the new head and shoulders yet.
