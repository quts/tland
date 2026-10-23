# Manual iOS test checklist

Automated tests cover the logic, and the Playwright suite drives WebKit with
iPhone and iPad emulation. These cover the things only a real phone shows:
the software keyboard, backgrounding, safe areas, and how the controls feel
under a thumb.

Setup: `./scripts/container-up.sh` (or `docker compose up --build`), then open
`http://<mac-lan-ip>:8080` on the device. See the README for finding that
address.

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

## Running the automated suites

```bash
./scripts/dev.sh npm test
```

```bash
./scripts/e2e.sh
```

The end-to-end suite builds the client, starts the game server and a static
preview, and drives WebKit with four profiles — iPhone and iPad, each in
portrait and landscape. Each one joins, walks by tapping, sends a message and
sees its own bubble, fires an emote, opens the minimap, and checks the layout
fits without the page scrolling.

What two players can see of each other is covered separately, by
`packages/server/test/integration.test.ts`: two real WebSocket clients against
a real server, asserting the join handshake, movement relay, position
validation, the exact proximity radii including the hysteresis band, the chat
rate limit and the room-full refusal. Playwright's Linux WebKit will not
automate a second page or context, and the server's relay logic is what a
two-browser test would really have been asserting.
