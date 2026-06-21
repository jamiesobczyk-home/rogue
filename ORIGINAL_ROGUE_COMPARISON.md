# Aligning Our Rogue With the Original (Rogue 5.4.4)

This document compares our game's logic against the canonical **Rogue 5.4.4**
C source and lays out a prioritized plan to make our mechanics as faithful as
practical.

## 1. Source of truth

The original Rogue is the 1980–1986 game by Michael Toy, Ken Arnold, and Glenn
Wichman. The last public release of the BSD line is **Rogue 5.4.4**. We compared
against these mirrors of that source tree:

- `Davidslv/rogue` — Original Rogue Game (5.4.4): https://github.com/Davidslv/rogue
- `fiorenzo1963/rogue` — 5.4.4 with bug fixes: https://github.com/fiorenzo1963/rogue
- `lcn2/rogue5.4` — BSD Rogue 5.4, ported to modern C: https://github.com/lcn2/rogue5.4

Key files referenced: `fight.c` (combat), `extern.c` (all data tables),
`monsters.c`/`chase.c` (monster AI), `rooms.c` (level generation), `rogue.h`
(constants).

Our implementation under review is the TypeScript engine in
`rogue-app/src/engine/` (the Python engine in `rogue/game/` is a 1:1 sibling and
shares all the same divergences).

> **Note on the goal.** "As close as possible to the original" does *not* mean a
> byte-perfect RNG match — CPython/JS PRNGs cannot reproduce the BSD `rnd()`
> stream, and that has no gameplay value. It means matching the *formulas, data
> tables, and decision logic* so the game *plays* like Rogue.

---

## 2. Executive summary of divergences

| Subsystem | Faithfulness today | Severity of gap |
|---|---|---|
| Armor (names + AC values) | ✅ Matches original exactly | none |
| Hunger constant (1300) | ✅ Correct base value | low |
| Monster HP = level d8 | ✅ Mostly correct shape | low |
| **Combat to-hit formula** | ❌ Invented (`roll < defense`) | **high** |
| **Strength modifiers** | ❌ Invented thresholds | **high** |
| **Monster stat table** | ⚠️ Wrong names + many wrong stats | **high** |
| **XP-to-level table** | ❌ Pure doubling, diverges after L7 | medium |
| ~~Dungeon generation~~ | ✅ 3×3 grid + gone/dark/maze rooms (Phase 4) | resolved |
| ~~Player HP regeneration~~ | ✅ Turn-based doctor() (Phase 3) | resolved |
| ~~Item tables (potions/scrolls/rings/wands)~~ | ✅ Weighted, completed, rings functional (Phase 5) | resolved |
| ~~Weapon table + multi-attack damage~~ | ✅ Original nine weapons + monster multi-attack | resolved |
| ~~FOV / dark rooms~~ | ✅ Dark rooms + corridor-only sight (Phase 4) | resolved |
| ~~Hunger model~~ | ✅ STOMACHSIZE/MORETIME/STARVETIME (Phase 6) | resolved |

---

## 3. Subsystem-by-subsystem comparison

### 3.1 Combat / to-hit  — **high priority**

**Original (`fight.c`, `swing()`):**
```c
swing(at_lvl, op_arm, wplus):
    res  = rnd(20)                 // 0..19
    need = (20 - at_lvl) - op_arm
    return (res + wplus) >= need
```
- `at_lvl` = attacker level (player exp level, or monster `s_lvl`).
- `op_arm` = defender armor class (lower is better; player default 10 → wearing
  armor *lowers* it; monster AC from the table, e.g. dragon −1).
- `wplus` = `hit_plus` from weapon/rings **plus** `str_plus[strength]`.
- Damage (`roll_em`): for each `NxS` group, sum N rolls of d`S`, then
  `+ dmg_plus(weapon/rings) + add_dam[strength]`, floored at 1 if it hits.

**Ours (`engine.ts playerAttack` / `monsters.ts attack`):**
```ts
hitRoll = randint(1,20)
if (hitRoll < target.defense) miss        // player→monster
if (hitRoll < player.effectiveAc) miss    // monster→player
```
This treats AC as a flat to-hit threshold and ignores attacker level and
strength entirely. It is not the Rogue formula.

**Action:** Replace both hit checks with a shared `swing(atLvl, opArm, wplus)`.
Store monster AC as the *original signed AC* (lower = better), not as a
"defense threshold."

