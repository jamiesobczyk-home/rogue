// Game-wide constants for the Rogue clone.
// This TypeScript engine is the single source of truth; values are aligned with
// the original Rogue 5.4.4 C source (see ORIGINAL_ROGUE_COMPARISON.md).

// ---------------------------------------------------------------------------
// Map dimensions
// ---------------------------------------------------------------------------
export const MAP_WIDTH = 80;
export const MAP_HEIGHT = 22;

// ---------------------------------------------------------------------------
// Dungeon generation parameters
// ---------------------------------------------------------------------------
export const MAX_ROOMS = 9;
export const MIN_ROOM_SIZE = 4;
export const MAX_ROOM_SIZE = 10;
export const MAX_DUNGEON_LEVEL = 26; // Amulet of Yendor is on level 26

// ---------------------------------------------------------------------------
// Tile type identifiers
// ---------------------------------------------------------------------------
export const TILE_VOID = 0; // Undiscovered space
export const TILE_FLOOR = 1; // Room floor
export const TILE_WALL_H = 2; // Horizontal wall  (-)
export const TILE_WALL_V = 3; // Vertical wall    (|)
export const TILE_WALL_C = 4; // Corner/junction  (+)
export const TILE_CORRIDOR = 5; // Corridor passage (#)
export const TILE_DOOR = 6; // Door             (+)
export const TILE_STAIRS_DN = 7; // Stairs down      (>)
export const TILE_STAIRS_UP = 8; // Stairs up        (<)
export const TILE_TRAP = 9; // Discovered trap  (^)

// Display characters (original Rogue aesthetics)
export const TILE_CHARS: Record<number, string> = {
  [TILE_VOID]: ' ',
  [TILE_FLOOR]: '.',
  [TILE_WALL_H]: '-',
  [TILE_WALL_V]: '|',
  [TILE_WALL_C]: '+',
  [TILE_CORRIDOR]: '#',
  [TILE_DOOR]: '+',
  [TILE_STAIRS_DN]: '>',
  [TILE_STAIRS_UP]: '<',
  [TILE_TRAP]: '^',
};

// ---------------------------------------------------------------------------
// Colour palette  (R, G, B) — 0..255 integers
// ---------------------------------------------------------------------------
export type RGB = [number, number, number];

export const BLACK: RGB = [0, 0, 0];
export const WHITE: RGB = [255, 255, 255];
export const RED: RGB = [200, 50, 50];
export const DARK_RED: RGB = [140, 20, 20];
export const GREEN: RGB = [50, 200, 50];
export const DARK_GREEN: RGB = [20, 120, 20];
export const BLUE: RGB = [80, 120, 220];
export const YELLOW: RGB = [220, 220, 50];
export const GOLD: RGB = [220, 180, 30];
export const CYAN: RGB = [50, 210, 210];
export const MAGENTA: RGB = [200, 80, 200];
export const ORANGE: RGB = [220, 140, 40];
export const BROWN: RGB = [160, 100, 40];
export const DARK_BROWN: RGB = [100, 60, 20];
export const GRAY: RGB = [128, 128, 128];
export const DARK_GRAY: RGB = [80, 80, 80];
export const LIGHT_GRAY: RGB = [192, 192, 192];
export const PURPLE: RGB = [140, 60, 200];

// Foreground colour per tile type (full visibility)
export const TILE_FG: Record<number, RGB> = {
  [TILE_VOID]: BLACK,
  [TILE_FLOOR]: DARK_GRAY,
  [TILE_WALL_H]: BROWN,
  [TILE_WALL_V]: BROWN,
  [TILE_WALL_C]: BROWN,
  [TILE_CORRIDOR]: DARK_GRAY,
  [TILE_DOOR]: BROWN,
  [TILE_STAIRS_DN]: YELLOW,
  [TILE_STAIRS_UP]: YELLOW,
  [TILE_TRAP]: RED,
};

