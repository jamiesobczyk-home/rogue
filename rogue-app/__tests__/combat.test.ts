// Verifies the authentic Rogue 5.4.4 combat math ported in combat.ts.

import { swing } from '../src/engine/combat';
import { strPlus, addDam } from '../src/engine/constants';

describe('swing() — fight.c to-hit formula', () => {
  it('always hits when the needed roll is <= 0', () => {
    // need = (20 - atLvl) - opArm. atLvl 20, opArm 0 => need 0; rnd(20)>=0 always.
    for (let i = 0; i < 200; i++) expect(swing(20, 0, 0)).toBe(true);
  });

  it('never hits when the need exceeds the max possible roll', () => {
    // need = (20 - 0) - (-1) = 21; rnd(20) tops out at 19, wplus 0 => impossible.
    for (let i = 0; i < 200; i++) expect(swing(0, -1, 0)).toBe(false);
  });

  it('higher attacker level and lower (better-for-attacker) target AC help', () => {
    // Sample empirically: a high-level attacker vs soft AC lands far more often
    // than a level-1 attacker vs hard (negative) AC.
    let strong = 0;
    let weak = 0;
    for (let i = 0; i < 2000; i++) {
      if (swing(15, 9, 3)) strong++; // need = (20-15)-9 = -4 (always)
      if (swing(1, -2, 0)) weak++; //  need = (20-1)-(-2) = 21 (never)
    }
    expect(strong).toBe(2000);
    expect(weak).toBe(0);
  });
});

describe('strength modifier tables', () => {
  it('matches Rogue str_plus / add_dam at key strengths', () => {
    expect(strPlus(16)).toBe(0); // starting strength
    expect(addDam(16)).toBe(1);
    expect(strPlus(31)).toBe(3); // max
    expect(addDam(31)).toBe(6);
    expect(strPlus(0)).toBe(-7);
    expect(addDam(0)).toBe(-7);
  });

  it('clamps out-of-range strengths to the table bounds', () => {
    expect(strPlus(-5)).toBe(-7);
    expect(strPlus(99)).toBe(3);
    expect(addDam(99)).toBe(6);
  });
});
