"""Inventory screen — list items with Use / Drop / Equip actions."""

from __future__ import annotations

from typing import Callable, TYPE_CHECKING

from kivy.uix.screenmanager import Screen
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.scrollview import ScrollView
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.gridlayout import GridLayout
from kivy.graphics import Color, Rectangle
from kivy.metrics import dp

if TYPE_CHECKING:
    from ..screens.game_screen import GameScreen


class InventoryScreen(Screen):
    """Shows the player's inventory with Use, Equip and Drop buttons."""

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self._game_screen: "GameScreen | None" = None

        root = BoxLayout(orientation="vertical")

        # Header
        header = BoxLayout(size_hint_y=None, height=dp(44))
        with header.canvas.before:
            Color(0.1, 0.1, 0.2, 1)
            self._hbg = Rectangle(pos=header.pos, size=header.size)
        header.bind(pos=lambda *_: setattr(self._hbg, 'pos', header.pos),
                    size=lambda *_: setattr(self._hbg, 'size', header.size))

        title = Label(text="[b]Inventory[/b]", markup=True, font_size="16sp",
                      size_hint_x=0.7)
        close_btn = Button(text="Close", size_hint_x=0.3,
                           background_color=(0.4, 0.1, 0.1, 1),
                           background_normal="")
        close_btn.bind(on_press=self._close)
        header.add_widget(title)
        header.add_widget(close_btn)
        root.add_widget(header)

        # Scrollable item list
        self._scroll = ScrollView(size_hint=(1, 1))
        self._item_list = GridLayout(
            cols=1,
            size_hint_y=None,
            spacing=dp(2),
            padding=dp(4),
        )
        self._item_list.bind(minimum_height=self._item_list.setter("height"))
        self._scroll.add_widget(self._item_list)
        root.add_widget(self._scroll)

        with root.canvas.before:
            Color(0.05, 0.05, 0.1, 1)
            self._bg = Rectangle(pos=root.pos, size=root.size)
        root.bind(pos=lambda *_: setattr(self._bg, 'pos', root.pos),
                  size=lambda *_: setattr(self._bg, 'size', root.size))

        self.add_widget(root)

    def open_for(self, game_screen: "GameScreen") -> None:
        """Populate the inventory list from the current game state."""
        self._game_screen = game_screen
        self._rebuild()

    def _rebuild(self) -> None:
        self._item_list.clear_widgets()
        engine = self._game_screen.engine
        player = engine.player

        if not player.inventory:
            lbl = Label(text="[color=aaaaaa](empty)[/color]", markup=True,
                        size_hint_y=None, height=dp(40))
            self._item_list.add_widget(lbl)
            return

        for idx, item in enumerate(player.inventory):
            slot = chr(ord('a') + idx)
            row  = self._make_row(slot, item, engine)
            self._item_list.add_widget(row)

    def _make_row(self, slot: str, item, engine) -> BoxLayout:
        row = BoxLayout(orientation="horizontal", size_hint_y=None, height=dp(46),
                        spacing=dp(4))
        with row.canvas.before:
            Color(0.12, 0.12, 0.18, 1)
            rect = Rectangle(pos=row.pos, size=row.size)
        row.bind(pos=lambda *_, r=rect: setattr(r, 'pos', row.pos),
                 size=lambda *_, r=rect: setattr(r, 'size', row.size))

        equipped = ""
        if engine.player.weapon is item:
            equipped = " [color=ffff00](wielding)[/color]"
        elif engine.player.armor is item:
            equipped = " [color=00ffff](wearing)[/color]"

        name_lbl = Label(
            text=f"[b]({slot})[/b] {item.display_name()}{equipped}",
            markup=True,
            font_size="13sp",
            halign="left",
            valign="middle",
            size_hint_x=0.6,
        )
        name_lbl.bind(size=lambda w, s: setattr(w, 'text_size', s))
        row.add_widget(name_lbl)

        use_btn = Button(text="Use", size_hint_x=0.2,
                         background_color=(0.2, 0.4, 0.2, 1),
                         background_normal="", font_size="12sp")
        use_btn.bind(on_press=lambda _, i=item: self._use_item(i))
        row.add_widget(use_btn)

        drop_btn = Button(text="Drop", size_hint_x=0.2,
                          background_color=(0.4, 0.2, 0.1, 1),
                          background_normal="", font_size="12sp")
        drop_btn.bind(on_press=lambda _, i=item: self._drop_item(i))
        row.add_widget(drop_btn)

        return row

    def _use_item(self, item) -> None:
        engine = self._game_screen.engine
        engine.action_use_item(item)
        self._game_screen.refresh()
        self._rebuild()
        # If we entered identify mode, close inventory so player can see
        from ...game.engine import STATE_IDENTIFY
        if engine.state == STATE_IDENTIFY:
            self._open_identify()

    def _drop_item(self, item) -> None:
        self._game_screen.engine.action_drop_item(item)
        self._game_screen.refresh()
        self._rebuild()

    def _open_identify(self) -> None:
        """Switch to identify-item mode in the inventory."""
        engine = self._game_screen.engine
        # Rebuild with "Identify" buttons
        self._item_list.clear_widgets()
        lbl = Label(text="[color=ffff00]Choose an item to identify:[/color]",
                    markup=True, size_hint_y=None, height=dp(40))
        self._item_list.add_widget(lbl)
        for idx, item in enumerate(engine.player.inventory):
            slot = chr(ord('a') + idx)
            btn = Button(
                text=f"({slot}) {item.display_name()}",
                size_hint_y=None,
                height=dp(46),
                background_color=(0.2, 0.2, 0.4, 1),
                background_normal="",
                font_size="13sp",
            )
            btn.bind(on_press=lambda _, i=item: self._do_identify(i))
            self._item_list.add_widget(btn)

    def _do_identify(self, item) -> None:
        self._game_screen.engine.action_identify_item(item)
        self._game_screen.refresh()
        self._rebuild()

    def _close(self, *_) -> None:
        if self._game_screen:
            self._game_screen.manager.current = "game"
