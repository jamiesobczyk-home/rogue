// Monster definitions and AI.
//
// Stats are the authentic Rogue 5.4.4 table (extern.c `monsters[26]`): each
// monster has a level (HP is rolled as `level`d8), a signed armor class (lower
// is better), an experience award, a treasure carry%, and a damage string of
// one or more `NxS` attack groups (e.g. dragon "1x8/1x8/3x10"). Depth-based
// spawning follows the `lvl_mons` order via randmonster() in monsters.c.

import { Actor, Player } from './entities';
import {
  RED,
  DARK_RED,
  GREEN,
  DARK_GREEN,
  YELLOW,
  CYAN,
  MAGENTA,
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
import { swing, rollDice, parseDamage } from './combat';
import type { Dungeon } from './dungeon';
import type { GameEngine } from './engine';

// ---------------------------------------------------------------------------
// Monster template
// ---------------------------------------------------------------------------

export interface MonsterTemplate {
  letter: string;
  name: string;
  color: RGB;
  level: number; // s_lvl; HP is rolled as `level`d8
  ac: number; // signed armor class — LOWER is better
  xpValue: number; // base experience award
  carry: number; // % chance to drop treasure on death
  damage: string; // attack groups, e.g. "1x8/1x8/3x10"
  speed: number; // actions per turn (flyers act twice)
  flags: string; // space-separated behaviour flags
}

function mt(
  letter: string,
  name: string,
  color: RGB,
  level: number,
  ac: number,
  xpValue: number,
  carry: number,
  damage: string,
  speed = 1,
  flags = '',
): MonsterTemplate {
  return { letter, name, color, level, ac, xpValue, carry, damage, speed, flags };
}

// Authentic stats (extern.c). Behaviour flags map the original special attacks:
// rust_armor (aquator), hold (flytrap), freeze (ice monster/yeti), steal_gold
// (leprechaun), steal_item (nymph), poison/str-drain (rattlesnake), confuse
// (medusa), drain_level (wraith), drain_maxhp (vampire), invisible (phantom),
// regenerate (troll/griffin/vampire), random_move (bat). Dragon's fire is the
// "3x10" group in its damage string.
export const MONSTER_TEMPLATES: MonsterTemplate[] = [
  mt('A', 'aquator', CYAN, 5, 2, 20, 0, '0x0/0x0', 1, 'rust_armor'),
  mt('B', 'bat', DARK_GRAY, 1, 3, 1, 0, '1x2', 2, 'random_move'),
  mt('C', 'centaur', BROWN, 4, 4, 17, 15, '1x2/1x5/1x5'),
  mt('D', 'dragon', RED, 10, -1, 5000, 100, '1x8/1x8/3x10'),
  mt('E', 'emu', BROWN, 1, 7, 2, 0, '1x2'),
  mt('F', 'venus flytrap', DARK_GREEN, 8, 3, 80, 0, '0x0', 1, 'hold'),
  mt('G', 'griffin', YELLOW, 13, 2, 2000, 20, '4x3/3x5', 1, 'regenerate'),
  mt('H', 'hobgoblin', BROWN, 1, 5, 3, 0, '1x8'),
  mt('I', 'ice monster', CYAN, 1, 9, 5, 0, '0x0', 1, 'freeze'),
  mt('J', 'jabberwock', MAGENTA, 15, 6, 3000, 70, '2x12/2x4'),
  mt('K', 'kestrel', LIGHT_GRAY, 1, 7, 1, 0, '1x4', 2),
  mt('L', 'leprechaun', GREEN, 3, 8, 10, 0, '1x1', 1, 'steal_gold'),
  mt('M', 'medusa', PURPLE, 8, 2, 200, 40, '3x4/3x4/2x5', 1, 'confuse'),
  mt('N', 'nymph', CYAN, 3, 9, 37, 100, '0x0', 1, 'steal_item'),
  mt('O', 'orc', GREEN, 1, 6, 5, 15, '1x8'),
  mt('P', 'phantom', GRAY, 8, 3, 120, 0, '4x4', 1, 'invisible'),
  mt('Q', 'quagga', BROWN, 3, 3, 15, 0, '1x5/1x5'),
  mt('R', 'rattlesnake', DARK_GREEN, 2, 3, 9, 0, '1x6', 1, 'poison'),
  mt('S', 'snake', GREEN, 1, 5, 2, 0, '1x3'),
  mt('T', 'troll', DARK_GREEN, 6, 4, 120, 50, '1x8/1x8/2x6', 1, 'regenerate'),
  mt('U', 'black unicorn', DARK_RED, 7, -2, 190, 0, '1x9/1x9/2x9'),
  mt('V', 'vampire', RED, 8, 1, 350, 20, '1x10', 1, 'regenerate drain_maxhp'),
  mt('W', 'wraith', GRAY, 5, 4, 55, 0, '1x6', 1, 'drain_level'),
  mt('X', 'xeroc', YELLOW, 7, 7, 100, 30, '4x4', 1, 'disguise'),
  mt('Y', 'yeti', WHITE, 4, 6, 50, 30, '1x6/1x6', 1, 'freeze'),
  mt('Z', 'zombie', DARK_GREEN, 2, 8, 6, 0, '1x8'),
];

// Native monster per dungeon depth 1..26 (monsters.c `lvl_mons`).
const LVL_MONS = 'KEBSHIROZLCQANYFTWPXUMVGJD';

const TEMPLATE_BY_LETTER = new Map(MONSTER_TEMPLATES.map((t) => [t.letter, t]));

// ---------------------------------------------------------------------------
// Monster instance
// ---------------------------------------------------------------------------

export class Monster extends Actor {
  template: MonsterTemplate;
  flags: Set<string>;
  speed: number;
  speedCounter = 0;
  damageGroups: [number, number][];

  aware = false;
  aggravated = false;
  scared = 0;
  invisible: boolean;

  constructor(x: number, y: number, template: MonsterTemplate) {
    const hp = Math.max(1, rollDice(template.level, 8));
    // attackDice is unused for monsters now (damageGroups drive combat) but the
    // Actor base still wants a pair; pass a harmless default.
    super(x, y, template.letter, template.color, template.name, hp, [1, 4], template.ac, template.xpValue);
    this.template = template;
    this.damageGroups = parseDamage(template.damage);
    this.flags = new Set(template.flags ? template.flags.split(' ') : []);
    this.speed = template.speed;
    this.invisible = this.flags.has('invisible');
  }

  /** Combat level for swing(). */
  get level(): number {
    return this.template.level;
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
    // Damage groups of all-zero sides ("0x0") mean the monster has no normal
    // melee — its turn is a pure special attack (rust, freeze, steal, hold).
    const meleeGroups = this.damageGroups.filter(([, sides]) => sides > 0);
    if (meleeGroups.length === 0) return this.specialAttack(engine, player);

    // Each attack group is an independent to-hit + damage roll (claw/claw/bite).
    let total = 0;
    let landed = 0;
    for (const [n, sides] of meleeGroups) {
      if (!swing(this.level, player.effectiveAc, 0)) continue;
      total += rollDice(n, sides);
      landed += 1;
    }
    if (landed === 0) return null; // all swings missed — no spam

    player.takeDamage(total);
    let msg = `The ${this.name} hits you for ${total} damage!`;

    if (this.flags.has('poison') && rng.random() < 0.5) {
      if (player.reduceStr(1)) msg += '  You feel weak!';
    }
    if (this.flags.has('confuse') && rng.random() < 0.5) {
      player.confused = CONFUSED_TURNS;
      msg += '  You feel confused!';
    }
    if (this.flags.has('drain_level') && rng.random() < 0.3 && player.expLevel > 1) {
      player.expLevel -= 1;
      const hpLoss = rng.randint(3, 10);
      player.maxHp = Math.max(1, player.maxHp - hpLoss);
      player.hp = Math.min(player.hp, player.maxHp);
      msg += `  Your life-force is drained!  You are now level ${player.expLevel}.`;
    }
    if (this.flags.has('drain_maxhp') && rng.random() < 0.3) {
      const hpLoss = rng.randint(1, 5);
      player.maxHp = Math.max(1, player.maxHp - hpLoss);
      player.hp = Math.min(player.hp, player.maxHp);
      msg += '  You feel your life draining away!';
    }
    if (this.flags.has('freeze') && rng.random() < 0.4) {
      player.frozen = FROZEN_TURNS;
      msg += '  You are frozen!';
    }
    return msg;
  }

  private specialAttack(engine: GameEngine, player: Player): string | null {
    if (this.flags.has('rust_armor')) {
      if (player.armor) {
        const armor = player.armor as unknown as { enchant: number; protected?: boolean };
        if (armor.protected || player.hasRing('maintain_armor')) {
          return `The ${this.name}'s touch fails to corrode your ${player.armor.name}.`;
        }
        player.armor.acBonus = Math.max(0, player.armor.acBonus - 1);
        armor.enchant -= 1;
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
    if (this.flags.has('freeze')) {
      player.frozen = FROZEN_TURNS;
      return `The ${this.name} freezes you!`;
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
// Factory — randmonster() from monsters.c
// ---------------------------------------------------------------------------

/** Pick the depth-appropriate monster letter (monsters.c randmonster). */
export function randMonsterLetter(level: number): string {
  let d = level + (rng.randrange(10) - 5); // level-5 .. level+4
  if (d < 1) d = rng.randint(1, 5);
  if (d > 26) d = rng.randint(22, 26);
  return LVL_MONS[d - 1];
}

export function spawnMonster(x: number, y: number, dungeonLevel: number): Monster {
  const letter = randMonsterLetter(dungeonLevel);
  const template = TEMPLATE_BY_LETTER.get(letter) ?? MONSTER_TEMPLATES[0];
  return new Monster(x, y, template);
}
