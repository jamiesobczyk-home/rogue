"""Monster definitions and AI for the Rogue clone.

All 26 original Rogue monsters are represented (A–Z), each with their
characteristic stats and special abilities.  The AI is intentionally simple:
 - Move toward the player when aware of them
 - Attack when adjacent
 - Some have special attacks (poison, level drain, steal, etc.)
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import TYPE_CHECKING, List, Optional, Tuple

from .entities import Actor
from .constants import (
    RED, DARK_RED, GREEN, DARK_GREEN, BLUE, YELLOW, CYAN, MAGENTA,
    ORANGE, BROWN, GRAY, DARK_GRAY, LIGHT_GRAY, PURPLE, WHITE, GOLD,
    CONFUSED_TURNS, FROZEN_TURNS,
)

if TYPE_CHECKING:
    from .engine import GameEngine


# ---------------------------------------------------------------------------
# Monster template
# ---------------------------------------------------------------------------

@dataclass
class MonsterTemplate:
    letter:       str
    name:         str
    color:        Tuple[int, int, int]
    min_level:    int     # Minimum dungeon level to appear
    max_level:    int     # Maximum dungeon level to appear (26 = always)
    hp_dice:      Tuple[int, int]      # (n, sides) for HP roll
    attack_dice:  Tuple[int, int]
    defense:      int                  # AC (lower = harder to hit)
    xp_value:     int
    speed:        int    = 1           # How often it gets extra moves (1=normal)
    flags:        str    = ""          # Space-separated special flags


# Full roster of original Rogue monsters
MONSTER_TEMPLATES: List[MonsterTemplate] = [
    MonsterTemplate('A', "aquator",    CYAN,       5, 26, (5, 8),  (0, 0),   2,   20, flags="rust_armor"),
    MonsterTemplate('B', "bat",        DARK_GRAY,  1,  8, (1, 8),  (1, 2),   3,    5, speed=2, flags="random_move"),
    MonsterTemplate('C', "centipede",  GREEN,      2, 10, (2, 4),  (1, 3),   3,   15, flags="reduce_str"),
    MonsterTemplate('D', "dragon",     RED,       10, 26, (10,8),  (4, 8),   9, 5000, flags="breathe_fire"),
    MonsterTemplate('E', "emu",        BROWN,      1,  6, (1, 8),  (1, 2),   2,    2, flags="aggressive"),
    MonsterTemplate('F', "venus flytrap", DARK_GREEN, 8,26,(8, 8), (0, 0),  3,   80, flags="hold"),
    MonsterTemplate('G', "griffin",    YELLOW,    13, 26, (13,8),  (5, 8),   5, 2000, flags="aggressive"),
    MonsterTemplate('H', "hobgoblin",  BROWN,      1,  8, (1, 8),  (1, 8),   1,   10),
    MonsterTemplate('I', "ice monster",CYAN,       1,  8, (1, 8),  (0, 0),   1,   15, flags="freeze"),
    MonsterTemplate('J', "jabberwock", MAGENTA,   15, 26, (15,8),  (2,12),   6, 3000),
    MonsterTemplate('K', "kestrel",    LIGHT_GRAY, 1,  6, (1, 4),  (1, 4),   1,    5, speed=2),
    MonsterTemplate('L', "leprechaun", GREEN,      3, 15, (3, 8),  (1, 1),   3,   10, flags="steal_gold"),
    MonsterTemplate('M', "medusa",     PURPLE,     8, 26, (8, 8),  (3, 4),   8,  200, flags="confuse"),
    MonsterTemplate('N', "nymph",      CYAN,       3, 14, (3, 8),  (0, 0),   3,   25, flags="steal_item"),
    MonsterTemplate('O', "orc",        GREEN,      5, 18, (5, 8),  (1, 8),   6,   25),
    MonsterTemplate('P', "phantom",    GRAY,       8, 26, (8, 8),  (4, 6),   3,  120, flags="invisible"),
    MonsterTemplate('Q', "quagga",     BROWN,      3, 15, (3, 8),  (2, 5),   3,   30),
    MonsterTemplate('R', "rattlesnake",DARK_GREEN, 2, 12, (2, 6),  (1, 6),   3,   20, flags="poison"),
    MonsterTemplate('S', "snake",      GREEN,      1,  8, (1, 6),  (1, 3),   1,    5),
    MonsterTemplate('T', "troll",      DARK_GREEN, 7, 26, (6, 8),  (2, 6),   4,   50, flags="regenerate"),
    MonsterTemplate('U', "ur-vile",    DARK_RED,   7, 26, (7, 8),  (1, 4),   2,   90, flags="cast_spell"),
    MonsterTemplate('V', "vampire",    RED,        8, 26, (8, 8),  (1,10),   1,  350, flags="drain_level"),
    MonsterTemplate('W', "wraith",     GRAY,       5, 26, (5, 8),  (1, 6),   4,   55, flags="drain_level"),
    MonsterTemplate('X', "xeroc",      YELLOW,     7, 26, (7, 8),  (4, 8),   7,  100, flags="disguise"),
    MonsterTemplate('Y', "yeti",       WHITE,      5, 20, (4, 8),  (1, 6),   6,   50, flags="freeze"),
    MonsterTemplate('Z', "zombie",     DARK_GREEN, 2, 10, (2, 8),  (1, 8),   2,    6),
]

_TEMPLATE_BY_LETTER = {t.letter: t for t in MONSTER_TEMPLATES}


def templates_for_level(level: int) -> List[MonsterTemplate]:
    return [t for t in MONSTER_TEMPLATES
            if t.min_level <= level <= t.max_level]


# ---------------------------------------------------------------------------
# Monster instance
# ---------------------------------------------------------------------------

class Monster(Actor):
    """A dungeon monster."""

    def __init__(self, x: int, y: int, template: MonsterTemplate) -> None:
        n, sides = template.hp_dice
        hp = sum(random.randint(1, sides) for _ in range(n))
        hp = max(1, hp)

        super().__init__(
            x=x, y=y,
            char=template.letter,
            color=template.color,
            name=template.name,
            max_hp=hp,
            attack_dice=template.attack_dice if template.attack_dice[1] > 0 else (1, 4),
            defense=template.defense,
            xp_value=template.xp_value,
        )
        self.template = template
        self.flags    = set(template.flags.split()) if template.flags else set()
        self.speed    = template.speed
        self.speed_counter = 0

        # Behaviour state
        self.aware       = False   # Has the monster detected the player?
        self.aggravated  = False   # Forced into aggressive state
        self.scared      = 0       # Turns of fleeing
        self.invisible   = "invisible" in self.flags

    # -- AI tick -------------------------------------------------------

    def act(self, engine: "GameEngine") -> Optional[str]:
        """Take one turn of AI action. Returns optional message for player."""
        if self.sleeping > 0 or self.frozen > 0:
            return None
        if not self.alive:
            return None

        player = engine.player
        dungeon = engine.dungeon

        # Become aware if player is visible to us or if aggravated
        if self.aggravated or engine._can_monster_see_player(self):
            self.aware = True

        if not self.aware:
            # Idle: random walk occasionally
            if random.random() < 0.1 and "random_move" in self.flags:
                self._random_step(dungeon, engine.occupied_positions())
            return None

        # Fast monsters get an extra move
        extra_moves = self.speed - 1
        msg = self._take_single_action(engine, player, dungeon)
        for _ in range(extra_moves):
            if self.alive and engine.player.alive:
                self._take_single_action(engine, player, dungeon)
        return msg

    def _take_single_action(self, engine: "GameEngine", player, dungeon) -> Optional[str]:
        dx = player.x - self.x
        dy = player.y - self.y
        dist = abs(dx) + abs(dy)

        # Fleeing monsters move away
        if self.scared > 0:
            self.scared -= 1
            self._move_away_from(player, dungeon, engine.occupied_positions())
            return None

        # Adjacent → attack
        if dist <= 1 or (abs(dx) == 1 and abs(dy) == 1):
            return self._attack(engine, player)

        # Confused → random move
        if self.confused > 0:
            self._random_step(dungeon, engine.occupied_positions())
            return None

        # Bats always move randomly
        if "random_move" in self.flags:
            self._random_step(dungeon, engine.occupied_positions())
            return None

        # Path toward player
        occupied = engine.occupied_positions() - {(self.x, self.y)}
        path = dungeon.path_to(self.x, self.y, player.x, player.y, blocked=occupied)
        if path:
            nx, ny = path[0]
            if (nx, ny) not in engine.occupied_positions() - {(self.x, self.y)}:
                self.x, self.y = nx, ny
        else:
            self._random_step(dungeon, engine.occupied_positions())

        return None

    def _attack(self, engine: "GameEngine", player) -> Optional[str]:
        """Perform a melee attack against the player."""
        # Aquators and nymphs with 0-damage dice don't deal direct damage
        if self.template.attack_dice[1] == 0:
            return self._special_attack(engine, player)

        # To-hit roll: 1d20 must exceed player's AC
        hit_roll = random.randint(1, 20)
        if hit_roll < player.effective_ac:
            return None  # Miss — no message for misses to reduce spam

        damage = self.roll_attack()
        player.take_damage(damage)

        msg = f"The {self.name} hits you for {damage} damage!"

        # Special on-hit effects
        if "poison" in self.flags and random.random() < 0.5:
            player.str_cur = max(1, player.str_cur - 1)
            msg += "  You feel weak!"

        if "reduce_str" in self.flags and random.random() < 0.3:
            player.str_cur = max(1, player.str_cur - 1)
            msg += "  You feel weaker!"

        if "confuse" in self.flags and random.random() < 0.5:
            player.confused = CONFUSED_TURNS
            msg += "  You feel confused!"

        if "drain_level" in self.flags and random.random() < 0.3:
            if player.exp_level > 1:
                player.exp_level -= 1
                hp_loss = random.randint(3, 10)
                player.max_hp = max(1, player.max_hp - hp_loss)
                player.hp = min(player.hp, player.max_hp)
                msg += f"  Your life-force is drained!  You are now level {player.exp_level}."

        if "freeze" in self.flags and random.random() < 0.4:
            player.frozen = FROZEN_TURNS
            msg += "  You are frozen!"

        if "breathe_fire" in self.flags and random.random() < 0.25:
            extra = random.randint(5, 20)
            player.take_damage(extra)
            msg += f"  The dragon breathes fire for {extra} extra damage!"

        return msg

    def _special_attack(self, engine: "GameEngine", player) -> Optional[str]:
        """Attacks that don't deal direct damage."""
        if "rust_armor" in self.flags:
            if player.armor:
                player.armor.ac_bonus = max(0, player.armor.ac_bonus - 1)
                player.armor.enchant -= 1
                player.recalc_ac()
                return f"The {self.name} corrodes your {player.armor.name}!"
            return None

        if "steal_gold" in self.flags:
            if player.gold > 0:
                stolen = min(player.gold, random.randint(1, player.gold))
                player.gold -= stolen
                self.aware = False   # Teleport away after stealing
                engine.teleport_monster(self)
                return f"The {self.name} steals {stolen} gold and disappears!"
            return None

        if "steal_item" in self.flags:
            if player.inventory:
                item = random.choice(player.inventory)
                player.remove_item(item)
                engine.teleport_monster(self)
                return f"The {self.name} steals your {item.display_name()} and disappears!"
            return None

        if "hold" in self.flags:
            player.frozen = FROZEN_TURNS * 3
            return f"The {self.name} grabs you!  You can't move!"

        return None

    # -- Movement helpers ----------------------------------------------

    def _random_step(self, dungeon, occupied) -> None:
        neighbours = dungeon.walkable_neighbours(self.x, self.y)
        free = [p for p in neighbours if p not in occupied]
        if free:
            self.x, self.y = random.choice(free)

    def _move_away_from(self, target, dungeon, occupied) -> None:
        best = None
        best_dist = -1
        for nx, ny in dungeon.walkable_neighbours(self.x, self.y):
            if (nx, ny) in occupied:
                continue
            d = abs(nx - target.x) + abs(ny - target.y)
            if d > best_dist:
                best_dist = d
                best = (nx, ny)
        if best:
            self.x, self.y = best


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def spawn_monster(x: int, y: int, dungeon_level: int) -> Monster:
    """Create a random monster suitable for the given dungeon level."""
    candidates = templates_for_level(dungeon_level)
    if not candidates:
        candidates = MONSTER_TEMPLATES[:6]   # fallback to early monsters

    # Weight toward level-appropriate monsters (prefer mid-range)
    weights = []
    for t in candidates:
        ideal = (t.min_level + t.max_level) / 2
        dist  = abs(ideal - dungeon_level)
        weights.append(max(1, 10 - int(dist)))

    template = random.choices(candidates, weights=weights, k=1)[0]
    return Monster(x, y, template)
