// Item definitions and effect handlers.
// Ported from rogue/game/items.py.

import {
  WEAPON_COLOR,
  ARMOR_COLOR,
  POTION_COLOR,
  SCROLL_COLOR,
  FOOD_COLOR,
  RING_COLOR,
  WAND_COLOR,
  GOLD_COLOR,
  AMULET_COLOR,
  CONFUSED_TURNS,
  BLIND_TURNS,
  HASTED_TURNS,
  HALLUC_TURNS,
  PLAYER_EXP_TABLE,
  STR_MAX,
  RGB,
} from './constants';
import { rng } from './rng';
import type { GameEngine } from './engine';

// ---------------------------------------------------------------------------
// Base Item
// ---------------------------------------------------------------------------

export class Item {
  static kind = 'item';
  kind = 'item';

  x: number;
  y: number;
  char: string;
  color: RGB;
  name: string;
  weight: number;
  value: number;
  identified = true; // overridden for potions/scrolls
  cursed = false;

  // Placeholders so item classes don't need to define unused attrs
  acBonus = 0;
  damageDice: [number, number] = [1, 4];
  damageBonus = 0;

  constructor(x: number, y: number, char: string, color: RGB, name: string, weight = 1, value = 0) {
    this.x = x;
    this.y = y;
    this.char = char;
    this.color = color;
    this.name = name;
    this.weight = weight;
    this.value = value;
  }

  get pos(): [number, number] {
    return [this.x, this.y];
  }

  displayName(): string {
    return this.name;
  }

  use(_engine: GameEngine): string {
    return 'Nothing happens.';
  }
}

// ---------------------------------------------------------------------------
// Gold
// ---------------------------------------------------------------------------

export class Gold extends Item {
  kind = 'gold';
  amount: number;

  constructor(x: number, y: number, amount: number) {
    super(x, y, '*', GOLD_COLOR, `${amount} gold pieces`, 1, amount);
    this.amount = amount;
  }
}

// ---------------------------------------------------------------------------
// Weapon
// ---------------------------------------------------------------------------

// (name, char, damageDice, damageBonus, value, weight)
const WEAPONS: [string, string, [number, number], number, number, number][] = [
  ['mace', ')', [2, 4], 1, 8, 30],
  ['long sword', ')', [1, 8], 2, 15, 40],
  ['short sword', ')', [1, 6], 0, 6, 30],
  ['dagger', ')', [1, 4], 0, 2, 10],
  ['two-handed sword', ')', [3, 6], 0, 25, 75],
  ['spear', ')', [2, 3], 0, 5, 25],
  ['morning star', ')', [2, 5], 1, 12, 35],
  ['war hammer', ')', [2, 4], 1, 10, 35],
  ['flail', ')', [2, 4], 0, 8, 30],
];

export class Weapon extends Item {
  kind = 'weapon';
  enchant: number;

  constructor(x: number, y: number, templateIdx?: number, enchant = 0, cursed = false) {
    const idx = templateIdx ?? rng.randrange(WEAPONS.length);
    const [nm, ch, dd, db, val, wt] = WEAPONS[idx];
    super(x, y, ch, WEAPON_COLOR, nm, wt, val);
    this.damageDice = dd;
    this.damageBonus = db + enchant;
    this.enchant = enchant;
    this.cursed = cursed;
  }

  displayName(): string {
    const sign = this.enchant >= 0 ? '+' : '';
    let base = `${this.name} (${sign}${this.enchant})`;
    if (this.cursed) base += ' {cursed}';
    return base;
  }

  use(engine: GameEngine): string {
    const player = engine.player;
    if (player.weapon === this) {
      player.weapon = null;
      return `You put away the ${this.name}.`;
    }
    if (player.weapon && player.weapon.cursed) return `The ${player.weapon.name} is stuck to your hand!`;
    player.weapon = this;
    return `You are now wielding the ${this.name}.`;
  }
}

// ---------------------------------------------------------------------------
// Armor
// ---------------------------------------------------------------------------

