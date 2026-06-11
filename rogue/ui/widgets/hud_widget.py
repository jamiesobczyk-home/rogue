"""HUD (heads-up display) widget showing player stats."""

from __future__ import annotations

from kivy.uix.boxlayout import BoxLayout
from kivy.uix.label import Label
from kivy.graphics import Color, Rectangle

from ...game.constants import (
    HUNGER_FULL, HUNGER_HUNGRY, HUNGER_WEAK, HUNGER_FAINT,
)


def _hunger_label(hunger: int) -> str:
    if hunger >= HUNGER_HUNGRY:
        return ""
    if hunger >= HUNGER_WEAK:
        return " [color=ffaa00]Hungry[/color]"
    if hunger >= HUNGER_FAINT:
        return " [color=ff4400]Weak[/color]"
    if hunger > 0:
        return " [color=ff0000]Faint[/color]"
    return " [color=ff0000]Starving![/color]"


def _status_flags(hud: dict) -> str:
    flags = []
    if hud.get("confused"):  flags.append("[color=ffaa00]Conf[/color]")
    if hud.get("blinded"):   flags.append("[color=555555]Blind[/color]")
    if hud.get("hasted"):    flags.append("[color=00ffaa]Haste[/color]")
    if hud.get("poisoned"):  flags.append("[color=88ff00]Pois[/color]")
    if hud.get("frozen"):    flags.append("[color=88ccff]Frz[/color]")
    if hud.get("has_amulet"):flags.append("[color=ffd700]Amulet[/color]")
    return "  ".join(flags)


class HudWidget(BoxLayout):
    """Two-line status bar rendered above the dungeon."""

    def __init__(self, **kwargs) -> None:
        super().__init__(orientation='vertical', size_hint_y=None, height=56,
                         **kwargs)
        self._line1 = Label(
            markup=True,
            font_size="13sp",
            halign="left",
            valign="middle",
            size_hint_y=0.5,
            text_size=(None, None),
        )
        self._line2 = Label(
            markup=True,
            font_size="13sp",
            halign="left",
            valign="middle",
            size_hint_y=0.5,
            text_size=(None, None),
        )
        self.add_widget(self._line1)
        self.add_widget(self._line2)

        with self.canvas.before:
            Color(0.1, 0.1, 0.15, 1)
            self._bg_rect = Rectangle(pos=self.pos, size=self.size)
        self.bind(pos=self._update_bg, size=self._update_bg)

    def _update_bg(self, *_) -> None:
        self._bg_rect.pos  = self.pos
        self._bg_rect.size = self.size

    def update(self, hud: dict) -> None:
        hp     = hud["hp"]
        max_hp = hud["max_hp"]
        hp_color = "00ff00" if hp > max_hp * 0.5 else (
                   "ffaa00" if hp > max_hp * 0.25 else "ff0000")

        line1 = (
            f"[b]HP:[/b][color={hp_color}]{hp}/{max_hp}[/color]  "
            f"[b]Str:[/b]{hud['str']}  "
            f"[b]AC:[/b]{hud['ac']}  "
            f"[b]Lv:[/b]{hud['level']}  "
            f"[b]Exp:[/b]{hud['exp']}"
            f"{_hunger_label(hud['hunger'])}"
        )
        line2 = (
            f"[b]Gold:[/b]{hud['gold']}  "
            f"[b]Dlv:[/b]{hud['dlevel']}  "
            f"[b]Turn:[/b]{hud['turn']}  "
            f"{_status_flags(hud)}"
        )
        self._line1.markup   = True
        self._line1.text     = "  " + line1
        self._line2.markup   = True
        self._line2.text     = "  " + line2
