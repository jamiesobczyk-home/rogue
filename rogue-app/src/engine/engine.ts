// Core game engine — manages game state and processes turns.
// Ported from rogue/game/engine.py.

import {
  MAP_WIDTH,
  MAP_HEIGHT,
  MAX_DUNGEON_LEVEL,
  TILE_STAIRS_DN,
  TILE_STAIRS_UP,
  CONFUSED_TURNS,
  RGB,
} from './constants';
import { rng } from './rng';
import { Dungeon } from './dungeon';
import { Player } from './entities';
import {
  Item,
  Gold,
  Potion,
  Scroll,
  Food,
  Amulet,
  Wand,
  PotionRegistry,
  ScrollRegistry,
  randomItem,
} from './items';
import { Monster, spawnMonster } from './monsters';

export const STATE_PLAYING = 'playing';
export const STATE_DEAD = 'dead';
export const STATE_WIN = 'win';
export const STATE_IDENTIFY = 'identify';

export type Cell = [number, boolean, boolean]; // (tileId, visible, explored)
export type EntityDraw = [number, number, string, RGB, boolean]; // (x, y, char, color, visible)

export interface RenderData {
  tiles: Cell[][];
  player: [number, number, string, RGB];
  monsters: EntityDraw[];
  items: EntityDraw[];
  messages: string[];
  hud: {
    hp: number;
    maxHp: number;
    str: number;
    ac: number;
    level: number;
    exp: number;
    gold: number;
    hunger: number;
    dlevel: number;
    turn: number;
    confused: boolean;
    blinded: boolean;
    hasted: boolean;
    poisoned: boolean;
    frozen: boolean;
    hasAmulet: boolean;
  };
  state: string;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class GameEngine {
  potionReg: PotionRegistry;
  scrollReg: ScrollRegistry;

  dungeonLevel = 1;
  dungeon: Dungeon;
  player: Player;
  monsters: Monster[] = [];
  items: Item[] = [];

  messages: string[] = [];
  state = STATE_PLAYING;
  turn = 0;

  monsterDetectionTurns = 0;
  seed: string;

  constructor(seed?: string | number) {
    // Reseed the shared RNG so the whole run is reproducible from this seed.
    rng.reseed(seed ?? String(Date.now()));
    this.seed = rng.seed;

    this.potionReg = new PotionRegistry();
    this.scrollReg = new ScrollRegistry();

    this.dungeon = this.buildDungeon();

    const [px, py] = this.dungeon.playerStart;
    this.player = new Player(px, py);
    this.dungeon.computeFov(px, py);

    this.populate();

    this.addMessage('Welcome to Rogue!  Your quest is to retrieve the Amulet of Yendor.');
  }

  // -- Dungeon management --------------------------------------------

  private buildDungeon(): Dungeon {
    return new Dungeon(this.dungeonLevel);
  }

  private populate(): void {
    this.monsters = [];
    this.items = [];

    if (this.dungeonLevel === MAX_DUNGEON_LEVEL && this.dungeon.stairsDown) {
      const [ax, ay] = this.dungeon.stairsDown;
      this.items.push(new Amulet(ax, ay));
    }

    for (const [mx, my] of this.dungeon.monsterSpawns) {
      this.monsters.push(spawnMonster(mx, my, this.dungeonLevel));
    }
    for (const [ix, iy] of this.dungeon.itemSpawns) {
      this.items.push(randomItem(ix, iy, this.dungeonLevel, this.potionReg, this.scrollReg));
    }
  }

  // -- Queries -------------------------------------------------------

  occupiedPositions(): Set<string> {
    const pos = new Set<string>([`${this.player.x},${this.player.y}`]);
    for (const m of this.monsters) if (m.alive) pos.add(`${m.x},${m.y}`);
    return pos;
  }

  monsterAt(x: number, y: number): Monster | null {
    for (const m of this.monsters) if (m.alive && m.x === x && m.y === y) return m;
    return null;
  }

  itemsAt(x: number, y: number): Item[] {
    return this.items.filter((i) => i.x === x && i.y === y);
  }

  canMonsterSeePlayer(monster: Monster): boolean {
    const p = this.player;
    const dist = Math.max(Math.abs(monster.x - p.x), Math.abs(monster.y - p.y));
    if (dist > 8) return false;
    return this.dungeon.visible[monster.y][monster.x];
  }

  // -- Message queue -------------------------------------------------

  addMessage(msg: string): void {
    if (msg) {
      this.messages.push(msg);
      if (this.messages.length > 200) this.messages = this.messages.slice(-200);
    }
  }

  // -- Player actions ------------------------------------------------

  actionMove(dx: number, dy: number): boolean {
    if (this.state !== STATE_PLAYING) return false;
    if (!this.player.alive) return false;

    if (this.player.frozen > 0) {
      this.addMessage("You can't move — you are frozen!");
      this.endPlayerTurn();
      return true;
    }

    let tx = this.player.x + dx;
    let ty = this.player.y + dy;

    if (this.player.confused > 0) {
      const dirs: [number, number][] = [
        [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1],
      ];
      const [cdx, cdy] = rng.choice(dirs);
      tx = this.player.x + cdx;
      ty = this.player.y + cdy;
    }

    const target = this.monsterAt(tx, ty);
    if (target) {
      this.playerAttack(target);
      this.endPlayerTurn();
      return true;
    }

    if (this.dungeon.isWalkable(tx, ty)) {
      this.player.moveTo(tx, ty);
      this.dungeon.computeFov(tx, ty);
      this.autoPickupGold();
      this.checkStairsMessage();
      this.endPlayerTurn();
      return true;
    }

    return false;
  }

  actionWait(): void {
    if (this.state === STATE_PLAYING) this.endPlayerTurn();
  }

  actionPickup(): void {
    if (this.state !== STATE_PLAYING) return;
    const here = this.itemsAt(this.player.x, this.player.y);
    if (here.length === 0) {
      this.addMessage('There is nothing here to pick up.');
      return;
    }
    for (const item of here) {
      if (item instanceof Gold) {
        this.player.gold += item.amount;
        this.removeItemFromMap(item);
        this.addMessage(`You pick up ${item.amount} gold pieces.`);
      } else {
        const slot = this.player.addItem(item);
        if (slot) {
          this.removeItemFromMap(item);
          this.addMessage(`(${slot}) ${item.displayName()}`);
        } else {
          this.addMessage('Your pack is too full.');
          break;
        }
      }
    }
    this.endPlayerTurn();
  }

  actionUseItem(item: Item): void {
    if (this.state !== STATE_PLAYING) return;
    const result = item.use(this);
    if (result === '__identify__') {
      this.state = STATE_IDENTIFY;
      this.addMessage('Which item do you want to identify?');
    } else {
      this.addMessage(result);
      if (item instanceof Potion || item instanceof Scroll || item instanceof Food) {
        this.player.removeItem(item);
      }
    }
    this.endPlayerTurn();
  }

  actionIdentifyItem(item: Item): void {
    item.identified = true;
    if (item instanceof Potion) item.registry.identify(item.effectKey);
    if (item instanceof Scroll) item.registry.identify(item.effectKey);
    this.addMessage(`That is ${item.displayName()}.`);
    this.state = STATE_PLAYING;
  }

  actionDropItem(item: Item): void {
    if (this.state !== STATE_PLAYING) return;
    item.x = this.player.x;
    item.y = this.player.y;
    this.player.removeItem(item);
    this.items.push(item);
    this.addMessage(`You drop the ${item.displayName()}.`);
    this.endPlayerTurn();
  }

  actionDescend(): void {
    if (this.state !== STATE_PLAYING) return;
    if (this.dungeon.tile(this.player.x, this.player.y) !== TILE_STAIRS_DN) {
      this.addMessage('You see no stairs going down here.');
      return;
    }
    if (this.dungeonLevel >= MAX_DUNGEON_LEVEL) {
      this.addMessage('You are already at the lowest level!');
      return;
    }
    this.dungeonLevel += 1;
    this.changeLevel();
    this.addMessage(`You descend to dungeon level ${this.dungeonLevel}.`);
  }

  actionAscend(): void {
    if (this.state !== STATE_PLAYING) return;
    if (this.dungeon.tile(this.player.x, this.player.y) !== TILE_STAIRS_UP) {
      this.addMessage('You see no stairs going up here.');
      return;
    }
    if (this.dungeonLevel === 1 && !this.player.hasAmulet) {
      this.addMessage('You need the Amulet of Yendor to leave the dungeon!');
      return;
    }
    if (this.dungeonLevel === 1 && this.player.hasAmulet) {
      this.triggerWin();
      return;
    }
    this.dungeonLevel -= 1;
    this.changeLevel();
    this.addMessage(`You ascend to dungeon level ${this.dungeonLevel}.`);
  }

  // -- Combat helpers ------------------------------------------------

  private playerAttack(target: Monster): void {
    const hitRoll = rng.randint(1, 20);
    if (hitRoll < target.defense) {
      this.addMessage(`You miss the ${target.name}.`);
      return;
    }

    const damage = this.player.rollAttack();
    target.takeDamage(damage);
    this.addMessage(`You hit the ${target.name} for ${damage} damage!`);

    if (!target.alive) {
      this.addMessage(`You killed the ${target.name}!`);
      this.removeMonster(target);
      if (rng.random() < 0.2) {
        const amount = rng.randint(1, Math.floor(target.xpValue / 2) + 1);
        this.items.push(new Gold(target.x, target.y, amount));
      }
      const lvlMsg = this.player.gainExp(target.xpValue);
      if (lvlMsg) this.addMessage(lvlMsg);
    }
  }

  // -- Monster turn processing ---------------------------------------

  private processMonsters(): void {
    for (const monster of [...this.monsters]) {
      if (!monster.alive) continue;
      const msg = monster.act(this);
      if (msg) this.addMessage(msg);
      if (monster.flags.has('regenerate') && this.turn % 5 === 0) monster.heal(1);
      monster.tickEffects();
    }
  }

  // -- End-of-turn bookkeeping ---------------------------------------

  private endPlayerTurn(): void {
    this.turn += 1;

    for (const m of this.player.tickEffects()) this.addMessage(m);

    const hungerMsg = this.player.tickHunger();
    if (hungerMsg) this.addMessage(hungerMsg);
    if (this.player.hunger <= 0 && this.turn % 10 === 0) {
      this.player.takeDamage(1);
      this.addMessage('You feel faint from hunger!');
    }

    if (this.monsterDetectionTurns > 0) this.monsterDetectionTurns -= 1;

    this.processMonsters();

    if (!this.player.alive) this.triggerDeath();
  }

  // -- Level transitions ---------------------------------------------

  private changeLevel(): void {
    this.dungeon = this.buildDungeon();
    const [px, py] = this.dungeon.playerStart;
    this.player.moveTo(px, py);
    this.dungeon.computeFov(px, py);
    this.populate();
  }

  // -- Item effect helpers (called by items) -------------------------

  teleportPlayer(): void {
    const candidates: [number, number][] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this.dungeon.isWalkable(x, y) && this.monsterAt(x, y) === null) candidates.push([x, y]);
      }
    }
    if (candidates.length > 0) {
      const [nx, ny] = rng.choice(candidates);
      this.player.moveTo(nx, ny);
      this.dungeon.computeFov(nx, ny);
      this.addMessage('...you teleport!');
    }
  }

  teleportMonster(monster: Monster): void {
    const candidates: [number, number][] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (
          this.dungeon.isWalkable(x, y) &&
          this.monsterAt(x, y) === null &&
          !(x === this.player.x && y === this.player.y)
        ) {
          candidates.push([x, y]);
        }
      }
    }
    if (candidates.length > 0) {
      const [nx, ny] = rng.choice(candidates);
      monster.x = nx;
      monster.y = ny;
    }
  }

  spawnMonsterNear(cx: number, cy: number): void {
    for (let i = 0; i < 50; i++) {
      const x = cx + rng.randint(-3, 3);
      const y = cy + rng.randint(-3, 3);
      if (
        x >= 0 &&
        x < MAP_WIDTH &&
        y >= 0 &&
        y < MAP_HEIGHT &&
        this.dungeon.isWalkable(x, y) &&
        this.monsterAt(x, y) === null &&
        !(x === this.player.x && y === this.player.y)
      ) {
        this.monsters.push(spawnMonster(x, y, this.dungeonLevel));
        return;
      }
    }
  }

  revealMap(): void {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this.dungeon.tiles[y][x] !== 0) this.dungeon.explored[y][x] = true;
      }
    }
  }

  zapWand(wand: Wand): string {
    const p = this.player;
    const key = wand.effectKey;
    const visibleMonsters = this.monsters.filter((m) => m.alive && this.dungeon.visible[m.y][m.x]);
    if (visibleMonsters.length === 0 && !['teleport_to', 'lightning', 'fire', 'cold'].includes(key)) {
      return 'The wand discharges harmlessly.';
    }

    let target: Monster | null = null;
    if (visibleMonsters.length > 0) {
      target = visibleMonsters.reduce((best, m) =>
        Math.abs(m.x - p.x) + Math.abs(m.y - p.y) < Math.abs(best.x - p.x) + Math.abs(best.y - p.y) ? m : best,
      );
    }

    if (key === 'magic_missile' && target) {
      const dmg = rng.randint(1, 4) + 1;
      target.takeDamage(dmg);
      if (!target.alive) {
        this.removeMonster(target);
        this.player.gainExp(target.xpValue);
        return `The bolt kills the ${target.name}!`;
      }
      return `The magic missile hits the ${target.name} for ${dmg} damage!`;
    }
    if (key === 'slow_monster' && target) {
      target.speed = Math.max(1, target.speed - 1);
      return `The ${target.name} slows down.`;
    }
    if (key === 'sleep_monster' && target) {
      target.sleeping = rng.randint(10, 20);
      return `The ${target.name} falls asleep.`;
    }
    if (key === 'drain_life' && target) {
      const dmg = Math.floor(p.hp / 2);
      p.takeDamage(dmg);
      target.takeDamage(dmg * 2);
      if (!target.alive) {
        this.removeMonster(target);
        return `The life drain kills the ${target.name}!`;
      }
      return `You drain life — the ${target.name} takes ${dmg * 2} damage.`;
    }
    if (key === 'confusion' && target) {
      target.confused = CONFUSED_TURNS;
      return `The ${target.name} looks confused.`;
    }
    if (key === 'teleport_to') {
      this.teleportPlayer();
      return 'You feel dizzy...';
    }
    if (['lightning', 'fire', 'cold'].includes(key) && target) {
      const base: Record<string, number> = { lightning: 6, fire: 8, cold: 5 };
      let dmg = 0;
      for (let i = 0; i < 4; i++) dmg += rng.randint(1, base[key]);
      target.takeDamage(dmg);
      if (!target.alive) {
        this.removeMonster(target);
        return `The ${key} kills the ${target.name}!`;
      }
      return `The ${key} hits the ${target.name} for ${dmg} damage!`;
    }
    return 'The wand discharges.';
  }

  // -- Win / death ---------------------------------------------------

  private checkStairsMessage(): void {
    const t = this.dungeon.tile(this.player.x, this.player.y);
    if (t === TILE_STAIRS_DN) this.addMessage('You see a staircase going down (use Descend button).');
    else if (t === TILE_STAIRS_UP) this.addMessage('You see a staircase going up (use Ascend button).');
  }

  private autoPickupGold(): void {
    const here = this.items.filter(
      (i) => i.x === this.player.x && i.y === this.player.y && i instanceof Gold,
    ) as Gold[];
    for (const g of here) {
      this.player.gold += g.amount;
      this.removeItemFromMap(g);
      this.addMessage(`You pick up ${g.amount} gold pieces.`);
    }
  }

  private triggerDeath(): void {
    this.state = STATE_DEAD;
    this.addMessage(`You die...  Score: ${this.score()}`);
  }

  private triggerWin(): void {
    this.state = STATE_WIN;
    this.addMessage(`You escape with the Amulet of Yendor!  Final score: ${this.score()}`);
  }

  score(): number {
    return this.player.expPts + this.player.gold + this.dungeonLevel * 100 + this.player.expLevel * 500;
  }

  // -- internal list helpers -----------------------------------------

  private removeMonster(m: Monster): void {
    const idx = this.monsters.indexOf(m);
    if (idx !== -1) this.monsters.splice(idx, 1);
  }

  private removeItemFromMap(item: Item): void {
    const idx = this.items.indexOf(item);
    if (idx !== -1) this.items.splice(idx, 1);
  }

  // -- Render --------------------------------------------------------

  getRenderData(): RenderData {
    const p = this.player;
    const dungeon = this.dungeon;
    const detectMode = this.monsterDetectionTurns > 0;

    const tiles: Cell[][] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        row.push([dungeon.tiles[y][x], dungeon.visible[y][x], dungeon.explored[y][x]]);
      }
      tiles.push(row);
    }

    const monsterData: EntityDraw[] = [];
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const visible = dungeon.visible[m.y][m.x] || detectMode;
      if (p.hallucinating > 0 && visible) {
        const ch = LETTERS[rng.randrange(LETTERS.length)];
        monsterData.push([m.x, m.y, ch, m.color, visible]);
      } else if (m.invisible && !p.seeInvisible) {
        // don't show invisible monsters
      } else {
        monsterData.push([m.x, m.y, m.char, m.color, visible]);
      }
    }

    const itemData: EntityDraw[] = [];
    for (const item of this.items) {
      const visible = dungeon.visible[item.y][item.x];
      if (visible || dungeon.explored[item.y][item.x]) {
        itemData.push([item.x, item.y, item.char, item.color, visible]);
      }
    }

    return {
      tiles,
      player: [p.x, p.y, p.char, p.color],
      monsters: monsterData,
      items: itemData,
      messages: [...this.messages],
      hud: {
        hp: p.hp,
        maxHp: p.maxHp,
        str: p.strCur,
        ac: p.effectiveAc,
        level: p.expLevel,
        exp: p.expPts,
        gold: p.gold,
        hunger: p.hunger,
        dlevel: this.dungeonLevel,
        turn: this.turn,
        confused: p.confused > 0,
        blinded: p.blinded > 0,
        hasted: p.hasted > 0,
        poisoned: p.poisoned > 0,
        frozen: p.frozen > 0,
        hasAmulet: p.hasAmulet,
      },
      state: this.state,
    };
  }
}
