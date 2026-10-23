# Manual iOS test checklist

Automated tests cover logic; these cover the things only a real phone shows.
Run through them on an actual iPhone and iPad in Safari — not in a desktop
browser's device emulator, which gets the keyboard, the toolbars, and the
backgrounding behaviour wrong.

Setup: `./scripts/container-up.sh` (or `docker compose up --build`), then open
`http://<mac-lan-ip>:8080` on the device. See the README for finding that
address.

## Milestone 1 — skeleton

- [ ] The page loads over the LAN address on iPhone Safari.
- [ ] The page loads on iPad Safari.
- [ ] The status pill reaches **已連線** within a second or two.
- [ ] The player count appears and matches the number of devices connected.
- [ ] Text renders in the rounded font, not a system fallback.

### Layout and safe areas

- [ ] Portrait: the HUD pills clear the notch / Dynamic Island.
- [ ] Landscape, both rotations: the HUD clears the rounded corners and the
      home indicator; nothing is cut off on the curved edges.
- [ ] Rotating the device re-centres the scene with no letterboxing, no
      stretched text, and no stale canvas size.
- [ ] Scrolling the page with one finger does nothing — no rubber-band bounce
      past the top or bottom.
- [ ] Pinching does not zoom the page.
- [ ] Double-tapping does not zoom the page.
- [ ] Long-pressing the canvas does not raise the copy/share callout.
- [ ] Scrolling Safari's toolbars away does not leave a gap at the bottom.

### Connection behaviour

- [ ] Background the tab (switch apps, or lock the screen) for a minute, then
      return: the status pill goes back to **已連線** on its own, within a few
      seconds, without a reload.
- [ ] Turn Wi-Fi off: the pill becomes **連線中斷，重試中…**.
- [ ] Turn Wi-Fi back on: it reconnects on its own.
- [ ] Restart the game server (`./scripts/container-up.sh --no-build`): every
      connected device reconnects without a reload.
- [ ] Two devices connected, then force-quit Safari on one: the other's player
      count drops within about a minute (the server's heartbeat sweep).

### Performance

- [ ] The scene animates smoothly; no visible stutter.
- [ ] The device does not get noticeably warm after a few minutes.

## Later milestones

Added as each one lands.

- Milestone 2: joystick feel, tap-to-move pathing, camera follow at the map edges.
- Milestone 3: avatar builder on a small screen, nickname entry.
- Milestone 4: the chat input is never covered by the iOS keyboard; bubbles
  stay legible over busy terrain; the minimap is tappable at thumb size.
- Milestone 5: refusal message when the room is full.
