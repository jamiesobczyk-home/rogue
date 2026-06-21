// Monster definitions and AI.
// Ported from rogue/game/monsters.py — all 26 original Rogue monsters (A–Z).

import { Actor, Player } from './entities';
import {
  RED,
  DARK_RED,
  GREEN,
  DARK_GREEN,
  BLUE,
  YELLOW,
  CYAN,
  MAGENTA,
  ORANGE,
  BROWN,
  GRAY,
  DARK_GRAY,
  LIGHT_GRAY,
  PURPLE,
  WHITE,
  CONFUSED_TURNS,
  FROZEN_TURNS,
  RGB,
} from './constants';
import { rng } from './rng';
import { swing } from './combat';
import type { Dungeon } from './dungeon';
import type { GameEngine } from './engine';

// ---------------------------------------------------------------------------
// Monster template
// ---------------------------------------------------------------------------

export interface MonsterTemplate {
  letter: string;
  name: string;
  color: RGB;
  minLevel: number;
  maxLevel: number;
  hpDice: [number, number];
  attackDice: [number, number];
  defense: number;
  xpValue: number;
  speed: number;
  flags: string;
}

function mt(
  letter: string,
  name: string,
  color: RGB,
  minLevel: number,
  maxLevel: number,
  hpDice: [number, number],
  attackDice: [number, number],
  defense: number,
  xpValue: number,
  speed = 1,
  flags = '',
): MonsterTemplate {
  return { letter, name, color, minLevel, maxLevel, hpDice, attackDice, defense, xpValue, speed, flags };
}

// The `defense` column is the original signed armor class (Rogue 5.4.4
// extern.c) — LOWER is better, and some monsters (dragon, black unicorn) have
// negative AC. It feeds swing() directly. Names, HP dice, attack dice and exp
// remain the simplified port for now (corrected in a later pass).
export const MONSTER_TEMPLATES: MonsterTemplate[] = [
  mt('A', 'aquator', CYAN, 5, 26, [5, 8], [0, 0], 2, 20, 1, 'rust_armor'),
  mt('B', 'bat', DARK_GRAY, 1, 8, [1, 8], [1, 2], 3, 5, 2, 'random_move'),
  mt('C', 'centipede', GREEN, 2, 10, [2, 4], [1, 3], 4, 15, 1, 'reduce_str'),
  mt('D', 'dragon', RED, 10, 26, [10, 8], [4, 8], -1, 5000, 1, 'breathe_fire'),
  mt('E', 'emu', BROWN, 1, 6, [1, 8], [1, 2], 7, 2, 1, 'aggressive'),
  mt('F', 'venus flytrap', DARK_GREEN, 8, 26, [8, 8], [0, 0], 3, 80, 1, 'hold'),
  mt('G', 'griffin', YELLOW, 13, 26, [13, 8], [5, 8], 2, 2000, 1, 'aggressive'),
  mt('H', 'hobgoblin', BROWN, 1, 8, [1, 8], [1, 8], 5, 10),
  mt('I', 'ice monster', CYAN, 1, 8, [1, 8], [0, 0], 9, 15, 1, 'freeze'),
  mt('J', 'jabberwock', MAGENTA, 15, 26, [15, 8], [2, 12], 6, 3000),
  mt('K', 'kestrel', LIGHT_GRAY, 1, 6, [1, 4], [1, 4], 7, 5, 2),
  mt('L', 'leprechaun', GREEN, 3, 15, [3, 8], [1, 1], 8, 10, 1, 'steal_gold'),
  mt('M', 'medusa', PURPLE, 8, 26, [8, 8], [3, 4], 2, 200, 1, 'confuse'),
  mt('N', 'nymph', CYAN, 3, 14, [3, 8], [0, 0], 9, 25, 1, 'steal_item'),
  mt('O', 'orc', GREEN, 5, 18, [5, 8], [1, 8], 6, 25),
  mt('P', 'phantom', GRAY, 8, 26, [8, 8], [4, 6], 3, 120, 1, 'invisible'),
  mt('Q', 'quagga', BROWN, 3, 15, [3, 8], [2, 5], 3, 30),
  mt('R', 'rattlesnake', DARK_GREEN, 2, 12, [2, 6], [1, 6], 3, 20, 1, 'poison'),
  mt('S', 'snake', GREEN, 1, 8, [1, 6], [1, 3], 5, 5),
  mt('T', 'troll', DARK_GREEN, 7, 26, [6, 8], [2, 6], 4, 50, 1, 'regenerate'),
  mt('U', 'ur-vile', DARK_RED, 7, 26, [7, 8], [1, 4], -2, 90, 1, 'cast_spell'),
  mt('V', 'vampire', RED, 8, 26, [8, 8], [1, 10], 1, 350, 1, 'drain_level'),
  mt('W', 'wraith', GRAY, 5, 26, [5, 8], [1, 6], 4, 55, 1, 'drain_level'),
  mt('X', 'xeroc', YELLOW, 7, 26, [7, 8], [4, 8], 7, 100, 1, 'disguise'),
  mt('Y', 'yeti', WHITE, 5, 20, [4, 8], [1, 6], 6, 50, 1, 'freeze'),
  mt('Z', 'zombie', DARK_GREEN, 2, 10, [2, 8], [1, 8], 8, 6),
];

