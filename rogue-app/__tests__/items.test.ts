// Phase 5: weighted item generation, original weapons, and functional rings.

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { setItem: jest.fn(), getItem: jest.fn(async () => null), removeItem: jest.fn() },
}));

import {
  GameEngine,
  Ring,
  Weapon,
  Potion,
  Gold,
  randomItem,
  PotionRegistry,
  ScrollRegistry,
} from '../src/engine';

// RING_EFFECTS index order (items.ts): 0 protection, 1 add_str, 2 sustain_str,
// 4 see_invisible, 6 aggravate, 10 slow_digestion.

describe('original weapon dice', () => {
  it('uses the Rogue damage dice', () => {
    expect(new Weapon(0, 0, 0).damageDice).toEqual([2, 4]); // mace
    expect(new Weapon(0, 0, 1).damageDice).toEqual([3, 4]); // long sword
    expect(new Weapon(0, 0, 5).damageDice).toEqual([4, 4]); // two-handed sword
    expect(new Weapon(0, 0, 4).damageDice).toEqual([1, 6]); // dagger
  });
});

describe('functional rings', () => {
  function wear(e: GameEngine, ring: Ring) {
    e.player.inventory.push(ring);
    return ring.use(e);
  }

  it('ring of protection lowers AC by its bonus', () => {
    const e = new GameEngine('r-prot');
    const before = e.player.effectiveAc;
    wear(e, new Ring(0, 0, 0, 2));
    expect(e.player.effectiveAc).toBe(before - 2);
  });

  it('ring of add strength raises effective strength', () => {
    const e = new GameEngine('r-str');
    const before = e.player.effectiveStr;
    wear(e, new Ring(0, 0, 1, 1));
    expect(e.player.effectiveStr).toBe(before + 1);
  });

  it('ring of sustain strength blocks strength loss', () => {
    const e = new GameEngine('r-sus');
    wear(e, new Ring(0, 0, 2));
    const s = e.player.strCur;
    expect(e.player.reduceStr(2)).toBe(false);
    expect(e.player.strCur).toBe(s);
  });

  it('ring of see invisible grants the sense', () => {
    const e = new GameEngine('r-inv');
    expect(e.player.canSeeInvisible).toBe(false);
    wear(e, new Ring(0, 0, 4));
    expect(e.player.canSeeInvisible).toBe(true);
  });

  it('refuses a third ring', () => {
    const e = new GameEngine('r-max');
    wear(e, new Ring(0, 0, 2));
    wear(e, new Ring(0, 0, 4));
    const msg = wear(e, new Ring(0, 0, 3));
    expect(msg).toMatch(/already wear two rings/);
    expect(e.player.rings).toHaveLength(2);
  });

  it('a cursed ring cannot be removed', () => {
    const e = new GameEngine('r-curse');
    const ring = new Ring(0, 0, 0, -2); // negative bonus -> cursed
    expect(ring.cursed).toBe(true);
    wear(e, ring);
    expect(ring.use(e)).toMatch(/stuck/);
    expect(e.player.rings).toContain(ring);
  });

  it('ring of slow digestion stretches food', () => {
    const a = new GameEngine('dig-a').player;
    const b = new GameEngine('dig-b').player;
    b.rings.push(new Ring(0, 0, 10)); // slow digestion
    for (let i = 0; i < 90; i++) {
      a.tickHunger();
      b.tickHunger();
    }
    expect(b.hunger).toBeGreaterThan(a.hunger);
  });
});

describe('weighted generation (extern.c probabilities)', () => {
  it('produces potions far more often than rings, and common effects dominate', () => {
    const pReg = new PotionRegistry();
    const sReg = new ScrollRegistry();
    let potions = 0;
    let rings = 0;
    let gainStr = 0;
    let raiseLevel = 0;
    for (let i = 0; i < 6000; i++) {
      const it = randomItem(1, 1, 5, pReg, sReg);
      if (it instanceof Ring) rings++;
      if (it instanceof Potion) {
        potions++;
        if (it.effectKey === 'gain_str') gainStr++;
        if (it.effectKey === 'raise_level') raiseLevel++;
      }
      void Gold; // keep import used
    }
    // potion category prob 26 vs ring 4.
    expect(potions).toBeGreaterThan(rings * 3);
    // gain strength prob 13 vs raise level prob 2.
    expect(gainStr).toBeGreaterThan(raiseLevel * 2);
  });
});
