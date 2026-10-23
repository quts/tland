# Asset licenses

Everything shipped by this project is either generated at runtime from code or
listed below. There are no downloaded sprites, icons, logos, sounds, or music.

## Graphics

**All graphics are drawn in code** — Phaser `Graphics` primitives and, where
relevant, `generateTexture()`. No raster or vector art files are bundled, and
no third-party art is used, traced, or adapted.

## The map outline

`packages/shared/src/map/coastline.txt` is a land/sea mask, one character per
tile, of the combined Taipei City and New Taipei City administrative outline.
It was traced from a reference image down to a 136 x 160 grid — coarse enough
that what survives is the geographic fact of where the coast runs, which is
not something anyone owns. **The reference image itself is deliberately not in
this repository**, so nothing here depends on its provenance.

Everything inside the outline — rivers, hills, parks, streets, towns — is
placed by `scripts/build-map.mjs`, positioned to echo the real geography
rather than to reproduce any map of it. Place names are used as names; no
map publisher's rendering, styling or data is reused.

Landmarks and scenery, when they arrive in later milestones, are generic
original shapes (a tall tower, a temple roof, a bridge). No real organization's
logo, trademark, wordmark, or emblem appears anywhere in this project.

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
Phaser (MIT) on the client and `ws` (MIT) on the server.
