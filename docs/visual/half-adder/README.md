# Wilson House — half adder

The bartender's Y choice opens a half-adder challenge instead of the addition placeholder. The existing high-resolution Wilson bar remains the background.

- Bank: AND, OR, XOR, NOT, each with its gate symbol and color.
- Circuit: fixed A/B fan-out wiring and two editable gate sockets leading to Sum and Carry. Tap a gate and then a socket, or drag a gate into a socket. Tap an occupied socket with no gate selected to clear it. Gates are reusable.
- Test: simulates all four A/B inputs and fills the truth table with actual outputs. Cells distinguish correct and incorrect values. Only XOR → Sum and AND → Carry passes all rows.
- NOT takes A only; its B wire is shown disconnected. Missing gates retain unknown outputs and cannot pass.
- Correct feedback: `太棒了`; incorrect/incomplete feedback: `你再試試看`.
- Reset clears both sockets and results. On narrow screens the workspace scrolls, and testing brings the results into view. The footer remains reachable.

Implementation: `packages/client/src/world/halfAdder.ts` contains the simulator; `packages/client/src/ui/halfAdderPuzzle.ts` renders the native, interactive circuit. `barGames.ts` routes Wilson to the circuit game, Moore/Shockley to their existing puzzles, and the remaining nine houses to the addition placeholder.

Validation: typecheck, lint, production build and 228 unit tests passed. Eight WebKit circuit scenarios covered iPhone/iPad portrait/landscape in 2D/3D, six iPhone regressions covered the existing block games, and four final layout scenarios verified that the last truth-table row becomes visible after testing. Coverage includes incomplete/wrong/correct circuits, all four input rows, NOT, touch, drag, clearing/replacing gates, reset, re-entry, Escape and outdoor movement pause.

Actual captures: [tablet ready](tablet-ready.png), [tablet result](tablet-result.png), [phone ready](phone-ready.png), [phone result](phone-result.png).

The question screen deliberately withholds the gate mapping, and the answer-revealing hint button has been removed. The simulator still checks the gate choices and shows their actual truth-table outputs after testing.