// (name, char, acBonus, value, weight)
const ARMORS: [string, string, number, number, number][] = [
  ['leather armor', '[', 2, 5, 20],
  ['ring mail', '[', 3, 8, 25],
  ['studded leather', '[', 3, 8, 25],
  ['scale mail', '[', 4, 11, 30],
  ['chain mail', '[', 5, 20, 40],
  ['splint mail', '[', 6, 40, 45],
  ['banded mail', '[', 6, 40, 45],
  ['plate mail', '[', 7, 75, 50],
];

export class Armor extends Item {
  kind = 'armor';
  enchant: number;

  constructor(x: number, y: number, templateIdx?: number, enchant = 0, cursed = false) {
    const idx = templateIdx ?? rng.randrange(ARMORS.length);
    const [nm, ch, ac, val, wt] = ARMORS[idx];
    super(x, y, ch, ARMOR_COLOR, nm, wt, val);
    this.acBonus = ac + enchant;
    this.enchant = enchant;
    this.cursed = cursed;
  }

  displayName(): string {
    const sign = this.enchant >= 0 ? '+' : '';
    let base = `${this.name} [${sign}${this.enchant}]`;
    if (this.cursed) base += ' {cursed}';
    return base;
  }

  use(engine: GameEngine): string {
    const player = engine.player;
    if (player.armor === this) {
      if (this.cursed) return `The ${this.name} is stuck to your body!`;
      player.armor = null;
      player.recalcAc();
      return `You take off the ${this.name}.`;
    }
    if (player.armor && player.armor.cursed) return `The ${player.armor.name} is stuck to your body!`;
    player.armor = this;
    player.recalcAc();
    return `You are now wearing the ${this.name}.`;
  }
}

// ---------------------------------------------------------------------------
// Potion  (unknown name until identified)
// ---------------------------------------------------------------------------

const POTION_EFFECTS: [string, string][] = [
  ['heal', 'healing'],
  ['extra_heal', 'extra healing'],
  ['poison', 'poison'],
  ['blindness', 'blindness'],
  ['confusion', 'confusion'],
  ['gain_str', 'gain strength'],
  ['restore_str', 'restore strength'],
  ['see_invisible', 'see invisible'],
  ['raise_level', 'raise level'],
  ['haste_self', 'haste self'],
  ['monster_det', 'monster detection'],
  ['hallucination', 'hallucination'],
];

const POTION_COLORS = [
  'bubbly', 'smoky', 'murky', 'swirling', 'effervescent', 'fizzing', 'luminescent', 'viscous', 'oily',
  'clear', 'yellow', 'red', 'blue', 'green', 'purple', 'orange', 'white', 'black', 'cyan', 'magenta',
];

export class PotionRegistry {
  private effectToColor: Record<string, string> = {};
  private identifiedMap: Record<string, boolean> = {};

  constructor() {
    const colours = [...POTION_COLORS];
    rng.shuffle(colours);
    POTION_EFFECTS.forEach(([keyName], i) => {
      this.effectToColor[keyName] = colours[i % colours.length];
      this.identifiedMap[keyName] = false;
    });
  }

  colourFor(key: string): string {
    return this.effectToColor[key] ?? 'strange';
  }

  identify(key: string): void {
    this.identifiedMap[key] = true;
  }

  isIdentified(key: string): boolean {
    return this.identifiedMap[key] ?? false;
  }

  trueName(key: string): string {
    for (const [k, nm] of POTION_EFFECTS) if (k === key) return `potion of ${nm}`;
    return 'unknown potion';
  }
}

export class Potion extends Item {
  kind = 'potion';
  effectKey: string;
  registry: PotionRegistry;

  constructor(x: number, y: number, effectKey: string, registry: PotionRegistry) {
    super(x, y, '!', POTION_COLOR, '', 1, 5);
    this.effectKey = effectKey;
    this.registry = registry;
    this.identified = registry.isIdentified(effectKey);
  }

  displayName(): string {
    if (this.registry.isIdentified(this.effectKey)) return this.registry.trueName(this.effectKey);
    return `a ${this.registry.colourFor(this.effectKey)} potion`;
  }

