"""Game-over (death) and victory screen."""

from __future__ import annotations

from typing import Callable

from kivy.uix.screenmanager import Screen
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.label import Label
from kivy.uix.button import Button
from kivy.graphics import Color, Rectangle
from kivy.metrics import dp


class GameOverScreen(Screen):

    def __init__(self, on_new_game: Callable, **kwargs) -> None:
        super().__init__(**kwargs)
        self._on_new_game = on_new_game

        root = BoxLayout(orientation="vertical", padding=dp(20), spacing=dp(16))

        with root.canvas.before:
            Color(0.05, 0.02, 0.02, 1)
            self._bg = Rectangle(pos=root.pos, size=root.size)
        root.bind(pos=lambda *_: setattr(self._bg, 'pos', root.pos),
                  size=lambda *_: setattr(self._bg, 'size', root.size))

        root.add_widget(Widget())   # spacer

        self._title = Label(
            text="[b][color=ff3333]YOU DIED[/color][/b]",
            markup=True,
            font_size="32sp",
            halign="center",
            size_hint_y=None,
            height=dp(60),
        )
        root.add_widget(self._title)

        self._score_label = Label(
            text="",
            markup=True,
            font_size="16sp",
            halign="center",
            size_hint_y=None,
            height=dp(120),
        )
        root.add_widget(self._score_label)

        root.add_widget(Widget())   # spacer

        btn = Button(
            text="[b]New Game[/b]",
            markup=True,
            font_size="18sp",
            size_hint=(0.5, None),
            height=dp(54),
            pos_hint={"center_x": 0.5},
            background_color=(0.2, 0.5, 0.2, 1),
            background_normal="",
        )
        btn.bind(on_press=lambda _: self._on_new_game())
        root.add_widget(btn)

        root.add_widget(Widget())

        self.add_widget(root)

    def show(self, engine, victory: bool = False) -> None:
        p = engine.player
        if victory:
            self._title.text = (
                "[b][color=ffd700]YOU WIN![/color][/b]\n"
                "[color=ffff88]You escaped with the Amulet of Yendor![/color]"
            )
            with self.canvas.before:
                Color(0.02, 0.05, 0.02, 1)
        else:
            self._title.text = "[b][color=ff3333]YOU DIED[/color][/b]"

        score = engine._score()
        self._score_label.text = (
            f"[b]Level:[/b] {p.exp_level}    "
            f"[b]Dungeon:[/b] {engine.dungeon_level}\n"
            f"[b]Gold:[/b] {p.gold}    "
            f"[b]Turns:[/b] {engine.turn}\n\n"
            f"[b][color=ffff00]Score: {score}[/color][/b]"
        )


# Import Widget here to avoid circular at top
from kivy.uix.widget import Widget
