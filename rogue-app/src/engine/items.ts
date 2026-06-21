// Item definitions and effect handlers.
//
// Data tables (names, spawn probabilities, worths) follow the original Rogue
// 5.4.4 tables in extern.c; item generation is weighted by those probabilities
// rather than uniform. Rings are worn and apply ongoing effects (see Player).

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
// Weighted selection helpers (extern.c pick_one / pick_index)
// ---------------------------------------------------------------------------

function pickByProb<T extends { prob: number }>(list: readonly T[]): T {
  const total = list.reduce((s, e) => s + e.prob, 0);
  let r = rng.random() * total;
  for (const e of list) {
    if (r < e.prob) return e;
    r -= e.prob;
  }
  return list[list.length - 1];
}

function pickIndexByProb(probs: readonly number[]): number {
  const total = probs.reduce((s, p) => s + p, 0);
  let r = rng.random() * total;
  for (let i = 0; i < probs.length; i++) {
    if (r < probs[i]) return i;
    r -= probs[i];
  }
  return probs.length - 1;
}

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
  identified = true; // overridden for potions/scrolls/rings
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
// Weapon  (original nine; damage is the wielded dice, no inherent plus)
// ---------------------------------------------------------------------------

interface WeaponDef {
  name: string;
  dice: [number, number];
  prob: number;
  value: number;
}

const WEAPONS: WeaponDef[] = [
  { name: 'mace', dice: [2, 4], prob: 11, value: 8 },
  { name: 'long sword', dice: [3, 4], prob: 11, value: 15 },
  { name: 'short bow', dice: [1, 1], prob: 12, value: 15 },
  { name: 'arrow', dice: [1, 1], prob: 12, value: 1 },
  { name: 'dagger', dice: [1, 6], prob: 8, value: 3 },
  { name: 'two-handed sword', dice: [4, 4], prob: 10, value: 75 },
  { name: 'dart', dice: [1, 1], prob: 12, value: 2 },
  { name: 'shuriken', dice: [1, 2], prob: 12, value: 5 },
  { name: 'spear', dice: [2, 3], prob: 12, value: 5 },
];

export class Weapon extends Item {
  kind = 'weapon';
  enchant: number;

