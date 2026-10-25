import * as THREE from 'three';
import { MAX_PLAYERS, TILE_SIZE, type Direction } from '@tland/shared';
import type { AvatarParts } from '../gfx/avatar.js';
import {
  AVATAR_TOP, AVATAR_SCALE, CharacterMaterialCache, assembleCharacter,
  faceGeometry, faceTexture, type AssembledCharacter,
} from './avatar3d.js';
import { characterColorsFor } from '../gfx/avatar.js';
import { SHADOW_X, SHADOW_Z } from './lighting.js';

/** Room for everyone the server admits, plus the local player. */
const CAPACITY = MAX_PLAYERS + 1;
const TURN_RATE = 12;
const HEADING_FOR: Record<Direction, number> = {
  down: 0,
  up: Math.PI,
  left: -Math.PI / 2,
  right: Math.PI / 2,
};

interface Character {
  readonly figure: AssembledCharacter;
  heading: number;
  lastX: number;
  lastY: number;
  walkPhase: number;
  /** Where the character is drawn this frame, in tiles. */
  readonly drawn: THREE.Vector3;
}

const matrix = new THREE.Matrix4();
const shadowScale = new THREE.Vector3(AVATAR_SCALE, 1, AVATAR_SCALE * 0.8);
const identity = new THREE.Quaternion();
const sunScale = new THREE.Vector3(AVATAR_SCALE * 1.05, 1, AVATAR_SCALE * 1.35);
const sunRotation = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0), Math.atan2(SHADOW_X, SHADOW_Z),
);
const lift = new THREE.Vector3();

/**
 * Every avatar on screen.
 *
 * A character is a body mesh from cached merged geometry, plus an arm in a
 * group of its own on each shoulder so the arms can be posed. Faces and blob
 * shadows are the same for everyone, so all of them together are one
 * InstancedMesh each, rewritten every frame from the characters' transforms.
 */
export class CharacterLayer {
  readonly group = new THREE.Group();
  private readonly characters = new Map<string, Character>();
  private readonly palettes = new CharacterMaterialCache();
  private readonly faces: THREE.InstancedMesh;
  private readonly shadows: THREE.InstancedMesh;

  constructor(
    shadowGeometry: THREE.BufferGeometry,
    shadowMaterial: THREE.Material,
  ) {
    this.group.name = 'characters';
    const faceMaterial = new THREE.MeshPhongMaterial({
      specular: 0x262016,
      shininess: 24,
      map: faceTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.faces = new THREE.InstancedMesh(faceGeometry(), faceMaterial, CAPACITY);
    this.faces.name = 'faces';
    this.faces.count = 0;
    // Instances roam the whole island; a fixed bounding sphere would cull them wrongly.
    this.faces.frustumCulled = false;
    this.shadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, CAPACITY * 2);
    this.shadows.name = 'character-shadows';
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    this.group.add(this.faces, this.shadows);
  }

  has(id: string): boolean {
    return this.characters.has(id);
  }

  add(id: string, avatar: AvatarParts, x: number, y: number, direction: Direction): void {
    this.remove(id);
    const figure = assembleCharacter(this.palettes.get(characterColorsFor(avatar)));
    figure.root.name = `avatar-${id}`;
    const character: Character = {
      figure,
      heading: HEADING_FOR[direction],
      lastX: x,
      lastY: y,
      walkPhase: 0,
      drawn: new THREE.Vector3(x / TILE_SIZE, 0, y / TILE_SIZE),
    };
    figure.root.position.copy(character.drawn);
    figure.root.rotation.y = character.heading;
    figure.root.scale.setScalar(AVATAR_SCALE);
    this.characters.set(id, character);
    this.group.add(figure.root);
  }

  setAvatar(id: string, avatar: AvatarParts): void {
    const character = this.characters.get(id);
    if (character === undefined) return;
    // Colour only: the geometry is shared and is never rebuilt.
    character.figure.setMaterial(this.palettes.get(characterColorsFor(avatar)));
  }

  remove(id: string): void {
    const character = this.characters.get(id);
    if (character === undefined) return;
    this.group.remove(character.figure.root);
    this.characters.delete(id);
  }

  /** Where a character is drawn this frame, in tiles; for overlays. */
  positionOf(id: string): THREE.Vector3 | undefined {
    return this.characters.get(id)?.drawn;
  }

  /**
   * Move one character to its position for this frame. `x` and `y` are world
   * pixels; facing follows the direction actually travelled, falling back to
   * the reported direction when standing still.
   */
  place(id: string, x: number, y: number, direction: Direction, walking: boolean, seconds: number): void {
    const character = this.characters.get(id);
    if (character === undefined) return;
    const dx = x - character.lastX;
    const dy = y - character.lastY;
    const target = dx * dx + dy * dy > 0.01 ? Math.atan2(dx, dy) : walking ? character.heading : HEADING_FOR[direction];
    let turn = target - character.heading;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    character.heading += turn * Math.min(1, seconds * TURN_RATE);
    character.lastX = x;
    character.lastY = y;

    character.walkPhase = walking ? character.walkPhase + seconds * 13 : 0;
    const bob = walking ? Math.abs(Math.sin(character.walkPhase)) * 0.06 : 0;
    character.drawn.set(x / TILE_SIZE, 0, y / TILE_SIZE);
    const root = character.figure.root;
    root.position.set(character.drawn.x, bob, character.drawn.z);
    root.rotation.set(0, character.heading, walking ? Math.sin(character.walkPhase) * 0.06 : 0);
    // The arms are their own groups now, so they can swing: opposite phases,
    // settling back to the resting splay when the character stops.
    const swing = walking ? Math.sin(character.walkPhase) * 0.4 : 0;
    character.figure.poseArm(-1, swing);
    character.figure.poseArm(1, -swing);
  }

  /** Copy each body's transform onto its face and shadow instances. */
  sync(): void {
    this.synced = 0;
    this.characters.forEach(this.syncOne);
    this.faces.count = this.synced;
    this.shadows.count = this.synced * 2;
    this.faces.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
  }

  private synced = 0;

  // Bound once, so syncing every frame allocates nothing.
  private readonly syncOne = (character: Character): void => {
    if (this.synced >= CAPACITY) return;
    const root = character.figure.root;
    root.updateMatrix();
    this.faces.setMatrixAt(this.synced, root.matrix);
    lift.set(character.drawn.x, 0, character.drawn.z);
    this.shadows.setMatrixAt(this.synced * 2, matrix.compose(lift, identity, shadowScale));
    // Keep the contact blob at the feet and add a sun-aligned oval in the same batch.
    lift.set(character.drawn.x + AVATAR_TOP * 0.42 * SHADOW_X, 0,
      character.drawn.z + AVATAR_TOP * 0.42 * SHADOW_Z);
    this.shadows.setMatrixAt(this.synced * 2 + 1, matrix.compose(lift, sunRotation, sunScale));
    this.synced += 1;
  };

  /** A standalone figure for the avatar preview, sharing this layer's resources. */
  previewMesh(avatar: AvatarParts): THREE.Group {
    const figure = assembleCharacter(this.palettes.get(characterColorsFor(avatar)));
    figure.root.add(new THREE.Mesh(this.faces.geometry, this.faces.material));
    return figure.root;
  }

  dispose(): void {
    this.palettes.dispose();
    this.faces.geometry.dispose();
    const faceMaterial = this.faces.material as THREE.MeshLambertMaterial;
    faceMaterial.map?.dispose();
    faceMaterial.dispose();
    this.faces.dispose();
    this.shadows.dispose();
  }
}
