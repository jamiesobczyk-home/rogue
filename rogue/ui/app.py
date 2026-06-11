"""Kivy application class for the Rogue mobile game."""

from __future__ import annotations

from kivy.app import App
from kivy.uix.screenmanager import ScreenManager, FadeTransition
from kivy.core.window import Window

from .screens.menu_screen     import MenuScreen
from .screens.game_screen     import GameScreen
from .screens.inventory_screen import InventoryScreen
from .screens.gameover_screen  import GameOverScreen


class RogueApp(App):
    """Top-level Kivy application."""

    title = "Rogue"

    def build(self):
        # Dark background everywhere
        Window.clearcolor = (0.05, 0.05, 0.05, 1)

        self.sm = ScreenManager(transition=FadeTransition(duration=0.15))

        # Create all screens
        game_screen = GameScreen(name="game")
        inv_screen  = InventoryScreen(name="inventory")
        go_screen   = GameOverScreen(name="gameover",
                                      on_new_game=self._start_new_game)
        menu_screen = MenuScreen(name="menu",
                                  on_new_game=self._start_new_game)

        self.sm.add_widget(menu_screen)
        self.sm.add_widget(game_screen)
        self.sm.add_widget(inv_screen)
        self.sm.add_widget(go_screen)

        self.sm.current = "menu"
        return self.sm

    def _start_new_game(self) -> None:
        game = self.sm.get_screen("game")
        game.start_new_game()
        self.sm.current = "game"
