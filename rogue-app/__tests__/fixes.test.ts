// Review fixes: starting pack, missile stacking, faithful scroll behaviors,
// trap gating, wand_mons wanderers, raise-level semantics, save round-trips,
// and save-schema validation.

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async () => {}),
    getItem: jest.fn(async () => null),
    removeItem: jest.fn(async () => {}),
  },
}));

import { GameEngine } from '../src/engine/engine';
import { Dungeon } from '../src/engine/dungeon';
import { RNG } from '../src/engine/rng';
import { Monster, MONSTER_TEMPLATES, randMonsterLetter } from '../src/engine/monsters';
import { Weapon, Scroll, Potion } from '../src/engine/items';
import { TILE_FLOOR } from '../src/engine/constants';
import { serializeEngine, deserializeEngine } from '../src/state/saveGame';

describe('original starting pack (init.c)', () => {
  it('gives food, +1/+1 mace (wielded), +1 short bow, 25-39 arrows, +1 ring mail (worn)', () => {
    const e = new GameEngine('pack');
    const inv = e.player.inventory;
    const names = inv.map((i) => i.name);
    expect(names).toContain('food ration');
    expect(names).toContain('mace');
    expect(names).toContain('short bow');
    expect(names).toContain('arrow');
    expect(names).toContain('ring mail');

    expect(e.player.weapon?.name).toBe('mace');
    expect((e.player.weapon as Weapon).enchant).toBe(1);
    expect(e.player.armor?.name).toBe('ring mail');
    expect(e.player.effectiveAc).toBe(6); // 10 - (3 + 1)

    const arrows = inv.find((i) => i.name === 'arrow') as Weapon;
    expect(arrows.count).toBeGreaterThanOrEqual(25);
    expect(arrows.count).toBeLessThanOrEqual(39);
  });
});

describe('missile stacking', () => {
  it('throwing from a stack peels one arrow and keeps the rest', () => {
    const e = new GameEngine('stack-throw');
    e.monsters = [];
    const p = e.player;
    // Find a visible adjacent floor cell for the target.
    let cell: [number, number] | null = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (e.dungeon.tile(x, y) === TILE_FLOOR && e.dungeon.visible[y][x]) cell = [x, y];
    }
    expect(cell).not.toBeNull();
    const m = new Monster(cell![0], cell![1], MONSTER_TEMPLATES[7]);
    m.defense = 40; // trivially hittable
    m.hp = 9999;
    m.maxHp = 9999;
    e.monsters = [m];

    const arrows = p.inventory.find((i) => i.name === 'arrow') as Weapon;
    const before = arrows.count;
    e.actionThrowItem(arrows);
    expect(arrows.count).toBe(before - 1);
    expect(p.inventory).toContain(arrows);
    const landed = e.items.filter((i) => i.name === 'arrow');
    expect(landed).toHaveLength(1);
    expect((landed[0] as Weapon).count).toBe(1);
    expect((landed[0] as Weapon).missile).toBe(true);
  });

  it('picking up a matching missile merges it into the stack', () => {
    const e = new GameEngine('stack-merge');
    const p = e.player;
    const arrows = p.inventory.find((i) => i.name === 'arrow') as Weapon;
    const before = arrows.count;
    const slots = p.inventory.length;
    const single = new Weapon(p.x, p.y, 3, 0);
    e.items.push(single);
    e.actionPickup();
    expect(arrows.count).toBe(before + 1);
    expect(p.inventory.length).toBe(slots); // no new slot consumed
  });
});

describe('faithful scroll behaviors (scrolls.c)', () => {
  it('scroll of sleep puts the READER to sleep', () => {
    const e = new GameEngine('scr-sleep');
    const s = new Scroll(0, 0, 'sleep', e.scrollReg);
    e.player.inventory.push(s);
    e.actionUseItem(s);
    expect(e.player.frozen).toBeGreaterThan(0);
  });

  it('reading scare monster is a dud; the dropped scroll blocks monster squares', () => {
    const e = new GameEngine('scr-scare');
    const m = new Monster(e.player.x + 3, e.player.y, MONSTER_TEMPLATES[7]);
    e.monsters = [m];
    const s = new Scroll(0, 0, 'scare_monster', e.scrollReg);
    e.player.inventory.push(s);
    e.actionUseItem(s);
    expect(m.scared).toBe(0); // no mass-flee on read
    expect(e.messages.join(' ')).toMatch(/maniacal laughter/);

    const dropped = new Scroll(5, 5, 'scare_monster', e.scrollReg);
    e.items.push(dropped);
    expect(e.scareSquares().has('5,5')).toBe(true);
  });

  it('hold monster only freezes monsters within 2 squares', () => {
    const e = new GameEngine('scr-hold');
    const near = new Monster(e.player.x + 2, e.player.y, MONSTER_TEMPLATES[7]);
    const far = new Monster(e.player.x + 6, e.player.y, MONSTER_TEMPLATES[7]);
    e.monsters = [near, far];
    const s = new Scroll(0, 0, 'hold_monster', e.scrollReg);
    e.player.inventory.push(s);
    e.actionUseItem(s);
    expect(near.frozen).toBeGreaterThan(0);
    expect(far.frozen).toBe(0);
  });
});