### 3.2 Strength system — **high priority**

Original strength is an integer (start **16**, hard max 31) with two lookup
tables, indexed directly by the strength value (`extern.c` / `fight.c`):

```
str_plus[] = -7,-6,-5,-4,-3,-2,-1, 0,0,0,0,0,0,0,0,0,0, 1,1,1,1, 2,2,2,2,2,2,2,2,2,2, 3
add_dam[]  = -7,-6,-5,-4,-3,-2,-1, 0,0,0,0,0,0,0,0,0,    1,1,2,3, 3,4,5,5,5,5,5,5,5,5,5, 6
```
So at the starting STR 16: `str_plus[16] = 0`, `add_dam[16] = 1`.

**Ours (`entities.ts`):** an invented `strDamageBonus` ladder
(`≥18→6, ≥16→4, …`) and no to-hit contribution at all. STR also caps at 18 in
our potion code, but the original caps at 31 and uses percentile-free integers.

**Action:** Port `str_plus`/`add_dam` verbatim, index by `strCur`, raise the cap
to 31, feed `str_plus` into `swing()` and `add_dam` into damage.

### 3.3 Monster stat table — **high priority**

The authoritative table (`extern.c`, `struct monster monsters[26]`), columns
`{ str, exp, lvl, AC, hpt, damage }` (AC lower = better; HP rolled as `lvl`d8):

| L | Name (ours → original) | exp | lvl | AC | Damage | Flags |
|---|---|---|---|---|---|---|
| A | aquator | 20 | 5 | 2 | 0x0/0x0 (rusts armor) | MEAN |
| B | bat | 1 | 1 | 3 | 1x2 | FLY |
| C | **centipede → centaur** | 17 | 4 | 4 | 1x2/1x5/1x5 | — |
| D | dragon | 5000 | 10 | −1 | 1x8/1x8/3x10 | MEAN |
| E | emu | 2 | 1 | 7 | 1x2 | MEAN |
| F | venus flytrap | 80 | 8 | 3 | %%%x0 (holds) | MEAN |
| G | griffin | 2000 | 13 | 2 | 4x3/3x5 | MEAN·FLY·REGEN |
| H | hobgoblin | 3 | 1 | 5 | 1x8 | MEAN |
| I | ice monster | 5 | 1 | 9 | 0x0 (freezes) | — |
| J | jabberwock | 3000 | 15 | 6 | 2x12/2x4 | — |
| K | kestrel | 1 | 1 | 7 | 1x4 | MEAN·FLY |
| L | leprechaun | 10 | 3 | 8 | 1x1 (steals gold) | — |
| M | medusa | 200 | 8 | 2 | 3x4/3x4/2x5 | MEAN |
| N | nymph | 37 | 3 | 9 | 0x0 (steals item) | — |
| O | orc | 5 | 1 | 6 | 1x8 | GREED |
| P | phantom | 120 | 8 | 3 | 4x4 | INVIS |
| Q | quagga | 15 | 3 | 3 | 1x5/1x5 | MEAN |
| R | rattlesnake | 9 | 2 | 3 | 1x6 (lowers STR) | MEAN |
| S | snake | 2 | 1 | 5 | 1x3 | MEAN |
| T | troll | 120 | 6 | 4 | 1x8/1x8/2x6 | REGEN·MEAN |
| U | **ur-vile → black unicorn** | 190 | 7 | −2 | 1x9/1x9/2x9 | MEAN |
| V | vampire | 350 | 8 | 1 | 1x10 (drains max HP) | REGEN·MEAN |
| W | wraith | 55 | 5 | 4 | 1x6 (drains XP) | — |
| X | xeroc | 100 | 7 | 7 | 4x4 | — |
| Y | yeti | 50 | 4 | 6 | 1x6/1x6 | — |
| Z | zombie | 6 | 2 | 8 | 1x8 | MEAN |

Carry-% (chance to drop treasure): dragon/nymph 100, jabberwock 70, troll 50,
medusa/xeroc/yeti 30, griffin/vampire 20, centaur/orc 15.

**Ours diverges on:** two names (C, U), most `exp` values, most AC values
(and AC *sign convention*), several `lvl` values (e.g. our centipede `[2,4]`),
and the damage model — original monsters have **multiple attacks per turn**
(`1x8/1x8/2x6`); ours collapses to one die pair plus ad-hoc special-flag riders.

