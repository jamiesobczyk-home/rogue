"""Core game engine — manages game state and processes turns."""

from __future__ import annotations

import random
from typing import Callable, Dict, List, Optional, Set, Tuple

from .constants import (
    MAP_WIDTH, MAP_HEIGHT, MAX_DUNGEON_LEVEL,
    TILE_STAIRS_DN, TILE_STAIRS_UP, TILE_FLOOR, TILE_CORRIDOR, TILE_DOOR,
    HUNGER_HUNGRY, HUNGER_WEAK, HUNGER_FAINT,
    CONFUSED_TURNS,
)
from .dungeon  import Dungeon
from .entities import Player
from .items    import (
    Item, Gold, Weapon, Armor, Potion, Scroll, Food, Ring, Wand, Amulet,
    PotionRegistry, ScrollRegistry, random_item,
)
from .monsters import Monster, spawn_monster


# ---------------------------------------------------------------------------
# Game states
# ---------------------------------------------------------------------------

STATE_PLAYING   = "playing"
STATE_DEAD      = "dead"
STATE_WIN       = "win"
STATE_IDENTIFY  = "identify"   # Waiting for the player to pick an item to ID


class GameEngine:
    """Owns all game state and exposes action methods called by the UI."""

    def __init__(self) -> None:
        # Shared registries (randomised once per game)
        self.potion_reg = PotionRegistry()
        self.scroll_reg = ScrollRegistry()

        self.dungeon_level    = 1
        self.dungeon: Dungeon = self._build_dungeon()

        px, py = self.dungeon.player_start
        self.player = Player(px, py)
        self.dungeon.compute_fov(px, py)

        self.monsters: List[Monster] = []
        self.items:    List[Item]    = []

        self._populate()

        self.messages: List[str]   = []
        self.state    = STATE_PLAYING
        self.turn     = 0

        # Temporary engine flags set by item effects
        self.monster_detection_turns = 0
        self._pending_identify        = False

        self.add_message(
            "Welcome to Rogue!  Your quest is to retrieve the Amulet of Yendor."
        )

    # ------------------------------------------------------------------
    # Dungeon management
    # ------------------------------------------------------------------

    def _build_dungeon(self) -> Dungeon:
        return Dungeon(self.dungeon_level)

    def _populate(self) -> None:
        """Place monsters and items on the current dungeon level."""
        self.monsters = []
        self.items    = []

        # Amulet of Yendor on the deepest level
        if self.dungeon_level == MAX_DUNGEON_LEVEL and self.dungeon.stairs_down:
            ax, ay = self.dungeon.stairs_down
            self.items.append(Amulet(ax, ay))

        for pos in self.dungeon.monster_spawns:
            self.monsters.append(spawn_monster(*pos, self.dungeon_level))

        for pos in self.dungeon.item_spawns:
            item = random_item(*pos, self.dungeon_level,
                               self.potion_reg, self.scroll_reg)
            self.items.append(item)

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def occupied_positions(self) -> Set[Tuple[int, int]]:
        pos = {(self.player.x, self.player.y)}
        for m in self.monsters:
            if m.alive:
                pos.add((m.x, m.y))
        return pos

    def monster_at(self, x: int, y: int) -> Optional[Monster]:
        for m in self.monsters:
            if m.alive and m.x == x and m.y == y:
                return m
        return None

    def items_at(self, x: int, y: int) -> List[Item]:
        return [i for i in self.items if i.x == x and i.y == y]

    def _can_monster_see_player(self, monster: Monster) -> bool:
        p = self.player
        dist = max(abs(monster.x - p.x), abs(monster.y - p.y))
        if dist > 8:
            return False
        # Simple: visible if the dungeon FOV includes the monster's position
        # (i.e. both are in the same lit room or adjacent corridor)
        return self.dungeon.visible[monster.y][monster.x]

    # ------------------------------------------------------------------
    # Message queue
    # ------------------------------------------------------------------

    def add_message(self, msg: str) -> None:
        if msg:
            self.messages.append(msg)
            if len(self.messages) > 200:
                self.messages = self.messages[-200:]

    # ------------------------------------------------------------------
    # Player actions (called by the UI)
    # ------------------------------------------------------------------

    def action_move(self, dx: int, dy: int) -> bool:
        """Attempt to move or attack. Returns True if a turn was consumed."""
        if self.state != STATE_PLAYING:
            return False
        if not self.player.alive:
            return False

        if self.player.frozen > 0:
            self.add_message("You can't move — you are frozen!")
            self._end_player_turn()
            return True

        tx, ty = self.player.x + dx, self.player.y + dy

        # Confused — redirect movement randomly
        if self.player.confused > 0:
            dx, dy = random.choice([(0,1),(0,-1),(1,0),(-1,0),
                                    (1,1),(1,-1),(-1,1),(-1,-1)])
            tx, ty = self.player.x + dx, self.player.y + dy

        # Attack if monster is there
        target = self.monster_at(tx, ty)
        if target:
            self._player_attack(target)
            self._end_player_turn()
            return True

        # Move if walkable
        if self.dungeon.is_walkable(tx, ty):
            self.player.move_to(tx, ty)
            self.dungeon.compute_fov(tx, ty)
            self._auto_pickup_gold()
            self._check_stairs_message()
            self._end_player_turn()
            return True

        return False

    def action_wait(self) -> None:
        """Skip the player's turn."""
        if self.state == STATE_PLAYING:
            self._end_player_turn()

    def action_pickup(self) -> None:
        """Pick up items at the player's location."""
        if self.state != STATE_PLAYING:
            return
        here = self.items_at(self.player.x, self.player.y)
        if not here:
            self.add_message("There is nothing here to pick up.")
            return
        for item in here:
            if isinstance(item, Gold):
                self.player.gold += item.amount
                self.items.remove(item)
                self.add_message(f"You pick up {item.amount} gold pieces.")
            else:
                slot = self.player.add_item(item)
                if slot:
                    self.items.remove(item)
                    self.add_message(f"({slot}) {item.display_name()}")
                else:
                    self.add_message("Your pack is too full.")
                    break
        self._end_player_turn()

    def action_use_item(self, item: Item) -> None:
        """Use/activate an item from inventory."""
        if self.state != STATE_PLAYING:
            return
        result = item.use(self)
        if result == "__identify__":
            self.state = STATE_IDENTIFY
            self.add_message("Which item do you want to identify?")
        else:
            self.add_message(result)
            # Consumables are removed after use
            if isinstance(item, (Potion, Scroll, Food)):
                self.player.remove_item(item)
        self._end_player_turn()

    def action_identify_item(self, item: Item) -> None:
        """Called when player selects an item to identify."""
        item.identified = True
        if isinstance(item, Potion):
            item.registry.identify(item.effect_key)
        if isinstance(item, Scroll):
            item.registry.identify(item.effect_key)
        self.add_message(f"That is {item.display_name()}.")
        self.state = STATE_PLAYING

    def action_drop_item(self, item: Item) -> None:
        """Drop an item at the player's location."""
        if self.state != STATE_PLAYING:
            return
        item.x = self.player.x
        item.y = self.player.y
        self.player.remove_item(item)
        self.items.append(item)
        self.add_message(f"You drop the {item.display_name()}.")
        self._end_player_turn()

    def action_descend(self) -> None:
        """Go down stairs."""
        if self.state != STATE_PLAYING:
            return
        if self.dungeon.tile(self.player.x, self.player.y) != TILE_STAIRS_DN:
            self.add_message("You see no stairs going down here.")
            return
        if self.dungeon_level >= MAX_DUNGEON_LEVEL:
            self.add_message("You are already at the lowest level!")
            return
        self.dungeon_level += 1
        self._change_level()
        self.add_message(f"You descend to dungeon level {self.dungeon_level}.")

    def action_ascend(self) -> None:
        """Go up stairs."""
        if self.state != STATE_PLAYING:
            return
        if self.dungeon.tile(self.player.x, self.player.y) != TILE_STAIRS_UP:
            self.add_message("You see no stairs going up here.")
            return
        if self.dungeon_level == 1 and not self.player.has_amulet:
            self.add_message("You need the Amulet of Yendor to leave the dungeon!")
            return
        if self.dungeon_level == 1 and self.player.has_amulet:
            self._trigger_win()
            return
        self.dungeon_level -= 1
        self._change_level()
        self.add_message(f"You ascend to dungeon level {self.dungeon_level}.")

    # ------------------------------------------------------------------
    # Combat helpers
    # ------------------------------------------------------------------

    def _player_attack(self, target: Monster) -> None:
        # To-hit: roll 1d20, need to beat target AC
        hit_roll = random.randint(1, 20)
        if hit_roll < target.defense:
            self.add_message(f"You miss the {target.name}.")
            return

        damage = self.player.roll_attack()
        target.take_damage(damage)
        self.add_message(f"You hit the {target.name} for {damage} damage!")

        if not target.alive:
            self.add_message(f"You killed the {target.name}!")
            self.monsters.remove(target)
            # Drop some gold occasionally
            if random.random() < 0.2:
                amount = random.randint(1, target.xp_value // 2 + 1)
                self.items.append(Gold(target.x, target.y, amount))
            # Grant experience
            lvl_msg = self.player.gain_exp(target.xp_value)
            if lvl_msg:
                self.add_message(lvl_msg)

    # ------------------------------------------------------------------
    # Monster turn processing
    # ------------------------------------------------------------------

    def _process_monsters(self) -> None:
        for monster in list(self.monsters):
            if not monster.alive:
                continue
            msg = monster.act(self)
            if msg:
                self.add_message(msg)
            # Troll regeneration
            if "regenerate" in monster.flags and self.turn % 5 == 0:
                monster.heal(1)
            # Tick monster status effects
            monster.tick_effects()

    # ------------------------------------------------------------------
    # End-of-turn bookkeeping
    # ------------------------------------------------------------------

    def _end_player_turn(self) -> None:
        self.turn += 1

        # Tick player status effects
        msgs = self.player.tick_effects()
        for m in msgs:
            self.add_message(m)

        # Hunger
        hunger_msg = self.player.tick_hunger()
        if hunger_msg:
            self.add_message(hunger_msg)
        if self.player.hunger <= 0 and self.turn % 10 == 0:
            self.player.take_damage(1)
            self.add_message("You feel faint from hunger!")

        # Monster detection wears off
        if self.monster_detection_turns > 0:
            self.monster_detection_turns -= 1

        # Process monster turns
        self._process_monsters()

        # Check player death
        if not self.player.alive:
            self._trigger_death()

    # ------------------------------------------------------------------
    # Level transitions
    # ------------------------------------------------------------------

    def _change_level(self) -> None:
        self.dungeon = self._build_dungeon()
        px, py = self.dungeon.player_start
        self.player.move_to(px, py)
        self.dungeon.compute_fov(px, py)
        self._populate()

    # ------------------------------------------------------------------
    # Item effect helpers (called by items)
    # ------------------------------------------------------------------

    def teleport_player(self) -> None:
        """Teleport player to a random walkable location."""
        candidates = [
            (x, y)
            for y in range(MAP_HEIGHT)
            for x in range(MAP_WIDTH)
            if self.dungeon.is_walkable(x, y)
               and self.monster_at(x, y) is None
        ]
        if candidates:
            nx, ny = random.choice(candidates)
            self.player.move_to(nx, ny)
            self.dungeon.compute_fov(nx, ny)
            self.add_message("...you teleport!")

    def teleport_monster(self, monster: Monster) -> None:
        candidates = [
            (x, y)
            for y in range(MAP_HEIGHT)
            for x in range(MAP_WIDTH)
            if self.dungeon.is_walkable(x, y)
               and self.monster_at(x, y) is None
               and (x, y) != (self.player.x, self.player.y)
        ]
        if candidates:
            monster.x, monster.y = random.choice(candidates)

    def spawn_monster_near(self, cx: int, cy: int) -> None:
        """Spawn a random monster near a given position."""
        for _ in range(50):
            x = cx + random.randint(-3, 3)
            y = cy + random.randint(-3, 3)
            if (0 <= x < MAP_WIDTH and 0 <= y < MAP_HEIGHT and
                    self.dungeon.is_walkable(x, y) and
                    self.monster_at(x, y) is None and
                    (x, y) != (self.player.x, self.player.y)):
                self.monsters.append(spawn_monster(x, y, self.dungeon_level))
                return

    def reveal_map(self) -> None:
        """Reveal all explored tiles (magic map scroll)."""
        for y in range(MAP_HEIGHT):
            for x in range(MAP_WIDTH):
                if self.dungeon.tiles[y][x] != 0:
                    self.dungeon.explored[y][x] = True

    def zap_wand(self, wand: "Wand") -> str:
        """Apply wand effect toward the nearest visible monster."""
        p = self.player
        key = wand.effect_key
        visible_monsters = [
            m for m in self.monsters
            if m.alive and self.dungeon.visible[m.y][m.x]
        ]
        if not visible_monsters and key not in ("teleport_to", "lightning", "fire", "cold"):
            return "The wand discharges harmlessly."

        target = (min(visible_monsters,
                      key=lambda m: abs(m.x - p.x) + abs(m.y - p.y))
                  if visible_monsters else None)

        if key == "magic_missile" and target:
            dmg = random.randint(1, 4) + 1
            target.take_damage(dmg)
            if not target.alive:
                self.monsters.remove(target)
                self.player.gain_exp(target.xp_value)
                return f"The bolt kills the {target.name}!"
            return f"The magic missile hits the {target.name} for {dmg} damage!"

        if key == "slow_monster" and target:
            target.speed = max(1, target.speed - 1)
            return f"The {target.name} slows down."

        if key == "sleep_monster" and target:
            target.sleeping = random.randint(10, 20)
            return f"The {target.name} falls asleep."

        if key == "drain_life" and target:
            dmg = p.hp // 2
            p.take_damage(dmg)
            target.take_damage(dmg * 2)
            if not target.alive:
                self.monsters.remove(target)
                return f"The life drain kills the {target.name}!"
            return f"You drain life — the {target.name} takes {dmg*2} damage."

        if key == "confusion" and target:
            target.confused = CONFUSED_TURNS
            return f"The {target.name} looks confused."

        if key == "teleport_to":
            self.teleport_player()
            return "You feel dizzy..."

        if key in ("lightning", "fire", "cold") and target:
            base = {"lightning": 6, "fire": 8, "cold": 5}[key]
            dmg = sum(random.randint(1, base) for _ in range(4))
            target.take_damage(dmg)
            if not target.alive:
                self.monsters.remove(target)
                return f"The {key} kills the {target.name}!"
            return f"The {key} hits the {target.name} for {dmg} damage!"

        return "The wand discharges."

    # ------------------------------------------------------------------
    # Win / death
    # ------------------------------------------------------------------

    def _check_stairs_message(self) -> None:
        t = self.dungeon.tile(self.player.x, self.player.y)
        if t == TILE_STAIRS_DN:
            self.add_message("You see a staircase going down (use Descend button).")
        elif t == TILE_STAIRS_UP:
            self.add_message("You see a staircase going up (use Ascend button).")

    def _auto_pickup_gold(self) -> None:
        """Auto-pick up gold coins."""
        here = [i for i in self.items
                if i.x == self.player.x and i.y == self.player.y
                and isinstance(i, Gold)]
        for g in here:
            self.player.gold += g.amount
            self.items.remove(g)
            self.add_message(f"You pick up {g.amount} gold pieces.")

    def _trigger_death(self) -> None:
        self.state = STATE_DEAD
        self.add_message(
            f"You die...  Score: {self._score()}"
        )

    def _trigger_win(self) -> None:
        self.state = STATE_WIN
        self.add_message(
            f"You escape with the Amulet of Yendor!  "
            f"Final score: {self._score()}"
        )

    def _score(self) -> int:
        return (self.player.exp_pts +
                self.player.gold +
                self.dungeon_level * 100 +
                self.player.exp_level * 500)

    # ------------------------------------------------------------------
    # Render helpers (called by the UI)
    # ------------------------------------------------------------------

    def get_render_data(self) -> Dict:
        """Return everything the UI needs to draw the current frame."""
        p = self.player
        dungeon = self.dungeon
        detect_mode = self.monster_detection_turns > 0

        tiles = []
        for y in range(MAP_HEIGHT):
            row = []
            for x in range(MAP_WIDTH):
                tile_id  = dungeon.tiles[y][x]
                visible  = dungeon.visible[y][x]
                explored = dungeon.explored[y][x]
                row.append((tile_id, visible, explored))
            tiles.append(row)

        monster_data = []
        for m in self.monsters:
            if not m.alive:
                continue
            visible = dungeon.visible[m.y][m.x] or detect_mode
            if p.hallucinating > 0 and visible:
                # Hallucination: show random character
                import string
                ch = random.choice(string.ascii_letters)
                monster_data.append((m.x, m.y, ch, m.color, visible))
            elif m.invisible and not p.see_invisible:
                pass  # Don't show invisible monsters
            else:
                monster_data.append((m.x, m.y, m.char, m.color, visible))

        item_data = []
        for item in self.items:
            visible = dungeon.visible[item.y][item.x]
            if visible or dungeon.explored[item.y][item.x]:
                item_data.append((item.x, item.y, item.char, item.color, visible))

        return {
            "tiles":    tiles,
            "player":   (p.x, p.y, p.char, p.color),
            "monsters": monster_data,
            "items":    item_data,
            "messages": list(self.messages),
            "hud": {
                "hp":      p.hp,
                "max_hp":  p.max_hp,
                "str":     p.str_cur,
                "ac":      p.effective_ac,
                "level":   p.exp_level,
                "exp":     p.exp_pts,
                "gold":    p.gold,
                "hunger":  p.hunger,
                "dlevel":  self.dungeon_level,
                "turn":    self.turn,
                "confused": p.confused > 0,
                "blinded":  p.blinded > 0,
                "hasted":   p.hasted > 0,
                "poisoned": p.poisoned > 0,
                "frozen":   p.frozen > 0,
                "has_amulet": p.has_amulet,
            },
            "state": self.state,
        }
