"""On-screen touch controls — D-pad and action buttons."""

from __future__ import annotations

from typing import Callable, Optional

from kivy.uix.widget import Widget
from kivy.uix.button import Button
from kivy.uix.gridlayout import GridLayout
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.label import Label
from kivy.graphics import Color, Ellipse, Rectangle, Line
from kivy.metrics import dp


# ---------------------------------------------------------------------------
# D-pad
# ---------------------------------------------------------------------------

# Maps button label → (dx, dy)
_DPAD_MOVES = {
    "↖": (-1, -1), "↑": (0, -1), "↗": (1, -1),
    "←": (-1,  0), "·": (0,  0), "→": (1,  0),
    "↙": (-1,  1), "↓": (0,  1), "↘": (1,  1),
}


class DPadWidget(GridLayout):
    """3×3 directional pad.  Centre button = wait."""

    def __init__(self, on_move: Callable[[int, int], None], **kwargs) -> None:
        super().__init__(cols=3, rows=3, spacing=dp(2), **kwargs)
        self.on_move_cb = on_move
        labels = ["↖", "↑", "↗",
                  "←", "·", "→",
                  "↙", "↓", "↘"]
        for label in labels:
            btn = Button(
                text=label,
                font_size="22sp",
                background_color=(0.2, 0.2, 0.3, 1),
                background_normal="",
                color=(0.9, 0.9, 1.0, 1),
                bold=True,
            )
            dx, dy = _DPAD_MOVES[label]
            btn.bind(on_press=lambda _btn, x=dx, y=dy: self.on_move_cb(x, y))
            self.add_widget(btn)


# ---------------------------------------------------------------------------
# Action button bar
# ---------------------------------------------------------------------------

class ActionBar(BoxLayout):
    """Row of action buttons (pickup, inventory, descend, ascend, wait)."""

    def __init__(
        self,
        on_pickup:    Callable,
        on_inventory: Callable,
        on_descend:   Callable,
        on_ascend:    Callable,
        on_wait:      Callable,
        **kwargs,
    ) -> None:
        super().__init__(
            orientation="horizontal",
            spacing=dp(3),
            **kwargs,
        )
        specs = [
            ("Pick up\n,", on_pickup,    (0.2, 0.3, 0.2, 1)),
            ("Inv\ni",     on_inventory, (0.2, 0.2, 0.3, 1)),
            ("Down\n>",    on_descend,   (0.3, 0.2, 0.2, 1)),
            ("Up\n<",      on_ascend,    (0.3, 0.3, 0.1, 1)),
            ("Wait\n.",    on_wait,      (0.25, 0.25, 0.25, 1)),
        ]
        for text, cb, color in specs:
            btn = Button(
                text=text,
                font_size="12sp",
                background_color=color,
                background_normal="",
                color=(1, 1, 1, 1),
                halign="center",
            )
            btn.bind(on_press=lambda _btn, callback=cb: callback())
            self.add_widget(btn)


# ---------------------------------------------------------------------------
# Combined control area
# ---------------------------------------------------------------------------

class ControlsWidget(BoxLayout):
    """D-pad on the left, action buttons on the right."""

    def __init__(
        self,
        on_move:      Callable[[int, int], None],
        on_pickup:    Callable,
        on_inventory: Callable,
        on_descend:   Callable,
        on_ascend:    Callable,
        on_wait:      Callable,
        **kwargs,
    ) -> None:
        super().__init__(
            orientation="horizontal",
            size_hint_y=None,
            height=dp(160),
            spacing=dp(6),
            padding=dp(4),
            **kwargs,
        )
        # Left: D-pad (square region)
        dpad = DPadWidget(on_move=on_move, size_hint=(None, 1), width=dp(160))
        self.add_widget(dpad)

        # Right: action buttons stacked vertically
        actions = ActionBar(
            on_pickup=on_pickup,
            on_inventory=on_inventory,
            on_descend=on_descend,
            on_ascend=on_ascend,
            on_wait=on_wait,
            size_hint=(1, 1),
        )
        self.add_widget(actions)
