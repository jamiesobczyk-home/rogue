// Phase 7: traps, wandering monsters, and a working hasted player.

import { GameEngine } from '../src/engine/engine';
import { Monster, MONSTER_TEMPLATES } from '../src/engine/monsters';
import { TILE_TRAP, TILE_FLOOR } from '../src/engine/constants';
import type { TrapKind } from '../src/engine/dungeon';

/** Find a walkable floor cell adjacent to the hero (clears monsters first). */
function floorNeighbour(e: GameEngine): [number, number, number, number] | null {
  e.monsters = [];
  const p = e.player;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
    const x = p.x + dx;
    const y = p.y + dy;
    if (e.dungeon.isWalkable(x, y) && e.dungeon.tile(x, y) === TILE_FLOOR) return [dx, dy, x, y];
  }
  return null;
}

function plantTrap(e: GameEngine, kind: TrapKind): [number, number, number, number] {
  const n = floorNeighbour(e);
  if (!n) throw new Error('no floor neighbour');
  const [dx, dy, x, y] = n;
  e.dungeon.traps = [{ x, y, kind, found: false }];
  return [dx, dy, x, y];
}

describe('traps', () => {
  it('triggers a hidden trap on step and reveals it', () => {
    const e = new GameEngine('trap-bear');
    const [dx, dy, x, y] = plantTrap(e, 'bear');
    e.actionMove(dx, dy);
    const trap = e.dungeon.traps[0];
    expect(trap.found).toBe(true);
    expect(e.dungeon.tile(x, y)).toBe(TILE_TRAP);
    expect(e.player.frozen).toBeGreaterThan(0); // bear trap holds the hero
  });

  it('a trap door drops the hero to the next level', () => {
    const e = new GameEngine('trap-door');
    const [dx, dy] = plantTrap(e, 'trapdoor');
    expect(e.dungeonLevel).toBe(1);
    e.actionMove(dx, dy);
    expect(e.dungeonLevel).toBe(2);
  });

  it('levitation floats the hero over traps', () => {
    const e = new GameEngine('trap-lev');
    const [dx, dy] = plantTrap(e, 'bear');
    e.player.levitating = 10;
    e.actionMove(dx, dy);
    expect(e.dungeon.traps[0].found).toBe(true);
    expect(e.player.frozen).toBe(0); // not caught
  });

  it('searching reveals an adjacent trap', () => {
    const e = new GameEngine('trap-search');
    const p = e.player;
    e.monsters = [];
    // Plant a hidden trap on an adjacent floor cell without stepping on it.
    const n = floorNeighbour(e)!;
    e.dungeon.traps = [{ x: n[2], y: n[3], kind: 'dart', found: false }];
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      e.actionSearch();
      found = e.dungeon.traps[0].found;
    }
    expect(found).toBe(true);
    expect(e.dungeon.tile(n[2], n[3])).toBe(TILE_TRAP);
  });
});

describe('hasted hero', () => {
  it('lets monsters act only about half as often', () => {
    const e = new GameEngine('haste');
    const m = new Monster(e.player.x + 5, e.player.y, MONSTER_TEMPLATES[1]);
    e.monsters = [m];
    const spy = jest.spyOn(m, 'act');
    e.player.hasted = 100;
    for (let i = 0; i < 10; i++) e.actionWait();
    const calls = spy.mock.calls.length;
    expect(calls).toBeLessThan(10);
    expect(calls).toBeGreaterThanOrEqual(4);
  });
});

describe('wandering monsters', () => {
  it('spawns new hunters over time', () => {
    const e = new GameEngine('wander');
    e.monsters = [];
    e.player.maxHp = 99999;
    e.player.hp = 99999;
    for (let i = 0; i < 600; i++) e.actionWait();
    expect(e.monsters.length).toBeGreaterThan(0);
  });
});