  use(engine: GameEngine): string {
    const player = engine.player;
    const key = this.effectKey;
    this.registry.identify(key);

    if (key === 'heal') {
      const gained = player.heal(rng.randint(1, 8) + player.expLevel);
      return `You feel better!  (healed ${gained} HP)`;
    }
    if (key === 'extra_heal') {
      player.maxHp = Math.min(player.maxHp + 1, 999);
      const gained = player.heal(rng.randint(3, 20));
      return `You feel much better!  (healed ${gained} HP)`;
    }
    if (key === 'poison') {
      player.strCur = Math.max(1, player.strCur - rng.randint(1, 3));
      return 'You feel very sick!';
    }
    if (key === 'blindness') {
      player.blinded = BLIND_TURNS;
      return 'A cloud of darkness surrounds you.';
    }
    if (key === 'confusion') {
      player.confused = CONFUSED_TURNS;
      return 'You feel confused.';
    }
    if (key === 'gain_str') {
      player.strCur = Math.min(player.strCur + 1, STR_MAX);
      player.strBase = Math.min(player.strBase + 1, STR_MAX);
      return 'You feel stronger!';
    }
    if (key === 'restore_str') {
      player.strCur = player.strBase;
      return 'You feel your strength return.';
    }
    if (key === 'see_invisible') {
      player.seeInvisible = 850;
      return 'You can now see invisible creatures.';
    }
    if (key === 'raise_level') {
      const msg = player.gainExp(PLAYER_EXP_TABLE[Math.min(player.expLevel, PLAYER_EXP_TABLE.length - 1)]);
      return msg || 'Your experience increases.';
    }
    if (key === 'haste_self') {
      player.hasted = HASTED_TURNS;
      return 'You feel yourself moving faster.';
    }
    if (key === 'monster_det') {
      engine.monsterDetectionTurns = 25;
      return 'You sense the presence of monsters.';
    }
    if (key === 'hallucination') {
      player.hallucinating = HALLUC_TURNS;
      return 'Oh wow, everything looks so different!';
    }
    return 'Nothing happens.';
  }
}

// ---------------------------------------------------------------------------
// Scroll  (unknown label until identified)
// ---------------------------------------------------------------------------

const SCROLL_EFFECTS: [string, string][] = [
  ['identify', 'identify'],
  ['magic_map', 'magic mapping'],
  ['hold_monster', 'hold monster'],
  ['sleep', 'sleep'],
  ['teleport', 'teleportation'],
  ['ench_weapon', 'enchant weapon'],
  ['ench_armor', 'enchant armor'],
  ['scare_monster', 'scare monster'],
  ['remove_curse', 'remove curse'],
  ['create_monster', 'create monster'],
  ['aggravate', 'aggravate monster'],
];

const SCROLL_SYLLABLES = [
  'ZELGO', 'MER', 'JUYED', 'AWK', 'YACC', 'BOULC', 'GRINGEL', 'FLASE', 'ACREWE', 'BRODI', 'HEP', 'TRI',
  'MON', 'KLOP', 'SEN', 'SAT', 'KLIS', 'VE', 'WUN', 'TURS', 'WAN', 'LEP', 'REB',
];

export class ScrollRegistry {
  private effectToLabel: Record<string, string> = {};
  private identifiedMap: Record<string, boolean> = {};

  constructor() {
    const labels: string[] = [];
    const syllables = [...SCROLL_SYLLABLES];
    rng.shuffle(syllables);
    for (let i = 0; i < SCROLL_EFFECTS.length; i++) {
      const n = rng.randint(2, 4);
      const parts: string[] = [];
      for (let j = 0; j < n; j++) parts.push(syllables[(i * 3 + j) % syllables.length]);
      labels.push(parts.join(' '));
    }
    SCROLL_EFFECTS.forEach(([keyName], i) => {
      this.effectToLabel[keyName] = labels[i];
      this.identifiedMap[keyName] = false;
    });
  }

  labelFor(key: string): string {
    return this.effectToLabel[key] ?? '???';
  }

  identify(key: string): void {
    this.identifiedMap[key] = true;
  }

  isIdentified(key: string): boolean {
    return this.identifiedMap[key] ?? false;
  }

  trueName(key: string): string {
    for (const [k, nm] of SCROLL_EFFECTS) if (k === key) return `scroll of ${nm}`;
    return 'unknown scroll';
  }
}

export class Scroll extends Item {
  kind = 'scroll';
  effectKey: string;
  registry: ScrollRegistry;

  constructor(x: number, y: number, effectKey: string, registry: ScrollRegistry) {
    super(x, y, '?', SCROLL_COLOR, '', 1, 5);
    this.effectKey = effectKey;
    this.registry = registry;
  }

