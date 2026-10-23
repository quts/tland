/**
 * The whole visual identity in one place: soft pastels, warm ink outlines.
 * Every colour here is used by code-drawn graphics; nothing is loaded.
 */
export const PALETTE = {
  ink: 0x4b4033,
  inkSoft: 0x7a6c5a,

  grass: 0xa9dcc0,
  grassAlt: 0x9fd6b8,
  grassDeep: 0x7cc39f,

  sand: 0xf0e0bd,
  sandAlt: 0xe6d3ab,

  water: 0x8fcfe3,
  waterDeep: 0x6fb9d2,
  waterFoam: 0xd3edf5,

  hill: 0x8fc9a8,
  hillHigh: 0xa8d8bc,
  hillRock: 0xb9ab8e,

  path: 0xeadbbd,
  pathAlt: 0xe2d1ae,
  pathEdge: 0xcdb98f,

  bridge: 0xc9a87c,
  bridgePlank: 0xb8946a,

  wall: 0xfdf7ec,
  wallAlt: 0xf3e7d4,
  roofWarm: 0xe49a8c,
  roofCool: 0x8fb8d9,
  roofMint: 0x90c9ae,
  door: 0xb8946a,

  trunk: 0xb8946a,
  leafLight: 0x8ed1a6,
  leafDark: 0x6fb98c,

  petalRose: 0xf3b8bf,
  petalCream: 0xfbe8a6,
  petalLilac: 0xc9b6e4,
  petalCore: 0xf7e2a0,

  rock: 0xc3bbab,
  rockShade: 0xa8a090,

  bench: 0xc9a87c,
  benchShade: 0xa8855f,

  shadow: 0x4b4033,
} as const;

/** Rounded-corner radius used across UI chrome, in CSS pixels. */
export const UI_RADIUS = 14;
