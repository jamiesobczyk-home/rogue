"""Item definitions and effect handlers for the Rogue clone.

Authentic Rogue features implemented here:
 - Potions with randomly assigned colour names (unknown until quaffed)
 - Scrolls with randomly assigned gibberish labels (unknown until read)
 - Weapons and armor with optional enchantment bonus
 - Food, rings, wands, and the Amulet of Yendor
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING, Dict, List, Optional, Tuple

from .constants import (
    WEAPON_COLOR, ARMOR_COLOR, POTION_COLOR, SCROLL_COLOR,
    FOOD_COLOR, RING_COLOR, WAND_COLOR, GOLD_COLOR, AMULET_COLOR,
    CONFUSED_TURNS, BLIND_TURNS, HASTED_TURNS, POISONED_TURNS, HALLUC_TURNS,
)

if TYPE_CHECKING:
    from .entities import Player
    from .engine import GameEngine


# ---------------------------------------------------------------------------
# Base Item
# ---------------------------------------------------------------------------

class Item:
    """An item that can appear in the dungeon or player inventory."""

    kind = "item"        # subclass tag

    def __init__(
        self,
        x: int, y: int,
        char: str,
        color: Tuple[int, int, int],
        name: str,
        weight: int = 1,
        value: int = 0,
    ) -> None:
        self.x = x
        self.y = y
        self.char = char
        self.color = color
        self.name = name
        self.weight = weight
        self.value = value
        self.identified = True    # overridden for potions/scrolls
        self.cursed = False

    @property
    def pos(self) -> Tuple[int, int]:
        return (self.x, self.y)

    def display_name(self) -> str:
        """Name shown in inventory (unknown if not identified)."""
        return self.name

    def use(self, engine: "GameEngine") -> str:
        """Apply item effect. Return a result message."""
        return "Nothing happens."

    # Placeholders so item classes don't need to define unused attrs
    ac_bonus: int = 0
    damage_dice: Tuple[int, int] = (1, 4)
    damage_bonus: int = 0


# ---------------------------------------------------------------------------
# Gold
# ---------------------------------------------------------------------------

class Gold(Item):
    kind = "gold"

    def __init__(self, x: int, y: int, amount: int) -> None:
        super().__init__(x, y, '*', GOLD_COLOR, f"{amount} gold pieces", value=amount)
        self.amount = amount


# ---------------------------------------------------------------------------
# Weapon
# ---------------------------------------------------------------------------

_WEAPONS = [
    # (name, char, damage_dice, damage_bonus, value, weight)
    ("mace",             ')',  (2, 4),  1, 8,  30),
    ("long sword",       ')',  (1, 8),  2, 15, 40),
    ("short sword",      ')',  (1, 6),  0, 6,  30),
    ("dagger",           ')',  (1, 4),  0, 2,  10),
    ("two-handed sword", ')',  (3, 6),  0, 25, 75),
    ("spear",            ')',  (2, 3),  0, 5,  25),
    ("morning star",     ')',  (2, 5),  1, 12, 35),
    ("war hammer",       ')',  (2, 4),  1, 10, 35),
    ("flail",            ')',  (2, 4),  0, 8,  30),
]


class Weapon(Item):
    kind = "weapon"

    def __init__(
        self, x: int, y: int,
        template_idx: Optional[int] = None,
        enchant: int = 0,
        cursed: bool = False,
    ) -> None:
        if template_idx is None:
            template_idx = random.randrange(len(_WEAPONS))
        nm, ch, dd, db, val, wt = _WEAPONS[template_idx]
        super().__init__(x, y, ch, WEAPON_COLOR, nm, weight=wt, value=val)
        self.damage_dice  = dd
        self.damage_bonus = db + enchant
        self.enchant      = enchant
        self.cursed       = cursed

    def display_name(self) -> str:
        sign = '+' if self.enchant >= 0 else ''
        base = f"{self.name} ({sign}{self.enchant})"
        if self.cursed:
            base += " {cursed}"
        return base

    def use(self, engine: "GameEngine") -> str:
        player = engine.player
        if player.weapon is self:
            player.weapon = None
            return f"You put away the {self.name}."
        if player.weapon and player.weapon.cursed:
            return f"The {player.weapon.name} is stuck to your hand!"
        player.weapon = self
        return f"You are now wielding the {self.name}."


# ---------------------------------------------------------------------------
# Armor
# ---------------------------------------------------------------------------

_ARMORS = [
    # (name, char, ac_bonus, value, weight)
    ("leather armor",       '[', 2, 5,  20),
    ("ring mail",            '[', 3, 8,  25),
    ("studded leather",      '[', 3, 8,  25),
    ("scale mail",           '[', 4, 11, 30),
    ("chain mail",           '[', 5, 20, 40),
    ("splint mail",          '[', 6, 40, 45),
    ("banded mail",          '[', 6, 40, 45),
    ("plate mail",           '[', 7, 75, 50),
]


class Armor(Item):
    kind = "armor"

    def __init__(
        self, x: int, y: int,
        template_idx: Optional[int] = None,
        enchant: int = 0,
        cursed: bool = False,
    ) -> None:
        if template_idx is None:
            template_idx = random.randrange(len(_ARMORS))
        nm, ch, ac, val, wt = _ARMORS[template_idx]
        super().__init__(x, y, ch, ARMOR_COLOR, nm, weight=wt, value=val)
        self.ac_bonus = ac + enchant
        self.enchant  = enchant
        self.cursed   = cursed

    def display_name(self) -> str:
        sign = '+' if self.enchant >= 0 else ''
        base = f"{self.name} [{sign}{self.enchant}]"
        if self.cursed:
            base += " {cursed}"
        return base

    def use(self, engine: "GameEngine") -> str:
        player = engine.player
        if player.armor is self:
            if self.cursed:
                return f"The {self.name} is stuck to your body!"
            player.armor = None
            player.recalc_ac()
            return f"You take off the {self.name}."
        if player.armor and player.armor.cursed:
            return f"The {player.armor.name} is stuck to your body!"
        player.armor = self
        player.recalc_ac()
        return f"You are now wearing the {self.name}."


# ---------------------------------------------------------------------------
# Potion  (unknown name until identified)
# ---------------------------------------------------------------------------

# (effect_key, base_name, default_color_hint)
_POTION_EFFECTS = [
    ("heal",           "healing"),
    ("extra_heal",     "extra healing"),
    ("poison",         "poison"),
    ("blindness",      "blindness"),
    ("confusion",      "confusion"),
    ("gain_str",       "gain strength"),
    ("restore_str",    "restore strength"),
    ("see_invisible",  "see invisible"),
    ("raise_level",    "raise level"),
    ("haste_self",     "haste self"),
    ("monster_det",    "monster detection"),
    ("hallucination",  "hallucination"),
]

_POTION_COLORS = [
    "bubbly", "smoky", "murky", "swirling", "effervescent",
    "fizzing", "luminescent", "viscous", "oily", "clear",
    "yellow", "red", "blue", "green", "purple",
    "orange", "white", "black", "cyan", "magenta",
]


class PotionRegistry:
    """Maps potion effect keys to randomised colour names for one game."""

    def __init__(self) -> None:
        colours = _POTION_COLORS[:]
        random.shuffle(colours)
        self._effect_to_color: Dict[str, str] = {}
        self._identified: Dict[str, bool] = {}
        for i, (key, _) in enumerate(_POTION_EFFECTS):
            self._effect_to_color[key] = colours[i % len(colours)]
            self._identified[key] = False

    def colour_for(self, key: str) -> str:
        return self._effect_to_color.get(key, "strange")

    def identify(self, key: str) -> None:
        self._identified[key] = True

    def is_identified(self, key: str) -> bool:
        return self._identified.get(key, False)

    def true_name(self, key: str) -> str:
        for k, nm in _POTION_EFFECTS:
            if k == key:
                return f"potion of {nm}"
        return "unknown potion"


class Potion(Item):
    kind = "potion"

    def __init__(
        self, x: int, y: int,
        effect_key: str,
        registry: PotionRegistry,
    ) -> None:
        super().__init__(x, y, '!', POTION_COLOR, "", weight=1, value=5)
        self.effect_key = effect_key
        self.registry   = registry
        self.identified = registry.is_identified(effect_key)

    def display_name(self) -> str:
        if self.registry.is_identified(self.effect_key):
            return self.registry.true_name(self.effect_key)
        colour = self.registry.colour_for(self.effect_key)
        return f"a {colour} potion"

    def use(self, engine: "GameEngine") -> str:
        player = engine.player
        key = self.effect_key
        self.registry.identify(key)

        if key == "heal":
            gained = player.heal(random.randint(1, 8) + player.exp_level)
            return f"You feel better!  (healed {gained} HP)"

        if key == "extra_heal":
            player.max_hp = min(player.max_hp + 1, 999)
            gained = player.heal(random.randint(3, 20))
            return f"You feel much better!  (healed {gained} HP)"

        if key == "poison":
            player.str_cur = max(1, player.str_cur - random.randint(1, 3))
            return "You feel very sick!"

        if key == "blindness":
            player.blinded = BLIND_TURNS
            return "A cloud of darkness surrounds you."

        if key == "confusion":
            player.confused = CONFUSED_TURNS
            return "You feel confused."

        if key == "gain_str":
            player.str_cur = min(player.str_cur + 1, 18)
            player.str_base = min(player.str_base + 1, 18)
            return "You feel stronger!"

        if key == "restore_str":
            player.str_cur = player.str_base
            return "You feel your strength return."

        if key == "see_invisible":
            player.see_invisible = 850
            return "You can now see invisible creatures."

        if key == "raise_level":
            msg = player.gain_exp(PLAYER_EXP_TABLE[min(player.exp_level,
                                   len(PLAYER_EXP_TABLE) - 1)])
            return msg or "Your experience increases."

        if key == "haste_self":
            player.hasted = HASTED_TURNS
            return "You feel yourself moving faster."

        if key == "monster_det":
            engine.monster_detection_turns = 25
            return "You sense the presence of monsters."

        if key == "hallucination":
            player.hallucinating = HALLUC_TURNS
            return "Oh wow, everything looks so different!"

        return "Nothing happens."


# ---------------------------------------------------------------------------
# Scroll  (unknown label until identified)
# ---------------------------------------------------------------------------

_SCROLL_EFFECTS = [
    ("identify",       "identify"),
    ("magic_map",      "magic mapping"),
    ("hold_monster",   "hold monster"),
    ("sleep",          "sleep"),
    ("teleport",       "teleportation"),
    ("ench_weapon",    "enchant weapon"),
    ("ench_armor",     "enchant armor"),
    ("scare_monster",  "scare monster"),
    ("remove_curse",   "remove curse"),
    ("create_monster", "create monster"),
    ("aggravate",      "aggravate monster"),
]

_SCROLL_SYLLABLES = [
    "ZELGO", "MER", "JUYED", "AWK", "YACC", "BOULC",
    "GRINGEL", "FLASE", "ACREWE", "BRODI", "HEP",
    "TRI", "MON", "KLOP", "SEN", "SAT", "KLIS",
    "VE", "WUN", "TURS", "WAN", "LEP", "REB",
]


class ScrollRegistry:
    def __init__(self) -> None:
        labels: List[str] = []
        syllables = _SCROLL_SYLLABLES[:]
        random.shuffle(syllables)
        for i in range(len(_SCROLL_EFFECTS)):
            n = random.randint(2, 4)
            label = " ".join(syllables[(i * 3 + j) % len(syllables)]
                             for j in range(n))
            labels.append(label)
        self._effect_to_label: Dict[str, str] = {}
        self._identified: Dict[str, bool] = {}
        for i, (key, _) in enumerate(_SCROLL_EFFECTS):
            self._effect_to_label[key] = labels[i]
            self._identified[key] = False

    def label_for(self, key: str) -> str:
        return self._effect_to_label.get(key, "???")

    def identify(self, key: str) -> None:
        self._identified[key] = True

    def is_identified(self, key: str) -> bool:
        return self._identified.get(key, False)

    def true_name(self, key: str) -> str:
        for k, nm in _SCROLL_EFFECTS:
            if k == key:
                return f"scroll of {nm}"
        return "unknown scroll"


class Scroll(Item):
    kind = "scroll"

    def __init__(
        self, x: int, y: int,
        effect_key: str,
        registry: ScrollRegistry,
    ) -> None:
        super().__init__(x, y, '?', SCROLL_COLOR, "", weight=1, value=5)
        self.effect_key = effect_key
        self.registry   = registry

    def display_name(self) -> str:
        if self.registry.is_identified(self.effect_key):
            return self.registry.true_name(self.effect_key)
        label = self.registry.label_for(self.effect_key)
        return f'a scroll labeled "{label}"'

    def use(self, engine: "GameEngine") -> str:
        player = engine.player
        key = self.effect_key
        self.registry.identify(key)

        if key == "identify":
            # Identifies an item in inventory — handled at engine level
            return "__identify__"

        if key == "magic_map":
            engine.reveal_map()
            return "You see a vision of the dungeon around you."

        if key == "hold_monster":
            for m in engine.monsters:
                m.frozen = 15
            return "The monsters around you are frozen!"

        if key == "sleep":
            for m in engine.monsters:
                m.sleeping = random.randint(5, 15)
            return "The monsters fall asleep."

        if key == "teleport":
            engine.teleport_player()
            return "You feel dizzy and..."

        if key == "ench_weapon":
            if player.weapon:
                player.weapon.enchant += 1
                player.weapon.damage_bonus += 1
                return f"Your {player.weapon.name} glows blue."
            return "You have no weapon to enchant."

        if key == "ench_armor":
            if player.armor:
                player.armor.enchant += 1
                player.armor.ac_bonus += 1
                player.recalc_ac()
                return f"Your {player.armor.name} glows blue."
            return "You have no armor to enchant."

        if key == "scare_monster":
            for m in engine.monsters:
                m.scared = getattr(m, 'scared', 0) + 20
            return "The monsters flee!"

        if key == "remove_curse":
            for item in player.inventory:
                item.cursed = False
            return "All your items are uncursed."

        if key == "create_monster":
            engine.spawn_monster_near(player.x, player.y)
            return "You hear a strange noise..."

        if key == "aggravate":
            for m in engine.monsters:
                m.aggravated = True
            return "You hear the monsters getting angry!"

        return "Nothing happens."


# ---------------------------------------------------------------------------
# Food
# ---------------------------------------------------------------------------

_FOOD_TYPES = [
    ("food ration",  '%', 800,  4),
    ("slime mold",   '%', 400,  2),
    ("strawberry",   '%', 200,  1),
    ("cookie",       '%', 300,  1),
]


class Food(Item):
    kind = "food"

    def __init__(self, x: int, y: int, kind_idx: Optional[int] = None) -> None:
        if kind_idx is None:
            kind_idx = 0 if random.random() < 0.7 else random.randrange(len(_FOOD_TYPES))
        nm, ch, nutrition, val = _FOOD_TYPES[kind_idx]
        super().__init__(x, y, ch, FOOD_COLOR, nm, weight=2, value=val)
        self.nutrition = nutrition

    def use(self, engine: "GameEngine") -> str:
        engine.player.eat(self.nutrition)
        engine.player.remove_item(self)
        if self.nutrition >= 700:
            return f"You eat the {self.name}.  Yum!"
        return f"You eat the {self.name}."


# ---------------------------------------------------------------------------
# Ring
# ---------------------------------------------------------------------------

_RING_EFFECTS = [
    ("protection",    "protection",    0),
    ("add_str",       "add strength",  0),
    ("sustain_str",   "sustain strength", 0),
    ("searching",     "searching",     0),
    ("see_invisible", "see invisible", 0),
    ("regeneration",  "regeneration",  0),
    ("aggravate",     "aggravate monster", 0),
    ("teleport",      "teleportation", 0),
]


class Ring(Item):
    kind = "ring"

    def __init__(self, x: int, y: int, effect_idx: Optional[int] = None) -> None:
        if effect_idx is None:
            effect_idx = random.randrange(len(_RING_EFFECTS))
        key, nm, val = _RING_EFFECTS[effect_idx]
        super().__init__(x, y, '=', RING_COLOR, f"ring of {nm}", weight=1, value=val)
        self.effect_key = key

    def use(self, engine: "GameEngine") -> str:
        # Ring effects are passive — just a message for now
        return f"You slip on the {self.name}."


# ---------------------------------------------------------------------------
# Wand / Staff
# ---------------------------------------------------------------------------

_WAND_EFFECTS = [
    ("magic_missile", "magic missile",    10),
    ("slow_monster",  "slow monster",     10),
    ("sleep_monster", "sleep monster",    10),
    ("teleport_to",   "teleport to",       5),
    ("confusion",     "confusion",        10),
    ("invisibility",  "invisibility",      8),
    ("cancellation",  "cancellation",      8),
    ("lightning",     "lightning",         3),
    ("fire",          "fire",              3),
    ("cold",          "cold",              3),
    ("drain_life",    "drain life",       10),
    ("polymorph",     "polymorph",         8),
]


class Wand(Item):
    kind = "wand"

    def __init__(self, x: int, y: int, effect_idx: Optional[int] = None) -> None:
        if effect_idx is None:
            effect_idx = random.randrange(len(_WAND_EFFECTS))
        key, nm, charges = _WAND_EFFECTS[effect_idx]
        super().__init__(x, y, '/', WAND_COLOR, f"wand of {nm}", weight=5, value=10)
        self.effect_key = key
        self.charges    = random.randint(3, charges)

    def display_name(self) -> str:
        return f"{self.name} ({self.charges} charges)"

    def use(self, engine: "GameEngine") -> str:
        if self.charges <= 0:
            return "The wand is empty."
        self.charges -= 1
        return engine.zap_wand(self)


# ---------------------------------------------------------------------------
# Amulet of Yendor
# ---------------------------------------------------------------------------

class Amulet(Item):
    kind = "amulet"

    def __init__(self, x: int, y: int) -> None:
        super().__init__(x, y, ',', AMULET_COLOR,
                         "Amulet of Yendor", weight=2, value=0)

    def use(self, engine: "GameEngine") -> str:
        engine.player.has_amulet = True
        return "You pick up the Amulet of Yendor!  Now escape!"


# ---------------------------------------------------------------------------
# Item factory
# ---------------------------------------------------------------------------

def random_item(
    x: int, y: int,
    dungeon_level: int,
    potion_reg: PotionRegistry,
    scroll_reg: ScrollRegistry,
) -> Item:
    """Create a random item appropriate for the dungeon level."""

    weights = {
        "gold":    20,
        "food":    15,
        "weapon":  15,
        "armor":   15,
        "potion":  15,
        "scroll":  12,
        "ring":     4,
        "wand":     4,
    }

    categories = list(weights.keys())
    cat_weights = list(weights.values())
    category = random.choices(categories, weights=cat_weights, k=1)[0]

    if category == "gold":
        amount = random.randint(1, 50 + dungeon_level * 10)
        return Gold(x, y, amount)

    if category == "food":
        return Food(x, y)

    if category == "weapon":
        # Higher dungeon levels → better weapons
        max_idx = min(len(_WEAPONS) - 1, dungeon_level // 3 + 3)
        idx = random.randint(0, max_idx)
        enchant = 0
        cursed  = False
        if random.random() < 0.15:
            if random.random() < 0.5:
                enchant = random.randint(1, 3)
            else:
                enchant = -random.randint(1, 3)
                cursed  = True
        return Weapon(x, y, idx, enchant, cursed)

    if category == "armor":
        max_idx = min(len(_ARMORS) - 1, dungeon_level // 3 + 2)
        idx = random.randint(0, max_idx)
        enchant = 0
        cursed  = False
        if random.random() < 0.15:
            if random.random() < 0.5:
                enchant = random.randint(1, 3)
            else:
                enchant = -random.randint(1, 3)
                cursed  = True
        return Armor(x, y, idx, enchant, cursed)

    if category == "potion":
        key = random.choice([e[0] for e in _POTION_EFFECTS])
        return Potion(x, y, key, potion_reg)

    if category == "scroll":
        key = random.choice([e[0] for e in _SCROLL_EFFECTS])
        return Scroll(x, y, key, scroll_reg)

    if category == "ring":
        return Ring(x, y)

    if category == "wand":
        return Wand(x, y)

    # fallback
    return Gold(x, y, 10)
