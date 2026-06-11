"""Main menu screen."""

from __future__ import annotations

from typing import Callable

from kivy.uix.screenmanager import Screen
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.label import Label
from kivy.uix.button import Button
from kivy.uix.widget import Widget
from kivy.graphics import Color, Rectangle
from kivy.metrics import dp


_SPLASH = """\
         ######    ######    #####   ##   ##  #######
         ##   ##  ##    ##  ##   ##  ##   ##  ##
         ######   ##    ##  ##       ##   ##  #####
         ##   ##  ##    ##  ##   ##  ##   ##  ##
         ##   ##   ######    #####    #####   #######

          Retrieve the Amulet of Yendor from level 26!
"""


class MenuScreen(Screen):

    def __init__(self, on_new_game: Callable, **kwargs) -> None:
        super().__init__(**kwargs)
        self._on_new_game = on_new_game

        root = BoxLayout(orientation="vertical", padding=dp(24), spacing=dp(12))

        with root.canvas.before:
            Color(0.05, 0.05, 0.05, 1)
            self._bg = Rectangle(pos=root.pos, size=root.size)
        root.bind(pos=lambda *_: setattr(self._bg, 'pos', root.pos),
                  size=lambda *_: setattr(self._bg, 'size', root.size))

        root.add_widget(Widget(size_hint_y=0.1))

        splash = Label(
            text=f"[font_name=RobotoMono][color=00ff88]{_SPLASH}[/color][/font_name]",
            markup=True,
            font_size="9sp",
            halign="center",
            size_hint_y=None,
            height=dp(120),
        )
        root.add_widget(splash)

        title = Label(
            text="[b][color=ffd700]ROGUE[/color][/b]",
            markup=True,
            font_size="48sp",
            halign="center",
            size_hint_y=None,
            height=dp(80),
        )
        root.add_widget(title)

        subtitle = Label(
            text="[color=aaaaaa]The Original Dungeon Crawler[/color]",
            markup=True,
            font_size="16sp",
            halign="center",
            size_hint_y=None,
            height=dp(30),
        )
        root.add_widget(subtitle)

        root.add_widget(Widget(size_hint_y=0.2))

        start_btn = Button(
            text="[b]New Game[/b]",
            markup=True,
            font_size="22sp",
            size_hint=(0.6, None),
            height=dp(60),
            pos_hint={"center_x": 0.5},
            background_color=(0.15, 0.45, 0.15, 1),
            background_normal="",
        )
        start_btn.bind(on_press=lambda _: self._on_new_game())
        root.add_widget(start_btn)

        root.add_widget(Widget(size_hint_y=0.1))

        help_text = Label(
            text=(
                "[color=888888]"
                "Controls: D-pad to move • Pick up , • Inventory i\n"
                "Use > < to go down/up stairs • . to wait\n"
                "Goal: Reach level 26 and bring back the Amulet of Yendor!"
                "[/color]"
            ),
            markup=True,
            font_size="13sp",
            halign="center",
            size_hint_y=None,
            height=dp(72),
        )
        root.add_widget(help_text)

        root.add_widget(Widget())

        self.add_widget(root)