Depth spawning order (`lvl_mons`, the "native" monster per level 1→26):
`K E B S H I R O Z L C Q A N Y F T W P X U M V G J D`.
Below the Amulet level monsters are upgraded: `lev_add = max(0, level - 26)`
adds to `s_lvl` and `+10*lev_add` to exp.

**Action:** Rebuild the template table from the values above, store signed AC,
support a `damage: string[]` of `NxS` attack groups, and roll HP as `lvl`d8.

### 3.4 Experience / leveling — medium

Original `e_levels[]` (`extern.c`), thresholds to reach L2…L21:
```
10, 20, 40, 80, 160, 320, 640, 1300, 2600, 5200, 13000, 26000,
50000, 100000, 200000, 400000, 800000, 2000000, 4000000, 8000000
```
Ours is a pure ×2 progression (`…640, 1280, 2560, 5120 …`) that matches only
through L7 then diverges sharply. On level-up the original adds `roll(1, 10)` HP
(we use `randint(3,10)`).

**Action:** Replace `PLAYER_EXP_TABLE` with `e_levels`; use `roll(1,10)` HP gain.

### 3.5 Dungeon generation — **high priority**

**Original (`rooms.c`, `do_rooms()`):** the 80×N map is a fixed **3×3 grid**
(`MAXROOMS = 9`), `bsze = (COLS/3, LINES/3)`. Exactly one room per cell; each
room's size/offset is randomized within its cell. `rnd(4)` cells become **gone
rooms** (ISGONE — a single corridor junction instead of a room). A room is
**dark** when `rnd(10) < level - 1` (deeper ⇒ darker), and `rnd(15)==0` makes a
**maze** room. Rooms are then connected as a graph of grid neighbors (`passages`
in `passages.c`): pick a start, spanning-tree to all neighbors, add a few extra
edges, then carve L-shaped corridors door-to-door.

**Ours (`dungeon.ts`):** up to 9 *randomly placed, non-overlapping* rooms, then
corridors carved by sorting rooms on X and chaining centers (plus one wrap-around
edge). No grid, no gone/dark/maze rooms, doors are incidental wall-cut cells.

**Action (largest single task):** Re-implement `do_rooms()` on the 3×3 grid with
gone/dark/maze flags, and a neighbor-graph corridor pass. This is what gives
Rogue its recognizable level shape.

### 3.6 Player regeneration — medium

Original: the hero passively heals over time — roughly every `(level<8 ?
21-level*2 : 3)` turns you regain 1 HP (and rings of regeneration speed it).
**Ours has no natural HP regen at all** (only potions heal). This materially
changes pacing.

**Action:** Add a turn-based regen counter to `endPlayerTurn()`.

### 3.7 Item tables — medium

Armor already matches the original (names + AC). The other tables are
incomplete and, importantly, **unweighted** — ours picks items uniformly; the
original uses the probability column (`pick_one`). Highlights of the gaps:

- **Potions (14 in original):** we are missing **levitation** and
  **magic detection**; original probabilities are non-uniform (gain strength,
  healing, restore strength are common at 13%; raise level rare at 2%).
- **Scrolls (18 in original):** original splits identify into five variants
  (potion/scroll/weapon/armor/ring-wand) and adds **food detection**,
  **protect armor**, **levitation**-adjacent effects; ours has 11 merged ones.
- **Rings (14 in original):** ours defines 8 keys but `Ring.use()` is **inert**
  ("You slip on the ring") — no passive effects are applied. Original rings give
  real ongoing effects (protection, add strength, regeneration, searching,
  stealth, slow digestion, dexterity, increase damage, etc.) and increase hunger.
- **Wands/staffs (14 in original):** ours has 12 keys; missing **light**,
  **haste monster**, **teleport away** vs **teleport to** split, **nothing**.
- **Weapons:** original set is mace, long sword, short bow, arrow, dagger,
  two-handed sword, dart, shuriken, spear (with launchers + ammo). Ours invented
  morning star / war hammer / flail and dropped bows/ammo. Damage dice differ
  (e.g. original mace 2x4, long sword 3x4, two-handed 4x4, dagger 1x6).

Original probability columns (`extern.c`, name / prob% / worth) are reproduced in
the appendix so they can be ported directly.

### 3.8 Hunger — low

