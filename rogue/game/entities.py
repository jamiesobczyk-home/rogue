"""Base entity classes shared by the player, monsters, and items."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, List, Optional, Tuple

from .constants import (
    PLAYER_START_HP, PLAYER_START_STR, PLAYER_START_AC,
    PLAYER_EXP_TABLE, HUNGER_FULL,
    CONFUSED_TURNS, BLIND_TURNS, HASTED_TURNS, POISONED_TURNS,
    FROZEN_TURNS, HALLUC_TURNS,
    MAX_INVENTORY, WHITE,
)

if TYPE_CHECKING:
    from .items import Item


# ---------------------------------------------------------------------------
# Entity  (anything that occupies a tile)
# ---------------------------------------------------------------------------

class Entity:
    """A map object with a position, display character and colour."""

    def __init__(
        self,
        x: int, y: int,
        char: str,
        color: Tuple[int, int, int],
        name: str,
    ) -> None:
        self.x = x
        self.y = y
        self.char = char
        self.color = color
        self.name = name

    @property
    def pos(self) -> Tuple[int, int]:
        return (self.x, self.y)

    def move_to(self, x: int, y: int) -> None:
        self.x = x
        self.y = y


# ---------------------------------------------------------------------------
# Actor  (entity with hit-points and combat stats)
# ---------------------------------------------------------------------------

class Actor(Entity):
    """Anything that can fight: player or monster."""

    def __init__(
        self,
        x: int, y: int,
        char: str,
        color: Tuple[int, int, int],
        name: str,
        max_hp: int,
        attack_dice: Tuple[int, int],   # (num_dice, sides) e.g. (2, 6) = 2d6
        defense: int,                    # raw armor class (lower = better)
        xp_value: int = 0,
    ) -> None:
        super().__init__(x, y, char, color, name)
        self.max_hp = max_hp
        self.hp = max_hp
        self.attack_dice = attack_dice  # (n, sides)
        self.defense = defense
        self.xp_value = xp_value

        # Status effects  (turns remaining, 0 = inactive)
        self.confused  = 0
        self.blinded   = 0
        self.hasted    = 0
        self.poisoned  = 0
        self.frozen    = 0
        self.sleeping  = 0

    @property
    def alive(self) -> bool:
        return self.hp > 0

    def take_damage(self, amount: int) -> int:
        """Reduce HP and return actual damage taken."""
        amount = max(1, amount)
        self.hp = max(0, self.hp - amount)
        return amount

    def heal(self, amount: int) -> int:
        """Restore HP up to max; return actual amount healed."""
        healed = min(amount, self.max_hp - self.hp)
        self.hp += healed
        return healed

    def roll_attack(self) -> int:
        n, sides = self.attack_dice
        return sum(random.randint(1, sides) for _ in range(n))

    def tick_effects(self) -> List[str]:
        """Decrement status timers; return list of expiry messages."""
        msgs = []
        for attr, label in (
            ("confused", "You are no longer confused."),
            ("blinded",  "Your vision clears."),
            ("hasted",   "You slow down."),
            ("poisoned", "The poison wears off."),
            ("frozen",   "You can move again."),
            ("sleeping", ""),
        ):
            val = getattr(self, attr)
            if val > 0:
                setattr(self, attr, val - 1)
                if getattr(self, attr) == 0 and label:
                    msgs.append(label)
        return msgs


# ---------------------------------------------------------------------------
# Player
# ---------------------------------------------------------------------------

class Player(Actor):
    """The player character."""

    def __init__(self, x: int, y: int) -> None:
        super().__init__(
            x=x, y=y,
            char='@',
            color=WHITE,
            name="you",
            max_hp=PLAYER_START_HP,
            attack_dice=(1, 4),      # bare-hands damage
            defense=PLAYER_START_AC,
            xp_value=0,
        )
        self.str_base = PLAYER_START_STR
        self.str_cur  = PLAYER_START_STR
        self.exp_level = 1
        self.exp_pts   = 0
        self.gold      = 0
        self.hunger    = HUNGER_FULL

        # Inventory: list of Item objects (max MAX_INVENTORY)
        self.inventory: List["Item"] = []
        # Equipment slots
        self.weapon: Optional["Item"] = None   # wielded weapon
        self.armor:  Optional["Item"] = None   # worn armor

        # Effective AC (recalculated from armor)
        self._armor_ac: int = 0

        # Has the Amulet of Yendor?
        self.has_amulet = False

        # Hallucination / see-invisible
        self.hallucinating = 0
        self.see_invisible = 0

    # -- AC ----------------------------------------------------------

    @property
    def effective_ac(self) -> int:
        """Lower is better.  Armour subtracts from base AC."""
        return PLAYER_START_AC - self._armor_ac

    def recalc_ac(self) -> None:
        base = 0
        if self.armor:
            base = self.armor.ac_bonus
        self._armor_ac = base

    # -- STR modifiers -----------------------------------------------

    @property
    def str_damage_bonus(self) -> int:
        if self.str_cur >= 18: return 6
        if self.str_cur >= 16: return 4
        if self.str_cur >= 13: return 2
        if self.str_cur >= 10: return 0
        if self.str_cur >= 7:  return -1
        return -2

    # -- Attack ------------------------------------------------------

    def roll_attack(self) -> int:
        if self.weapon:
            n, sides = self.weapon.damage_dice
        else:
            n, sides = self.attack_dice  # bare hands
        dmg = sum(random.randint(1, sides) for _ in range(n))
        if self.weapon:
            dmg += self.weapon.damage_bonus
        dmg += self.str_damage_bonus
        return max(1, dmg)

    # -- Experience --------------------------------------------------

    def gain_exp(self, amount: int) -> Optional[str]:
        """Add exp; return level-up message if applicable, else None."""
        self.exp_pts += amount
        msg = None
        while (self.exp_level < len(PLAYER_EXP_TABLE) - 1 and
               self.exp_pts >= PLAYER_EXP_TABLE[self.exp_level]):
            self.exp_level += 1
            hp_gain = random.randint(3, 10)
            self.max_hp += hp_gain
            self.hp += hp_gain
            msg = f"Welcome to level {self.exp_level}!  You feel stronger."
        return msg

    # -- Inventory ---------------------------------------------------

    def add_item(self, item: "Item") -> Optional[str]:
        """Add item to inventory. Returns slot letter, or None if full."""
        if len(self.inventory) >= MAX_INVENTORY:
            return None
        self.inventory.append(item)
        return chr(ord('a') + len(self.inventory) - 1)

    def remove_item(self, item: "Item") -> None:
        if item in self.inventory:
            self.inventory.remove(item)
            # If it was equipped, unequip
            if self.weapon is item:
                self.weapon = None
            if self.armor is item:
                self.armor = None
                self.recalc_ac()

    def item_slot(self, item: "Item") -> str:
        """Return inventory letter for this item."""
        idx = self.inventory.index(item)
        return chr(ord('a') + idx)

    # -- Hunger ------------------------------------------------------

    def tick_hunger(self) -> Optional[str]:
        """Consume one hunger unit.  Returns warning message if needed."""
        self.hunger -= 1
        if self.hunger == 300:
            return "You are starting to feel hungry."
        if self.hunger == 150:
            return "You are feeling weak!"
        if self.hunger == 20:
            return "You are about to faint from hunger!"
        if self.hunger <= 0:
            self.hunger = 0
            # Starvation damage every 10 turns
            return None   # handled by caller
        return None

    def eat(self, nutrition: int) -> None:
        self.hunger = min(HUNGER_FULL, self.hunger + nutrition)

    # -- Tick --------------------------------------------------------

    def tick_effects(self) -> List[str]:
        msgs = super().tick_effects()
        if self.hallucinating > 0:
            self.hallucinating -= 1
            if self.hallucinating == 0:
                msgs.append("Everything looks normal again.")
        if self.see_invisible > 0:
            self.see_invisible -= 1
        return msgs
