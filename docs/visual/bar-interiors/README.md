# Full-screen bar interiors

2026-10-25 · branch: `codex/sharp-bar-assets`

The front-row house actions now include **進入屋子** below **閱讀告示牌**.
Each house loads its own separately rendered 1536 × 1024 bar image on entry.
The previous 312 × 206 contact-sheet windows have been replaced; no thumbnail
sheet or SVG crop remains in the runtime view. Source/provenance is recorded
in ASSET_LICENSES.md.

The high-resolution image fills the complete game viewport edge to edge in portrait and
landscape, preserving aspect ratio and cropping to cover. There is no header,
house/style caption, instruction text or scene frame. Only a small safe-area
return arrow floats over the image. House/style labels remain available to
assistive technology without being displayed.

Clicking anywhere in the scene opens **你好** with an **OK** button. OK/Escape
dismiss the greeting while remaining inside. The return arrow or Escape from
the room returns to the same outdoor position and restores focus/movement.
The existing house introduction remains usable.

Interiors are local image views rather than additional multiplayer rooms.
Outdoor movement is paused; no room geometry or new server messages are added.

## Verification

- Type checking, ESLint, 219 unit tests and production build passed.
- **16 high-resolution WebKit scenarios passed**, covering 2D/3D, two different house styles, all four iPhone/iPad
  orientations, exact viewport-edge coverage, absence of captions, greeting/OK,
  image loading, pause/resume, return focus and noticeboard compatibility.
- Unit checks verify twelve unique house/image/style assignments and read the
  physical dimensions from every shipped lossless WebP.
- Existing large-bundle warning remains.

Run `npm run build`, then:

```sh
npx playwright test e2e/bar-interiors.spec.ts
```

![Portrait](portrait.png)

![Landscape](landscape.png)

![Greeting](greeting.png)

## High-resolution replacement

The built-in image_gen tool produced twelve full-scene assets using the user's
new quality reference. The base scene removes the embedded minigame dialog and
cursor. Color edits retain the bartender and composition. Final prompts are in
[prompts-v2.json](prompts-v2.json). This quality correction does not introduce a
minigame or change the existing hello/OK interaction.

Final runtime assets are in `packages/client/public/images/bars/`. Each is
1536 × 1024 (about 24 times the original window's pixel count) and stored as
lossless WebP without resizing or sharpening. A decoded-pixel comparison
against each generated PNG passed. [assets-v2.json](assets-v2.json) records
sizes, dimensions and hashes.

The native `img` uses `object-fit: cover`. Updated browser tests decode the
selected image and assert naturalWidth >= 1536, naturalHeight >= 1024, full
viewport coverage and the correct house's independent image path. Unit tests
read the actual lossless WebP headers of all twelve files, so a future
thumbnail substitution cannot pass by changing metadata alone.

[All twelve full-resolution assets](gallery-v2.html) · [Generation prompts](prompts-v2.json)