`HUNGERTIME = 1300`, `STOMACHSIZE = 2000`, `STARVETIME = 850`, `MORETIME = 150`
(`rogue.h`). Eating adds `HUNGERTIME` to `food_left` capped near `STOMACHSIZE`;
states trip at fixed remaining-food thresholds, then starvation. Our base 1300 is
right, but we count down from 1300 (not up to a 2000 stomach) and use ad-hoc
thresholds (300/150/20). Close enough that this is low priority, but the cap and
the "Hungry/Weak/Faint" trip points can be aligned to `MORETIME`/`STARVETIME`.

### 3.9 FOV / lighting — low

Original lights an entire **lit** room (and immediately-adjacent passage cells),
shows only the 8 neighbors in **dark** rooms and corridors. Ours always lights
the whole room. Once dark rooms (3.5) exist, restrict FOV in them to the hero's
neighborhood.

---

## 4. Prioritized implementation plan

Each phase is independently shippable and testable. Phases 1–3 deliver the
biggest "feels like Rogue" payoff for the least code.

**Phase 1 — Combat core (high impact, low risk). ✅ DONE (TypeScript engine).**
1. ✅ Added `STR_PLUS[]` / `ADD_DAM[]` + `strPlus()`/`addDam()` to `constants.ts`;
   raised the STR cap to 31 (`STR_MAX`), applied in the gain-strength potion.
2. ✅ New `combat.ts` with the authentic `swing(atLvl, opArm, wplus)` plus
   `parseDamage()` / `rollDamageGroups()` helpers (the latter ready for the
   Phase 2 multi-attack work).
3. ✅ `playerAttack` and `Monster.attack` now use `swing()`. Monster AC is stored
   as the original signed value (lower = better; dragon −1, black unicorn −2);
   player AC already uses the 10-minus-armor scale and is consumed via the
   formula, not a flat threshold. Player to-hit adds `strPlus + weapon enchant`;
   damage adds `addDam`.
4. ✅ Existing suites still green (28) + new `combat.test.ts` (5) locking the
   formula and the strength tables. Engine typechecks clean.

> **Python sibling — RETIRED.** The `rogue/` Python/Kivy app was removed; the
> TypeScript engine in `rogue-app/src/engine/` is now the single source of truth.
> README and the engine header comments were updated accordingly.

**Phase 2 — Monster + XP data (high impact, low risk). ✅ DONE.**
1. ✅ Rebuilt `MONSTER_TEMPLATES` from the authentic table: corrected names
   (**centaur**, **black unicorn**), exp, signed AC, treasure `carry%`, per-level
   stats, and a `damage` string of `NxS` attack groups. HP is now rolled as
   `level`d8.
2. ✅ Multi-attack turns: each damage group is an independent `swing()` + roll
   (claw/claw/bite); special-only monsters (aquator, ice monster, nymph,
   flytrap) resolve their effect instead. Vampire drains max-HP, wraith drains
   level (split correctly).
3. ✅ Replaced the doubling XP curve with the real `e_levels[]` thresholds.
4. ✅ Depth spawning now uses `randmonster()` over the `lvl_mons` order
   (`level + rnd(10) - 5`, clamped) instead of min/max-level weighting.
5. ✅ Treasure drops gated by `carry%`.

**Phase 3 — Player regeneration. ✅ DONE.**
`Player.regen()` (Rogue `doctor()`): below level 8, heal 1 HP every
`21 - 2*level` turns; from level 8, every 3 turns for `rnd(level-7)+1`. Wired
into `endPlayerTurn()`. (Ring-of-regeneration speed-up lands with Phase 5 rings.)

Tests after Phases 2–3: **41 green** (added `fidelity.test.ts`); engine
typechecks clean.

**Phase 2 — Monster + XP data (high impact, low risk).**
1. Rebuild `MONSTER_TEMPLATES` from §3.3 (correct names, exp, lvl, signed AC,
   `damage: string[]`, carry%). Roll HP as `lvl`d8.
2. Implement multi-attack turns (iterate the damage groups).
3. Replace `PLAYER_EXP_TABLE` with `e_levels`; HP gain `roll(1,10)`.
4. Use `lvl_mons` ordering + depth scaling for spawns.

**Phase 3 — Player regeneration (medium).**
Add the turn-based heal counter to `endPlayerTurn()` (faster at higher level,
and via ring of regeneration once rings work).