  displayName(): string {
    if (this.registry.isIdentified(this.effectKey)) return this.registry.trueName(this.effectKey);
    return `a scroll labeled "${this.registry.labelFor(this.effectKey)}"`;
  }

  use(engine: GameEngine): string {
    const player = engine.player;
    const key = this.effectKey;
    this.registry.identify(key);

    if (key === 'identify') return '__identify__';
    if (key === 'magic_map') {
      engine.revealMap();
      return 'You see a vision of the dungeon around you.';
    }
    if (key === 'hold_monster') {
      for (const m of engine.monsters) m.frozen = 15;
      return 'The monsters around you are frozen!';
    }
    if (key === 'sleep') {
      for (const m of engine.monsters) m.sleeping = rng.randint(5, 15);
      return 'The monsters fall asleep.';
    }
    if (key === 'teleport') {
      engine.teleportPlayer();
      return 'You feel dizzy and...';
    }
    if (key === 'ench_weapon') {
      if (player.weapon) {
        (player.weapon as Weapon).enchant += 1;
        player.weapon.damageBonus += 1;
        return `Your ${player.weapon.name} glows blue.`;
      }
      return 'You have no weapon to enchant.';
    }
    if (key === 'ench_armor') {
      if (player.armor) {
        (player.armor as Armor).enchant += 1;
        player.armor.acBonus += 1;
        player.recalcAc();
        return `Your ${player.armor.name} glows blue.`;
      }
      return 'You have no armor to enchant.';
    }
    if (key === 'scare_monster') {
      for (const m of engine.monsters) m.scared = (m.scared || 0) + 20;
      return 'The monsters flee!';
    }
    if (key === 'remove_curse') {
      for (const item of player.inventory) item.cursed = false;
      return 'All your items are uncursed.';
    }
    if (key === 'create_monster') {
      engine.spawnMonsterNear(player.x, player.y);
      return 'You hear a strange noise...';
    }
    if (key === 'aggravate') {
      for (const m of engine.monsters) m.aggravated = true;
      return 'You hear the monsters getting angry!';
    }
    return 'Nothing happens.';
  }
}

// ---------------------------------------------------------------------------
// Food
// ---------------------------------------------------------------------------

// (name, char, nutrition, value)
const FOOD_TYPES: [string, string, number, number][] = [
  ['food ration', '%', 800, 4],
  ['slime mold', '%', 400, 2],
  ['strawberry', '%', 200, 1],
  ['cookie', '%', 300, 1],
];

export class Food extends Item {
  kind = 'food';
  nutrition: number;

  constructor(x: number, y: number, kindIdx?: number) {
    const idx = kindIdx ?? (rng.random() < 0.7 ? 0 : rng.randrange(FOOD_TYPES.length));
    const [nm, ch, nutrition, val] = FOOD_TYPES[idx];
    super(x, y, ch, FOOD_COLOR, nm, 2, val);
    this.nutrition = nutrition;
  }

  use(engine: GameEngine): string {
    engine.player.eat(this.nutrition);
    engine.player.removeItem(this);
    if (this.nutrition >= 700) return `You eat the ${this.name}.  Yum!`;
    return `You eat the ${this.name}.`;
  }
}

// ---------------------------------------------------------------------------
// Ring
// ---------------------------------------------------------------------------

const RING_EFFECTS: [string, string, number][] = [
  ['protection', 'protection', 0],
  ['add_str', 'add strength', 0],
  ['sustain_str', 'sustain strength', 0],
  ['searching', 'searching', 0],
  ['see_invisible', 'see invisible', 0],
  ['regeneration', 'regeneration', 0],
  ['aggravate', 'aggravate monster', 0],
  ['teleport', 'teleportation', 0],
];

export class Ring extends Item {
  kind = 'ring';
  effectKey: string;

  constructor(x: number, y: number, effectIdx?: number) {
    const idx = effectIdx ?? rng.randrange(RING_EFFECTS.length);
    const [key, nm, val] = RING_EFFECTS[idx];
    super(x, y, '=', RING_COLOR, `ring of ${nm}`, 1, val);
    this.effectKey = key;
  }

