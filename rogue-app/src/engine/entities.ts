// Base entity classes shared by the player, monsters, and items.

import {
  PLAYER_START_HP,
  PLAYER_START_STR,
  PLAYER_START_AC,
  PLAYER_EXP_TABLE,
  HUNGER_FULL,
  MAX_INVENTORY,
  WHITE,
  RGB,
  strPlus,
  addDam,
} from './constants';
import { rng } from './rng';
import type { Item, Ring } from './items';

// ---------------------------------------------------------------------------
// Entity  (anything that occupies a tile)
// ---------------------------------------------------------------------------

export class Entity {
  x: number;
  y: number;
  char: string;
  color: RGB;
  name: string;

  constructor(x: number, y: number, char: string, color: RGB, name: string) {
    this.x = x;
    this.y = y;
    this.char = char;
    this.color = color;
    this.name = name;
  }

  get pos(): [number, number] {
    return [this.x, this.y];
  }

  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }
}

// ---------------------------------------------------------------------------
// Actor  (entity with hit-points and combat stats)
// ---------------------------------------------------------------------------

export class Actor extends Entity {
  maxHp: number;
  hp: number;
  attackDice: [number, number]; // (n, sides)
  defense: number;
  xpValue: number;

  // Status effects (turns remaining, 0 = inactive)
  confused = 0;
  blinded = 0;
  hasted = 0;
  poisoned = 0;
  frozen = 0;
  sleeping = 0;

