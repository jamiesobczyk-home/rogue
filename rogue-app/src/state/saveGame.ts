// Persistent save/resume — a capability the original Kivy game lacked.
//
// We snapshot the full GameEngine to JSON and restore it by replaying class
// shapes. Because every entity is a plain data object plus methods, we rebuild
// instances and copy fields back, re-linking shared registries and equipment.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GameEngine,
  Dungeon,
  Rect,
  Player,
  Monster,
  MONSTER_TEMPLATES,
  Gold,
  Weapon,
  Armor,
  Potion,
  Scroll,
  Food,
  Ring,
  Wand,
  Amulet,
  Item,
  ItemRegistries,
  weaponTemplateIndexByName,
  armorTemplateIndexByName,
} from '../engine';

const SAVE_KEY = 'rogue.savegame.v1';

// ---------------------------------------------------------------------------
// Map-layer packing — tiles as digit strings, booleans as '0'/'1' strings.
// Cuts the per-turn JSON payload by ~10x vs. nested arrays (save format v2).
// ---------------------------------------------------------------------------

const packTiles = (rows: number[][]): string[] => rows.map((r) => r.join(''));
const packBools = (rows: boolean[][]): string[] =>
  rows.map((r) => r.map((b) => (b ? '1' : '0')).join(''));

/** Accepts both the packed v2 string rows and legacy v1 nested arrays. */
function unpackTiles(rows: string[] | number[][]): number[][] {
  if (rows.length === 0 || Array.isArray(rows[0])) return rows as number[][];
  return (rows as string[]).map((r) => Array.from(r, Number));
}

