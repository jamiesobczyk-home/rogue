// Authentic Rogue 5.4.4 combat resolution (fight.c).
//
// The original `swing()` decides hit/miss:
//
//     int swing(int at_lvl, int op_arm, int wplus) {
//         int res  = rnd(20);            // 0..19
//         int need = (20 - at_lvl) - op_arm;
//         return (res + wplus >= need);
//     }
//
// Armor class follows the Rogue/D&D convention: LOWER is better. The hero's AC
// starts at 10 and is reduced by armor; monster AC comes from the stat table
// (e.g. dragon −1). `wplus` is the attacker's to-hit bonus (weapon enchantment +
// strPlus(strength) for the hero; 0 for plain monster attacks).

import { rng } from './rng';

/** Sum of `n` rolls of a `sides`-sided die. */
export function rollDice(n: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += rng.randint(1, sides);
  return total;
}

/** True if the attack lands. Mirrors fight.c swing(). */
export function swing(atLvl: number, opArm: number, wplus: number): boolean {
  const res = rng.randrange(20); // rnd(20) -> 0..19
  const need = 20 - atLvl - opArm;
  return res + wplus >= need;
}

/**
 * Roll a Rogue damage string such as "1x8/1x8/3x10" — a set of NxS attack
 * groups. Returns the per-group rolls so multi-attack monsters can resolve each
 * swing independently. `bonus` (str add_dam, weapon dplus) is applied per group.
 */
export function rollDamageGroups(groups: [number, number][], bonus = 0): number[] {
  return groups.map(([n, sides]) => {
    let total = bonus;
    for (let i = 0; i < n; i++) total += rng.randint(1, sides);
    return total;
  });
}

/** Parse a Rogue damage string ("2x6/1x4") into [n, sides] groups. */
export function parseDamage(spec: string): [number, number][] {
  return spec
    .split('/')
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => {
      const [n, s] = g.split('x').map((v) => parseInt(v, 10));
      return [Number.isFinite(n) ? n : 0, Number.isFinite(s) ? s : 0] as [number, number];
    });
}
