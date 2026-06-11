"""Main game screen: dungeon view + HUD + message log + controls."""

from __future__ import annotations

from typing import TYPE_CHECKING

from kivy.uix.screenmanager import Screen
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.widget import Widget
from kivy.clock import Clock
from kivy.metrics import dp

from ..widgets.dungeon_widget  import DungeonWidget
from ..widgets.hud_widget      import HudWidget
from ..widgets.message_log     import MessageLog
from ..widgets.controls_widget import ControlsWidget
from ...game.engine import GameEngine, STATE_DEAD, STATE_WIN, STATE_IDENTIFY


class GameScreen(Screen):
    """The primary gameplay screen."""

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.engine: GameEngine | None = None
        self._layout_built = False

    def start_new_game(self) -> None:
        """Create a fresh engine and (re)build the UI layout."""
        self.engine = GameEngine()
        if not self._layout_built:
            self._build_layout()
            self._layout_built = True
        self.refresh()

    # ------------------------------------------------------------------
    # Layout construction
    # ------------------------------------------------------------------

    def _build_layout(self) -> None:
        root = BoxLayout(orientation="vertical")

        # 1. HUD (top)
        self.hud = HudWidget()
        root.add_widget(self.hud)

        # 2. Dungeon view (centre, fills remaining space)
        self.dungeon_widget = DungeonWidget(size_hint=(1, 1))
        self.dungeon_widget.bind(on_touch_up=self._on_dungeon_touch)
        root.add_widget(self.dungeon_widget)

        # 3. Message log
        self.msg_log = MessageLog(size_hint_x=1)
        root.add_widget(self.msg_log)

        # 4. Controls (bottom)
        self.controls = ControlsWidget(
            on_move=self._on_move,
            on_pickup=self._on_pickup,
            on_inventory=self._on_inventory,
            on_descend=self._on_descend,
            on_ascend=self._on_ascend,
            on_wait=self._on_wait,
        )
        root.add_widget(self.controls)

        self.add_widget(root)

    # ------------------------------------------------------------------
    # Refresh display from engine state
    # ------------------------------------------------------------------

    def refresh(self) -> None:
        if not self.engine:
            return
        data = self.engine.get_render_data()
        self.dungeon_widget.render(data)
        self.hud.update(data["hud"])
        self.msg_log.push(data["messages"])

        # Transition to end screens
        state = data["state"]
        if state == STATE_DEAD:
            Clock.schedule_once(lambda _: self._go_gameover(victory=False), 0.5)
        elif state == STATE_WIN:
            Clock.schedule_once(lambda _: self._go_gameover(victory=True), 0.5)

    # ------------------------------------------------------------------
    # Control callbacks
    # ------------------------------------------------------------------

    def _on_move(self, dx: int, dy: int) -> None:
        if self.engine:
            self.engine.action_move(dx, dy)
            self.refresh()

    def _on_pickup(self) -> None:
        if self.engine:
            self.engine.action_pickup()
            self.refresh()

    def _on_inventory(self) -> None:
        sm = self.manager
        inv = sm.get_screen("inventory")
        inv.open_for(self)
        sm.current = "inventory"

    def _on_descend(self) -> None:
        if self.engine:
            self.engine.action_descend()
            self.refresh()

    def _on_ascend(self) -> None:
        if self.engine:
            self.engine.action_ascend()
            self.refresh()

    def _on_wait(self) -> None:
        if self.engine:
            self.engine.action_wait()
            self.refresh()

    # ------------------------------------------------------------------
    # Tap-to-move on dungeon
    # ------------------------------------------------------------------

    def _on_dungeon_touch(self, widget, touch) -> bool:
        if not widget.collide_point(*touch.pos):
            return False
        tile = widget.touch_to_map(touch.x, touch.y)
        if tile and self.engine:
            px, py = self.engine.player.x, self.engine.player.y
            tx, ty = tile
            # Move one step at a time toward tapped tile
            dx = 0 if tx == px else (1 if tx > px else -1)
            dy = 0 if ty == py else (1 if ty > py else -1)
            if dx != 0 or dy != 0:
                self.engine.action_move(dx, dy)
                self.refresh()
        return True

    # ------------------------------------------------------------------
    # Screen transitions
    # ------------------------------------------------------------------

    def _go_gameover(self, victory: bool) -> None:
        sm = self.manager
        go = sm.get_screen("gameover")
        go.show(self.engine, victory=victory)
        sm.current = "gameover"