  constructor(
    x: number,
    y: number,
    char: string,
    color: RGB,
    name: string,
    maxHp: number,
    attackDice: [number, number],
    defense: number,
    xpValue = 0,
  ) {
    super(x, y, char, color, name);
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.attackDice = attackDice;
    this.defense = defense;
    this.xpValue = xpValue;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  takeDamage(amount: number): number {
    amount = Math.max(1, amount);
    this.hp = Math.max(0, this.hp - amount);
    return amount;
  }

  heal(amount: number): number {
    const healed = Math.min(amount, this.maxHp - this.hp);
    this.hp += healed;
    return healed;
  }

  rollAttack(): number {
    const [n, sides] = this.attackDice;
    let total = 0;
    for (let i = 0; i < n; i++) total += rng.randint(1, sides);
    return total;
  }

  tickEffects(): string[] {
    const msgs: string[] = [];
    const specs: [keyof Actor, string][] = [
      ['confused', 'You are no longer confused.'],
      ['blinded', 'Your vision clears.'],
      ['hasted', 'You slow down.'],
      ['poisoned', 'The poison wears off.'],
      ['frozen', 'You can move again.'],
      ['sleeping', ''],
    ];
    for (const [attr, label] of specs) {
      const val = this[attr] as unknown as number;
      if (val > 0) {
        (this[attr] as unknown as number) = val - 1;
        if ((this[attr] as unknown as number) === 0 && label) msgs.push(label);
      }
    }
    return msgs;
  }
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export class Player extends Actor {
  strBase: number;
  strCur: number;
  expLevel: number;
  expPts: number;
  gold: number;
  hunger: number;

  inventory: Item[] = [];
  weapon: Item | null = null;
  armor: Item | null = null;
  rings: Ring[] = []; // worn rings (max 2)

  private armorAc = 0;

  hasAmulet = false;
  hallucinating = 0;
  seeInvisible = 0;
  levitating = 0;
  confusingTouch = false; // scroll of monster confusion — next hit confuses
  private regenCounter = 0;
  private digestion = 0;

  constructor(x: number, y: number) {
    super(x, y, '@', WHITE, 'you', PLAYER_START_HP, [1, 4], PLAYER_START_AC, 0);
    this.strBase = PLAYER_START_STR;
    this.strCur = PLAYER_START_STR;
    this.expLevel = 1;
    this.expPts = 0;
    this.gold = 0;
    this.hunger = HUNGER_FULL;
  }

  // -- Rings -------------------------------------------------------

  hasRing(key: string): boolean {
    return this.rings.some((r) => r.effectKey === key);
  }

  /** Summed magnitude of all worn rings of a kind (protection, add_str, …). */
  ringBonus(key: string): number {
    return this.rings.filter((r) => r.effectKey === key).reduce((s, r) => s + (r.bonus || 0), 0);
  }

  get effectiveStr(): number {
    return this.strCur + this.ringBonus('add_str');
  }

  get canSeeInvisible(): boolean {
    return this.seeInvisible > 0 || this.hasRing('see_invisible');
  }

  /** Lower strength unless a ring of sustain strength prevents it. */
  reduceStr(n: number): boolean {
    if (this.hasRing('sustain_str')) return false;
    this.strCur = Math.max(1, this.strCur - n);
    return true;
  }

  // -- AC ----------------------------------------------------------

  get effectiveAc(): number {
    return PLAYER_START_AC - this.armorAc - this.ringBonus('protection');
  }

  recalcAc(): void {
    this.armorAc = this.armor ? this.armor.acBonus : 0;
  }

  // -- STR modifiers (Rogue 5.4.4 str_plus / add_dam) --------------

  /** To-hit bonus: strength + weapon enchantment + ring of dexterity. */
  get toHitBonus(): number {
    const weaponPlus = this.weapon ? (this.weapon as unknown as { enchant?: number }).enchant ?? 0 : 0;
    return strPlus(this.effectiveStr) + weaponPlus + this.ringBonus('dexterity');
  }

  // -- Attack ------------------------------------------------------

  rollAttack(): number {
    let n: number;
    let sides: number;
    if (this.weapon) [n, sides] = this.weapon.damageDice;
    else [n, sides] = this.attackDice;
    let dmg = 0;
    for (let i = 0; i < n; i++) dmg += rng.randint(1, sides);
    if (this.weapon) dmg += this.weapon.damageBonus;
    dmg += addDam(this.effectiveStr) + this.ringBonus('increase_damage');
    return Math.max(1, dmg);
  }

  // -- Experience --------------------------------------------------

  gainExp(amount: number): string | null {
    this.expPts += amount;
    let msg: string | null = null;
    while (this.expLevel < PLAYER_EXP_TABLE.length - 1 && this.expPts >= PLAYER_EXP_TABLE[this.expLevel]) {
      this.expLevel += 1;
      const hpGain = rng.randint(3, 10);
      this.maxHp += hpGain;
      this.hp += hpGain;
      msg = `Welcome to level ${this.expLevel}!  You feel stronger.`;
    }
    return msg;
  }

  // -- Inventory ---------------------------------------------------

  addItem(item: Item): string | null {
    if (this.inventory.length >= MAX_INVENTORY) return null;
    this.inventory.push(item);
    return String.fromCharCode('a'.charCodeAt(0) + this.inventory.length - 1);
  }

  removeItem(item: Item): void {
    const idx = this.inventory.indexOf(item);
    if (idx !== -1) {
      this.inventory.splice(idx, 1);
      if (this.weapon === item) this.weapon = null;
      if (this.armor === item) {
        this.armor = null;
        this.recalcAc();
      }
      const ri = this.rings.indexOf(item as unknown as Ring);
      if (ri !== -1) this.rings.splice(ri, 1);
    }
  }

  itemSlot(item: Item): string {
    const idx = this.inventory.indexOf(item);
    return String.fromCharCode('a'.charCodeAt(0) + idx);
  }

  // -- Hunger ------------------------------------------------------

  tickHunger(): string | null {
    this.hunger -= 1;
    // Worn rings speed digestion; a ring of slow digestion offsets the cost.
    if (this.rings.length > 0) {
      const cost = this.rings.filter((r) => r.effectKey !== 'slow_digestion' && r.effectKey !== 'adornment').length;
      this.digestion += cost - (this.hasRing('slow_digestion') ? 1 : 0);
      while (this.digestion >= 3) {
        this.hunger -= 1;
        this.digestion -= 3;
      }
      while (this.digestion <= -3) {
        this.hunger += 1;
        this.digestion += 3;
      }
    }
    if (this.hunger === 300) return 'You are starting to feel hungry.';
    if (this.hunger === 150) return 'You are feeling weak!';
    if (this.hunger === 20) return 'You are about to faint from hunger!';
    if (this.hunger <= 0) {
      this.hunger = 0;
      return null; // starvation damage handled by caller
    }
    return null;
  }

  eat(nutrition: number): void {
    this.hunger = Math.min(HUNGER_FULL, this.hunger + nutrition);
  }

  // -- Natural healing (Rogue daemon.c doctor) ---------------------

  /**
   * Regenerate HP over time. Below level 8 the hero heals 1 HP every
   * (21 - 2*level) turns; from level 8 on, every 3 turns for rnd(level-7)+1.
   */
  regen(): void {
    if (this.hp >= this.maxHp) {
      this.regenCounter = 0;
      return;
    }
    this.regenCounter += 1;
    let interval = this.expLevel < 8 ? Math.max(1, 21 - this.expLevel * 2) : 3;
    if (this.hasRing('regeneration')) interval = Math.max(1, Math.floor(interval / 2));
    if (this.regenCounter >= interval) {
      const amount = this.expLevel < 8 ? 1 : rng.randint(1, Math.max(1, this.expLevel - 7));
      this.heal(amount);
      this.regenCounter = 0;
    }
  }

  // -- Tick --------------------------------------------------------

  tickEffects(): string[] {
    const msgs = super.tickEffects();
    if (this.hallucinating > 0) {
      this.hallucinating -= 1;
      if (this.hallucinating === 0) msgs.push('Everything looks normal again.');
    }
    if (this.seeInvisible > 0) this.seeInvisible -= 1;
    if (this.levitating > 0) {
      this.levitating -= 1;
      if (this.levitating === 0) msgs.push('You float gently back to the ground.');
    }
    return msgs;
  }
}