describe('trap gating (rooms.c)', () => {
  it('level 1 is usually trap-free; deep levels always have 1-2 traps', () => {
    let shallowWithTraps = 0;
    for (let i = 0; i < 60; i++) {
      if (new Dungeon(1, new RNG(`t1-${i}`)).traps.length > 0) shallowWithTraps++;
    }
    // rnd(10) < 1 -> ~10% of level-1 maps have traps.
    expect(shallowWithTraps).toBeLessThan(20);

    for (let i = 0; i < 20; i++) {
      const d = new Dungeon(10, new RNG(`t10-${i}`)); // rnd(10) < 10 always
      expect(d.traps.length).toBeGreaterThanOrEqual(1);
      expect(d.traps.length).toBeLessThanOrEqual(10);
    }
  });
});

describe('wanderers use wand_mons', () => {
  it('never produces the six letters that cannot wander', () => {
    const excluded = new Set(['I', 'L', 'N', 'F', 'X', 'D']);
    for (let level = 1; level <= 30; level++) {
      for (let i = 0; i < 40; i++) {
        expect(excluded.has(randMonsterLetter(level, true))).toBe(false);
      }
    }
  });
});

describe('potion of raise level sets XP to the next threshold', () => {
  it('jumps exactly one level from zero XP', () => {
    const e = new GameEngine('raise');
    const pot = new Potion(0, 0, 'raise_level', e.potionReg);
    e.player.inventory.push(pot);
    e.actionUseItem(pot);
    expect(e.player.expLevel).toBe(2);
    expect(e.player.expPts).toBe(10); // set to e_levels[1], not added
  });
});

describe('save round-trip of weapon templates and stacks', () => {
  it('a dagger keeps its hurl dice and missile flag after reload', () => {
    const e = new GameEngine('rt-dagger');
    const dagger = new Weapon(0, 0, 4, 2);
    e.player.inventory.push(dagger);
    const r = deserializeEngine(serializeEngine(e));
    const back = r.player.inventory.find((i) => i.name === 'dagger') as Weapon;
    expect(back).toBeTruthy();
    expect(back.hurlDice).toEqual([1, 4]);
    expect(back.missile).toBe(true);
    expect(back.enchant).toBe(2);
  });

  it('arrow stack count and depth-scaled monsters survive reload', () => {
    const e = new GameEngine('rt-stack');
    const arrows = e.player.inventory.find((i) => i.name === 'arrow') as Weapon;
    arrows.count = 31;
    e.monsters[0].levelBonus = 3;
    e.monsters[0].xpValue = 999;
    const r = deserializeEngine(serializeEngine(e));
    const back = r.player.inventory.find((i) => i.name === 'arrow') as Weapon;
    expect(back.count).toBe(31);
    expect(r.monsters[0].levelBonus).toBe(3);
    expect(r.monsters[0].xpValue).toBe(999);
    expect(r.monsters[0].level).toBe(r.monsters[0].template.level + 3);
  });
});

describe('save-schema validation', () => {
  it('rejects malformed or tampered saves instead of half-restoring', () => {
    expect(() => deserializeEngine('{"version":99}')).toThrow(/Invalid save/);
    expect(() => deserializeEngine('{"version":2,"seed":"x"}')).toThrow(/Invalid save/);
    expect(() => deserializeEngine('null')).toThrow(/Invalid save/);
    const good = serializeEngine(new GameEngine('val'));
    const tampered = JSON.parse(good);
    tampered.monsters.push({ letter: '☠', x: 1, y: 1, hp: 1 });
    expect(() => deserializeEngine(JSON.stringify(tampered))).toThrow(/Invalid save/);
  });
});
