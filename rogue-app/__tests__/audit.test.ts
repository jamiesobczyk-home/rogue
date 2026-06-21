// Empirical audit of the points I was least confident about.
// AsyncStorage is mocked (pure-node tests).

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async () => {}),
    getItem: jest.fn(async () => null),
    removeItem: jest.fn(async () => {}),
  },
}));

import {
  GameEngine,
  Player,
  Weapon,
  Armor,
  Potion,
  Scroll,
  STATE_PLAYING,
  STATE_IDENTIFY,
  PLAYER_START_AC,
} from '../src/engine';
import { serializeEngine, deserializeEngine } from '../src/state/saveGame';

describe('AUDIT 3 — Actor.tickEffects cast actually decrements/expires', () => {
  it('decrements a status timer each tick and emits expiry message at 0', () => {
    const e = new GameEngine('tick');
    e.player.confused = 3;
    expect(e.player.tickEffects()).toEqual([]); // 3 -> 2
    expect(e.player.confused).toBe(2);
    expect(e.player.tickEffects()).toEqual([]); // 2 -> 1
    expect(e.player.confused).toBe(1);
    const msgs = e.player.tickEffects(); // 1 -> 0, expiry
    expect(e.player.confused).toBe(0);
    expect(msgs).toContain('You are no longer confused.');
  });

  it('does not go negative or re-message once expired', () => {
    const e = new GameEngine('tick2');
    e.player.frozen = 1;
    e.player.tickEffects();
    expect(e.player.frozen).toBe(0);
    const again = e.player.tickEffects();
    expect(e.player.frozen).toBe(0);
    expect(again).toEqual([]);
  });
});

describe('AUDIT 6 — equipped weapon/armor survive save/load', () => {
  it('relinks equipped items and preserves effective AC + weapon dice', () => {
    const e = new GameEngine('equip');
    const w = new Weapon(0, 0, 1, 2); // long sword, +2 -> dice [3,4], bonus 0+2=2
    const a = new Armor(0, 0, 4, 1); // chain mail, +1 -> acBonus 5+1=6
    e.player.inventory.push(w, a);
    e.player.weapon = w;
    e.player.armor = a;
    e.player.recalcAc();
    const acBefore = e.player.effectiveAc;
    expect(acBefore).toBe(PLAYER_START_AC - 6);

    const r = deserializeEngine(serializeEngine(e));
    // Equipped references must point at the restored inventory items, not nulls.
    expect(r.player.weapon).not.toBeNull();
    expect(r.player.armor).not.toBeNull();
    expect(r.player.weapon).toBe(r.player.inventory[0]);
    expect(r.player.armor).toBe(r.player.inventory[1]);
    expect(r.player.weapon!.damageDice).toEqual([3, 4]);
    expect(r.player.weapon!.damageBonus).toBe(2);
    expect(r.player.effectiveAc).toBe(acBefore);
  });
});

describe('AUDIT 4 — identify-scroll flow does not get stuck', () => {
  it('enters IDENTIFY then returns to PLAYING and marks the item identified', () => {
    const e = new GameEngine('ident');
    const scroll = new Scroll(0, 0, 'id_potion', e.scrollReg);
    const potion = new Potion(0, 0, 'heal', e.potionReg);
    potion.identified = false;
    e.player.inventory.push(scroll, potion);

    e.actionUseItem(scroll);
    expect(e.state).toBe(STATE_IDENTIFY);

    e.actionIdentifyItem(potion);
    expect(e.state).toBe(STATE_PLAYING);
    expect(potion.identified).toBe(true);
    // Faithful-to-original quirk: the identify scroll is NOT consumed.
    expect(e.player.inventory).toContain(scroll);
  });
});

describe('AUDIT 5 — getRenderData is callable repeatedly under hallucination', () => {
  it('does not throw and yields render data while hallucinating', () => {
    const e = new GameEngine('hallu');
    e.player.hallucinating = 50;
    // Calling repeatedly (as React might) must never throw.
    for (let i = 0; i < 20; i++) {
      const d = e.getRenderData();
      expect(d.tiles.length).toBeGreaterThan(0);
    }
  });
});

describe('AUDIT 2 — broad save/load fidelity incl. registries', () => {
  it('preserves potion/scroll identification across reload', () => {
    const e = new GameEngine('reg');
    e.potionReg.identify('heal');
    e.scrollReg.identify('teleport');
    const r = deserializeEngine(serializeEngine(e));
    expect(r.potionReg.isIdentified('heal')).toBe(true);
    expect(r.potionReg.isIdentified('poison')).toBe(false);
    expect(r.scrollReg.isIdentified('teleport')).toBe(true);
  });

  it('round-trips a deep game state after real play', () => {
    const e = new GameEngine('deep');
    const moves: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (let i = 0; i < 80; i++) e.actionMove(...moves[i % 4]);
    const r = deserializeEngine(serializeEngine(e));
    const a = e.getRenderData();
    const b = r.getRenderData();
    expect(b.tiles).toEqual(a.tiles);
    expect(b.monsters).toEqual(a.monsters);
    expect(b.items).toEqual(a.items);
    expect(b.hud).toEqual(a.hud);
  });
});