// Dimmed (explored but not currently visible) — ~30 % brightness
export const TILE_FG_DIM: Record<number, RGB> = Object.fromEntries(
  Object.entries(TILE_FG).map(([k, v]) => [
    Number(k),
    [Math.floor((v[0] * 3) / 10), Math.floor((v[1] * 3) / 10), Math.floor((v[2] * 3) / 10)] as RGB,
  ]),
);

// ---------------------------------------------------------------------------
// Entity colours
// ---------------------------------------------------------------------------
export const PLAYER_COLOR = WHITE;
export const GOLD_COLOR = GOLD;
export const FOOD_COLOR = ORANGE;
export const WEAPON_COLOR = LIGHT_GRAY;
export const ARMOR_COLOR = CYAN;
export const POTION_COLOR = MAGENTA;
export const SCROLL_COLOR = YELLOW;
export const RING_COLOR = GREEN;
export const WAND_COLOR = BLUE;
export const AMULET_COLOR = GOLD;

// ---------------------------------------------------------------------------
// Player starting stats
// ---------------------------------------------------------------------------
export const PLAYER_START_HP = 12;
export const PLAYER_START_STR = 16;
export const PLAYER_START_AC = 10; // Lower is better (Rogue/D&D convention)
export const PLAYER_START_EXP = 1;
// Experience needed to advance FROM each level (index = current level). Values
// are the original Rogue 5.4.4 e_levels[] thresholds (extern.c); index 0 is
// unused. e.g. reaching level 2 costs 10 XP, level 8 costs 1300 (not 1280).
export const PLAYER_EXP_TABLE = [
  0, 10, 20, 40, 80, 160, 320, 640, 1300, 2600, 5200, 13000, 26000, 50000, 100000, 200000, 400000,
  800000, 2000000, 4000000, 8000000,
];

// ---------------------------------------------------------------------------
// Strength modifier tables  (Rogue 5.4.4 fight.c)
// Indexed directly by the strength value (0..31). str_plus adjusts to-hit,
// add_dam adjusts damage. At the starting STR 16: strPlus=0, addDam=1.
// ---------------------------------------------------------------------------
export const STR_MAX = 31;

export const STR_PLUS = [
  -7, -6, -5, -4, -3, -2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3,
];
export const ADD_DAM = [
  -7, -6, -5, -4, -3, -2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6,
];

const clampStr = (str: number): number => Math.max(0, Math.min(STR_MAX, Math.floor(str)));
export const strPlus = (str: number): number => STR_PLUS[clampStr(str)];
export const addDam = (str: number): number => ADD_DAM[clampStr(str)];

// ---------------------------------------------------------------------------
// Hunger system  (food_left units; Rogue 5.4.4 rogue.h)
// ---------------------------------------------------------------------------
export const HUNGERTIME = 1300; // food a ration restores
export const STOMACHSIZE = 2000; // max food_left
export const MORETIME = 150; // weak threshold
export const STARVETIME = 850; // turns at <=0 before death

export const HUNGER_FULL = HUNGERTIME; // food_left at game start
export const HUNGER_HUNGRY = 2 * MORETIME; // 300 — "getting hungry"
export const HUNGER_WEAK = MORETIME; // 150 — "feel weak"
export const HUNGER_FAINT = 0; // fainting from hunger

export const HUNGER_LABELS: Record<number, string> = {
  [HUNGER_HUNGRY]: 'Hungry',
  [HUNGER_WEAK]: 'Weak',
  [HUNGER_FAINT]: 'Faint',
};

// ---------------------------------------------------------------------------
// Status effect durations (turns)
// ---------------------------------------------------------------------------
export const CONFUSED_TURNS = 20;
export const BLIND_TURNS = 850;
export const HASTED_TURNS = 14;
export const POISONED_TURNS = 40;
export const HALLUC_TURNS = 850;
export const SLEEPING_TURNS = 5;
export const FROZEN_TURNS = 3;

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
export const MAX_INVENTORY = 26; // slots a–z

// ---------------------------------------------------------------------------
// Viewport / rendering
// ---------------------------------------------------------------------------
export const VIEWPORT_W = 40; // tiles visible horizontally (centred on player)
export const VIEWPORT_H = 18; // tiles visible vertically
