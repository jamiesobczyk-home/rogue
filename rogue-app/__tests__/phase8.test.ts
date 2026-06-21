// Phase 8: identification & item fidelity.

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { setItem: jest.fn(), getItem: jest.fn(async () => null), removeItem: jest.fn() },
}));

import { GameEngine, STATE_IDENTIFY, STATE_PLAYING } from '../src/engine/engine';
import { Ring, Wand, Scroll, Potion, Weapon } from '../src/engine/items';
import { Monster, MONSTER_TEMPLATES } from '../src/engine/monsters';
import { TILE_FLOOR } from '../src/engine/constants';

describe('ring & wand obfuscation', () => {
  it('hides a ring kind behind a stone name until worn', () => {
    const e = new GameEngine('obf-ring');
    const r = new Ring(0, 0, 0, 2, false, e.ringReg); // protection
    expect(r.displayName()).toMatch(/ ring$/);
    expect(r.displayName()).not.toMatch(/protection/);
    e.player.inventory.push(r);
    r.use(e);
    expect(r.displayName()).toMatch(/protection/);
  });

  it('hides a wand kind behind a material until zapped', () => {
    const e = new GameEngine('obf-wand');
    const w = new Wand(0, 0, 6, e.wandReg); // magic missile
    expect(w.displayName()).toMatch(/ wand$/);
    expect(w.displayName()).not.toMatch(/missile/);
    w.use(e); // zapping reveals the kind
    expect(w.displayName()).toMatch(/magic missile/);
  });
});

describe('split identify scrolls', () => {
  it('only identify the matching item category', () => {
    const e = new GameEngine('idk');
    const scroll = new Scroll(0, 0, 'id_weapon', e.scrollReg);
    const potion = new Potion(0, 0, 'heal', e.potionReg);
    potion.identified = false;
    const weapon = new Weapon(0, 0, 1);
    e.player.inventory.push(scroll, potion, weapon);

    e.actionUseItem(scroll);
    expect(e.state).toBe(STATE_IDENTIFY);

    e.actionIdentifyItem(potion); // wrong category — rejected
    expect(e.state).toBe(STATE_IDENTIFY);
    expect(potion.identified).toBe(false);

    e.actionIdentifyItem(weapon); // correct category
    expect(e.state).toBe(STATE_PLAYING);
    expect(weapon.identified).toBe(true);
  });
});

describe('monsters carry and drop loot', () => {
  it('drops a carried pack item where the monster died', () => {
    const e = new GameEngine('loot');
    e.monsters = [];
    e.items = [];
    const p = e.player;
    let dir: [number, number] | null = null;
    let cell: [number, number] | null = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (e.dungeon.isWalkable(x, y) && e.dungeon.tile(x, y) === TILE_FLOOR) {
        dir = [dx, dy];
        cell = [x, y];
        break;
      }
    }
    expect(cell).not.toBeNull();
    const [mx, my] = cell!;
    const m = new Monster(mx, my, MONSTER_TEMPLATES[7]); // hobgoblin
    m.hp = 1;
    m.defense = 40; // make it trivially hittable for a deterministic kill
    const pack = new Potion(mx, my, 'heal', e.potionReg);
    m.pack = pack;
    e.monsters = [m];

    e.actionMove(dir![0], dir![1]); // attack into the monster

    expect(m.alive).toBe(false);
    expect(e.items).toContain(pack);
    expect(pack.x).toBe(mx);
    expect(pack.y).toBe(my);
  });
});

describe('hallucination scrambles item glyphs', () => {
  it('renders item characters from the random glyph pool', () => {
    const e = new GameEngine('hallu-item');
    const p = e.player;
    const it = new Potion(p.x, p.y, 'heal', e.potionReg);
    e.items = [it];
    e.player.hallucinating = 200;
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const data = e.getRenderData();
      const drawn = data.items.find((d) => d[0] === p.x && d[1] === p.y);
      if (drawn) seen.add(drawn[2]);
    }
    expect(seen.size).toBeGreaterThan(1); // glyph changes while hallucinating
  });
});
