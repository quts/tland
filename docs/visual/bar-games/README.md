# Bar block games

Click the bartender, choose Y to play or N to stay in the bar. Each game fills the viewport over that house's existing high-resolution bar artwork.

- Moore House: arrange six blocks to define `fib(n)`, test `n ≤ 1`, return `n`, otherwise return `fib(n − 1) + fib(n − 2)`, and end the function. The bank begins scrambled.
- Shockley House: four movable blocks inside fixed `isEven(n)` function boundaries: `如果 n % 2 == 0`, `回傳 True`, `否則`, `回傳 False`.
- Wilson House: [interactive half-adder circuit](../half-adder/README.md).
- Other nine houses: `1 + 1 = ?`, with a single `2` answer block.
- Tap a bank block to fill the first empty slot. Tap a placed block to return it. Drag blocks into slots to place or swap them. Both panels scroll independently on small displays.
- Submit shows `太棒了` for the complete correct order and `你再試試看` for incorrect/incomplete answers. Reset clears the arrangement. The back arrow or Escape returns to the bar; returning outdoors restores movement.

Questions, bank blocks, colors, and accepted order live in `packages/client/src/world/barGames.ts`. Replace the corresponding house's `HOUSE_GAMES` entry to introduce another question without changing the interaction or layout. Answers are checked locally; this version does not execute submitted code or persist scores.

Validation: typecheck, lint, unit suite, production build, and WebKit end-to-end coverage for iPhone/iPad in portrait/landscape and 2D/3D worlds. Tests cover declining/accepting, wrong and correct answers, taking blocks back, reset/re-entry, Escape, focus restoration, and frozen outdoor movement. Tablet landscape additionally covers dragging and swapping.

Actual WebKit captures: [Moore on tablet](moore-tablet.png), [Moore on phone](moore-phone.png), [addition on phone](addition-phone.png), [invitation](invitation-phone.png), [correct Fibonacci answer](moore-success-phone.png), [correct addition answer](addition-success-phone.png).

Verified after adding Shockley: 224 unit tests and 24 game browser scenarios passed across all four device/orientation projects in 2D/3D, including touch and drag/swapping. Typecheck, lint and production build passed. The original bar integration previously passed 32 scenarios plus 4 additional touch/drag scenarios.

Shockley captures: [phone](shockley-phone.png), [tablet](shockley-tablet.png). Fixed function boundaries remain in place when resetting or taking blocks back.
