// Phase 4: authentic 3x3-grid dungeon generation.

import { Dungeon } from '../src/engine/dungeon';
import { RNG } from '../src/engine/rng';
import { MAP_WIDTH, MAP_HEIGHT, TILE_CHARS, TILE_STAIRS_DN, TILE_CORRIDOR } from '../src/engine/constants';

function build(seed: string, level = 1): Dungeon {
  return new Dungeon(level, new RNG(seed));
}

describe('3x3 grid layout', () => {
  it('creates nine grid rooms, some of them gone', () => {
    let sawGone = false;
    for (let i = 0; i < 30; i++) {
      const d = build(`grid-${i}`);
      expect(d.rooms).toHaveLength(9);
      if (d.rooms.some((r) => r.gone)) sawGone = true;
      // Real rooms must have proper interiors.
      for (const r of d.rooms) {
        if (!r.gone) {
          expect(r.w).toBeGreaterThanOrEqual(4);
          expect(r.h).toBeGreaterThanOrEqual(4);
        }
      }
    }
    expect(sawGone).toBe(true);
  });

  it('produces more dark rooms as depth increases', () => {
    const darkAt = (level: number) => {
      let dark = 0;
      for (let i = 0; i < 40; i++) build(`dk-${level}-${i}`, level).rooms.forEach((r) => r.dark && dark++);
      return dark;
    };
    expect(darkAt(1)).toBe(0); // rnd(10) < 0 is never true on level 1
    expect(darkAt(20)).toBeGreaterThan(darkAt(3));
  });
});

describe('connectivity', () => {
  it('lets the hero reach the down-stairs from the start on every seed', () => {
    for (let i = 0; i < 50; i++) {
      const d = build(`conn-${i}`);
      const [sx, sy] = d.playerStart;
      const [tx, ty] = d.stairsDown!;
      const path = d.pathTo(sx, sy, tx, ty);
      const reached = sx === tx && sy === ty ? true : path.length > 0;
      expect(reached).toBe(true);
    }
  });
});

// Render one level so a human can eyeball the layout in test output.
describe('maze rooms', () => {
  it('carves connected maze rooms reachable from the start', () => {
    let foundMaze = false;
    for (let i = 0; i < 120 && !foundMaze; i++) {
      const d = build(`maze-${i}`, 5);
      const maze = d.rooms.find((r) => r.maze);
      if (!maze) continue;
      foundMaze = true;

      const corridorCells: [number, number][] = [];
      for (let y = maze.y1 + 1; y < maze.y2; y++) {
        for (let x = maze.x1 + 1; x < maze.x2; x++) {
          if (d.tiles[y][x] === TILE_CORRIDOR) corridorCells.push([x, y]);
        }
      }
      expect(corridorCells.length).toBeGreaterThan(0);

      const [sx, sy] = d.playerStart;
      const reachable = corridorCells.some(([x, y]) => d.pathTo(sx, sy, x, y).length > 0);
      expect(reachable).toBe(true);
    }
    expect(foundMaze).toBe(true);
  });
});

describe('sample render', () => {
  it('dumps an ASCII level', () => {
    const d = build('showcase');
    const rows: string[] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      let row = '';
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (x === d.playerStart[0] && y === d.playerStart[1]) row += '@';
        else if (d.tiles[y][x] === TILE_STAIRS_DN) row += '>';
        else row += TILE_CHARS[d.tiles[y][x]] ?? '?';
      }
      rows.push(row);
    }
    // eslint-disable-next-line no-console
    console.log('\n' + rows.join('\n'));
    expect(rows).toHaveLength(MAP_HEIGHT);
  });
});
