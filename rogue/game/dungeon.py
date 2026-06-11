"""Procedural dungeon generation and field-of-view for the Rogue clone.

Dungeon layout follows the classic Rogue style:
 - Up to MAX_ROOMS rectangular rooms scattered across the map
 - Rooms connected by L-shaped corridors
 - Doors placed where corridors meet room walls
 - Stairs (down / up) placed in random rooms
 - Field-of-view: rooms are fully lit when the player is inside;
   corridors reveal only adjacent tiles (authentic Rogue behaviour)
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import List, Optional, Set, Tuple

from .constants import (
    MAP_WIDTH, MAP_HEIGHT, MAX_ROOMS, MIN_ROOM_SIZE, MAX_ROOM_SIZE,
    TILE_VOID, TILE_FLOOR, TILE_WALL_H, TILE_WALL_V, TILE_WALL_C,
    TILE_CORRIDOR, TILE_DOOR, TILE_STAIRS_DN, TILE_STAIRS_UP,
)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Rect:
    """An axis-aligned rectangle representing a room."""
    x: int
    y: int
    w: int
    h: int

    # Inclusive bounds
    @property
    def x1(self) -> int: return self.x
    @property
    def y1(self) -> int: return self.y
    @property
    def x2(self) -> int: return self.x + self.w - 1
    @property
    def y2(self) -> int: return self.y + self.h - 1

    @property
    def centre(self) -> Tuple[int, int]:
        return (self.x + self.w // 2, self.y + self.h // 2)

    def intersects(self, other: "Rect", margin: int = 1) -> bool:
        return (
            self.x1 - margin <= other.x2 + margin and
            self.x2 + margin >= other.x1 - margin and
            self.y1 - margin <= other.y2 + margin and
            self.y2 + margin >= other.y1 - margin
        )

    def random_interior(self) -> Tuple[int, int]:
        """Return a random floor tile (inside walls)."""
        return (
            random.randint(self.x1 + 1, self.x2 - 1),
            random.randint(self.y1 + 1, self.y2 - 1),
        )


# ---------------------------------------------------------------------------
# Dungeon class
# ---------------------------------------------------------------------------

class Dungeon:
    """Holds the tile grid, FOV state, and all entity spawn positions."""

    def __init__(self, level: int, rng: Optional[random.Random] = None):
        self.level = level
        self.rng = rng or random.Random()

        # 2-D grids (row = y, col = x)
        self.tiles: List[List[int]] = [
            [TILE_VOID] * MAP_WIDTH for _ in range(MAP_HEIGHT)
        ]
        self.visible: List[List[bool]] = [
            [False] * MAP_WIDTH for _ in range(MAP_HEIGHT)
        ]
        self.explored: List[List[bool]] = [
            [False] * MAP_WIDTH for _ in range(MAP_HEIGHT)
        ]

        self.rooms: List[Rect] = []

        # Spawn points populated during generation
        self.player_start: Tuple[int, int] = (0, 0)
        self.stairs_down: Optional[Tuple[int, int]] = None
        self.stairs_up:   Optional[Tuple[int, int]] = None
        self.monster_spawns: List[Tuple[int, int]] = []
        self.item_spawns:    List[Tuple[int, int]] = []

        self._generate()

    # ------------------------------------------------------------------
    # Tile helpers
    # ------------------------------------------------------------------

    def tile(self, x: int, y: int) -> int:
        if 0 <= x < MAP_WIDTH and 0 <= y < MAP_HEIGHT:
            return self.tiles[y][x]
        return TILE_VOID

    def set_tile(self, x: int, y: int, t: int) -> None:
        if 0 <= x < MAP_WIDTH and 0 <= y < MAP_HEIGHT:
            self.tiles[y][x] = t

    def is_walkable(self, x: int, y: int) -> bool:
        t = self.tile(x, y)
        return t in (TILE_FLOOR, TILE_CORRIDOR, TILE_DOOR,
                     TILE_STAIRS_DN, TILE_STAIRS_UP)

    def in_room(self, x: int, y: int) -> Optional[Rect]:
        """Return the room that contains (x, y), or None."""
        for r in self.rooms:
            if r.x1 < x < r.x2 and r.y1 < y < r.y2:
                return r
        return None

    # ------------------------------------------------------------------
    # FOV  (authentic Rogue behaviour)
    # ------------------------------------------------------------------

    def compute_fov(self, px: int, py: int) -> None:
        """Update visible grid based on player position.

        Rules:
          * If the player is inside a room: the entire room interior is lit.
          * Corridor tiles: only the 8 immediate neighbours are visible.
          * Doors are always visible from either side.
        """
        # Clear current visibility
        for y in range(MAP_HEIGHT):
            for x in range(MAP_WIDTH):
                self.visible[y][x] = False

        room = self.in_room(px, py)
        if room:
            # Reveal whole room interior (and its walls)
            for y in range(room.y1, room.y2 + 1):
                for x in range(room.x1, room.x2 + 1):
                    self.visible[y][x] = True
                    self.explored[y][x] = True
            # Also reveal adjacent corridor/door tiles so the player can
            # see the exits
            for y in range(room.y1 - 1, room.y2 + 2):
                for x in range(room.x1 - 1, room.x2 + 2):
                    if 0 <= x < MAP_WIDTH and 0 <= y < MAP_HEIGHT:
                        t = self.tiles[y][x]
                        if t in (TILE_CORRIDOR, TILE_DOOR):
                            self.visible[y][x] = True
                            self.explored[y][x] = True
        else:
            # Corridor: reveal self + 8 neighbours
            for dy in range(-1, 2):
                for dx in range(-1, 2):
                    nx, ny = px + dx, py + dy
                    if 0 <= nx < MAP_WIDTH and 0 <= ny < MAP_HEIGHT:
                        t = self.tiles[ny][nx]
                        if t != TILE_VOID:
                            self.visible[ny][nx] = True
                            self.explored[ny][nx] = True

    # ------------------------------------------------------------------
    # Dungeon generation
    # ------------------------------------------------------------------

    def _generate(self) -> None:
        self._place_rooms()
        self._connect_rooms()
        self._place_stairs()
        self._choose_spawns()

    def _place_rooms(self) -> None:
        """Attempt to place MAX_ROOMS non-overlapping rooms."""
        attempts = 0
        while len(self.rooms) < MAX_ROOMS and attempts < 200:
            attempts += 1
            w = self.rng.randint(MIN_ROOM_SIZE, MAX_ROOM_SIZE)
            h = self.rng.randint(MIN_ROOM_SIZE, MAX_ROOM_SIZE)
            # Leave a 1-tile border so walls don't touch the map edge
            x = self.rng.randint(1, MAP_WIDTH  - w - 2)
            y = self.rng.randint(1, MAP_HEIGHT - h - 2)
            room = Rect(x, y, w, h)

            if any(room.intersects(r) for r in self.rooms):
                continue

            self._carve_room(room)
            self.rooms.append(room)

        if not self.rooms:
            # Fallback: single central room
            room = Rect(5, 5, 20, 10)
            self._carve_room(room)
            self.rooms.append(room)

    def _carve_room(self, room: Rect) -> None:
        """Write wall and floor tiles for a room."""
        for y in range(room.y1, room.y2 + 1):
            for x in range(room.x1, room.x2 + 1):
                if y == room.y1 or y == room.y2:
                    self.set_tile(x, y, TILE_WALL_H)
                elif x == room.x1 or x == room.x2:
                    self.set_tile(x, y, TILE_WALL_V)
                else:
                    self.set_tile(x, y, TILE_FLOOR)
        # Corners
        for cx, cy in [(room.x1, room.y1), (room.x2, room.y1),
                       (room.x1, room.y2), (room.x2, room.y2)]:
            self.set_tile(cx, cy, TILE_WALL_C)

    def _connect_rooms(self) -> None:
        """Connect consecutive rooms (sorted by centre-x) with corridors."""
        sorted_rooms = sorted(self.rooms, key=lambda r: r.centre[0])
        for i in range(len(sorted_rooms) - 1):
            self._carve_corridor(sorted_rooms[i], sorted_rooms[i + 1])

        # Also connect room 0 to the last room so all rooms are reachable
        if len(sorted_rooms) > 2:
            self._carve_corridor(sorted_rooms[0], sorted_rooms[-1])

    def _carve_corridor(self, a: Rect, b: Rect) -> None:
        """Carve an L-shaped corridor from room a to room b."""
        ax, ay = a.centre
        bx, by = b.centre

        # Randomly decide if we go horizontal-first or vertical-first
        if self.rng.random() < 0.5:
            self._hcorridor(ax, bx, ay)
            self._vcorridor(ay, by, bx)
            corner = (bx, ay)
        else:
            self._vcorridor(ay, by, ax)
            self._hcorridor(ax, bx, by)
            corner = (ax, by)

        # Mark the corner tile as corridor if it's currently void
        cx, cy = corner
        if self.tile(cx, cy) == TILE_VOID:
            self.set_tile(cx, cy, TILE_CORRIDOR)

    def _hcorridor(self, x1: int, x2: int, y: int) -> None:
        for x in range(min(x1, x2), max(x1, x2) + 1):
            t = self.tile(x, y)
            if t in (TILE_VOID, TILE_WALL_H, TILE_WALL_V, TILE_WALL_C):
                # Punch a door if we're hitting a room wall, else corridor
                if t in (TILE_WALL_H, TILE_WALL_V, TILE_WALL_C):
                    self.set_tile(x, y, TILE_DOOR)
                else:
                    self.set_tile(x, y, TILE_CORRIDOR)

    def _vcorridor(self, y1: int, y2: int, x: int) -> None:
        for y in range(min(y1, y2), max(y1, y2) + 1):
            t = self.tile(x, y)
            if t in (TILE_VOID, TILE_WALL_H, TILE_WALL_V, TILE_WALL_C):
                if t in (TILE_WALL_H, TILE_WALL_V, TILE_WALL_C):
                    self.set_tile(x, y, TILE_DOOR)
                else:
                    self.set_tile(x, y, TILE_CORRIDOR)

    def _place_stairs(self) -> None:
        """Place stairs in random rooms (never the same room)."""
        if len(self.rooms) < 2:
            r = self.rooms[0]
            cx, cy = r.centre
            self.stairs_down = (cx, cy)
            self.player_start = (cx - 1, cy)
            return

        shuffled = self.rooms[:]
        self.rng.shuffle(shuffled)

        # Player start — first room
        self.player_start = shuffled[0].random_interior()

        # Stairs down — last room
        self.stairs_down = shuffled[-1].random_interior()
        self.set_tile(*self.stairs_down, TILE_STAIRS_DN)

        # Stairs up — second-to-last room (not the same room as down)
        if len(shuffled) >= 3:
            self.stairs_up = shuffled[-2].random_interior()
            self.set_tile(*self.stairs_up, TILE_STAIRS_UP)

    def _choose_spawns(self) -> None:
        """Pick candidate positions for monsters and items."""
        candidates: List[Tuple[int, int]] = []
        for r in self.rooms:
            for _ in range(r.w * r.h):
                pos = r.random_interior()
                t = self.tile(*pos)
                if t == TILE_FLOOR and pos != self.player_start:
                    candidates.append(pos)

        self.rng.shuffle(candidates)
        seen: Set[Tuple[int, int]] = {self.player_start}
        unique = []
        for pos in candidates:
            if pos not in seen:
                unique.append(pos)
                seen.add(pos)

        # Split candidates between monsters and items
        total = len(unique)
        n_monsters = min(total // 2, max(3, self.level + 2))
        n_items    = min(total - n_monsters, max(2, 4 + self.level // 3))

        self.monster_spawns = unique[:n_monsters]
        self.item_spawns    = unique[n_monsters: n_monsters + n_items]

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def walkable_neighbours(self, x: int, y: int) -> List[Tuple[int, int]]:
        result = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                if self.is_walkable(nx, ny):
                    result.append((nx, ny))
        return result

    def path_to(self, sx: int, sy: int, tx: int, ty: int,
                blocked: Set[Tuple[int, int]] | None = None) -> List[Tuple[int, int]]:
        """BFS path from (sx, sy) to (tx, ty). Returns list of (x,y) steps."""
        from collections import deque
        blocked = blocked or set()
        queue: deque = deque()
        queue.append((sx, sy))
        came_from: dict = {(sx, sy): None}

        while queue:
            cx, cy = queue.popleft()
            if (cx, cy) == (tx, ty):
                break
            for nx, ny in self.walkable_neighbours(cx, cy):
                if (nx, ny) not in came_from and (nx, ny) not in blocked:
                    came_from[(nx, ny)] = (cx, cy)
                    queue.append((nx, ny))

        if (tx, ty) not in came_from:
            return []

        path = []
        cur: Optional[Tuple[int, int]] = (tx, ty)
        while cur and cur != (sx, sy):
            path.append(cur)
            cur = came_from[cur]
        path.reverse()
        return path
