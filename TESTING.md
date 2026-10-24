# Manual iOS test checklist

Automated tests cover the logic, and the Playwright suite drives WebKit with
iPhone and iPad emulation. These cover the things only a real phone shows:
the software keyboard, backgrounding, safe areas, and how the controls feel
under a thumb.

Setup: `./scripts/container-up.sh` (or `docker compose up --build`), then open
`http://<mac-lan-ip>:8080/?view=2d` on the device for the 2D checklists below,
or the plain address for the 3D one further down. See the README for finding
that address.

## Join screen

- [ ] The page loads over the LAN address on iPhone Safari.
- [ ] The page loads on iPad Safari.
- [ ] Text renders in the rounded font, not a system fallback.
- [ ] Tapping a skin, shirt, hat or accessory updates the preview immediately.
- [ ] Every swatch and chip is comfortably hittable with a thumb.
- [ ] Focusing the nickname field does **not** zoom the page.
- [ ] The keyboard's "go" key joins the town.
- [ ] The button stays disabled until the name field has something in it.
- [ ] With the keyboard open, the join button is still reachable by scrolling.

## In the world

- [ ] The status pill reaches **已連線** within a second or two.
- [ ] The player count matches the number of devices connected.
- [ ] A district banner appears when you cross into a new district.
- [ ] The character you built is the character you are walking around as.

### Controls

- [ ] The joystick moves the character in every direction, including diagonals.
- [ ] Pushing the joystick into a wall slides along it rather than sticking.
- [ ] The joystick returns to centre when you lift your thumb.
- [ ] Dragging past the edge of the ring keeps moving in that direction.
- [ ] Tapping a spot walks there, around buildings and along bridges.
- [ ] Tapping the river or a building walks to the nearest reachable spot.
- [ ] Tapping shows the ring marker where you tapped.
- [ ] Taking hold of the joystick cancels a tap-to-move route.
- [ ] A drag on the world does not get read as a tap.

### Layout and safe areas

- [ ] Portrait: the HUD pills clear the notch or Dynamic Island.
- [ ] Landscape, both rotations: the HUD, joystick and emote column clear the
      rounded corners and the home indicator.
- [ ] Rotating re-centres the view with no letterboxing, no stretched text,
      and no stale canvas size.
- [ ] One-finger scrolling does nothing — no rubber-band bounce.
- [ ] Pinching does not zoom the page.
- [ ] Double-tapping does not zoom the page.
- [ ] Long-pressing the canvas does not raise the copy/share callout.
- [ ] Scrolling Safari's toolbars away does not leave a gap at the bottom.

### Chat and the keyboard

- [ ] Tapping 說話 opens the field and raises the keyboard.
- [ ] **The field stays visible above the keyboard** — this is the one most
      likely to regress.
- [ ] Sending closes the keyboard and shows your bubble above your character.
- [ ] Typing does not walk the character.
- [ ] Tapping away from an empty field folds it back to the button.
- [ ] A bubble fades after about six seconds.
- [ ] A long message wraps rather than running off the screen.
- [ ] Sending six messages quickly gets a "slow down" notice on the sixth.

### Two devices

- [ ] Both see each other appear and move, smoothly rather than in jumps.
- [ ] Standing close together, each sees the other's bubbles.
- [ ] Walking four or five tiles apart, bubbles stop arriving.
- [ ] Walking back and forth across that boundary does not make bubbles blink
      on and off.
- [ ] Emotes pop above the right character on both devices.
- [ ] The minimap shows a dot for the other player.

### Connection behaviour

- [ ] Background the tab (switch apps, or lock the screen) for a minute, then
      return: the pill goes back to **已連線** on its own within a few seconds,
      without a reload, and you are still standing where you were.
- [ ] Turn Wi-Fi off: the pill becomes **連線中斷，重試中…**.
- [ ] Turn Wi-Fi back on: it reconnects by itself.
- [ ] Restart the game server (`./scripts/container-up.sh --no-build`): every
      device reconnects and rejoins without a reload.
