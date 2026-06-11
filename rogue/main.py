#!/usr/bin/env python3
"""Entry point for the Rogue mobile game.

Run locally:
    cd rogue/
    python main.py

Build for Android (requires buildozer):
    buildozer android debug

Build for iOS (requires kivy-ios):
    toolchain build python3 kivy
    toolchain create RogueApp .
"""

import os
import sys

# Make sure the project root is on the path when run directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rogue.ui.app import RogueApp


if __name__ == "__main__":
    RogueApp().run()