  constructor(x: number, y: number, templateIdx?: number, enchant = 0, cursed = false) {
    const idx = templateIdx ?? WEAPONS.indexOf(pickByProb(WEAPONS));
    const def = WEAPONS[idx];
    super(x, y, ')', WEAPON_COLOR, def.name, 1, def.value);
    this.damageDice = def.dice;
    this.damageBonus = enchant; // original weapons have no base bonus
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
// Armor  (names + AC match the original; acBonus = 10 - originalAC)
// ---------------------------------------------------------------------------

interface ArmorDef {
  name: string;
  ac: number; // acBonus
  prob: number;
  value: number;
}

const ARMORS: ArmorDef[] = [
  { name: 'leather armor', ac: 2, prob: 20, value: 20 },
  { name: 'ring mail', ac: 3, prob: 15, value: 25 },
  { name: 'studded leather', ac: 3, prob: 15, value: 20 },
  { name: 'scale mail', ac: 4, prob: 13, value: 30 },
  { name: 'chain mail', ac: 5, prob: 12, value: 75 },
  { name: 'splint mail', ac: 6, prob: 10, value: 80 },
  { name: 'banded mail', ac: 6, prob: 10, value: 90 },
  { name: 'plate mail', ac: 7, prob: 5, value: 150 },
];

export class Armor extends Item {
  kind = 'armor';
  enchant: number;
  protected = false; // scroll of protect armor / ring of maintain armor

  constructor(x: number, y: number, templateIdx?: number, enchant = 0, cursed = false) {
    const idx = templateIdx ?? ARMORS.indexOf(pickByProb(ARMORS));
    const def = ARMORS[idx];
    super(x, y, '[', ARMOR_COLOR, def.name, 1, def.value);
    this.acBonus = def.ac + enchant;
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

interface EffectDef {
  key: string;
  name: string;
  prob: number;
}

const POTION_EFFECTS: EffectDef[] = [
  { key: 'confusion', name: 'confusion', prob: 7 },
  { key: 'hallucination', name: 'hallucination', prob: 8 },
  { key: 'poison', name: 'poison', prob: 8 },
  { key: 'gain_str', name: 'gain strength', prob: 13 },
  { key: 'see_invisible', name: 'see invisible', prob: 3 },
  { key: 'heal', name: 'healing', prob: 13 },
  { key: 'monster_det', name: 'monster detection', prob: 6 },
  { key: 'magic_det', name: 'magic detection', prob: 6 },
  { key: 'raise_level', name: 'raise level', prob: 2 },
  { key: 'extra_heal', name: 'extra healing', prob: 5 },
  { key: 'haste_self', name: 'haste self', prob: 5 },
  { key: 'restore_str', name: 'restore strength', prob: 13 },
  { key: 'blindness', name: 'blindness', prob: 5 },
  { key: 'levitation', name: 'levitation', prob: 6 },
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
    POTION_EFFECTS.forEach(({ key }, i) => {
      this.effectToColor[key] = colours[i % colours.length];
      this.identifiedMap[key] = false;
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
    const e = POTION_EFFECTS.find((p) => p.key === key);
    return e ? `potion of ${e.name}` : 'unknown potion';
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
      if (player.reduceStr(rng.randint(1, 3))) return 'You feel very sick!';
      return 'You feel momentarily sick.';
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
    if (key === 'magic_det') {
      const n = engine.detectItems((it) => !(it instanceof Gold));
      return n > 0 ? 'You sense the presence of magic.' : 'You sense no magic.';
    }
    if (key === 'hallucination') {
      player.hallucinating = HALLUC_TURNS;
      return 'Oh wow, everything looks so different!';
    }
    if (key === 'levitation') {
      player.levitating = 30;
      return 'You start to float in the air.';
    }
    return 'Nothing happens.';
  }
}

// ---------------------------------------------------------------------------
// Scroll  (unknown label until identified)
// ---------------------------------------------------------------------------

const SCROLL_EFFECTS: EffectDef[] = [
  { key: 'identify', name: 'identify', prob: 43 }, // five identify variants merged
  { key: 'magic_map', name: 'magic mapping', prob: 4 },
  { key: 'hold_monster', name: 'hold monster', prob: 2 },
  { key: 'sleep', name: 'sleep', prob: 3 },
  { key: 'ench_armor', name: 'enchant armor', prob: 7 },
  { key: 'scare_monster', name: 'scare monster', prob: 3 },
  { key: 'food_detect', name: 'food detection', prob: 2 },
  { key: 'teleport', name: 'teleportation', prob: 5 },
  { key: 'ench_weapon', name: 'enchant weapon', prob: 8 },
  { key: 'create_monster', name: 'create monster', prob: 4 },
  { key: 'remove_curse', name: 'remove curse', prob: 7 },
  { key: 'aggravate', name: 'aggravate monster', prob: 3 },
  { key: 'protect_armor', name: 'protect armor', prob: 2 },
  { key: 'monster_conf', name: 'monster confusion', prob: 7 },
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
    SCROLL_EFFECTS.forEach(({ key }, i) => {
      this.effectToLabel[key] = labels[i];
      this.identifiedMap[key] = false;
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
    const e = SCROLL_EFFECTS.find((s) => s.key === key);
    return e ? `scroll of ${e.name}` : 'unknown scroll';
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
    if (key === 'monster_conf') {
      player.confusingTouch = true;
      return 'Your hands begin to glow red.';
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
    if (key === 'protect_armor') {
      if (player.armor) {
        (player.armor as Armor).protected = true;
        return `Your ${player.armor.name} is covered by a shimmering gold shield.`;
      }
      return 'You have no armor to protect.';
    }
    if (key === 'scare_monster') {
      for (const m of engine.monsters) m.scared = (m.scared || 0) + 20;
      return 'The monsters flee!';
    }
    if (key === 'food_detect') {
      const n = engine.detectItems((it) => it instanceof Food);
      return n > 0 ? 'Your nose tingles with the smell of food.' : 'You smell no food.';
    }
    if (key === 'remove_curse') {
      for (const item of player.inventory) item.cursed = false;
      return 'You feel as if somebody is watching over you.';
    }
    if (key === 'create_monster') {
      engine.spawnMonsterNear(player.x, player.y);
      return 'You hear a faint cry of anguish in the distance.';
    }
    if (key === 'aggravate') {
      for (const m of engine.monsters) m.aggravated = true;
      return 'You hear a high-pitched humming noise.';
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
// Ring  (worn; ongoing effects handled by Player)
// ---------------------------------------------------------------------------

interface RingDef {
  key: string;
  name: string;
  prob: number;
  value: number;
  magnitude: boolean; // has a [+n] bonus
}

const RING_EFFECTS: RingDef[] = [
  { key: 'protection', name: 'protection', prob: 9, value: 400, magnitude: true },
  { key: 'add_str', name: 'add strength', prob: 9, value: 400, magnitude: true },
  { key: 'sustain_str', name: 'sustain strength', prob: 5, value: 280, magnitude: false },
  { key: 'searching', name: 'searching', prob: 10, value: 420, magnitude: false },
  { key: 'see_invisible', name: 'see invisible', prob: 10, value: 310, magnitude: false },
  { key: 'adornment', name: 'adornment', prob: 1, value: 10, magnitude: false },
  { key: 'aggravate', name: 'aggravate monster', prob: 10, value: 10, magnitude: false },
  { key: 'dexterity', name: 'dexterity', prob: 8, value: 440, magnitude: true },
  { key: 'increase_damage', name: 'increase damage', prob: 8, value: 400, magnitude: true },
  { key: 'regeneration', name: 'regeneration', prob: 4, value: 460, magnitude: false },
  { key: 'slow_digestion', name: 'slow digestion', prob: 9, value: 240, magnitude: false },
  { key: 'teleport', name: 'teleportation', prob: 5, value: 30, magnitude: false },
  { key: 'stealth', name: 'stealth', prob: 7, value: 470, magnitude: false },
  { key: 'maintain_armor', name: 'maintain armor', prob: 5, value: 380, magnitude: false },
];

export class Ring extends Item {
  kind = 'ring';
  effectKey: string;
  bonus: number; // magnitude for protection/add_str/dexterity/increase_damage
  worn = false;

  constructor(x: number, y: number, effectIdx?: number, bonus?: number, cursed = false) {
    const idx = effectIdx ?? RING_EFFECTS.indexOf(pickByProb(RING_EFFECTS));
    const def = RING_EFFECTS[idx];
    super(x, y, '=', RING_COLOR, `ring of ${def.name}`, 1, def.value);
    this.effectKey = def.key;
    if (bonus !== undefined) {
      this.bonus = bonus;
    } else if (def.magnitude) {
      // +1..+3, with a chance of a cursed negative ring.
      this.bonus = rng.random() < 0.25 ? -rng.randint(1, 2) : rng.randint(1, 3);
    } else {
      this.bonus = 0;
    }
    this.cursed = cursed || this.bonus < 0;
    this.identified = false; // bonus hidden until worn
  }

  displayName(): string {
    let nm = this.name;
    if (this.identified) {
      const def = RING_EFFECTS.find((r) => r.key === this.effectKey);
      if (def?.magnitude) nm += ` [${this.bonus >= 0 ? '+' : ''}${this.bonus}]`;
    }
    if (this.worn) nm += ' (on hand)';
    return nm;
  }

  use(engine: GameEngine): string {
    const player = engine.player;
    if (this.worn) {
      if (this.cursed) return `You can't remove the ${this.name} — it appears to be stuck!`;
      this.worn = false;
      player.rings = player.rings.filter((r) => r !== this);
      return `You remove the ${this.name}.`;
    }
    if (player.rings.length >= 2) return 'You already wear two rings.';
    player.rings.push(this);
    this.worn = true;
    this.identified = true;
    if (this.effectKey === 'aggravate') {
      for (const m of engine.monsters) m.aggravated = true;
      return `You put on the ${this.name}.  You hear a faint humming.`;
    }
    return `You are now wearing the ${this.name}.`;
  }
}

// ---------------------------------------------------------------------------
// Wand / Staff
// ---------------------------------------------------------------------------

interface WandDef {
  key: string;
  name: string;
  prob: number;
}

const WAND_EFFECTS: WandDef[] = [
  { key: 'light', name: 'light', prob: 12 },
  { key: 'invisibility', name: 'invisibility', prob: 6 },
  { key: 'lightning', name: 'lightning', prob: 3 },
  { key: 'fire', name: 'fire', prob: 3 },
  { key: 'cold', name: 'cold', prob: 3 },
  { key: 'polymorph', name: 'polymorph', prob: 15 },
  { key: 'magic_missile', name: 'magic missile', prob: 10 },
  { key: 'haste_monster', name: 'haste monster', prob: 10 },
  { key: 'slow_monster', name: 'slow monster', prob: 11 },
  { key: 'drain_life', name: 'drain life', prob: 9 },
  { key: 'nothing', name: 'nothing', prob: 1 },
  { key: 'teleport_away', name: 'teleport away', prob: 6 },
  { key: 'teleport_to', name: 'teleport to', prob: 6 },
  { key: 'cancellation', name: 'cancellation', prob: 5 },
];

export class Wand extends Item {
  kind = 'wand';
  effectKey: string;
  charges: number;

  constructor(x: number, y: number, effectIdx?: number) {
    const idx = effectIdx ?? WAND_EFFECTS.indexOf(pickByProb(WAND_EFFECTS));
    const def = WAND_EFFECTS[idx];
    super(x, y, '/', WAND_COLOR, `wand of ${def.name}`, 5, 10);
    this.effectKey = def.key;
    this.charges = rng.randint(3, 7);
  }

  displayName(): string {
    return `${this.name} (${this.charges} charges)`;
  }

  use(engine: GameEngine): string {
    if (this.charges <= 0) return 'The wand has no charges left.';
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
// Item factory  (object type distribution from extern.c things[])
// ---------------------------------------------------------------------------

const CATEGORY_PROBS = [26, 36, 16, 7, 7, 4, 4]; // potion, scroll, food, weapon, armor, ring, wand
const CATEGORIES = ['potion', 'scroll', 'food', 'weapon', 'armor', 'ring', 'wand'] as const;

function maybeEnchant(): { enchant: number; cursed: boolean } {
  if (rng.random() < 0.15) {
    if (rng.random() < 0.5) return { enchant: rng.randint(1, 3), cursed: false };
    return { enchant: -rng.randint(1, 3), cursed: true };
  }
  return { enchant: 0, cursed: false };
}

export function randomItem(
  x: number,
  y: number,
  dungeonLevel: number,
  potionReg: PotionRegistry,
  scrollReg: ScrollRegistry,
): Item {
  // Gold is placed independently in the original; we fold it in at ~1/3.
  if (rng.random() < 0.34) {
    return new Gold(x, y, rng.randint(2, 50 + dungeonLevel * 10));
  }

  const category = CATEGORIES[pickIndexByProb(CATEGORY_PROBS)];

  if (category === 'food') return new Food(x, y);
  if (category === 'weapon') {
    const { enchant, cursed } = maybeEnchant();
    return new Weapon(x, y, undefined, enchant, cursed);
  }
  if (category === 'armor') {
    const { enchant, cursed } = maybeEnchant();
    return new Armor(x, y, undefined, enchant, cursed);
  }
  if (category === 'potion') return new Potion(x, y, pickByProb(POTION_EFFECTS).key, potionReg);
  if (category === 'scroll') return new Scroll(x, y, pickByProb(SCROLL_EFFECTS).key, scrollReg);
  if (category === 'ring') return new Ring(x, y);
  if (category === 'wand') return new Wand(x, y);

  return new Gold(x, y, 10);
}
