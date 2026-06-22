// Phase 9 (Tier 3): amulet-gated ascent, infinite descent + scaling,
// treasure rooms, and cause-of-death scoring.

import { GameEngine, STATE_PLAYING, STATE_WIN } from '../src/engine/engine';
import { spawnMonster, Monster, MONSTER_TEMPLATES } from '../src/engine/monsters';
import { Gold } from '../src/engine/items';
import { TILE_STAIRS_UP, TILE_STAIRS_DN, TILE_FLOOR } from '../src/engine/constants';

describe('amulet-gated ascent', () => {
  it('blocks climbing without the Amulet, then wins with it on level 1', () => {
    const e = new GameEngine('ascent');
    const p = e.player;
    e.dungeon.setTile(p.x, p.y, TILE_STAIRS_UP);

    e.actionAscend();
    expect(e.state).toBe(STATE_PLAYING); // sealed without the amulet

    p.hasAmulet = true;
    e.actionAscend();
    expect(e.state).toBe(STATE_WIN);
  });
});

describe('infinite descent and depth scaling', () => {
  it('descends past the Amulet level', () => {
    const e = new GameEngine('descent');
    const p = e.player;
    e.dungeonLevel = 26;
    e.dungeon.setTile(p.x, p.y, TILE_STAIRS_DN);
    e.actionDescend();
    expect(e.dungeonLevel).toBe(27);
  });

  it('scales monsters tougher below the Amulet level', () => {
    const shallow = spawnMonster(0, 0, 10);
    expect(shallow.levelBonus).toBe(0);
    const deep = spawnMonster(0, 0, 31); // 31 - 26 = 5
    expect(deep.levelBonus).toBe(5);
    expect(deep.level).toBe(deep.template.level + 5);
  });
});

describe('treasure rooms', () => {
  it('occasionally fills a room with gold', () => {
    let maxGold = 0;
    for (let i = 0; i < 200; i++) {
      const e = new GameEngine(`treasure-${i}`);
      const golds = e.items.filter((it) => it instanceof Gold).length;
      maxGold = Math.max(maxGold, golds);
    }
    expect(maxGold).toBeGreaterThanOrEqual(8); // a treasure room dwarfs normal drops
  });
});

describe('cause of death', () => {
  it('records the monster that killed the hero', () => {
    const e = new GameEngine('cause');
    const p = e.player;
    e.monsters = [];
    // Place an aware monster on an adjacent floor cell.
    let placed = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (e.dungeon.isWalkable(x, y) && e.dungeon.tile(x, y) === TILE_FLOOR) {
        const m = new Monster(x, y, MONSTER_TEMPLATES[7]); // hobgoblin
        m.aware = true;
        e.monsters = [m];
        placed = true;
        break;
      }
    }
    expect(placed).toBe(true);

    p.maxHp = 99999;
    p.hp = 99999;
    let hit = false;
    for (let i = 0; i < 80 && !hit; i++) {
      e.actionWait();
      if (p.hp < 99999) hit = true;
    }
    expect(hit).toBe(true);
    expect(e.deathCause).toMatch(/killed by .*hobgoblin/);
  });
});