- [ ] Two devices connected, then force-quit Safari on one: the other's player
      count drops within about a minute (the server's heartbeat sweep).

### Performance

- [ ] Walking is smooth; no visible stutter crossing the town.
- [ ] The minimap does not cause a hitch when toggled on.
- [ ] The device does not get noticeably warm after a few minutes.

## The 3D view (the default)

Open `http://<mac-lan-ip>:8080/?view=3d&debug=1` — naming the view also
undoes a remembered 2D choice from the checklists above. `debug=1` adds the readout
in the top-left corner: frame rate, frame time (average and worst), CPU time
per frame, draw calls, triangles, and live geometries and textures. Write the
numbers down; they are the point of this section.

### Frame rate and budgets

Targets on an iPhone 12-class device: **55 fps or better**, **under 150 draw
calls**.

- [ ] Standing still in the town centre after joining: fps ____ calls ____
      tris ____.
- [ ] Walking steadily for ten seconds: fps ____, worst frame ____ ms.
- [ ] Over the wooded northern hills, the heaviest view — add `&at=64,40`
      before joining to start there: fps ____ calls ____.
- [ ] With thirty other players around you (see *Crowds* below): fps ____
      calls ____.
- [ ] `geom` and `tex` stay level while you walk about; a number that keeps
      climbing is a leak.

### Looks and controls

- [ ] The join screen shows a 3D figure, and it changes with every skin,
      outfit, hat and accessory you pick.
- [ ] The character you built is the one walking around.
- [ ] Up on the joystick walks up the screen; every direction matches the 2D
      view.
- [ ] Tapping the ground walks there, with a ring where you tapped. Tapping
      a house or a hill walks to the nearest spot you can reach.
- [ ] The camera follows smoothly and never turns.
- [ ] Name tags, bubbles and emotes sit over the right heads, track them while
      they walk, and vanish when their owner walks off screen.
- [ ] District banners and the minimap behave exactly as in 2D.

### Rotation and the background

- [ ] Rotate to landscape and back: no stretched picture, no letterboxing,
      and the same width of town in view as before.
- [ ] Background the tab for a minute and come back: drawing resumes, the
      connection recovers as in 2D, and no "struggling" prompt appears because
      of the pause.

### Losing the graphics

- [ ] Tap **模擬失去畫面** in the debug readout: a "正在恢復" card appears
      and the world comes back by itself after about two seconds, still
      following you.
- [ ] Turn WebGL 2.0 off (Settings → Apps → Safari → Advanced → Feature
      Flags) and open the plain address: the page explains that 3D is unavailable
      and lets you into the 2D town instead. Turn it back on afterwards.
- [ ] On a device that cannot keep up (or with Low Power Mode on), after
      about five seconds under 30 fps a card offers to switch to 2D. It only
      asks; choosing **繼續用 3D** keeps 3D and it does not ask again.
- [ ] Choosing **改用 2D** there reloads in 2D, and opening the plain address
      afterwards stays in 2D.

### Crowds

From the Mac, with the stack running, send thirty bots to where you are
standing (the zone banner and minimap tell you roughly; any tile works):

```bash
./scripts/dev.sh sh -c 'npm run build -w @tland/shared && node scripts/bots.mjs --url ws://<mac-lan-ip>:8080/ws --count 30 --near 68,72'
```

They walk over at a legal speed, then mill about, chatting and waving. Ctrl+C
sends them home and reports how many of their steps the server refused, which
should be none.

- [ ] Thirty avatars in view, each with its own look and name tag.
- [ ] Their bubbles and emotes appear over the right heads.
- [ ] Frame rate and draw calls recorded above.

## Running the automated suites

```bash
./scripts/dev.sh npm test
```

```bash
./scripts/e2e.sh
```

The end-to-end suite builds the client, starts the game server and a static
preview, and drives WebKit with four profiles — iPhone and iPad, each in
portrait and landscape. In 2D each one joins, walks by tapping, sends a
message and sees its own bubble, fires an emote, opens the minimap, and checks
the layout fits without the page scrolling.

The 2D spec opens `?view=2d`. The 3D spec (`e2e/view3d.spec.ts`) checks that
the plain address opens 3D and that choosing 2D is remembered, joins, checks
the draw-call
budget, taps a tile chosen a few steps away and waits for the player to stand
on exactly that tile, and checks the join screen's 3D preview changes with the
avatar. It asserts behaviour, never frame rate: WebGL in a container may be
software-rendered.

What two players can see of each other is covered twice. The 3D spec starts a
private game server pinned to one spawn tile (through the server's existing
`fixedSpawn` option) and brings in bots — plain WebSocket clients speaking the
real protocol — so it can check that a nearby player's name, bubble and emote
appear over their head, and that thirty of them stay within the draw-call
budget. And `packages/server/test/integration.test.ts` drives two real
WebSocket clients against a real server, asserting the join handshake,
movement relay, position validation, the exact proximity radii including the
hysteresis band, the chat rate limit and the room-full refusal. Playwright's
Linux WebKit will not automate a second page or context, which is why the
second player is a bot rather than another browser.
