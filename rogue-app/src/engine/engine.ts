// Core game engine — manages game state and processes turns.

import {
  MAP_WIDTH,
  MAP_HEIGHT,
  MAX_DUNGEON_LEVEL,
  TILE_FLOOR,
  TILE_CORRIDOR,
  TILE_DOOR,
  TILE_STAIRS_DN,
  TILE_STAIRS_UP,
  TILE_TRAP,
  CONFUSED_TURNS,
  SLEEPING_TURNS,
  FROZEN_TURNS,
  STARVETIME,
  addDam,
  RGB,
} from './constants';
import { rng } from './rng';
import { swing, rollDice } from './combat';
import { Dungeon, Trap } from './dungeon';
import { Player } from './entities';
import {
  Item,
  Gold,
  Potion,
  Scroll,
  Food,
  Amulet,
  Wand,
  Weapon,
  Armor,
  Ring,
  PotionRegistry,
  ScrollRegistry,
  RingRegistry,
  WandRegistry,
  ItemRegistries,
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
  ringReg: RingRegistry;
  wandReg: WandRegistry;

  dungeonLevel = 1;
  dungeon: Dungeon;
  player: Player;
  monsters: Monster[] = [];
  items: Item[] = [];

  messages: string[] = [];
  state = STATE_PLAYING;
  turn = 0;
  identifyKind = 'any'; // which item category the pending identify scroll targets
  deathCause = 'killed in the dungeon'; // recorded for the tombstone screen

  monsterDetectionTurns = 0;
  seed: string;

  private hasteToggle = false; // alternates monster turns while the hero is hasted
  private wanderBetween = 0; // turns since last wander roll
  private wanderCooldown = 0; // cooldown after a wanderer spawns

  constructor(seed?: string | number) {
    // Reseed the shared RNG so the whole run is reproducible from this seed.
    rng.reseed(seed ?? String(Date.now()));
    this.seed = rng.seed;

    this.potionReg = new PotionRegistry();
    this.scrollReg = new ScrollRegistry();
    this.ringReg = new RingRegistry();
    this.wandReg = new WandRegistry();

    this.dungeon = this.buildDungeon();

    const [px, py] = this.dungeon.playerStart;
    this.player = new Player(px, py);
    this.giveStartingPack();
    this.updateFov(px, py);

    this.populate();

    this.addMessage('Welcome to Rogue!  Your quest is to retrieve the Amulet of Yendor.');
  }

  /**
   * The original starting pack (init.c init_player): 1 food ration, +1 ring
   * mail (worn), a +1,+1 mace (wielded), a +1 short bow, and 25–39 arrows —
   * all pre-identified.
   */
  private giveStartingPack(): void {
    const p = this.player;
    const food = new Food(0, 0, 0);
    const mace = new Weapon(0, 0, 0, 1); // mace, +1/+1
    const bow = new Weapon(0, 0, 2, 1); // short bow, +1
    const arrows = new Weapon(0, 0, 3, 0); // arrows, +0
    arrows.count = rng.randint(25, 39); // rnd(15) + 25
    const mail = new Armor(0, 0, 1, 1); // ring mail, +1 -> AC 6
    for (const it of [food, mace, bow, arrows, mail]) p.addItem(it);
    p.weapon = mace;
    p.armor = mail;
    p.recalcAc();
  }

  // -- Dungeon management --------------------------------------------

  private buildDungeon(): Dungeon {
    return new Dungeon(this.dungeonLevel);
  }

  get registries(): ItemRegistries {
    return { potion: this.potionReg, scroll: this.scrollReg, ring: this.ringReg, wand: this.wandReg };
  }

  private populate(): void {
    this.monsters = [];
    this.items = [];

    if (this.dungeonLevel === MAX_DUNGEON_LEVEL && this.dungeon.stairsDown) {
      const [ax, ay] = this.dungeon.stairsDown;
      this.items.push(new Amulet(ax, ay));
    }

    for (const [mx, my] of this.dungeon.monsterSpawns) {
      const m = spawnMonster(mx, my, this.dungeonLevel);
      // A monster carries treasure with its template carry% (extern.c).
      if (rng.randrange(100) < m.template.carry) {
        m.pack = randomItem(m.x, m.y, this.dungeonLevel, this.registries);
      }
      this.monsters.push(m);
    }
    for (const [ix, iy] of this.dungeon.itemSpawns) {
      this.items.push(randomItem(ix, iy, this.dungeonLevel, this.registries));
    }

    this.maybeAddTreasureRoom();
  }

  /** Occasionally fill a room with gold and guardians (rooms.c treas_room). */
  private maybeAddTreasureRoom(): void {
    if (rng.randrange(20) !== 0) return; // ~1 in 20 levels
    const rooms = this.dungeon.rooms.filter(
      (r) => !r.gone && !r.maze && !(r.x1 < this.player.x && this.player.x < r.x2 && r.y1 < this.player.y && this.player.y < r.y2),
    );
    if (rooms.length === 0) return;
    const room = rng.choice(rooms);

    let guardians = 0;
    for (let y = room.y1 + 1; y < room.y2; y++) {
      for (let x = room.x1 + 1; x < room.x2; x++) {
        if (this.dungeon.tile(x, y) !== TILE_FLOOR || this.monsterAt(x, y)) continue;
        if (rng.random() < 0.55) {
          this.items.push(new Gold(x, y, rng.randint(5, 30 + this.dungeonLevel * 15)));
        } else if (guardians < 6 && rng.random() < 0.4) {
          // Sleeping guardians that wake when the hero approaches.
          this.monsters.push(spawnMonster(x, y, this.dungeonLevel + 2));
          guardians += 1;
        }
      }
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

  /** Squares holding a dropped scroll of scare monster — monsters won't enter. */
  scareSquares(): Set<string> {
    const squares = new Set<string>();
    for (const it of this.items) {
      if (it instanceof Scroll && it.effectKey === 'scare_monster') squares.add(`${it.x},${it.y}`);
    }
    return squares;
  }

  itemsAt(x: number, y: number): Item[] {
    return this.items.filter((i) => i.x === x && i.y === y);
  }

  canMonsterSeePlayer(monster: Monster): boolean {
    const p = this.player;
    const dist = Math.max(Math.abs(monster.x - p.x), Math.abs(monster.y - p.y));
    // A ring of stealth keeps the hero unnoticed until much closer.
    const range = p.hasRing('stealth') ? 3 : 8;
    if (dist > range) return false;
    return this.dungeon.visible[monster.y][monster.x];
  }

  /** Recompute visibility — but a blinded hero sees nothing new. */
  private updateFov(x: number, y: number): void {
    if (this.player && this.player.blinded > 0) {
      const vis = this.dungeon.visible;
      for (let yy = 0; yy < MAP_HEIGHT; yy++) for (let xx = 0; xx < MAP_WIDTH; xx++) vis[yy][xx] = false;
      return;
    }
    this.dungeon.computeFov(x, y);
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
      // Rogue forbids diagonal moves into/out of doorways and passages.
      if (this.diagonalBlocked(this.player.x, this.player.y, tx, ty)) return false;
      this.player.moveTo(tx, ty);
      this.updateFov(tx, ty);
      this.autoPickupGold();
      this.checkTrap();
      this.checkStairsMessage();
      this.endPlayerTurn();
      return true;
    }

    return false;
  }

  /** True if a diagonal step would slip through a doorway or passage. */
  private diagonalBlocked(fx: number, fy: number, tx: number, ty: number): boolean {
    if (fx === tx || fy === ty) return false; // orthogonal moves are fine
    const passage = (t: number) => t === TILE_DOOR || t === TILE_CORRIDOR;
    return passage(this.dungeon.tile(fx, fy)) || passage(this.dungeon.tile(tx, ty));
  }

  actionWait(): void {
    if (this.state === STATE_PLAYING) this.endPlayerTurn();
  }

  /** Search adjacent cells for hidden traps (and reveal them). */
  actionSearch(): void {
    if (this.state !== STATE_PLAYING) return;
    let found = 0;
    for (const t of this.dungeon.traps) {
      if (t.found) continue;
      if (Math.abs(t.x - this.player.x) <= 1 && Math.abs(t.y - this.player.y) <= 1) {
        if (rng.random() < 0.5) {
          t.found = true;
          this.dungeon.setTile(t.x, t.y, TILE_TRAP);
          found += 1;
        }
      }
    }
    if (found > 0) this.addMessage(found === 1 ? 'You found a trap!' : `You found ${found} traps!`);
    this.endPlayerTurn();
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
          // Missiles may have merged into an existing stack — show that stack.
          const shown = this.player.inventory.includes(item)
            ? item
            : this.player.inventory.find((i) => i.kind === item.kind && i.name === item.name) ?? item;
          this.addMessage(`(${slot}) ${shown.displayName()}`);
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

  /** Does `item` match the category the pending identify scroll targets? */
  private matchesIdentifyKind(item: Item): boolean {
    switch (this.identifyKind) {
      case 'any':
        return true;
      case 'potion':
        return item instanceof Potion;
      case 'scroll':
        return item instanceof Scroll;
      case 'weapon':
        return item instanceof Weapon;
      case 'armor':
        return item instanceof Armor;
      case 'ringwand':
        return item instanceof Ring || item instanceof Wand;
      default:
        return true;
    }
  }

  actionIdentifyItem(item: Item): void {
    if (this.state !== STATE_IDENTIFY) return;
    if (!this.matchesIdentifyKind(item)) {
      this.addMessage('This scroll has no effect on that.');
      return; // stay in identify mode so the player can pick again
    }
    item.identified = true;
    if (item instanceof Potion) item.registry.identify(item.effectKey);
    if (item instanceof Scroll) item.registry.identify(item.effectKey);
    if (item instanceof Ring) item.registry?.identify(item.effectKey);
    if (item instanceof Wand) item.registry?.identify(item.effectKey);
    this.addMessage(`That is ${item.displayName()}.`);
    this.identifyKind = 'any';
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

  /** Hurl an item at the nearest visible monster (auto-targeted). */
  actionThrowItem(item: Item): void {
    if (this.state !== STATE_PLAYING) return;
    const p = this.player;
    const target = this.nearestVisibleMonster();

    // Missiles stack: peel a single projectile off the pile, keep the rest.
    let missile = item;
    if (item instanceof Weapon && item.count > 1) {
      item.count -= 1;
      missile = new Weapon(0, 0, item.templateIdx, item.enchant, item.cursed);
    } else {
      p.removeItem(item);
    }

    if (!target) {
      missile.x = p.x;
      missile.y = p.y;
      this.items.push(missile);
      this.addMessage(`You throw the ${missile.displayName()}, but there is nothing to hit.`);
      this.endPlayerTurn();
      return;
    }

    const w = missile instanceof Weapon ? missile : null;
    const wplus = p.toHitBonus + (w ? w.enchant : 0);
    if (w && swing(p.expLevel, target.defense, wplus)) {
      let dmg = rollDice(w.hurlDice[0], w.hurlDice[1]) + addDam(p.effectiveStr) + w.enchant;
      // Firing matching ammo while wielding its launcher adds a bonus.
      if (w.missile && w.launcher && p.weapon instanceof Weapon && p.weapon.name === w.launcher) {
        dmg += rollDice(1, 6);
      }
      dmg = Math.max(1, dmg);
      target.takeDamage(dmg);
      this.addMessage(`The ${missile.displayName()} hits the ${target.name} for ${dmg} damage!`);
      if (!target.alive) {
        this.addMessage(`You killed the ${target.name}!`);
        this.removeMonster(target);
        this.dropMonsterLoot(target);
        const lvl = p.gainExp(target.xpValue);
        if (lvl) this.addMessage(lvl);
      }
    } else {
      this.addMessage(`The ${missile.displayName()} misses the ${target.name}.`);
    }

    // The thrown item lands on the target's square.
    missile.x = target.x;
    missile.y = target.y;
    this.items.push(missile);
    this.endPlayerTurn();
  }

  actionDescend(): void {
    if (this.state !== STATE_PLAYING) return;
    if (this.dungeon.tile(this.player.x, this.player.y) !== TILE_STAIRS_DN) {
      this.addMessage('You see no stairs going down here.');
      return;
    }
    // The dungeon continues indefinitely past the Amulet level.
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
    // The way back is sealed until you hold the Amulet of Yendor.
    if (!this.player.hasAmulet) {
      this.addMessage('A magical force prevents you from ascending without the Amulet of Yendor.');
      return;
    }
    if (this.dungeonLevel === 1) {
      this.triggerWin();
      return;
    }
    this.dungeonLevel -= 1;
    this.changeLevel();
    this.addMessage(`You ascend to dungeon level ${this.dungeonLevel}.`);
  }

  // -- Combat helpers ------------------------------------------------

  private playerAttack(target: Monster): void {
    // Rogue to-hit: rnd(20) + toHitBonus >= (20 - level) - monsterAC.
    if (!swing(this.player.expLevel, target.defense, this.player.toHitBonus)) {
      this.addMessage(`You miss the ${target.name}.`);
      return;
    }

    const damage = this.player.rollAttack();
    target.takeDamage(damage);
    this.addMessage(`You hit the ${target.name} for ${damage} damage!`);

    if (this.player.confusingTouch && target.alive) {
      target.confused = CONFUSED_TURNS;
      this.player.confusingTouch = false;
      this.addMessage(`The ${target.name} looks confused.`);
    }

    if (!target.alive) {
      this.addMessage(`You killed the ${target.name}!`);
      this.removeMonster(target);
      this.dropMonsterLoot(target);
      const lvlMsg = this.player.gainExp(target.xpValue);
      if (lvlMsg) this.addMessage(lvlMsg);
    }
  }

  /** Drop whatever a slain monster was carrying (its pack item or gold). */
  private dropMonsterLoot(m: Monster): void {
    if (m.pack) {
      m.pack.x = m.x;
      m.pack.y = m.y;
      this.items.push(m.pack);
      m.pack = null;
    } else if (rng.randrange(100) < m.template.carry) {
      const amount = rng.randint(1, Math.floor(m.xpValue / 2) + 1);
      this.items.push(new Gold(m.x, m.y, amount));
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

    this.player.regen();

    const hungerMsg = this.player.tickHunger();
    if (hungerMsg) this.addMessage(hungerMsg);
    if (this.player.hunger <= 0) {
      // Starving: the hero randomly FAINTS (loses turns, daemons.c), and dies
      // only after STARVETIME turns below zero — no chip damage.
      if (this.player.hunger < -STARVETIME) {
        this.player.hp = 0;
        this.deathCause = 'died of starvation';
        this.addMessage('You have starved to death.');
      } else if (this.player.frozen === 0 && rng.random() < 0.2) {
        this.player.frozen = rng.randint(4, 8);
        this.addMessage('You faint from lack of food.');
      }
    }

    if (this.monsterDetectionTurns > 0) this.monsterDetectionTurns -= 1;

    // A ring of teleportation occasionally whisks the hero away.
    if (this.player.hasRing('teleport') && rng.random() < 0.02) {
      this.teleportPlayer();
    }

    this.maybeSpawnWanderer();

    // A hasted hero acts twice per monster turn: only run monsters on alternate
    // turns while hasted (Rogue 5.4.4 ISHASTE).
    let runMonsters = true;
    if (this.player.hasted > 0) {
      this.hasteToggle = !this.hasteToggle;
      runMonsters = this.hasteToggle;
    } else {
      this.hasteToggle = false;
    }
    if (runMonsters) this.processMonsters();

    if (!this.player.alive) this.triggerDeath();
  }

  // -- Traps ---------------------------------------------------------

  private checkTrap(): void {
    const trap = this.dungeon.trapAt(this.player.x, this.player.y);
    if (!trap) return;
    // Levitation floats the hero over floor traps.
    if (this.player.levitating > 0) {
      if (!trap.found) {
        trap.found = true;
        this.dungeon.setTile(trap.x, trap.y, TILE_TRAP);
        this.addMessage('You float over a trap.');
      }
      return;
    }
    if (!trap.found) {
      trap.found = true;
      this.dungeon.setTile(trap.x, trap.y, TILE_TRAP);
    }
    this.triggerTrap(trap);
  }

  private triggerTrap(trap: Trap): void {
    const p = this.player;
    switch (trap.kind) {
      case 'trapdoor':
        this.addMessage('You fall through a trap door!');
        this.dungeonLevel += 1;
        this.changeLevel();
        this.deathCause = 'fell to their death through a trap door';
        p.takeDamage(rng.randint(1, this.dungeonLevel));
        break;
      case 'bear':
        p.frozen = Math.max(p.frozen, rng.randint(2, 5));
        this.addMessage('You are caught in a bear trap!');
        break;
      case 'sleep':
        p.frozen = Math.max(p.frozen, rng.randint(2, SLEEPING_TURNS));
        this.addMessage('A strange white mist envelops you and you fall asleep.');
        break;
      case 'arrow': {
        if (swing(this.dungeonLevel, p.effectiveAc, 0)) {
          const dmg = rng.randint(1, 6);
          this.deathCause = 'shot by an arrow trap';
          p.takeDamage(dmg);
          this.addMessage(`An arrow shoots out and hits you for ${dmg} damage!`);
        } else {
          this.addMessage('An arrow shoots out at you — and misses.');
        }
        break;
      }
      case 'teleport':
        this.teleportPlayer();
        this.addMessage('You are momentarily disoriented...');
        break;
      case 'dart': {
        const dmg = rng.randint(1, 4);
        this.deathCause = 'killed by a dart trap';
        p.takeDamage(dmg);
        let msg = `A small dart whizzes out and hits you for ${dmg} damage!`;
        if (rng.random() < 0.4 && p.reduceStr(1)) msg += '  You feel weaker.';
        this.addMessage(msg);
        break;
      }
      case 'rust':
        if (p.armor && !(p.armor as unknown as { protected?: boolean }).protected && !p.hasRing('maintain_armor')) {
          p.armor.acBonus = Math.max(0, p.armor.acBonus - 1);
          (p.armor as unknown as { enchant: number }).enchant -= 1;
          p.recalcAc();
          this.addMessage('A gush of water hits you — your armor weakens!');
        } else {
          this.addMessage('A gush of water hits you on the head.');
        }
        break;
    }
    if (!p.alive) this.triggerDeath();
  }

  // -- Wandering monsters --------------------------------------------

  /** Periodically spawn a new monster that hunts the hero (daemons.c). */
  private maybeSpawnWanderer(): void {
    if (this.wanderCooldown > 0) {
      this.wanderCooldown -= 1;
      return;
    }
    if (this.monsters.filter((m) => m.alive).length >= 15) return;
    this.wanderBetween += 1;
    if (this.wanderBetween < 4) return;
    this.wanderBetween = 0;
    if (rng.randint(1, 6) !== 4) return;
    this.spawnWanderer();
    this.wanderCooldown = 70;
  }

  private spawnWanderer(): void {
    // Find a floor cell the hero cannot currently see.
    const spots: [number, number][] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (
          this.dungeon.isWalkable(x, y) &&
          !this.dungeon.visible[y][x] &&
          this.monsterAt(x, y) === null &&
          !(x === this.player.x && y === this.player.y)
        ) {
          spots.push([x, y]);
        }
      }
    }
    if (spots.length === 0) return;
    const [x, y] = rng.choice(spots);
    // Wanderers draw from the original wand_mons table (some letters never wander).
    const m = spawnMonster(x, y, this.dungeonLevel, true);
    m.aware = true;
    m.aggravated = true;
    this.monsters.push(m);
  }

  // -- Level transitions ---------------------------------------------

  private changeLevel(): void {
    this.dungeon = this.buildDungeon();
    const [px, py] = this.dungeon.playerStart;
    this.player.moveTo(px, py);
    this.updateFov(px, py);
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
      this.updateFov(nx, ny);
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

  /** Mark matching items as explored (potions of magic/food detection). */
  detectItems(pred: (it: Item) => boolean): number {
    let n = 0;
    for (const it of this.items) {
      if (pred(it)) {
        this.dungeon.explored[it.y][it.x] = true;
        n += 1;
      }
    }
    return n;
  }

  /** Light the room (or immediate area) the hero stands in. */
  lightArea(): void {
    const room = this.dungeon.inRoom(this.player.x, this.player.y);
    if (room) {
      room.dark = false;
      this.updateFov(this.player.x, this.player.y);
    }
  }

  private nearestVisibleMonster(): Monster | null {
    const p = this.player;
    const visible = this.monsters.filter((m) => m.alive && this.dungeon.visible[m.y][m.x]);
    if (visible.length === 0) return null;
    return visible.reduce((best, m) =>
      Math.abs(m.x - p.x) + Math.abs(m.y - p.y) < Math.abs(best.x - p.x) + Math.abs(best.y - p.y) ? m : best,
    );
  }

  zapWand(wand: Wand): string {
    const p = this.player;
    const key = wand.effectKey;

    // Wands that need no monster target.
    if (key === 'nothing') return 'The wand does nothing.';
    if (key === 'light') {
      this.lightArea();
      return 'The area is lit by a shimmering light.';
    }
    if (key === 'teleport_to') {
      this.teleportPlayer();
      return 'You feel dizzy for a moment...';
    }

    const target = this.nearestVisibleMonster();
    if (!target) return 'The wand discharges harmlessly into the darkness.';

    const killed = (verb: string): string => {
      this.removeMonster(target);
      this.dropMonsterLoot(target);
      const lvl = p.gainExp(target.xpValue);
      if (lvl) this.addMessage(lvl);
      return `The ${verb} kills the ${target.name}!`;
    };

    if (key === 'magic_missile') {
      const dmg = rng.randint(1, 4) + 1;
      target.takeDamage(dmg);
      if (!target.alive) return killed('bolt');
      return `The magic missile hits the ${target.name} for ${dmg} damage!`;
    }
    if (key === 'lightning' || key === 'fire' || key === 'cold') {
      const base: Record<string, number> = { lightning: 6, fire: 8, cold: 5 };
      let dmg = 0;
      for (let i = 0; i < 6; i++) dmg += rng.randint(1, base[key]); // ~6d6 bolt
      target.takeDamage(dmg);
      if (!target.alive) return killed(key);
      return `The bolt of ${key} hits the ${target.name} for ${dmg} damage!`;
    }
    if (key === 'drain_life') {
      const dmg = Math.max(1, Math.floor(p.hp / 2));
      this.deathCause = 'drained their own life force';
      p.takeDamage(dmg);
      target.takeDamage(dmg * 2);
      if (!target.alive) return killed('life drain');
      return `You drain life — the ${target.name} takes ${dmg * 2} damage.`;
    }
    if (key === 'slow_monster') {
      target.speed = Math.max(1, target.speed - 1);
      return `The ${target.name} slows down.`;
    }
    if (key === 'haste_monster') {
      target.speed += 1;
      return `The ${target.name} speeds up!`;
    }
    if (key === 'teleport_away') {
      this.teleportMonster(target);
      return `The ${target.name} vanishes!`;
    }
    if (key === 'invisibility') {
      target.invisible = true;
      return `The ${target.name} fades from view.`;
    }
    if (key === 'cancellation') {
      target.flags.clear();
      target.invisible = false;
      return `The ${target.name} is stripped of its powers.`;
    }
    if (key === 'polymorph') {
      const [mx, my] = [target.x, target.y];
      this.removeMonster(target);
      this.monsters.push(spawnMonster(mx, my, this.dungeonLevel));
      return `The ${target.name} turns into something else!`;
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
    if (this.state === STATE_DEAD) return;
    this.state = STATE_DEAD;
    this.addMessage(`You die...  ${this.deathCause}.  Score: ${this.score()}`);
  }

  private triggerWin(): void {
    this.state = STATE_WIN;
    this.addMessage(`You escape with the Amulet of Yendor!  Final score: ${this.score()}`);
  }

  /** Score is gold-driven (Rogue), with depth/xp and a winner bonus. */
  score(): number {
    let s = this.player.gold + this.player.expPts + this.dungeonLevel * 100 + this.player.expLevel * 100;
    if (this.state === STATE_WIN) s += 10000 + this.player.gold; // amulet bonus
    return s;
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
      } else if (m.invisible && !p.canSeeInvisible) {
        // don't show invisible monsters
      } else if (m.disguiseChar && !m.aware) {
        // A xeroc poses as an innocent item until it wakes.
        monsterData.push([m.x, m.y, m.disguiseChar, m.color, visible]);
      } else {
        monsterData.push([m.x, m.y, m.char, m.color, visible]);
      }
    }

    const ITEM_GLYPHS = '!?/=)[%*,$';
    const itemData: EntityDraw[] = [];
    for (const item of this.items) {
      const visible = dungeon.visible[item.y][item.x];
      if (visible || dungeon.explored[item.y][item.x]) {
        // Hallucination scrambles item glyphs the hero can currently see.
        const ch = p.hallucinating > 0 && visible ? ITEM_GLYPHS[rng.randrange(ITEM_GLYPHS.length)] : item.char;
        itemData.push([item.x, item.y, ch, item.color, visible]);
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
