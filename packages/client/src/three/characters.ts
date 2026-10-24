import * as THREE from 'three';
import { MAX_PLAYERS, TILE_SIZE, type Direction } from '@tland/shared';
import type { AvatarParts } from '../gfx/avatar.js';
import { AVATAR_SCALE, AvatarGeometryCache, faceGeometry, faceTexture } from './avatar3d.js';

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
  readonly body: THREE.Mesh;
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
const lift = new THREE.Vector3();

/**
 * Every avatar on screen.
 *
 * Bodies are one mesh each, from cached merged geometry. Faces and blob
 * shadows are the same for everyone, so all of them together are one
 * InstancedMesh each, rewritten every frame from the bodies' transforms:
 * thirty players cost thirty-two draw calls, not ninety.
 */
export class CharacterLayer {
  readonly group = new THREE.Group();
  private readonly characters = new Map<string, Character>();
  private readonly cache = new AvatarGeometryCache();
  private readonly faces: THREE.InstancedMesh;
  private readonly shadows: THREE.InstancedMesh;

  constructor(
    private readonly material: THREE.Material,
    shadowGeometry: THREE.BufferGeometry,
    shadowMaterial: THREE.Material,
  ) {
    this.group.name = 'characters';
    const faceMaterial = new THREE.MeshLambertMaterial({
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
    this.shadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, CAPACITY);
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
    const body = new THREE.Mesh(this.cache.get(avatar), this.material);
    body.name = `avatar-${id}`;
    const character: Character = {
      body,
      heading: HEADING_FOR[direction],
      lastX: x,
      lastY: y,
      walkPhase: 0,
      drawn: new THREE.Vector3(x / TILE_SIZE, 0, y / TILE_SIZE),
    };
    body.position.copy(character.drawn);
    body.rotation.y = character.heading;
    body.scale.setScalar(AVATAR_SCALE);
    this.characters.set(id, character);
    this.group.add(body);
  }

  setAvatar(id: string, avatar: AvatarParts): void {
    const character = this.characters.get(id);
    if (character !== undefined) character.body.geometry = this.cache.get(avatar);
  }

  remove(id: string): void {
    const character = this.characters.get(id);
    if (character === undefined) return;
    this.group.remove(character.body);
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
    character.body.position.set(character.drawn.x, bob, character.drawn.z);
    character.body.rotation.set(0, character.heading, walking ? Math.sin(character.walkPhase) * 0.06 : 0);
  }

  /** Copy each body's transform onto its face and shadow instances. */
  sync(): void {
    this.synced = 0;
    this.characters.forEach(this.syncOne);
    this.faces.count = this.synced;
    this.shadows.count = this.synced;
    this.faces.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
  }

  private synced = 0;

  // Bound once, so syncing every frame allocates nothing.
  private readonly syncOne = (character: Character): void => {
    if (this.synced >= CAPACITY) return;
    const body = character.body;
    body.updateMatrix();
    this.faces.setMatrixAt(this.synced, body.matrix);
    lift.set(character.drawn.x, 0, character.drawn.z);
    this.shadows.setMatrixAt(this.synced, matrix.compose(lift, identity, shadowScale));
    this.synced += 1;
  };

  /** A standalone mesh for the avatar preview, sharing this layer's resources. */
  previewMesh(avatar: AvatarParts): THREE.Group {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(this.cache.get(avatar), this.material));
    group.add(new THREE.Mesh(this.faces.geometry, this.faces.material));
    return group;
  }

  dispose(): void {
    this.cache.dispose();
    this.faces.geometry.dispose();
    const faceMaterial = this.faces.material as THREE.MeshLambertMaterial;
    faceMaterial.map?.dispose();
    faceMaterial.dispose();
    this.faces.dispose();
    this.shadows.dispose();
  }
}