export function templatesForLevel(level: number): MonsterTemplate[] {
  return MONSTER_TEMPLATES.filter((t) => t.minLevel <= level && level <= t.maxLevel);
}

// ---------------------------------------------------------------------------
// Monster instance
// ---------------------------------------------------------------------------

export class Monster extends Actor {
  template: MonsterTemplate;
  flags: Set<string>;
  speed: number;
  speedCounter = 0;

  aware = false;
  aggravated = false;
  scared = 0;
  invisible: boolean;

  constructor(x: number, y: number, template: MonsterTemplate) {
    const [n, sides] = template.hpDice;
    let hp = 0;
    for (let i = 0; i < n; i++) hp += rng.randint(1, sides);
    hp = Math.max(1, hp);

    super(
      x,
      y,
      template.letter,
      template.color,
      template.name,
      hp,
      template.attackDice[1] > 0 ? template.attackDice : [1, 4],
      template.defense,
      template.xpValue,
    );
    this.template = template;
    this.flags = new Set(template.flags ? template.flags.split(' ') : []);
    this.speed = template.speed;
    this.invisible = this.flags.has('invisible');
  }

  /** Combat level for swing() — HP is rolled as `level`d8, so hpDice[0] is it. */
  get level(): number {
    return this.template.hpDice[0];
  }

  // -- AI tick -------------------------------------------------------

  act(engine: GameEngine): string | null {
    if (this.sleeping > 0 || this.frozen > 0) return null;
    if (!this.alive) return null;

    const player = engine.player;
    const dungeon = engine.dungeon;

    if (this.aggravated || engine.canMonsterSeePlayer(this)) this.aware = true;

    if (!this.aware) {
      if (rng.random() < 0.1 && this.flags.has('random_move')) {
        this.randomStep(dungeon, engine.occupiedPositions());
      }
      return null;
    }

    const extraMoves = this.speed - 1;
    const msg = this.takeSingleAction(engine, player, dungeon);
    for (let i = 0; i < extraMoves; i++) {
      if (this.alive && engine.player.alive) this.takeSingleAction(engine, player, dungeon);
    }
    return msg;
  }

  private takeSingleAction(engine: GameEngine, player: Player, dungeon: Dungeon): string | null {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.abs(dx) + Math.abs(dy);

    if (this.scared > 0) {
      this.scared -= 1;
      this.moveAwayFrom(player, dungeon, engine.occupiedPositions());
      return null;
    }

    if (dist <= 1 || (Math.abs(dx) === 1 && Math.abs(dy) === 1)) {
      return this.attack(engine, player);
    }

    if (this.confused > 0) {
      this.randomStep(dungeon, engine.occupiedPositions());
      return null;
    }

    if (this.flags.has('random_move')) {
      this.randomStep(dungeon, engine.occupiedPositions());
      return null;
    }

    const occupied = engine.occupiedPositions();
    occupied.delete(`${this.x},${this.y}`);
    const path = dungeon.pathTo(this.x, this.y, player.x, player.y, occupied);
    if (path.length > 0) {
      const [nx, ny] = path[0];
      if (!occupied.has(`${nx},${ny}`)) {
        this.x = nx;
        this.y = ny;
      }
    } else {
      this.randomStep(dungeon, engine.occupiedPositions());
    }
    return null;
  }

