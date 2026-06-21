// Procedural dungeon generation and field-of-view.

import {
  MAP_WIDTH,
  MAP_HEIGHT,
  MAX_ROOMS,
  MIN_ROOM_SIZE,
  MAX_ROOM_SIZE,
  TILE_VOID,
  TILE_FLOOR,
  TILE_WALL_H,
  TILE_WALL_V,
  TILE_WALL_C,
  TILE_CORRIDOR,
  TILE_DOOR,
  TILE_STAIRS_DN,
  TILE_STAIRS_UP,
} from './constants';
import { rng as defaultRng, RNG } from './rng';

export type Pos = [number, number];

const key = (x: number, y: number) => `${x},${y}`;

// ---------------------------------------------------------------------------
// Rect
// ---------------------------------------------------------------------------

export class Rect {
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
      t === TILE_STAIRS_UP
    );
  }

  inRoom(x: number, y: number): Rect | null {
    for (const r of this.rooms) {
      if (r.x1 < x && x < r.x2 && r.y1 < y && y < r.y2) return r;
    }
    return null;
  }

  // -- FOV (authentic Rogue behaviour) -------------------------------

  computeFov(px: number, py: number): void {
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) this.visible[y][x] = false;

    const room = this.inRoom(px, py);
    if (room) {
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
    this.placeRooms();
    this.connectRooms();
    this.placeStairs();
    this.chooseSpawns();
  }

  private placeRooms(): void {
    let attempts = 0;
    while (this.rooms.length < MAX_ROOMS && attempts < 200) {
      attempts += 1;
      const w = this.rng.randint(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
      const h = this.rng.randint(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
      const x = this.rng.randint(1, MAP_WIDTH - w - 2);
      const y = this.rng.randint(1, MAP_HEIGHT - h - 2);
      const room = new Rect(x, y, w, h);

      if (this.rooms.some((r) => room.intersects(r))) continue;

      this.carveRoom(room);
      this.rooms.push(room);
    }

    if (this.rooms.length === 0) {
      const room = new Rect(5, 5, 20, 10);
      this.carveRoom(room);
      this.rooms.push(room);
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

  private connectRooms(): void {
    const sorted = [...this.rooms].sort((a, b) => a.centre[0] - b.centre[0]);
    for (let i = 0; i < sorted.length - 1; i++) this.carveCorridor(sorted[i], sorted[i + 1]);
    if (sorted.length > 2) this.carveCorridor(sorted[0], sorted[sorted.length - 1]);
  }

  private carveCorridor(a: Rect, b: Rect): void {
    const [ax, ay] = a.centre;
    const [bx, by] = b.centre;
    let corner: Pos;

    if (this.rng.random() < 0.5) {
      this.hcorridor(ax, bx, ay);
      this.vcorridor(ay, by, bx);
      corner = [bx, ay];
    } else {
      this.vcorridor(ay, by, ax);
      this.hcorridor(ax, bx, by);
      corner = [ax, by];
    }

    const [cx, cy] = corner;
    if (this.tile(cx, cy) === TILE_VOID) this.setTile(cx, cy, TILE_CORRIDOR);
  }

  private hcorridor(x1: number, x2: number, y: number): void {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      const t = this.tile(x, y);
      if (t === TILE_VOID || t === TILE_WALL_H || t === TILE_WALL_V || t === TILE_WALL_C) {
        if (t === TILE_WALL_H || t === TILE_WALL_V || t === TILE_WALL_C) this.setTile(x, y, TILE_DOOR);
        else this.setTile(x, y, TILE_CORRIDOR);
      }
    }
  }

  private vcorridor(y1: number, y2: number, x: number): void {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      const t = this.tile(x, y);
      if (t === TILE_VOID || t === TILE_WALL_H || t === TILE_WALL_V || t === TILE_WALL_C) {
        if (t === TILE_WALL_H || t === TILE_WALL_V || t === TILE_WALL_C) this.setTile(x, y, TILE_DOOR);
        else this.setTile(x, y, TILE_CORRIDOR);
      }
    }
  }

  private placeStairs(): void {
    if (this.rooms.length < 2) {
      const r = this.rooms[0];
      const [cx, cy] = r.centre;
      this.stairsDown = [cx, cy];
      this.playerStart = [cx - 1, cy];
      return;
    }

    const shuffled = [...this.rooms];
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
    for (const r of this.rooms) {
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