**Phase 4 — Dungeon generation (high impact). ✅ DONE (maze rooms deferred).**
1. ✅ `gridRooms()` lays one room per cell of a fixed 3×3 grid
   (`bsze = MAP/3`), sized and offset within each cell like `do_rooms()`.
2. ✅ `rnd(4)` cells become **gone rooms** (bare corridor junctions); rooms turn
   **dark** when `rnd(10) < level-1`, so deeper levels are darker.
3. ✅ `connectRooms()` builds a spanning tree over grid-adjacent rooms plus a few
   extra cycles (passages.c), and `conn()` carves bent corridors placing **doors**
   where they meet room walls (pierced walls also become doors).
4. ✅ FOV now gates on `room.dark`: lit rooms reveal fully, dark rooms and
   corridors reveal only the hero's immediate surroundings.
5. ✅ Stairs/spawns restricted to real (non-gone) rooms. Room layout flags are
   serialized so FOV survives save/reload.
6. ✅ **Maze rooms** (`rnd(15)==0`) are carved as a perfect maze of corridors
   (recursive backtracker); they read as corridor for FOV, and corridors tunnel
   in to the nearest maze passage so connectivity always holds (Phase 6).

Tests after Phase 4: **45 green** (added `dungeon.test.ts`: 9-room grid, gone
rooms, depth-scaled dark rooms, and start→down-stairs connectivity on 50 seeds,
plus an ASCII level dump). Engine typechecks clean.

**Phase 5 — Item fidelity. ✅ DONE (with noted simplifications).**
1. ✅ **Weighted generation** by the original probability columns: object type
   via `things[]` (potion 26 / scroll 36 / food 16 / weapon 7 / armor 7 / ring 4
   / wand 4), and effect/material via each `*_info` prob column (`pickByProb`).
2. ✅ Potions completed to all 14 (added **magic detection**, **levitation**);
   scrolls expanded (added **food detection**, **protect armor**, **monster
   confusion**); wands rebuilt to the real `ws_info` set (light, polymorph,
   haste/slow monster, teleport to/away, cancellation, invisibility, nothing, …).
3. ✅ **Functional rings** — two ring slots with wear/remove and real ongoing
   effects: protection (AC), add strength, sustain strength, see invisible,
   dexterity (to-hit), increase damage, regeneration (faster heal), slow
   digestion (food), maintain armor (rust immunity), aggravate (on wear),
   stealth (detection range), teleportation (random). Worn rings also cost food.
   Cursed rings can't be removed. State persists across save/load.
4. ✅ Weapons replaced with the original nine and correct dice (mace 2x4, long
   sword 3x4, two-handed 4x4, dagger 1x6, spear 2x3, …); base bonus is enchant
   only. Armor already matched.

> **Simplifications (documented, low impact):** the five identify scrolls are
> kept as one generic `identify` (combined 43% prob) rather than per-type;
> launchers/ammo (bow+arrow) are wieldable weapons without a separate
> fire-the-missile mechanic; `searching`/`adornment` rings are inert because we
> have no traps yet.

Tests after Phase 5: **54 green** (new `items.test.ts`: weapon dice, ring
effects, two-ring limit, cursed-ring lock, slow digestion, weighted
distribution). Engine typechecks clean.

**Phase 6 — Lighting & polish. ✅ DONE.**
1. ✅ **Hunger** rebuilt on the original units: `HUNGERTIME 1300`,
   `STOMACHSIZE 2000`, `MORETIME 150`, `STARVETIME 850`. Eating fills toward the
   2000-unit stomach; warnings fire as the hero *crosses* the 300 (hungry) / 150
   (weak) / 0 (faint) thresholds (robust to ring digestion); food can go negative
   and the hero starves to death after `STARVETIME` turns below zero.
2. ✅ Maze rooms carved (see Phase 4 item 6) — closes out the dungeon generator.
3. ✅ HUD hunger label aligned to the new thresholds; message strings nudged
   toward the original wording.

Dark-room FOV was already delivered in Phase 4.

Tests after Phase 6: **58 green** (added maze-room connectivity + hunger
threshold/eat-cap/starvation tests). Engine typechecks clean.

