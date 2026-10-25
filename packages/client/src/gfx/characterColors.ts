/**
 * The character's colours — the only thing about it that varies.
 *
 * Geometry, proportions and the outfit are fixed. Every character is the same
 * mesh; what changes between them is this, and nothing here can change a
 * shape.
 */
export interface CharacterColors {
  skin: string;
  hair: string;
  outfit: string;
  shoes: string;
  hat: string;
  hatRibbon: string;
  scarf: string;
}

/** The signature look: straw hat, coral ribbon and scarf, lavender outfit. */
export const DEFAULT_COLORS: CharacterColors = {
  skin: '#fbe0c6',
  hair: '#5c4232',
  outfit: '#c9b6e4',
  shoes: '#4b3a2f',
  hat: '#f2d58a',
  hatRibbon: '#e0796b',
  scarf: '#e0796b',
};

/** Reference-sheet palettes; every entry uses the same fixed geometry. */
export const CHARACTER_PALETTES: ReadonlyArray<{
  readonly name: string;
  readonly colors: Readonly<CharacterColors>;
}> = [
  { name: '甜美款', colors: { ...DEFAULT_COLORS, outfit: '#e9a7a6', scarf: '#d98079', hatRibbon: '#d98079', hat: '#f1d4a0' } },
  { name: '清新款', colors: { ...DEFAULT_COLORS, outfit: '#a5bada', scarf: '#438dc7', hatRibbon: '#438dc7' } },
  { name: '自然款', colors: { ...DEFAULT_COLORS, outfit: '#91aa97', scarf: '#d48550', hatRibbon: '#65785b', hat: '#dfbb89' } },
  { name: '秋日款', colors: { ...DEFAULT_COLORS, outfit: '#bea17a', scarf: '#607354', hatRibbon: '#745332', hat: '#d7b17d' } },
  { name: '經典款', colors: DEFAULT_COLORS },
  { name: '溫柔款', colors: { ...DEFAULT_COLORS, outfit: '#bfb6c2', scarf: '#9567ba', hatRibbon: '#9567ba', hat: '#eee7da' } },
  { name: '天空款', colors: { ...DEFAULT_COLORS, outfit: '#a9c6f0', scarf: '#438dc7', hatRibbon: '#438dc7' } },
  { name: '奶油款', colors: { ...DEFAULT_COLORS, outfit: '#e9e2d4', scarf: '#b48496', hatRibbon: '#b48496' } },
];
