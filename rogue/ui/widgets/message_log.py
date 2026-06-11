"""Scrolling message log widget."""

from __future__ import annotations

from kivy.uix.label import Label
from kivy.graphics import Color, Rectangle


_MAX_VISIBLE = 3   # Number of message lines shown


class MessageLog(Label):
    """Shows the most recent game messages."""

    def __init__(self, **kwargs) -> None:
        super().__init__(
            markup=True,
            font_size="12sp",
            halign="left",
            valign="top",
            size_hint_y=None,
            height=56,
            padding=(6, 4),
            **kwargs,
        )
        self._all_messages: list = []

        with self.canvas.before:
            Color(0.05, 0.05, 0.1, 1)
            self._bg = Rectangle(pos=self.pos, size=self.size)
        self.bind(pos=self._upd, size=self._upd)

    def _upd(self, *_) -> None:
        self._bg.pos  = self.pos
        self._bg.size = self.size
        self.text_size = (self.width - 12, None)

    def push(self, messages: list) -> None:
        """Replace the message list with the latest from the engine."""
        self._all_messages = messages
        recent = messages[-_MAX_VISIBLE:]
        lines  = []
        for i, msg in enumerate(recent):
            # Dim older messages
            alpha = 255 if i == len(recent) - 1 else (180 if i == len(recent) - 2 else 100)
            hex_a = format(alpha, '02x')
            lines.append(f"[color=#ffffff{hex_a}]{msg}[/color]")
        self.text = "\n".join(lines)