**Phase 7 — Traps, wandering monsters, hasted hero. ✅ DONE.**
1. ✅ **Traps** (`trap.c`): trap door (fall to next level + fall damage), bear
   trap (held), sleeping-gas (held/asleep), arrow (to-hit + 1d6), teleport,
   dart (1d4 + str drain), rust (corrodes armor). Hidden on floor (`rnd(level/4)+1`
   per level) until triggered or found; revealed as `^` (TILE_TRAP). Levitation
   floats over them; rust respects protect-armor / maintain-armor.
2. ✅ **Searching** — `actionSearch()` (Search button) reveals adjacent traps,
   which finally gives the `searching` ring a job.
3. ✅ **Wandering monsters** (`daemons.c rollwand`): every 4 turns a 1-in-6 roll
   spawns a new hunter on an unseen floor cell (aware + aggravated), with a
   ~70-turn cooldown and a 15-monster cap, so cleared levels stay dangerous.
4. ✅ **Hasted hero now works**: monsters run only on alternate turns while the
   hero is hasted (≈2× player speed). **Blindness** was already wired (FOV reveals
   nothing while blinded).

Tests after Phase 7: **64 green** (new `phase7.test.ts`: trap trigger/reveal,
trap-door descent, levitation, search, haste cadence, wandering spawn). Engine
typechecks clean.

**Phase 8 — Identification & item fidelity. ✅ DONE.**
1. ✅ **Split the five identify scrolls** (potion / scroll / weapon / armor /
   ring-or-wand); each only works on its own category and is rejected otherwise
   (the inventory titles the prompt accordingly).
2. ✅ **Ring & wand appearances obfuscated** — rings show as a random gem
   ("a ruby ring"), wands as a random material ("a copper wand"), per-game and
   persistent, until worn / zapped / identified (new `RingRegistry` /
   `WandRegistry`, mirroring potions and scrolls).
3. ✅ **Hallucination scrambles item glyphs** the hero can see, not just monsters.
4. ✅ **Monsters carry & drop real items** — each monster rolls its `carry%` for a
   pack item at spawn and drops it where it dies (loot centralised through
   `dropMonsterLoot`, covering melee and wand kills). Persisted in saves.

Tests after Phase 8: **69 green** (new `phase8.test.ts`: ring/wand obfuscation,
split-identify rejection, monster loot drop, hallucinated glyphs). Engine
typechecks clean.

### Status
**Phase 9 — Endgame & meta (Tier 3). ✅ DONE.**
1. ✅ **Amulet-gated ascent**: you cannot climb until you hold the Amulet of
   Yendor; descent now continues indefinitely past level 26.
2. ✅ **Depth scaling** (`lev_add`): monsters spawned below the Amulet level gain
   HP, experience, and combat level.
3. ✅ **Treasure rooms** (~1 in 20 levels): a room packed with gold and sleeping
   guardians.
4. ✅ **Scoring & tombstone**: cause of death is tracked (monster/trap/starvation/
   self) and shown on a RIP tombstone with depth, gold, turns, and a gold-driven
   score (+ amulet win bonus).

**In-app player guide. ✅ DONE.** A "How to Play" screen off the main menu with the
quest, controls, and colour-matched legends for the map, items, all 26 monsters,
and HUD status — plus reference links. (Chosen over external-only docs so it works
offline in the PWA.)

Tests after Phase 9: **74 green** (new `phase9.test.ts`: amulet gating, infinite
descent, depth scaling, treasure rooms, cause-of-death).

**Phase 10 — Remaining tail. ✅ DONE.**
1. ✅ **Throwing / ranged combat**: a Throw action (inventory button) hurls a
   weapon at the nearest visible monster using the original `weap_info` hurl
   dice; missiles (dart/shuriken/arrow/dagger/spear) carry; firing matching ammo
   while wielding its launcher (arrow + short bow) adds a bonus; the missile
   lands on the target's square.
2. ✅ **ISMEAN "awake in room"**: mean monsters (the 15 original ISMEAN letters)
   now wake the instant the hero shares their room, even out of line of sight;
   non-mean monsters still slumber until seen or disturbed.
3. ✅ **No diagonal moves through doorways/passages** (Rogue movement rule).

Tests after Phase 10: **78 green** (new `phase10.test.ts`).

