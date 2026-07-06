// Procedural dungeon generation and field-of-view.
//
// Levels follow the original Rogue 5.4.4 layout (rooms.c / passages.c): the map
// is a fixed 3x3 grid of nine cells, one room per cell. Some cells become
// "gone" rooms (a bare corridor junction), and deeper levels grow more "dark"
// rooms. Rooms are joined by a spanning tree of grid-adjacent connections (plus
// a few extra cycles), with doors where corridors meet room walls.

import {
  MAP_WIDTH,
  MAP_HEIGHT,
  MAX_ROOMS,
  TILE_VOID,
  TILE_FLOOR,
  TILE_WALL_H,
  TILE_WALL_V,
  TILE_WALL_C,
  TILE_CORRIDOR,
  TILE_DOOR,
  TILE_STAIRS_DN,
  TILE_STAIRS_UP,
  TILE_TRAP,
} from './constants';
import { rng as defaultRng, RNG } from './rng';

export type Pos = [number, number];

// Trap kinds (Rogue 5.4.4). Hidden until triggered or found by searching.
export const TRAP_KINDS = ['trapdoor', 'bear', 'sleep', 'arrow', 'teleport', 'dart', 'rust'] as const;
export type TrapKind = (typeof TRAP_KINDS)[number];

export interface Trap {
  x: number;
  y: number;
  kind: TrapKind;
  found: boolean;
}

const key = (x: number, y: number) => `${x},${y}`;

// ---------------------------------------------------------------------------
// Rect
// ---------------------------------------------------------------------------

export class Rect {
  // Layout flags from the original generator.
  gone = false; // ISGONE — a bare corridor junction, no walls/floor
  dark = false; // ISDARK — only the hero's immediate surroundings are lit
  maze = false; // ISMAZE — reserved (not yet carved)

  constructor(public x: number, public y: number, public w: number, public h: number) {}

  get x1(): number {
    return this.x;
  }
  get y1(): number {
    return this.y;
  }
  get x2(): number {
    return this.x + this.w - 1;
  }
  get y2(): number {
    return this.y + this.h - 1;
  }

  get centre(): Pos {
    return [this.x + Math.floor(this.w / 2), this.y + Math.floor(this.h / 2)];
  }

  intersects(other: Rect, margin = 1): boolean {
    return (
      this.x1 - margin <= other.x2 + margin &&
      this.x2 + margin >= other.x1 - margin &&
      this.y1 - margin <= other.y2 + margin &&
      this.y2 + margin >= other.y1 - margin
    );
  }

  randomInterior(rng: RNG): Pos {
    return [rng.randint(this.x1 + 1, this.x2 - 1), rng.randint(this.y1 + 1, this.y2 - 1)];
  }
}

// ---------------------------------------------------------------------------
// Dungeon
// ---------------------------------------------------------------------------

export class Dungeon {
  level: number;
  rng: RNG;

  tiles: number[][];
  visible: boolean[][];
  explored: boolean[][];

  rooms: Rect[] = [];
  traps: Trap[] = [];

  playerStart: Pos = [0, 0];
  stairsDown: Pos | null = null;
  stairsUp: Pos | null = null;
  monsterSpawns: Pos[] = [];
  itemSpawns: Pos[] = [];

  constructor(level: number, rng?: RNG) {
    this.level = level;
    this.rng = rng ?? defaultRng;

    this.tiles = Array.from({ length: MAP_HEIGHT }, () => new Array<number>(MAP_WIDTH).fill(TILE_VOID));
    this.visible = Array.from({ length: MAP_HEIGHT }, () => new Array<boolean>(MAP_WIDTH).fill(false));
    this.explored = Array.from({ length: MAP_HEIGHT }, () => new Array<boolean>(MAP_WIDTH).fill(false));

    this.generate();
  }

  // -- Tile helpers --------------------------------------------------

