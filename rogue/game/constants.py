"""Game-wide constants for the Rogue clone."""

# ---------------------------------------------------------------------------
# Map dimensions
# ---------------------------------------------------------------------------
MAP_WIDTH = 80
MAP_HEIGHT = 22

# ---------------------------------------------------------------------------
# Dungeon generation parameters
# ---------------------------------------------------------------------------
MAX_ROOMS = 9
MIN_ROOM_SIZE = 4
MAX_ROOM_SIZE = 10
MAX_DUNGEON_LEVEL = 26   # Amulet of Yendor is on level 26

# ---------------------------------------------------------------------------
# Tile type identifiers
# ---------------------------------------------------------------------------
TILE_VOID = 0       # Undiscovered space
TILE_FLOOR = 1      # Room floor
TILE_WALL_H = 2     # Horizontal wall  (-)
TILE_WALL_V = 3     # Vertical wall    (|)
TILE_WALL_C = 4     # Corner/junction  (+)
TILE_CORRIDOR = 5   # Corridor passage (#)
TILE_DOOR = 6       # Door             (+)
TILE_STAIRS_DN = 7  # Stairs down      (>)
TILE_STAIRS_UP = 8  # Stairs up        (<)

# Display characters (original Rogue aesthetics)
TILE_CHARS = {
    TILE_VOID:      ' ',
    TILE_FLOOR:     '.',
    TILE_WALL_H:    '-',
    TILE_WALL_V:    '|',
    TILE_WALL_C:    '+',
    TILE_CORRIDOR:  '#',
    TILE_DOOR:      '+',
    TILE_STAIRS_DN: '>',
    TILE_STAIRS_UP: '<',
}

# ---------------------------------------------------------------------------
# Colour palette  (R, G, B) — 0..255 integers
# ---------------------------------------------------------------------------
BLACK      = (  0,   0,   0)
WHITE      = (255, 255, 255)
RED        = (200,  50,  50)
DARK_RED   = (140,  20,  20)
GREEN      = ( 50, 200,  50)
DARK_GREEN = ( 20, 120,  20)
BLUE       = ( 80, 120, 220)
YELLOW     = (220, 220,  50)
GOLD       = (220, 180,  30)
CYAN       = ( 50, 210, 210)
MAGENTA    = (200,  80, 200)
ORANGE     = (220, 140,  40)
BROWN      = (160, 100,  40)
DARK_BROWN = (100,  60,  20)
GRAY       = (128, 128, 128)
DARK_GRAY  = ( 80,  80,  80)
LIGHT_GRAY = (192, 192, 192)
PURPLE     = (140,  60, 200)

# Foreground colour per tile type (full visibility)
TILE_FG = {
    TILE_VOID:      BLACK,
    TILE_FLOOR:     DARK_GRAY,
    TILE_WALL_H:    BROWN,
    TILE_WALL_V:    BROWN,
    TILE_WALL_C:    BROWN,
    TILE_CORRIDOR:  DARK_GRAY,
    TILE_DOOR:      BROWN,
    TILE_STAIRS_DN: YELLOW,
    TILE_STAIRS_UP: YELLOW,
}

# Dimmed (explored but not currently visible) — ≈30 % brightness
TILE_FG_DIM = {k: tuple(c * 3 // 10 for c in v) for k, v in TILE_FG.items()}

# ---------------------------------------------------------------------------
# Entity colours
# ---------------------------------------------------------------------------
PLAYER_COLOR  = WHITE
GOLD_COLOR    = GOLD
FOOD_COLOR    = ORANGE
WEAPON_COLOR  = LIGHT_GRAY
ARMOR_COLOR   = CYAN
POTION_COLOR  = MAGENTA
SCROLL_COLOR  = YELLOW
RING_COLOR    = GREEN
WAND_COLOR    = BLUE
AMULET_COLOR  = GOLD

# ---------------------------------------------------------------------------
# Player starting stats
# ---------------------------------------------------------------------------
PLAYER_START_HP  = 12
PLAYER_START_STR = 16
PLAYER_START_AC  = 10   # Lower is better (Rogue/D&D convention)
PLAYER_START_EXP = 1
PLAYER_EXP_TABLE = [
    0, 10, 20, 40, 80, 160, 320, 640, 1280, 2560,
    5120, 10240, 20480, 40960, 81920, 163840, 327680,
    655360, 1310720, 2621440, 5242880, 10485760,
    20971520, 41943040, 83886080, 167772160,
]

# ---------------------------------------------------------------------------
# Hunger system  (turns remaining)
# ---------------------------------------------------------------------------
HUNGER_FULL       = 1300
HUNGER_HUNGRY     = 300
HUNGER_WEAK       = 150
HUNGER_FAINT      = 20

HUNGER_LABELS = {
    HUNGER_FULL:  "Full",
    HUNGER_HUNGRY: "Hungry",
    HUNGER_WEAK:  "Weak",
    HUNGER_FAINT: "Faint",
    0:            "Starving",
}

# ---------------------------------------------------------------------------
# Status effect durations (turns)
# ---------------------------------------------------------------------------
CONFUSED_TURNS  = 20
BLIND_TURNS     = 850
HASTED_TURNS    = 14
POISONED_TURNS  = 40
HALLUC_TURNS    = 850
SLEEPING_TURNS  = 5
FROZEN_TURNS    = 3

# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------
MAX_INVENTORY = 26   # slots a–z

# ---------------------------------------------------------------------------
# Viewport / rendering
# ---------------------------------------------------------------------------
VIEWPORT_W = 40   # tiles visible horizontally (centred on player)
VIEWPORT_H = 18   # tiles visible vertically