  use(_engine: GameEngine): string {
    return `You slip on the ${this.name}.`;
  }
}

// ---------------------------------------------------------------------------
// Wand / Staff
// ---------------------------------------------------------------------------

const WAND_EFFECTS: [string, string, number][] = [
  ['magic_missile', 'magic missile', 10],
  ['slow_monster', 'slow monster', 10],
  ['sleep_monster', 'sleep monster', 10],
  ['teleport_to', 'teleport to', 5],
  ['confusion', 'confusion', 10],
  ['invisibility', 'invisibility', 8],
  ['cancellation', 'cancellation', 8],
  ['lightning', 'lightning', 3],
  ['fire', 'fire', 3],
  ['cold', 'cold', 3],
  ['drain_life', 'drain life', 10],
  ['polymorph', 'polymorph', 8],
];

export class Wand extends Item {
  kind = 'wand';
  effectKey: string;
  charges: number;

  constructor(x: number, y: number, effectIdx?: number) {
    const idx = effectIdx ?? rng.randrange(WAND_EFFECTS.length);
    const [key, nm, charges] = WAND_EFFECTS[idx];
    super(x, y, '/', WAND_COLOR, `wand of ${nm}`, 5, 10);
    this.effectKey = key;
    this.charges = rng.randint(3, charges);
  }

  displayName(): string {
    return `${this.name} (${this.charges} charges)`;
  }

  use(engine: GameEngine): string {
    if (this.charges <= 0) return 'The wand is empty.';
    this.charges -= 1;
    return engine.zapWand(this);
  }
}

// ---------------------------------------------------------------------------
// Amulet of Yendor
// ---------------------------------------------------------------------------

export class Amulet extends Item {
  kind = 'amulet';

  constructor(x: number, y: number) {
    super(x, y, ',', AMULET_COLOR, 'Amulet of Yendor', 2, 0);
  }

  use(engine: GameEngine): string {
    engine.player.hasAmulet = true;
    return 'You pick up the Amulet of Yendor!  Now escape!';
  }
}

// ---------------------------------------------------------------------------
// Item factory
// ---------------------------------------------------------------------------

export function randomItem(
  x: number,
  y: number,
  dungeonLevel: number,
  potionReg: PotionRegistry,
  scrollReg: ScrollRegistry,
): Item {
  const categories = ['gold', 'food', 'weapon', 'armor', 'potion', 'scroll', 'ring', 'wand'];
  const catWeights = [20, 15, 15, 15, 15, 12, 4, 4];
  const category = rng.choices(categories, catWeights, 1)[0];

  if (category === 'gold') {
    const amount = rng.randint(1, 50 + dungeonLevel * 10);
    return new Gold(x, y, amount);
  }
  if (category === 'food') return new Food(x, y);

  if (category === 'weapon') {
    const maxIdx = Math.min(WEAPONS.length - 1, Math.floor(dungeonLevel / 3) + 3);
    const idx = rng.randint(0, maxIdx);
    let enchant = 0;
    let cursed = false;
    if (rng.random() < 0.15) {
      if (rng.random() < 0.5) enchant = rng.randint(1, 3);
      else {
        enchant = -rng.randint(1, 3);
        cursed = true;
      }
    }
    return new Weapon(x, y, idx, enchant, cursed);
  }

  if (category === 'armor') {
    const maxIdx = Math.min(ARMORS.length - 1, Math.floor(dungeonLevel / 3) + 2);
    const idx = rng.randint(0, maxIdx);
    let enchant = 0;
    let cursed = false;
    if (rng.random() < 0.15) {
      if (rng.random() < 0.5) enchant = rng.randint(1, 3);
      else {
        enchant = -rng.randint(1, 3);
        cursed = true;
      }
    }
    return new Armor(x, y, idx, enchant, cursed);
  }

  if (category === 'potion') {
    const key = rng.choice(POTION_EFFECTS.map((e) => e[0]));
    return new Potion(x, y, key, potionReg);
  }

  if (category === 'scroll') {
    const key = rng.choice(SCROLL_EFFECTS.map((e) => e[0]));
    return new Scroll(x, y, key, scrollReg);
  }

  if (category === 'ring') return new Ring(x, y);
  if (category === 'wand') return new Wand(x, y);

  return new Gold(x, y, 10);
}
