// Phase 2/3 fidelity: authentic monster stats, e_levels XP, and HP regen.

import { GameEngine, STATE_DEAD } from '../src/engine/engine';
import { MONSTER_TEMPLATES, Monster } from '../src/engine/monsters';
import { parseDamage } from '../src/engine/combat';
import { PLAYER_EXP_TABLE, STOMACHSIZE, STARVETIME } from '../src/engine/constants';

const byLetter = (l: string) => MONSTER_TEMPLATES.find((t) => t.letter === l)!;

describe('Monster table matches Rogue 5.4.4', () => {
  it('uses the original names for C and U', () => {
    expect(byLetter('C').name).toBe('centaur');
    expect(byLetter('U').name).toBe('black unicorn');
  });

  it('has the canonical dragon and aquator stats', () => {
    const d = byLetter('D');
    expect(d).toMatchObject({ level: 10, ac: -1, xpValue: 5000, carry: 100, damage: '1x8/1x8/3x10' });
    const a = byLetter('A');
    expect(a).toMatchObject({ level: 5, ac: 2, xpValue: 20, damage: '0x0/0x0' });
  });

  it('rolls HP as level d8', () => {
    for (let i = 0; i < 50; i++) {
      const m = new Monster(0, 0, byLetter('T')); // troll, level 6
      expect(m.maxHp).toBeGreaterThanOrEqual(1);
      expect(m.maxHp).toBeLessThanOrEqual(6 * 8);
    }
  });

  it('parses multi-attack damage strings', () => {
    expect(parseDamage('1x8/1x8/3x10')).toEqual([
      [1, 8],
      [1, 8],
      [3, 10],
    ]);
  });
});

describe('Experience thresholds use e_levels', () => {
  it('matches the original non-doubling curve at level 8+', () => {
    expect(PLAYER_EXP_TABLE[8]).toBe(1300); // not 1280
    expect(PLAYER_EXP_TABLE[9]).toBe(2600);
    expect(PLAYER_EXP_TABLE[10]).toBe(5200);
  });

  it('awards the correct level for a lump of experience', () => {
    const e = new GameEngine('xp2');
    e.player.gainExp(1300);
    expect(e.player.expLevel).toBe(9); // passes thresholds up to and incl. 1300
  });
});

describe('Hunger system (Rogue stomach/eat)', () => {
  it('eats up to the stomach size', () => {
    const e = new GameEngine('hunger-eat');
    e.player.hunger = 5;
    e.player.eat(3000);
    expect(e.player.hunger).toBe(STOMACHSIZE);
  });

  it('warns as the hero crosses each hunger threshold', () => {
    const p = new GameEngine('hunger-th').player;
    p.hunger = 301;
    expect(p.tickHunger()).toMatch(/hungry/);
    p.hunger = 151;
    expect(p.tickHunger()).toMatch(/weak/);
    p.hunger = 1;
    expect(p.tickHunger()).toMatch(/faint/);
  });

  it('starves to death after STARVETIME turns below zero', () => {
    const e = new GameEngine('starve');
    e.player.hunger = -STARVETIME; // one more tick pushes past the limit
    e.actionWait();
    expect(e.state).toBe(STATE_DEAD);
  });
});

describe('Player regenerates HP over time', () => {
  it('heals slowly when wounded and never exceeds maxHp', () => {
    const e = new GameEngine('regen');
    e.player.maxHp = 40;
    e.player.hp = 10;
    for (let i = 0; i < 200; i++) e.player.regen();
    expect(e.player.hp).toBeGreaterThan(10);
    expect(e.player.hp).toBeLessThanOrEqual(40);
  });

  it('does nothing at full health', () => {
    const e = new GameEngine('regen2');
    e.player.maxHp = 20;
    e.player.hp = 20;
    for (let i = 0; i < 50; i++) e.player.regen();
    expect(e.player.hp).toBe(20);
  });
});
