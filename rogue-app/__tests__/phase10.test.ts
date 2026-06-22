// Phase 10 (tail): throwing/ranged combat, ISMEAN room aggro, no-diagonal doors.

import { GameEngine } from '../src/engine/engine';
import { Monster, MONSTER_TEMPLATES } from '../src/engine/monsters';
import { Weapon } from '../src/engine/items';
import { TILE_DOOR, TILE_FLOOR } from '../src/engine/constants';

function visibleFloorNeighbour(e: GameEngine): [number, number] | null {
  const p = e.player;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = p.x + dx;
    const y = p.y + dy;
    if (e.dungeon.tile(x, y) === TILE_FLOOR && e.dungeon.visible[y][x]) return [x, y];
  }
  return null;
}

describe('throwing', () => {
  it('hurls a weapon at the nearest visible monster and the missile lands there', () => {
    const e = new GameEngine('throw');
    e.monsters = [];
    const cell = visibleFloorNeighbour(e);
    expect(cell).not.toBeNull();
    const [mx, my] = cell!;
    const m = new Monster(mx, my, MONSTER_TEMPLATES[7]); // hobgoblin
    m.defense = 40; // trivially hittable
    e.monsters = [m];

    const dagger = new Weapon(0, 0, 4); // missile weapon
    e.player.inventory.push(dagger);
    const hpBefore = m.hp;

    e.actionThrowItem(dagger);

    expect(e.player.inventory).not.toContain(dagger);
    expect(m.hp).toBeLessThan(hpBefore);
    expect(dagger.x).toBe(mx);
    expect(dagger.y).toBe(my);
    expect(e.items).toContain(dagger);
  });

  it('drops at the hero when there is nothing to hit', () => {
    const e = new GameEngine('throw-miss');
    e.monsters = [];
    const dagger = new Weapon(0, 0, 4);
    e.player.inventory.push(dagger);
    e.actionThrowItem(dagger);
    expect(dagger.x).toBe(e.player.x);
    expect(dagger.y).toBe(e.player.y);
    expect(e.items).toContain(dagger);
  });
});

describe('ISMEAN room aggro', () => {
  it('mean monsters wake on room entry; others stay asleep out of sight', () => {
    const e = new GameEngine('mean');
    const p = e.player;
    const room = e.dungeon.rooms.find(
      (r) => !r.gone && !r.maze && r.x1 < p.x && p.x < r.x2 && r.y1 < p.y && p.y < r.y2,
    );
    expect(room).toBeTruthy();

    // Blind everything so only room-aggro (not line of sight) can wake them.
    for (let y = 0; y < e.dungeon.visible.length; y++)
      for (let x = 0; x < e.dungeon.visible[0].length; x++) e.dungeon.visible[y][x] = false;

    let cell: [number, number] | null = null;
    for (let y = room!.y1 + 1; y < room!.y2 && !cell; y++)
      for (let x = room!.x1 + 1; x < room!.x2; x++)
        if (e.dungeon.tile(x, y) === TILE_FLOOR && !(x === p.x && y === p.y)) {
          cell = [x, y];
          break;
        }
    expect(cell).not.toBeNull();

    const mean = new Monster(cell![0], cell![1], MONSTER_TEMPLATES[7]); // hobgoblin (aggressive)
    e.monsters = [mean];
    mean.act(e);
    expect(mean.aware).toBe(true);

    const tame = new Monster(cell![0], cell![1], MONSTER_TEMPLATES[11]); // leprechaun (not aggressive)
    e.monsters = [tame];
    tame.act(e);
    expect(tame.aware).toBe(false);
  });
});

describe('no diagonal moves through doorways', () => {
  it('blocks a diagonal step onto a door but allows it orthogonally', () => {
    const e = new GameEngine('diag');
    e.monsters = [];
    const p = e.player;
    const [sx, sy] = [p.x, p.y];
    e.dungeon.setTile(p.x + 1, p.y + 1, TILE_DOOR);
    expect(e.actionMove(1, 1)).toBe(false);
    expect([p.x, p.y]).toEqual([sx, sy]);

    const e2 = new GameEngine('diag2');
    e2.monsters = [];
    const q = e2.player;
    e2.dungeon.setTile(q.x + 1, q.y, TILE_DOOR);
    expect(e2.actionMove(1, 0)).toBe(true);
  });
});
