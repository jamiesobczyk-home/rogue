// Game-wide constants for the Rogue clone.
// Ported 1:1 from rogue/game/constants.py — keep names in sync with the Python reference.

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
export const PLAYER_EXP_TABLE = [
  0, 10, 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480, 40960, 81920, 163840, 327680,
  655360, 1310720, 2621440, 5242880, 10485760, 20971520, 41943040, 83886080, 167772160,
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
// Hunger system  (turns remaining)
// ---------------------------------------------------------------------------
export const HUNGER_FULL = 1300;
export const HUNGER_HUNGRY = 300;
export const HUNGER_WEAK = 150;
export const HUNGER_FAINT = 20;

export const HUNGER_LABELS: Record<number, string> = {
  [HUNGER_FULL]: 'Full',
  [HUNGER_HUNGRY]: 'Hungry',
  [HUNGER_WEAK]: 'Weak',
  [HUNGER_FAINT]: 'Faint',
  0: 'Starving',
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
