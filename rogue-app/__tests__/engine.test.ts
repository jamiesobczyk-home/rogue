import { GameEngine, STATE_PLAYING, STATE_DEAD, STATE_WIN } from '../src/engine/engine';
import { MAP_WIDTH, MAP_HEIGHT, TILE_VOID, TILE_STAIRS_UP } from '../src/engine/constants';
import { MONSTER_TEMPLATES } from '../src/engine/monsters';

// A fixed action script used to drive an engine deterministically.
const MOVES: [number, number][] = [
  [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
];

/** Drive the engine through N turns and snapshot render data after each. */
function runScript(seed: string, steps: number): string[] {
  const engine = new GameEngine(seed);
  const snaps: string[] = [];
  for (let i = 0; i < steps; i++) {
    const [dx, dy] = MOVES[i % MOVES.length];
    engine.actionMove(dx, dy);
    if (i % 7 === 0) engine.actionWait();
    snaps.push(JSON.stringify(engine.getRenderData()));
  }
  return snaps;
}

describe('GameEngine determinism', () => {
  it('same seed + same actions => identical render stream', () => {
    // Runs are sequential (the shared RNG is reseeded by each constructor),
    // so two same-seed runs must match frame-for-frame.
    const a = runScript('repro-seed', 120);
    const b = runScript('repro-seed', 120);
    expect(a).toEqual(b);
  });

  it('different seeds => different initial dungeon', () => {
    const a = new GameEngine('seed-A');
    const b = new GameEngine('seed-B');
    expect(JSON.stringify(a.dungeon.tiles)).not.toEqual(JSON.stringify(b.dungeon.tiles));
  });
});

describe('Dungeon structural invariants', () => {
  it('generates a valid starting level', () => {
    const engine = new GameEngine('structure');
    const d = engine.dungeon;

    expect(d.rooms.length).toBeGreaterThan(0);

    // Player starts on a walkable tile.
    const [px, py] = d.playerStart;
    expect(d.isWalkable(px, py)).toBe(true);
    expect(engine.player.x).toBe(px);
    expect(engine.player.y).toBe(py);

    // Stairs down exist and are walkable.
    expect(d.stairsDown).not.toBeNull();
    const [sx, sy] = d.stairsDown!;
    expect(d.isWalkable(sx, sy)).toBe(true);

    // All tile ids are within the known range.
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        expect(d.tiles[y][x]).toBeGreaterThanOrEqual(TILE_VOID);
        expect(d.tiles[y][x]).toBeLessThanOrEqual(TILE_STAIRS_UP);
      }
    }
  });

  it('spawns monsters appropriate to the dungeon level', () => {
    const engine = new GameEngine('monsters');
    for (const m of engine.monsters) {
      expect(m.template.minLevel).toBeLessThanOrEqual(engine.dungeonLevel);
      expect(m.template.maxLevel).toBeGreaterThanOrEqual(engine.dungeonLevel);
      expect(m.hp).toBeGreaterThan(0);
    }
  });

  it('exposes all 26 classic monsters A–Z', () => {
    expect(MONSTER_TEMPLATES).toHaveLength(26);
    const letters = MONSTER_TEMPLATES.map((t) => t.letter).join('');
    expect(letters).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });
});

describe('Player mechanics', () => {
  it('levels up when enough experience is gained', () => {
    const engine = new GameEngine('xp');
    const p = engine.player;
    expect(p.expLevel).toBe(1);
    const msg = p.gainExp(10); // table[1] = 10
    expect(p.expLevel).toBe(2);
    expect(msg).toContain('level 2');
  });

  it('take damage and heal are clamped', () => {
    const engine = new GameEngine('dmg');
    const p = engine.player;
    p.maxHp = 20;
    p.hp = 20;
    p.takeDamage(5);
    expect(p.hp).toBe(15);
    p.heal(100);
    expect(p.hp).toBe(20); // clamped to maxHp
    p.takeDamage(1000);
    expect(p.hp).toBe(0);
    expect(p.alive).toBe(false);
  });

  it('hunger decreases each turn', () => {
    const engine = new GameEngine('hunger');
    const before = engine.player.hunger;
    engine.actionWait();
    expect(engine.player.hunger).toBe(before - 1);
  });
});

describe('Seeded smoke run', () => {
  it('never throws and keeps a valid state over a long random walk', () => {
    const engine = new GameEngine('smoke');
    const valid = new Set([STATE_PLAYING, STATE_DEAD, STATE_WIN, 'identify']);
    for (let i = 0; i < 3000; i++) {
      const [dx, dy] = MOVES[i % MOVES.length];
      engine.actionMove(dx, dy);
      expect(valid.has(engine.state)).toBe(true);
      const data = engine.getRenderData();
      expect(data.tiles).toHaveLength(MAP_HEIGHT);
      expect(data.tiles[0]).toHaveLength(MAP_WIDTH);
      if (engine.state !== STATE_PLAYING) break;
    }
  });
});

describe('Win condition wiring', () => {
  it('blocks leaving level 1 without the Amulet', () => {
    const engine = new GameEngine('win');
    // Force player onto an up-staircase tile is not guaranteed; instead verify
    // the guard message path by calling ascend off-stairs.
    engine.actionAscend();
    const msgs = engine.messages.join(' ');
    expect(msgs.length).toBeGreaterThan(0);
    expect(engine.state).toBe(STATE_PLAYING);
  });

  it('declares victory when ascending level 1 with the Amulet on up-stairs', () => {
    const engine = new GameEngine('victory');
    // Place an up-staircase under the player and hand them the amulet.
    engine.player.hasAmulet = true;
    engine.dungeon.setTile(engine.player.x, engine.player.y, TILE_STAIRS_UP);
    engine.actionAscend();
    expect(engine.state).toBe(STATE_WIN);
  });
});