function unpackBools(rows: string[] | boolean[][]): boolean[][] {
  if (rows.length === 0 || Array.isArray(rows[0])) return rows as boolean[][];
  return (rows as string[]).map((r) => Array.from(r, (c) => c === '1'));
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function serializeItem(it: Item): any {
  // `kind` distinguishes the subclass; effect/registry data is restored by key.
  const base: any = {
    kind: it.kind,
    x: it.x,
    y: it.y,
    name: it.name,
    identified: it.identified,
    cursed: it.cursed,
    acBonus: it.acBonus,
    damageDice: it.damageDice,
    damageBonus: it.damageBonus,
  };
  if (it instanceof Gold) base.amount = it.amount;
  if (it instanceof Weapon || it instanceof Armor) {
    base.enchant = (it as any).enchant;
    base.templateIdx = (it as any).templateIdx;
  }
  if (it instanceof Weapon) base.count = it.count;
  if (it instanceof Armor) base.protectedArmor = it.protected;
  if (it instanceof Potion) base.effectKey = it.effectKey;
  if (it instanceof Scroll) base.effectKey = it.effectKey;
  if (it instanceof Food) base.nutrition = it.nutrition;
  if (it instanceof Ring) {
    base.effectKey = it.effectKey;
    base.bonus = it.bonus;
    base.worn = it.worn;
  }
  if (it instanceof Wand) {
    base.effectKey = it.effectKey;
    base.charges = it.charges;
  }
  return base;
}

export function serializeEngine(e: GameEngine): string {
  const data = {
    version: 2,
    seed: e.seed,
    dungeonLevel: e.dungeonLevel,
    turn: e.turn,
    state: e.state,
    monsterDetectionTurns: e.monsterDetectionTurns,
    messages: e.messages.slice(-50),
    potionIdentified: (e.potionReg as any).identifiedMap,
    potionColors: (e.potionReg as any).effectToColor,
    scrollIdentified: (e.scrollReg as any).identifiedMap,
    scrollLabels: (e.scrollReg as any).effectToLabel,
    ringIdentified: (e.ringReg as any).identifiedMap,
    ringStones: (e.ringReg as any).effectToAppearance,
    wandIdentified: (e.wandReg as any).identifiedMap,
    wandMaterials: (e.wandReg as any).effectToAppearance,
    dungeon: {
      level: e.dungeon.level,
      tiles: packTiles(e.dungeon.tiles),
      visible: packBools(e.dungeon.visible),
      explored: packBools(e.dungeon.explored),
      rooms: e.dungeon.rooms.map((r) => ({
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        gone: r.gone,
        dark: r.dark,
        maze: r.maze,
      })),
      playerStart: e.dungeon.playerStart,
      stairsDown: e.dungeon.stairsDown,
      stairsUp: e.dungeon.stairsUp,
      traps: e.dungeon.traps,
    },
    player: {
      x: e.player.x,
      y: e.player.y,
      hp: e.player.hp,
      maxHp: e.player.maxHp,
      strBase: e.player.strBase,
      strCur: e.player.strCur,
      expLevel: e.player.expLevel,
      expPts: e.player.expPts,
      gold: e.player.gold,
      hunger: e.player.hunger,
      confused: e.player.confused,
      blinded: e.player.blinded,
      hasted: e.player.hasted,
      poisoned: e.player.poisoned,
      frozen: e.player.frozen,
      sleeping: e.player.sleeping,
      hallucinating: e.player.hallucinating,
      seeInvisible: e.player.seeInvisible,
      hasAmulet: e.player.hasAmulet,
      levitating: e.player.levitating,
      confusingTouch: e.player.confusingTouch,
      inventory: e.player.inventory.map(serializeItem),
      weaponIdx: e.player.weapon ? e.player.inventory.indexOf(e.player.weapon) : -1,
      armorIdx: e.player.armor ? e.player.inventory.indexOf(e.player.armor) : -1,
      ringIdxs: e.player.rings.map((r) => e.player.inventory.indexOf(r)),
    },
    monsters: e.monsters.map((m) => ({
      letter: m.template.letter,
      x: m.x,
      y: m.y,
      hp: m.hp,
      maxHp: m.maxHp,
      aware: m.aware,
      aggravated: m.aggravated,
      scared: m.scared,
      speed: m.speed,
      confused: m.confused,
      frozen: m.frozen,
      sleeping: m.sleeping,
      levelBonus: m.levelBonus,
      xpValue: m.xpValue,
      invisible: m.invisible,
      disguiseChar: m.disguiseChar,
      pack: m.pack ? serializeItem(m.pack) : null,
    })),
    items: e.items.map(serializeItem),
  };
  return JSON.stringify(data);
}

// ---------------------------------------------------------------------------
// Deserialization
// ---------------------------------------------------------------------------

function rebuildItem(d: any, regs: ItemRegistries): Item {
  let it: Item;
  switch (d.kind) {
    case 'gold':
      it = new Gold(d.x, d.y, d.amount);
      break;
    case 'weapon':
      it = new Weapon(d.x, d.y, d.templateIdx ?? weaponTemplateIndexByName(d.name), d.enchant ?? 0, d.cursed);
      (it as Weapon).count = d.count ?? 1;
      break;
    case 'armor':
      it = new Armor(d.x, d.y, d.templateIdx ?? armorTemplateIndexByName(d.name), d.enchant ?? 0, d.cursed);
      break;
    case 'potion':
      it = new Potion(d.x, d.y, d.effectKey, regs.potion);
      break;
    case 'scroll':
      it = new Scroll(d.x, d.y, d.effectKey, regs.scroll);
      break;
    case 'food':
      it = new Food(d.x, d.y, 0);
      (it as Food).nutrition = d.nutrition;
      break;
    case 'ring':
      it = new Ring(d.x, d.y, 0, d.bonus ?? 0, d.cursed, regs.ring);
      (it as Ring).effectKey = d.effectKey;
      (it as Ring).worn = d.worn ?? false;
      break;
    case 'wand':
      it = new Wand(d.x, d.y, 0, regs.wand);
      (it as Wand).effectKey = d.effectKey;
      (it as Wand).charges = d.charges;
      break;
    case 'amulet':
      it = new Amulet(d.x, d.y);
      break;
    default:
      it = new Gold(d.x, d.y, 0);
  }
  // Restore data fields that the constructor may have randomized.
  it.name = d.name;
  it.identified = d.identified;
  it.cursed = d.cursed;
  it.acBonus = d.acBonus;
  it.damageDice = d.damageDice;
  it.damageBonus = d.damageBonus;
  if (it instanceof Armor) it.protected = d.protectedArmor ?? false;
  return it;
}

/**
 * Structural validation of untrusted save data. Saves live in local storage,
 * but a corrupt/tampered blob must fail *here* (caught by loadGame -> null ->
 * fresh game) rather than half-restoring a broken engine. This check is also
 * the integrity boundary if cloud saves/leaderboards ever exist.
 */
function validateSave(d: any): void {
  const fail = (why: string): never => {
    throw new Error(`Invalid save data: ${why}`);
  };
  if (!d || typeof d !== 'object') fail('not an object');
  if (d.version !== 1 && d.version !== 2) fail(`unknown version ${d.version}`);
  if (typeof d.seed !== 'string' && typeof d.seed !== 'number') fail('bad seed');
  if (!Number.isInteger(d.dungeonLevel) || d.dungeonLevel < 1) fail('bad dungeonLevel');
  if (!Number.isInteger(d.turn) || d.turn < 0) fail('bad turn');
  if (!d.dungeon || !Array.isArray(d.dungeon.tiles) || !Array.isArray(d.dungeon.rooms)) fail('bad dungeon');
  if (!Array.isArray(d.dungeon.visible) || !Array.isArray(d.dungeon.explored)) fail('bad dungeon layers');
  const p = d.player;
  if (!p || typeof p !== 'object') fail('missing player');
  for (const k of ['x', 'y', 'hp', 'maxHp', 'strCur', 'expLevel', 'expPts', 'gold', 'hunger']) {
    if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) fail(`bad player.${k}`);
  }
  if (!Array.isArray(p.inventory)) fail('bad inventory');
  if (!Array.isArray(d.monsters) || !Array.isArray(d.items)) fail('bad monsters/items');
  const letters = new Set(MONSTER_TEMPLATES.map((t) => t.letter));
  for (const m of d.monsters) {
    if (!m || !letters.has(m.letter)) fail('unknown monster letter');
    if (typeof m.x !== 'number' || typeof m.y !== 'number' || typeof m.hp !== 'number') fail('bad monster');
  }
}