  private attack(engine: GameEngine, player: Player): string | null {
    if (this.template.attackDice[1] === 0) return this.specialAttack(engine, player);

    // Rogue to-hit: rnd(20) >= (20 - monsterLevel) - playerAC.
    if (!swing(this.level, player.effectiveAc, 0)) return null; // miss — no spam

    const damage = this.rollAttack();
    player.takeDamage(damage);
    let msg = `The ${this.name} hits you for ${damage} damage!`;

    if (this.flags.has('poison') && rng.random() < 0.5) {
      player.strCur = Math.max(1, player.strCur - 1);
      msg += '  You feel weak!';
    }
    if (this.flags.has('reduce_str') && rng.random() < 0.3) {
      player.strCur = Math.max(1, player.strCur - 1);
      msg += '  You feel weaker!';
    }
    if (this.flags.has('confuse') && rng.random() < 0.5) {
      player.confused = CONFUSED_TURNS;
      msg += '  You feel confused!';
    }
    if (this.flags.has('drain_level') && rng.random() < 0.3) {
      if (player.expLevel > 1) {
        player.expLevel -= 1;
        const hpLoss = rng.randint(3, 10);
        player.maxHp = Math.max(1, player.maxHp - hpLoss);
        player.hp = Math.min(player.hp, player.maxHp);
        msg += `  Your life-force is drained!  You are now level ${player.expLevel}.`;
      }
    }
    if (this.flags.has('freeze') && rng.random() < 0.4) {
      player.frozen = FROZEN_TURNS;
      msg += '  You are frozen!';
    }
    if (this.flags.has('breathe_fire') && rng.random() < 0.25) {
      const extra = rng.randint(5, 20);
      player.takeDamage(extra);
      msg += `  The dragon breathes fire for ${extra} extra damage!`;
    }
    return msg;
  }

  private specialAttack(engine: GameEngine, player: Player): string | null {
    if (this.flags.has('rust_armor')) {
      if (player.armor) {
        player.armor.acBonus = Math.max(0, player.armor.acBonus - 1);
        (player.armor as unknown as { enchant: number }).enchant -= 1;
        player.recalcAc();
        return `The ${this.name} corrodes your ${player.armor.name}!`;
      }
      return null;
    }
    if (this.flags.has('steal_gold')) {
      if (player.gold > 0) {
        const stolen = Math.min(player.gold, rng.randint(1, player.gold));
        player.gold -= stolen;
        this.aware = false;
        engine.teleportMonster(this);
        return `The ${this.name} steals ${stolen} gold and disappears!`;
      }
      return null;
    }
    if (this.flags.has('steal_item')) {
      if (player.inventory.length > 0) {
        const item = rng.choice(player.inventory);
        player.removeItem(item);
        engine.teleportMonster(this);
        return `The ${this.name} steals your ${item.displayName()} and disappears!`;
      }
      return null;
    }
    if (this.flags.has('hold')) {
      player.frozen = FROZEN_TURNS * 3;
      return `The ${this.name} grabs you!  You can't move!`;
    }
    return null;
  }

  // -- Movement helpers ----------------------------------------------

  private randomStep(dungeon: Dungeon, occupied: Set<string>): void {
    const neighbours = dungeon.walkableNeighbours(this.x, this.y);
    const free = neighbours.filter(([nx, ny]) => !occupied.has(`${nx},${ny}`));
    if (free.length > 0) {
      const [nx, ny] = rng.choice(free);
      this.x = nx;
      this.y = ny;
    }
  }

  private moveAwayFrom(target: Player, dungeon: Dungeon, occupied: Set<string>): void {
    let best: [number, number] | null = null;
    let bestDist = -1;
    for (const [nx, ny] of dungeon.walkableNeighbours(this.x, this.y)) {
      if (occupied.has(`${nx},${ny}`)) continue;
      const d = Math.abs(nx - target.x) + Math.abs(ny - target.y);
      if (d > bestDist) {
        bestDist = d;
        best = [nx, ny];
      }
    }
    if (best) {
      this.x = best[0];
      this.y = best[1];
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function spawnMonster(x: number, y: number, dungeonLevel: number): Monster {
  let candidates = templatesForLevel(dungeonLevel);
  if (candidates.length === 0) candidates = MONSTER_TEMPLATES.slice(0, 6);

  const weights = candidates.map((t) => {
    const ideal = (t.minLevel + t.maxLevel) / 2;
    const dist = Math.abs(ideal - dungeonLevel);
    return Math.max(1, 10 - Math.floor(dist));
  });

  const template = rng.choices(candidates, weights, 1)[0];
  return new Monster(x, y, template);
}