  tile(x: number, y: number): number {
    if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) return this.tiles[y][x];
    return TILE_VOID;
  }

  setTile(x: number, y: number, t: number): void {
    if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) this.tiles[y][x] = t;
  }

  isWalkable(x: number, y: number): boolean {
    const t = this.tile(x, y);
    return (
      t === TILE_FLOOR ||
      t === TILE_CORRIDOR ||
      t === TILE_DOOR ||
      t === TILE_STAIRS_DN ||
      t === TILE_STAIRS_UP ||
      t === TILE_TRAP
    );
  }

  trapAt(x: number, y: number): Trap | null {
    for (const t of this.traps) if (t.x === x && t.y === y) return t;
    return null;
  }

  inRoom(x: number, y: number): Rect | null {
    for (const r of this.rooms) {
      if (r.gone || r.maze) continue; // maze rooms behave like corridors for FOV
      if (r.x1 < x && x < r.x2 && r.y1 < y && y < r.y2) return r;
    }
    return null;
  }

  // -- FOV (authentic Rogue behaviour) -------------------------------

  computeFov(px: number, py: number): void {
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) this.visible[y][x] = false;

    const room = this.inRoom(px, py);
    if (room && !room.dark) {
      // A lit room reveals its whole interior plus adjacent passages/doors.
      for (let y = room.y1; y <= room.y2; y++) {
        for (let x = room.x1; x <= room.x2; x++) {
          this.visible[y][x] = true;
          this.explored[y][x] = true;
        }
      }
      for (let y = room.y1 - 1; y <= room.y2 + 1; y++) {
        for (let x = room.x1 - 1; x <= room.x2 + 1; x++) {
          if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
            const t = this.tiles[y][x];
            if (t === TILE_CORRIDOR || t === TILE_DOOR) {
              this.visible[y][x] = true;
              this.explored[y][x] = true;
            }
          }
        }
      }
    } else {
      // Corridors and dark rooms reveal only the hero's immediate surroundings.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
            const t = this.tiles[ny][nx];
            if (t !== TILE_VOID) {
              this.visible[ny][nx] = true;
              this.explored[ny][nx] = true;
            }
          }
        }
      }
    }
  }

  // -- Generation ----------------------------------------------------

  private generate(): void {
    this.gridRooms();
    this.connectRooms();
    this.placeStairs();
    this.chooseSpawns();
    this.placeTraps();
  }

  /** Scatter hidden traps on room floor (rooms.c: only when rnd(10) < level, count rnd(level/4)+1). */
  private placeTraps(): void {
    if (this.rng.randrange(10) >= this.level) return; // shallow levels are usually trap-free
    const ntraps = Math.min(10, this.rng.randrange(Math.max(1, Math.floor(this.level / 4))) + 1);
    const taken = new Set<string>([key(this.playerStart[0], this.playerStart[1])]);
    if (this.stairsDown) taken.add(key(this.stairsDown[0], this.stairsDown[1]));
    if (this.stairsUp) taken.add(key(this.stairsUp[0], this.stairsUp[1]));

    const solids = this.solidRooms();
    let attempts = 0;
    while (this.traps.length < ntraps && attempts < 300) {
      attempts += 1;
      const room = solids[this.rng.randrange(solids.length)];
      const [x, y] = room.randomInterior(this.rng);
      if (this.tile(x, y) !== TILE_FLOOR || taken.has(key(x, y))) continue;
      taken.add(key(x, y));
      const kind = TRAP_KINDS[this.rng.randrange(TRAP_KINDS.length)];
      this.traps.push({ x, y, kind, found: false });
    }
  }

  /** One room per cell of a 3x3 grid (rooms.c do_rooms). */
  private gridRooms(): void {
    const bsx = Math.floor(MAP_WIDTH / 3);
    const bsy = Math.floor(MAP_HEIGHT / 3);

    // rnd(4) cells become "gone" rooms — bare corridor junctions.
    const goneCount = this.rng.randint(0, 3);
    const goneSet = new Set<number>();
    while (goneSet.size < goneCount) goneSet.add(this.rng.randrange(MAX_ROOMS));

    for (let i = 0; i < MAX_ROOMS; i++) {
      const topX = (i % 3) * bsx + 1;
      const topY = Math.floor(i / 3) * bsy;

      if (goneSet.has(i)) {
        let px = 0;
        let py = 0;
        do {
          px = topX + 1 + this.rng.randrange(Math.max(1, bsx - 2));
          py = topY + 1 + this.rng.randrange(Math.max(1, bsy - 2));
        } while (py < 1 || py > MAP_HEIGHT - 2);
        const gone = new Rect(px, py, 1, 1);
        gone.gone = true;
        this.rooms.push(gone);
        continue;
      }

      let maxW = 4 + this.rng.randrange(Math.max(1, bsx - 4));
      let maxH = 4 + this.rng.randrange(Math.max(1, bsy - 4));
      maxW = Math.min(maxW, bsx - 1);
      maxH = Math.min(maxH, bsy - 1);

      const posX = topX + this.rng.randrange(Math.max(1, bsx - maxW));
      let posY = topY + this.rng.randrange(Math.max(1, bsy - maxH));
      if (posY < 1) posY = 1; // keep clear of the top status row

      const room = new Rect(posX, posY, maxW, maxH);
      if (this.rng.randrange(15) === 0) {
        room.maze = true;
        this.carveMaze(room);
      } else {
        room.dark = this.rng.randrange(10) < this.level - 1;
        this.carveRoom(room);
      }
      this.rooms.push(room);
    }
  }

  /** Carve a perfect maze of corridors inside the room cell (rooms.c do_maze). */
  private carveMaze(room: Rect): void {
    const visited = new Set<string>();
    const sx = room.x1 + 1;
    const sy = room.y1 + 1;
    this.setTile(sx, sy, TILE_CORRIDOR);
    visited.add(key(sx, sy));
    const stack: Pos[] = [[sx, sy]];

    while (stack.length > 0) {
      const [cx, cy] = stack[stack.length - 1];
      const dirs: Pos[] = [
        [0, -2],
        [0, 2],
        [-2, 0],
        [2, 0],
      ];
      this.rng.shuffle(dirs);
      let advanced = false;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx > room.x1 && nx < room.x2 && ny > room.y1 && ny < room.y2 && !visited.has(key(nx, ny))) {
          this.setTile(cx + dx / 2, cy + dy / 2, TILE_CORRIDOR); // knock down the wall between
          this.setTile(nx, ny, TILE_CORRIDOR);
          visited.add(key(nx, ny));
          stack.push([nx, ny]);
          advanced = true;
          break;
        }
      }
      if (!advanced) stack.pop();
    }
  }

  private carveRoom(room: Rect): void {
    for (let y = room.y1; y <= room.y2; y++) {
      for (let x = room.x1; x <= room.x2; x++) {
        if (y === room.y1 || y === room.y2) this.setTile(x, y, TILE_WALL_H);
        else if (x === room.x1 || x === room.x2) this.setTile(x, y, TILE_WALL_V);
        else this.setTile(x, y, TILE_FLOOR);
      }
    }
    for (const [cx, cy] of [
      [room.x1, room.y1],
      [room.x2, room.y1],
      [room.x1, room.y2],
      [room.x2, room.y2],
    ]) {
      this.setTile(cx, cy, TILE_WALL_C);
    }
  }

  // -- Passages (passages.c) -----------------------------------------

  /** Grid-adjacent neighbours of room i and the direction to reach them. */
  private neighbours(i: number): [number, 'r' | 'd'][] {
    const list: [number, 'r' | 'd'][] = [];
    if (i % 3 < 2) list.push([i + 1, 'r']);
    if (i < MAX_ROOMS - 3) list.push([i + 3, 'd']);
    return list;
  }

  private connectRooms(): void {
    const edges: [number, number, 'r' | 'd'][] = [];
    for (let i = 0; i < MAX_ROOMS; i++) for (const [j, d] of this.neighbours(i)) edges.push([i, j, d]);

    const inGraph = new Array(MAX_ROOMS).fill(false);
    const connected = new Set<string>();

    // Spanning tree: keep adding an edge that touches exactly one in-graph room.
    inGraph[this.rng.randrange(MAX_ROOMS)] = true;
    let guard = 0;
    while (inGraph.filter(Boolean).length < MAX_ROOMS && guard++ < 500) {
      const cands = edges.filter(([a, b]) => inGraph[a] !== inGraph[b]);
      if (cands.length === 0) break;
      const [a, b, d] = this.rng.choice(cands);
      this.conn(a, b, d);
      connected.add(`${a}-${b}`);
      inGraph[a] = true;
      inGraph[b] = true;
    }

    // A few extra connections create loops, like the original.
    const extra = this.rng.randint(0, 4);
    for (let k = 0; k < extra; k++) {
      const avail = edges.filter(([a, b]) => !connected.has(`${a}-${b}`));
      if (avail.length === 0) break;
      const [a, b, d] = this.rng.choice(avail);
      this.conn(a, b, d);
      connected.add(`${a}-${b}`);
    }
  }

  /** Carve a corridor (with doors) between two grid-adjacent rooms. */
  private conn(ai: number, bi: number, dir: 'r' | 'd'): void {
    const a = this.rooms[ai];
    const b = this.rooms[bi];
    const [aDoor, aOut] = this.exitPoint(a, dir, true);
    const [bDoor, bOut] = this.exitPoint(b, dir, false);

    this.placeDoor(a, aDoor);
    this.placeDoor(b, bDoor);

    if (dir === 'r') this.carvePathH(aOut, bOut);
    else this.carvePathV(aOut, bOut);
  }

  /**
   * Pick the door cell on `room`'s facing wall and the corridor cell just
   * outside it. `first` is the left/top room of the pair. Gone rooms use their
   * single point for both.
   */
  private exitPoint(room: Rect, dir: 'r' | 'd', first: boolean): [Pos, Pos] {
    if (room.gone) {
      const p: Pos = [room.x, room.y];
      return [p, p];
    }
    if (room.maze) {
      // Connect to the maze passage cell nearest the facing edge.
      const p = this.nearestMazeCell(room, dir, first);
      return [p, p];
    }
    if (dir === 'r') {
      const wallX = first ? room.x2 : room.x1;
      const y = this.rng.randint(room.y1 + 1, room.y2 - 1);
      return [[wallX, y], [first ? wallX + 1 : wallX - 1, y]];
    }
    const wallY = first ? room.y2 : room.y1;
    const x = this.rng.randint(room.x1 + 1, room.x2 - 1);
    return [[x, wallY], [x, first ? wallY + 1 : wallY - 1]];
  }

  private placeDoor(room: Rect, p: Pos): void {
    if (room.gone || room.maze) {
      if (this.tile(p[0], p[1]) === TILE_VOID) this.setTile(p[0], p[1], TILE_CORRIDOR);
    } else {
      this.setTile(p[0], p[1], TILE_DOOR);
    }
  }

  /** The maze passage cell closest to the wall of `room` facing the neighbour. */
  private nearestMazeCell(room: Rect, dir: 'r' | 'd', first: boolean): Pos {
    const cells: Pos[] = [];
    for (let y = room.y1 + 1; y < room.y2; y++) {
      for (let x = room.x1 + 1; x < room.x2; x++) {
        if (this.tile(x, y) === TILE_CORRIDOR) cells.push([x, y]);
      }
    }
    if (cells.length === 0) return room.centre;
    const score = ([x, y]: Pos): number => {
      if (dir === 'r') return first ? room.x2 - x : x - room.x1;
      return first ? room.y2 - y : y - room.y1;
    };
    return cells.reduce((best, c) => (score(c) < score(best) ? c : best));
  }

  /** Corridor cell: void becomes passage, a pierced wall becomes a door. */
  private passCell(x: number, y: number): void {
    const t = this.tile(x, y);
    if (t === TILE_VOID) this.setTile(x, y, TILE_CORRIDOR);
    else if (t === TILE_WALL_H || t === TILE_WALL_V || t === TILE_WALL_C) this.setTile(x, y, TILE_DOOR);
  }

  private carvePathH(aOut: Pos, bOut: Pos): void {
    let [ax, ay] = aOut;
    let [bx, by] = bOut;
    if (ax > bx) {
      [ax, bx] = [bx, ax];
      [ay, by] = [by, ay];
    }
    const midX = ax + this.rng.randrange(Math.max(1, bx - ax + 1));
    this.carveH(ax, midX, ay);
    this.carveV(ay, by, midX);
    this.carveH(midX, bx, by);
  }

  private carvePathV(aOut: Pos, bOut: Pos): void {
    let [ax, ay] = aOut;
    let [bx, by] = bOut;
    if (ay > by) {
      [ax, bx] = [bx, ax];
      [ay, by] = [by, ay];
    }
    const midY = ay + this.rng.randrange(Math.max(1, by - ay + 1));
    this.carveV(ay, midY, ax);
    this.carveH(ax, bx, midY);
    this.carveV(midY, by, bx);
  }

  private carveH(x1: number, x2: number, y: number): void {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) this.passCell(x, y);
  }

  private carveV(y1: number, y2: number, x: number): void {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) this.passCell(x, y);
  }

  // -- Stairs & spawns -----------------------------------------------

  /** Rooms with real floor (excludes gone junctions and maze cells). */
  private solidRooms(): Rect[] {
    const solid = this.rooms.filter((r) => !r.gone && !r.maze);
    return solid.length > 0 ? solid : this.rooms.filter((r) => !r.gone);
  }

  private placeStairs(): void {
    const real = this.solidRooms();
    const shuffled = [...real];
    this.rng.shuffle(shuffled);

    this.playerStart = shuffled[0].randomInterior(this.rng);

    this.stairsDown = shuffled[shuffled.length - 1].randomInterior(this.rng);
    this.setTile(this.stairsDown[0], this.stairsDown[1], TILE_STAIRS_DN);

    if (shuffled.length >= 3) {
      this.stairsUp = shuffled[shuffled.length - 2].randomInterior(this.rng);
      this.setTile(this.stairsUp[0], this.stairsUp[1], TILE_STAIRS_UP);
    }
  }

  private chooseSpawns(): void {
    const candidates: Pos[] = [];
    for (const r of this.solidRooms()) {
      for (let i = 0; i < r.w * r.h; i++) {
        const pos = r.randomInterior(this.rng);
        const t = this.tile(pos[0], pos[1]);
        if (t === TILE_FLOOR && !(pos[0] === this.playerStart[0] && pos[1] === this.playerStart[1])) {
          candidates.push(pos);
        }
      }
    }

    this.rng.shuffle(candidates);
    const seen = new Set<string>([key(this.playerStart[0], this.playerStart[1])]);
    const unique: Pos[] = [];
    for (const pos of candidates) {
      const k = key(pos[0], pos[1]);
      if (!seen.has(k)) {
        unique.push(pos);
        seen.add(k);
      }
    }

    const total = unique.length;
    const nMonsters = Math.min(Math.floor(total / 2), Math.max(3, this.level + 2));
    const nItems = Math.min(total - nMonsters, Math.max(2, 4 + Math.floor(this.level / 3)));

    this.monsterSpawns = unique.slice(0, nMonsters);
    this.itemSpawns = unique.slice(nMonsters, nMonsters + nItems);
  }

  // -- Utility -------------------------------------------------------

  walkableNeighbours(x: number, y: number): Pos[] {
    const result: Pos[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (this.isWalkable(nx, ny)) result.push([nx, ny]);
      }
    }
    return result;
  }

  /** BFS path from (sx, sy) to (tx, ty). Returns list of [x, y] steps. */
  pathTo(sx: number, sy: number, tx: number, ty: number, blocked?: Set<string>): Pos[] {
    const block = blocked ?? new Set<string>();
    const queue: Pos[] = [[sx, sy]];
    let head = 0;
    const cameFrom = new Map<string, Pos | null>();
    cameFrom.set(key(sx, sy), null);

    while (head < queue.length) {
      const [cx, cy] = queue[head++];
      if (cx === tx && cy === ty) break;
      for (const [nx, ny] of this.walkableNeighbours(cx, cy)) {
        const k = key(nx, ny);
        if (!cameFrom.has(k) && !block.has(k)) {
          cameFrom.set(k, [cx, cy]);
          queue.push([nx, ny]);
        }
      }
    }

    if (!cameFrom.has(key(tx, ty))) return [];

    const path: Pos[] = [];
    let cur: Pos | null = [tx, ty];
    while (cur && !(cur[0] === sx && cur[1] === sy)) {
      path.push(cur);
      cur = cameFrom.get(key(cur[0], cur[1])) ?? null;
    }
    path.reverse();
    return path;
  }
}