export function deserializeEngine(json: string): GameEngine {
  const d = JSON.parse(json);
  validateSave(d);

  // Construct a fresh engine with the saved seed, then overwrite its state.
  const e = new GameEngine(d.seed);
  e.dungeonLevel = d.dungeonLevel;
  e.turn = d.turn;
  e.state = d.state;
  e.monsterDetectionTurns = d.monsterDetectionTurns;
  e.messages = d.messages ?? [];

  // Registries.
  (e.potionReg as any).identifiedMap = d.potionIdentified;
  (e.potionReg as any).effectToColor = d.potionColors;
  (e.scrollReg as any).identifiedMap = d.scrollIdentified;
  (e.scrollReg as any).effectToLabel = d.scrollLabels;
  if (d.ringIdentified) (e.ringReg as any).identifiedMap = d.ringIdentified;
  if (d.ringStones) (e.ringReg as any).effectToAppearance = d.ringStones;
  if (d.wandIdentified) (e.wandReg as any).identifiedMap = d.wandIdentified;
  if (d.wandMaterials) (e.wandReg as any).effectToAppearance = d.wandMaterials;

  // Dungeon.
  const dn = new Dungeon(d.dungeon.level);
  dn.tiles = unpackTiles(d.dungeon.tiles);
  dn.visible = unpackBools(d.dungeon.visible);
  dn.explored = unpackBools(d.dungeon.explored);
  dn.playerStart = d.dungeon.playerStart;
  dn.stairsDown = d.dungeon.stairsDown;
  dn.stairsUp = d.dungeon.stairsUp;
  dn.traps = d.dungeon.traps ?? [];
  // Rooms need real Rect instances for inRoom()/FOV, including layout flags.
  dn.rooms = d.dungeon.rooms.map((r: any) => {
    const rect = new Rect(r.x, r.y, r.w, r.h);
    rect.gone = r.gone ?? false;
    rect.dark = r.dark ?? false;
    rect.maze = r.maze ?? false;
    return rect;
  });
  e.dungeon = dn;

  // Player.
  const p = new Player(d.player.x, d.player.y);
  Object.assign(p, {
    hp: d.player.hp,
    maxHp: d.player.maxHp,
    strBase: d.player.strBase,
    strCur: d.player.strCur,
    expLevel: d.player.expLevel,
    expPts: d.player.expPts,
    gold: d.player.gold,
    hunger: d.player.hunger,
    confused: d.player.confused,
    blinded: d.player.blinded,
    hasted: d.player.hasted,
    poisoned: d.player.poisoned,
    frozen: d.player.frozen,
    sleeping: d.player.sleeping,
    hallucinating: d.player.hallucinating,
    seeInvisible: d.player.seeInvisible,
    hasAmulet: d.player.hasAmulet,
    levitating: d.player.levitating ?? 0,
    confusingTouch: d.player.confusingTouch ?? false,
  });
  const regs = e.registries;
  p.inventory = d.player.inventory.map((id: any) => rebuildItem(id, regs));
  p.weapon = d.player.weaponIdx >= 0 ? p.inventory[d.player.weaponIdx] : null;
  p.armor = d.player.armorIdx >= 0 ? p.inventory[d.player.armorIdx] : null;
  p.rings = (d.player.ringIdxs ?? []).map((i: number) => p.inventory[i]).filter(Boolean) as Ring[];
  p.recalcAc();
  e.player = p;

  // Monsters.
  const byLetter = new Map(MONSTER_TEMPLATES.map((t) => [t.letter, t]));
  e.monsters = d.monsters.map((m: any) => {
    const tmpl = byLetter.get(m.letter)!;
    const mon = new Monster(m.x, m.y, tmpl);
    mon.hp = m.hp;
    mon.maxHp = m.maxHp;
    mon.aware = m.aware;
    mon.aggravated = m.aggravated;
    mon.scared = m.scared;
    mon.speed = m.speed;
    mon.confused = m.confused;
    mon.frozen = m.frozen;
    mon.sleeping = m.sleeping;
    mon.levelBonus = m.levelBonus ?? 0;
    if (typeof m.xpValue === 'number') mon.xpValue = m.xpValue;
    if (typeof m.invisible === 'boolean') mon.invisible = m.invisible;
    mon.disguiseChar = m.disguiseChar ?? mon.disguiseChar;
    mon.pack = m.pack ? rebuildItem(m.pack, regs) : null;
    return mon;
  });

  // Floor items.
  e.items = d.items.map((id: any) => rebuildItem(id, regs));

  return e;
}

// ---------------------------------------------------------------------------
// Storage API
// ---------------------------------------------------------------------------

export async function saveGame(engine: GameEngine): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVE_KEY, serializeEngine(engine));
  } catch (err) {
    console.warn('Failed to save game:', err);
  }
}

export async function loadGame(): Promise<GameEngine | null> {
  try {
    const json = await AsyncStorage.getItem(SAVE_KEY);
    if (!json) return null;
    return deserializeEngine(json);
  } catch (err) {
    console.warn('Failed to load game:', err);
    return null;
  }
}

export async function hasSave(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SAVE_KEY)) !== null;
  } catch {
    return false;
  }
}

export async function clearSave(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
