import { describe, expect, it } from 'vitest';
import { getTownMap, TILE_SIZE } from '@tland/shared';
import { ClientWorld } from '../src/world/clientWorld.js';
import { WALK_SPEED_PX, canStand } from '../src/world/movement.js';

const map = { ...getTownMap(), width: 12, height: 12, spawn: { x: 2, y: 2 },
  isWalkable: (x: number, y: number) => x >= 0 && y >= 0 && x < 12 && y < 12,
  zoneAt: () => null };

describe('tap route arrival', () => {
  it.each([
    { name: '30fps straight', frames: [1000 / 30], goal: { x: 6, y: 2 } },
    { name: '24fps diagonal', frames: [1000 / 24], goal: { x: 6, y: 6 } },
    { name: '20fps turn', frames: [50], goal: { x: 6, y: 5 } },
    { name: 'variable mobile frames', frames: [16.7, 33.3, 50, 41, 28, 22], goal: { x: 7, y: 6 } },
  ])('arrives without reversing or exceeding the movement budget: $name', ({ frames, goal }) => {
    const world = new ClientWorld({ map });
    world.setActive(true);
    world.walkToTile(goal);
    const target = { x: goal.x * TILE_SIZE + TILE_SIZE / 2, y: goal.y * TILE_SIZE + TILE_SIZE / 2 };
    let now = 0, travelledBudget = 0, previous = world.getPosition();
    const startX = previous.x;
    let previousDistance = Math.hypot(previous.x - target.x, previous.y - target.y);
    for (let frame = 0; frame < 240; frame += 1) {
      const delta = frames[frame % frames.length]!;
      now += delta;
      travelledBudget += WALK_SPEED_PX * Math.min(delta, 50) / 1000;
      world.update(now, delta, { x: 0, y: 0 });
      const current = world.getPosition();
      const distance = Math.hypot(current.x - target.x, current.y - target.y);
      expect(distance, 'route must not bounce back away from its destination').toBeLessThanOrEqual(previousDistance + 1e-6);
      expect(Math.hypot(current.x - previous.x, current.y - previous.y)).toBeLessThanOrEqual(
        WALK_SPEED_PX * Math.min(delta, 50) / 1000 + 1e-6,
      );
      if (goal.y === map.spawn.y) {
        expect(current.x, 'leftover distance must continue across intermediate waypoints')
          .toBeCloseTo(Math.min(target.x, startX + travelledBudget), 6);
      }
      previous = current;
      previousDistance = distance;
    }
    expect(world.getPosition()).toEqual(target);
    expect(world.self.walking).toBe(false);
  });
  it('turns around blocked corners without entering collision tiles at low FPS', () => {
    const obstacleMap = { ...map, isWalkable: (x: number, y: number) =>
      map.isWalkable(x, y) && !(x === 4 && y < 6) };
    const world = new ClientWorld({ map: obstacleMap });
    world.setActive(true);
    world.walkToTile({ x: 6, y: 2 });
    for (let frame = 1; frame <= 240; frame += 1) {
      const before = world.getPosition();
      world.update(frame * 1000 / 30, 1000 / 30, { x: 0, y: 0 });
      const after = world.getPosition();
      expect(canStand(obstacleMap, after.x, after.y)).toBe(true);
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThanOrEqual(WALK_SPEED_PX / 30 + 1e-6);
    }
    expect(world.getPosition()).toEqual({ x: 6 * TILE_SIZE + 16, y: 2 * TILE_SIZE + 16 });
    expect(world.self.walking).toBe(false);
  });

});
