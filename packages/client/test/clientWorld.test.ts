import { describe, expect, it } from 'vitest';
import { BUBBLE_TTL_MS, TILE_SIZE, TICK_MS, getTownMap, type PlayerState } from '@tland/shared';
import { ClientWorld } from '../src/world/clientWorld.js';

const map = getTownMap();
const FRAME = 1000 / 60;

function makeWorld(): { world: ClientWorld; zones: (string | null)[]; clock: { now: number } } {
  const clock = { now: 0 };
  const zones: (string | null)[] = [];
  const world = new ClientWorld({ map, clock: () => clock.now, onZoneChange: (zone) => zones.push(zone) });
  return { world, zones, clock };
}

function run(world: ClientWorld, clock: { now: number }, ms: number, input = { x: 0, y: 0 }): void {
  for (let elapsed = 0; elapsed < ms; elapsed += FRAME) {
    clock.now += FRAME;
    world.update(clock.now, FRAME, input);
  }
}

/** A walkable tile next to the spawn in the given direction, if there is one. */
function openNeighbour(dx: number, dy: number): boolean {
  return map.isWalkable(map.spawn.x + dx, map.spawn.y + dy);
}

const tileOf = (world: ClientWorld) => ({
  x: Math.floor(world.self.x / TILE_SIZE),
  y: Math.floor(world.self.y / TILE_SIZE),
});

function remote(id: string, x: number, y: number): PlayerState {
  return { id, nick: id, avatar: { body: 1, shirt: 2 }, x, y, dir: 'down', moving: false };
}

describe('ClientWorld', () => {
  it('stays put until the player has joined', () => {
    const { world, clock } = makeWorld();
    const start = world.getPosition();
    run(world, clock, 500, { x: 1, y: 0 });
    expect(world.getPosition()).toEqual(start);
  });

  it('walks with the input, faces the way it walks, and collides', () => {
    const { world, clock } = makeWorld();
    world.setActive(true);
    const direction = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => openNeighbour(dx as number, dy as number));
    expect(direction).toBeDefined();
    const [dx, dy] = direction as [number, number];
    const start = world.getPosition();
    run(world, clock, 150, { x: dx, y: dy });
    const now = world.getPosition();
    expect(Math.hypot(now.x - start.x, now.y - start.y)).toBeGreaterThan(5);
    expect(world.self.walking).toBe(true);
    expect(world.self.facing).toBe(dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up');

    // Push into the sea for a long time: never ends up on unwalkable ground.
    run(world, clock, 8000, { x: dx, y: dy });
    const tile = tileOf(world);
    expect(map.isWalkable(tile.x, tile.y)).toBe(true);
    run(world, clock, 50);
    expect(world.self.walking).toBe(false);
  });

  it('follows a tapped route to the tile and announces it', () => {
    const { world, clock } = makeWorld();
    world.setActive(true);
    const events: string[] = [];
    world.listen({
      routeStarted: (goal) => events.push(`start ${goal.x},${goal.y}`),
      routeCleared: () => events.push('clear'),
    });

    let goal: { x: number; y: number } | null = null;
    for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2]]) {
      const x = map.spawn.x + (dx as number);
      const y = map.spawn.y + (dy as number);
      if (map.isWalkable(x, y)) {
        goal = { x, y };
        break;
      }
    }
    expect(goal).not.toBeNull();
    const target = goal as { x: number; y: number };

    world.walkToTile(target);
    expect(events).toContain(`start ${target.x},${target.y}`);
    run(world, clock, 6000);
    expect(tileOf(world)).toEqual(target);
    expect(world.self.x).toBe(target.x * TILE_SIZE + TILE_SIZE / 2);
    expect(events.at(-1)).toBe('clear');
  });

  it('drops the route when the server corrects the player', () => {
    const { world } = makeWorld();
    world.setActive(true);
    const spawn = map.spawn;
    let cleared = 0;
    world.listen({ routeCleared: () => (cleared += 1) });
    world.walkToTile({ x: spawn.x + 2, y: spawn.y });
    const before = cleared;
    world.correctSelf(100, 200);
    expect(cleared).toBeGreaterThan(before);
    expect(world.getPosition()).toEqual({ x: 100, y: 200 });
  });

  it('interpolates other players a tick behind, and snaps across long gaps', () => {
    const { world, clock } = makeWorld();
    world.addRemote(remote('a', 100, 100));
    world.applyUpdates([{ id: 'a', x: 132, y: 100, dir: 'right', moving: true }]);
    const other = world.remote('a');
    expect(other?.walking).toBe(true);

    world.update(clock.now + (TICK_MS * 1.5) / 2, FRAME, { x: 0, y: 0 });
    expect(other?.x).toBeGreaterThan(100);
    expect(other?.x).toBeLessThan(132);

    world.update(clock.now + TICK_MS * 2, FRAME, { x: 0, y: 0 });
    expect(other?.x).toBe(132);
    expect(other?.walking).toBe(false);

    world.applyUpdates([{ id: 'a', x: 2000, y: 100, dir: 'right', moving: false }]);
    expect(other?.x).toBe(2000);
  });

  it('ignores updates for players it never heard join', () => {
    const { world } = makeWorld();
    world.applyUpdates([{ id: 'ghost', x: 1, y: 1, dir: 'up', moving: true }]);
    expect(world.remoteList()).toEqual([]);
  });

  it('keeps a bubble for its lifetime, and only for someone it knows', () => {
    const { world, clock } = makeWorld();
    world.setSelfId('me');
    world.addRemote(remote('a', 100, 100));
    const said: string[] = [];
    world.listen({ said: (id, text) => said.push(`${id}:${text}`) });

    world.say('nobody', '...');
    world.say('a', '哈囉');
    world.say('me', '嗨');
    expect(said).toEqual(['a:哈囉', 'me:嗨']);
    expect(world.bubbleTexts().sort()).toEqual(['哈囉', '嗨'].sort());

    clock.now += BUBBLE_TTL_MS + 1;
    expect(world.bubbleTexts()).toEqual([]);
  });

  it('forgets a player and their bubble when they leave', () => {
    const { world } = makeWorld();
    const removed: string[] = [];
    world.listen({ remoteRemoved: (id) => removed.push(id) });
    world.addRemote(remote('a', 100, 100));
    world.say('a', '再見');
    world.removeRemote('a');
    expect(removed).toEqual(['a']);
    expect(world.bubbleTexts()).toEqual([]);
    expect(world.remote('a')).toBeUndefined();
  });

  it('reports the district once on arrival and again on crossing a border', () => {
    const { world, zones, clock } = makeWorld();
    world.placeSelf(map.spawn.x * TILE_SIZE + 16, map.spawn.y * TILE_SIZE + 16);
    expect(zones).toEqual([map.zoneAt(map.spawn.x, map.spawn.y)]);
    run(world, clock, 100);
    expect(zones).toHaveLength(1);
  });
});
