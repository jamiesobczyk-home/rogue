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
  PotionRegistry,
  ScrollRegistry,
} from '../engine';

const SAVE_KEY = 'rogue.savegame.v1';

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
  if (it instanceof Weapon || it instanceof Armor) base.enchant = (it as any).enchant;
  if (it instanceof Potion) base.effectKey = it.effectKey;
  if (it instanceof Scroll) base.effectKey = it.effectKey;
  if (it instanceof Food) base.nutrition = it.nutrition;
  if (it instanceof Ring) base.effectKey = it.effectKey;
  if (it instanceof Wand) {
    base.effectKey = it.effectKey;
    base.charges = it.charges;
  }
  return base;
}

export function serializeEngine(e: GameEngine): string {
  const data = {
    version: 1,
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
    dungeon: {
      level: e.dungeon.level,
      tiles: e.dungeon.tiles,
      visible: e.dungeon.visible,
      explored: e.dungeon.explored,
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
      inventory: e.player.inventory.map(serializeItem),
      weaponIdx: e.player.weapon ? e.player.inventory.indexOf(e.player.weapon) : -1,
      armorIdx: e.player.armor ? e.player.inventory.indexOf(e.player.armor) : -1,
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
    })),
    items: e.items.map(serializeItem),
  };
  return JSON.stringify(data);
}

// ---------------------------------------------------------------------------
// Deserialization
// ---------------------------------------------------------------------------

function rebuildItem(d: any, potionReg: PotionRegistry, scrollReg: ScrollRegistry): Item {
  let it: Item;
  switch (d.kind) {
    case 'gold':
      it = new Gold(d.x, d.y, d.amount);
      break;
    case 'weapon':
      it = new Weapon(d.x, d.y, 0, d.enchant ?? 0, d.cursed);
      break;
    case 'armor':
      it = new Armor(d.x, d.y, 0, d.enchant ?? 0, d.cursed);
      break;
    case 'potion':
      it = new Potion(d.x, d.y, d.effectKey, potionReg);
      break;
    case 'scroll':
      it = new Scroll(d.x, d.y, d.effectKey, scrollReg);
      break;
    case 'food':
      it = new Food(d.x, d.y, 0);
      (it as Food).nutrition = d.nutrition;
      break;
    case 'ring':
      it = new Ring(d.x, d.y, 0);
      (it as Ring).effectKey = d.effectKey;
      break;
    case 'wand':
      it = new Wand(d.x, d.y, 0);
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
  return it;
}

export function deserializeEngine(json: string): GameEngine {
  const d = JSON.parse(json);

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

  // Dungeon.
  const dn = new Dungeon(d.dungeon.level);
  dn.tiles = d.dungeon.tiles;
  dn.visible = d.dungeon.visible;
  dn.explored = d.dungeon.explored;
  dn.playerStart = d.dungeon.playerStart;
  dn.stairsDown = d.dungeon.stairsDown;
  dn.stairsUp = d.dungeon.stairsUp;
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
  });
  p.inventory = d.player.inventory.map((id: any) => rebuildItem(id, e.potionReg, e.scrollReg));
  p.weapon = d.player.weaponIdx >= 0 ? p.inventory[d.player.weaponIdx] : null;
  p.armor = d.player.armorIdx >= 0 ? p.inventory[d.player.armorIdx] : null;
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
    return mon;
  });

  // Floor items.
  e.items = d.items.map((id: any) => rebuildItem(id, e.potionReg, e.scrollReg));

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
