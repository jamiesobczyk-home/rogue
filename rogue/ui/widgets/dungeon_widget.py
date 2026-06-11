"""Canvas-based dungeon renderer for the Rogue mobile game.

Renders the dungeon tile grid centred on the player.  Each tile is drawn
as a coloured rectangle; entity characters are overlaid using pre-cached
CoreLabel textures for efficient reuse across turns.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from kivy.uix.widget import Widget
from kivy.graphics import Color, Rectangle
from kivy.core.text import Label as CoreLabel
from kivy.core.window import Window

from ...game.constants import (
    MAP_WIDTH, MAP_HEIGHT, TILE_VOID, TILE_CHARS, TILE_FG, TILE_FG_DIM,
    VIEWPORT_W, VIEWPORT_H, BLACK,
)


# ---------------------------------------------------------------------------
# Tile size selection
# ---------------------------------------------------------------------------

def _calc_tile_size(widget_w: float, widget_h: float) -> int:
    tw = int(widget_w / VIEWPORT_W)
    th = int(widget_h / VIEWPORT_H)
    return max(12, min(tw, th))


# ---------------------------------------------------------------------------
# DungeonWidget
# ---------------------------------------------------------------------------

class DungeonWidget(Widget):
    """Draws the dungeon, monsters and items on its Kivy canvas."""

    # Shared texture cache across all instances:  (char, r, g, b) → Texture
    _tex_cache: Dict[Tuple, object] = {}

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self._render_data: Optional[dict] = None
        self.tile_size = 18
        self.bind(size=self._on_size)

    def _on_size(self, *_) -> None:
        self.tile_size = _calc_tile_size(self.width, self.height)
        if self._render_data:
            self.render(self._render_data)

    # ------------------------------------------------------------------
    # Public API called by the game screen
    # ------------------------------------------------------------------

    def render(self, data: dict) -> None:
        """Redraw the entire dungeon from render data returned by GameEngine."""
        self._render_data = data
        if not data:
            return

        px, py = data["player"][:2]
        ts = self.tile_size

        # Compute the top-left tile of the viewport (centred on player)
        half_w = VIEWPORT_W // 2
        half_h = VIEWPORT_H // 2
        vx = max(0, min(px - half_w, MAP_WIDTH  - VIEWPORT_W))
        vy = max(0, min(py - half_h, MAP_HEIGHT - VIEWPORT_H))

        self._vx = vx
        self._vy = vy

        self.canvas.clear()
        with self.canvas:
            # Background — black void
            Color(0, 0, 0, 1)
            Rectangle(pos=self.pos, size=self.size)

            tiles = data["tiles"]

            # Draw tiles
            for ty in range(VIEWPORT_H):
                for tx in range(VIEWPORT_W):
                    mx = vx + tx
                    my = vy + ty
                    if mx >= MAP_WIDTH or my >= MAP_HEIGHT:
                        continue
                    tile_id, visible, explored = tiles[my][mx]
                    if tile_id == TILE_VOID and not explored:
                        continue
                    if not explored:
                        continue

                    char = TILE_CHARS.get(tile_id, ' ')
                    if visible:
                        fg = TILE_FG.get(tile_id, (80, 80, 80))
                    else:
                        fg = TILE_FG_DIM.get(tile_id, (20, 20, 20))

                    sx = self.x + tx * ts
                    sy = self.y + (VIEWPORT_H - 1 - ty) * ts

                    self._draw_char(char, fg, sx, sy, ts)

            # Draw items (only those in viewport)
            for ix, iy, ichar, icolor, ivisible in data.get("items", []):
                tx = ix - vx
                ty = iy - vy
                if not (0 <= tx < VIEWPORT_W and 0 <= ty < VIEWPORT_H):
                    continue
                if not ivisible and not tiles[iy][ix][2]:
                    continue
                alpha = 1.0 if ivisible else 0.4
                sx = self.x + tx * ts
                sy = self.y + (VIEWPORT_H - 1 - ty) * ts
                self._draw_char(ichar,
                                tuple(int(c * alpha) for c in icolor),
                                sx, sy, ts)

            # Draw monsters
            for mx2, my2, mchar, mcolor, mvisible in data.get("monsters", []):
                tx = mx2 - vx
                ty = my2 - vy
                if not (0 <= tx < VIEWPORT_W and 0 <= ty < VIEWPORT_H):
                    continue
                if not mvisible:
                    continue
                sx = self.x + tx * ts
                sy = self.y + (VIEWPORT_H - 1 - ty) * ts
                self._draw_char(mchar, mcolor, sx, sy, ts)

            # Draw player
            ppx, ppy, pchar, pcolor = data["player"]
            tx = ppx - vx
            ty = ppy - vy
            if 0 <= tx < VIEWPORT_W and 0 <= ty < VIEWPORT_H:
                sx = self.x + tx * ts
                sy = self.y + (VIEWPORT_H - 1 - ty) * ts
                self._draw_char(pchar, pcolor, sx, sy, ts)

    # ------------------------------------------------------------------
    # Touch → map tile coordinate
    # ------------------------------------------------------------------

    def touch_to_map(self, touch_x: float, touch_y: float) -> Optional[Tuple[int, int]]:
        """Convert a screen touch position to a map (x, y) tile coordinate."""
        ts = self.tile_size
        tx = int((touch_x - self.x) / ts)
        ty = VIEWPORT_H - 1 - int((touch_y - self.y) / ts)
        mx = getattr(self, '_vx', 0) + tx
        my = getattr(self, '_vy', 0) + ty
        if 0 <= mx < MAP_WIDTH and 0 <= my < MAP_HEIGHT:
            return (mx, my)
        return None

    # ------------------------------------------------------------------
    # Drawing primitives
    # ------------------------------------------------------------------

    def _draw_char(
        self,
        char: str,
        color: Tuple[int, int, int],
        sx: float,
        sy: float,
        ts: int,
    ) -> None:
        """Draw a single character tile at screen position (sx, sy)."""
        if char == ' ':
            return
        r, g, b = color
        tex = self._get_texture(char, r, g, b, ts)
        if tex:
            Color(1, 1, 1, 1)
            Rectangle(texture=tex, pos=(sx, sy), size=(ts, ts))

    def _get_texture(self, char: str, r: int, g: int, b: int, ts: int):
        key = (char, r, g, b, ts)
        if key not in DungeonWidget._tex_cache:
            lbl = CoreLabel(
                text=char,
                font_size=ts,
                bold=True,
                color=(r / 255.0, g / 255.0, b / 255.0, 1.0),
            )
            lbl.refresh()
            DungeonWidget._tex_cache[key] = lbl.texture
        return DungeonWidget._tex_cache[key]