### Status — feature-complete vs. the original's mechanics
Phases 1–10 are done. The TypeScript engine in `rogue-app/src/engine/` is the
single source of truth (the Python prototype was retired). Every major Rogue
5.4.4 subsystem — combat, strength, monsters, XP, dungeon layout, FOV, hunger,
regeneration, items/ID/rings/wands, traps, wandering monsters, haste/blindness,
the amulet endgame with depth scaling, treasure rooms, scoring, throwing, and
monster aggro — is now modelled on the original.

**Only deliberate deviation left:** the JS PRNG does not reproduce the BSD
`rnd()` stream byte-for-byte (large effort, zero gameplay effect — a numeric
seed won't regenerate the *identical* 1980 dungeon, but same-seed runs are fully
reproducible in our engine).

---

## 5. Appendix — original data tables (for direct porting)

**Potions** (name / prob% / worth) — `pot_info[]`:
confusion 7/5 · hallucination 8/5 · poison 8/5 · gain strength 13/150 ·
see invisible 3/100 · healing 13/130 · monster detection 6/130 ·
magic detection 6/105 · raise level 2/250 · extra healing 5/200 ·
haste self 5/190 · restore strength 13/130 · blindness 5/5 · levitation 6/75.

**Scrolls** — `scr_info[]`:
monster confusion 7/140 · magic mapping 4/150 · hold monster 2/180 · sleep 3/5 ·
enchant armor 7/160 · identify potion 10/80 · identify scroll 10/80 ·
identify weapon 6/80 · identify armor 7/100 · identify ring/wand/staff 10/115 ·
scare monster 3/200 · food detection 2/60 · teleportation 5/165 ·
enchant weapon 8/150 · create monster 4/75 · remove curse 7/105 ·
aggravate monsters 3/20 · protect armor 2/250.

**Rings** — `ring_info[]`:
protection 9/400 · add strength 9/400 · sustain strength 5/280 · searching 10/420 ·
see invisible 10/310 · adornment 1/10 · aggravate monster 10/10 · dexterity 8/440 ·
increase damage 8/400 · regeneration 4/460 · slow digestion 9/240 ·
teleportation 5/30 · stealth 7/470 · maintain armor 5/380.

**Wands/Staffs** — `ws_info[]`:
light 12/250 · invisibility 6/5 · lightning 3/330 · fire 3/330 · cold 3/330 ·
polymorph 15/310 · magic missile 10/170 · haste monster 10/5 · slow monster 11/350 ·
drain life 9/300 · nothing 1/5 · teleport away 6/340 · teleport to 6/50 ·
cancellation 5/280.

**Armor** (name / prob% / worth; AC base, lower=better) — `arm_info[]`:
leather 20/20 (AC 8) · ring mail 15/25 (7) · studded leather 15/20 (7) ·
scale mail 13/30 (6) · chain mail 12/75 (5) · splint mail 10/80 (4) ·
banded mail 10/90 (4) · plate mail 5/150 (3).

**Weapons** (name / prob% / worth) — `weap_info[]`:
mace 11/8 · long sword 11/15 · short bow 12/15 · arrow 12/1 · dagger 8/3 ·
two-handed sword 10/75 · dart 12/2 · shuriken 12/5 · spear 12/5.
Damage dice (wielded / thrown): mace 2x4/1x3 · long sword 3x4/1x2 ·
short bow 1x1/1x1 · arrow 1x1/2x3 · dagger 1x6/1x4 · two-handed sword 4x4/1x2 ·
dart 1x1/1x3 · shuriken 1x2/2x4 · spear 2x3/1x6.

**Strength tables** — `fight.c`:
```
str_plus[] = -7,-6,-5,-4,-3,-2,-1, 0,0,0,0,0,0,0,0,0,0, 1,1,1,1, 2,2,2,2,2,2,2,2,2,2, 3
add_dam[]  = -7,-6,-5,-4,-3,-2,-1, 0,0,0,0,0,0,0,0,0,    1,1,2,3, 3,4,5,5,5,5,5,5,5,5,5, 6
```

**Experience** — `e_levels[]`:
```
10, 20, 40, 80, 160, 320, 640, 1300, 2600, 5200, 13000, 26000,
50000, 100000, 200000, 400000, 800000, 2000000, 4000000, 8000000
```

**Constants** — `rogue.h`:
`HUNGERTIME 1300 · STOMACHSIZE 2000 · STARVETIME 850 · MORETIME 150 ·
AMULETLEVEL 26 · MAXROOMS 9 · MAXTRAPS 10`.
