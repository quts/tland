import * as THREE from 'three';

import type { CharacterColors } from '../../gfx/characterColors.js';
export { DEFAULT_COLORS, CHARACTER_PALETTES, type CharacterColors } from '../../gfx/characterColors.js';

/**
 * Which slot of the palette a vertex is tinted with. Geometry carries this
 * number; the colour itself lives in the material.
 */
export const PART = {
  skin: 0,
  hair: 1,
  outfit: 2,
  shoes: 3,
  hat: 4,
  hatRibbon: 5,
  scarf: 6,
} as const;

const ORDER: ReadonlyArray<keyof CharacterColors> = [
  'skin', 'hair', 'outfit', 'shoes', 'hat', 'hatRibbon', 'scarf',
];

export function colorKey(colors: CharacterColors): string {
  return ORDER.map((slot) => colors[slot]).join('|');
}

/**
 * The character material: the town's own Phong shading, with the palette
 * added as a uniform the vertex shader looks up by part number.
 *
 * This is what lets one geometry serve every character. The vertex colour
 * holds the base darkening as grey, and the palette tints it — so a character
 * changes colour by using a different material, never by being rebuilt.
 */
export function characterMaterial(colors: CharacterColors): THREE.MeshPhongMaterial {
  const palette = ORDER.map((slot) => new THREE.Color(colors[slot]));
  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    flatShading: false,
    specular: 0x554938,
    shininess: 20,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms['palette'] = { value: palette };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float partId;\nuniform vec3 palette[7];',
      )
      .replace(
        '#include <color_vertex>',
        '#include <color_vertex>\n\tvColor.rgb *= palette[int(partId + 0.5)];',
      );
  };
  // Materials that inject the same code can share one compiled program, but
  // they must not share with a plain Phong material that injects none.
  material.customProgramCacheKey = (): string => 'character-palette';
  return material;
}

/**
 * One material per distinct palette, shared by everyone wearing it.
 *
 * Per-character colours need per-character uniforms, and uniforms belong to a
 * material — so a palette costs a material. Two characters coloured the same
 * share one.
 */
export class CharacterMaterialCache {
  private readonly materials = new Map<string, THREE.MeshPhongMaterial>();

  get(colors: CharacterColors): THREE.MeshPhongMaterial {
    const key = colorKey(colors);
    let material = this.materials.get(key);
    if (material === undefined) {
      material = characterMaterial(colors);
      this.materials.set(key, material);
    }
    return material;
  }

  get size(): number {
    return this.materials.size;
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}
