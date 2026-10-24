# Asset licenses

Everything shipped by this project is either generated at runtime from code or
listed below. There are no downloaded sprites, icons, logos, sounds, or music.

## Graphics

**All graphics are drawn in code** — Phaser `Graphics` primitives and, where
relevant, `generateTexture()`. No raster or vector art files are bundled, and
no third-party art is used, traced, or adapted.

The optional 3D view (`?view=3d`) follows the same rule: every mesh is built
from three.js primitive geometry (boxes, cylinders, spheres, icosahedra) or
from the map grid, coloured with per-vertex colours from the project palette.
The only textures are drawn at runtime on a canvas. No models, image
textures, or environment maps are downloaded or bundled.

## The map outline

`packages/shared/src/map/coastline.txt` is a land/sea mask, one character per
tile, of the island the game is set on. It is a stylized silhouette: the
proportions were set by hand to suggest a river basin ringed by mountains and
opening to the sea on one side, which is the shape the setting calls for.

The coarse geography it evokes is a matter of where land and water happen to
be, which is not something anyone owns. No map publisher's rendering, styling,
tiles or data are reused, and **no reference image ships with this
repository**.

Everything inside the outline — rivers, hills, parks, streets, towns — is
placed by `scripts/build-map.mjs`. Place names are used as names only.

## Fonts

| File | Font | Version | License | Source |
| --- | --- | --- | --- | --- |
| `packages/client/public/fonts/jf-openhuninn-2.1.woff2` | jf open huninn | 2.1 | SIL Open Font License 1.1 | <https://github.com/justfont/open-huninn-font> |

The full license text ships alongside the font as
`packages/client/public/fonts/jf-openhuninn-OFL-LICENSE.txt`, as OFL 1.1
requires. Reserved Font Names: `open huninn`, `huninn`.

jf open huninn credits two upstream works in that same license file, both
permissive and compatible:

| Upstream | License | Note |
| --- | --- | --- |
| Kosugi Maru (MOTOYA CO., LTD.) | Apache License 2.0 | the Han glyphs are derived from it |
| Varela Round | SIL Open Font License 1.1 | Reserved Font Names: `Varela`, `Varela Round` |

The committed file is a WOFF2 re-encoding of the upstream TTF, produced by
`scripts/build-font.sh`. Nothing is subsetted: all 12,260 glyphs are intact,
because player nicknames may contain any Han character. Re-encoding a font is
explicitly permitted by OFL 1.1, and the Reserved Font Names are unchanged.

The CSS fallback stack names `Noto Sans TC` (SIL OFL 1.1) and the system faces
`PingFang TC` and `Hiragino Sans`. None of these are bundled — they are used
only if already present on the reader's device.

## Sounds and music

None. The project ships no audio files.

## Third-party code

Runtime and build dependencies are declared in `package.json` and installed
from npm; their licenses are their own. The notable runtime dependencies are
Phaser (MIT) and three.js (MIT, loaded only for the 3D view) on the client,
and `ws` (MIT) on the server. `@types/three` (MIT) is a build-time dependency
only.
