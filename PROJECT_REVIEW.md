# Project Review — Rogue (TypeScript/Expo PWA)

*Review date: 2026-07-05. Scope: full repository — engine fidelity vs. the
original Rogue 5.4.4, code efficiency, and security. Fidelity claims were
re-verified against the canonical 5.4.4 C source published on the internet
(`extern.c`, `fight.c`, `monsters.c`, `scrolls.c`, `init.c` from the
Davidslv/rogue mirror of the BSD 5.4.4 tree).*

---

## 1. Verdict at a glance

| Area | Grade | Summary |
|---|---|---|
| Fidelity to Rogue 5.4.4 | **A−** | Core formulas and data tables verified byte-for-byte correct. A handful of real divergences remain (see §2). |
| Code quality / efficiency | **B+** | Clean, well-commented, 78 green tests, typechecks clean. Main issue: full-state JSON save on *every* turn. |
| Security | **A−** | No runtime network calls, no secrets, offline PWA. 12 moderate `npm audit` findings, all in Expo *build* tooling; save-file loading trusts its input; CI actions pinned by tag not SHA. |
| Licensing readiness | **C** | The repo ships Expo's template MIT LICENSE (copyright 650 Industries) — the project has no license of its own. Must be fixed before any distribution/monetization. |

**Is the game identical to the original?** No — and byte-identical is
impossible by design (different PRNG, touch UI, no terminal). But it is a
*faithful mechanical recreation*: every load-bearing formula and data table I
checked against the published 5.4.4 source matches exactly. What remains are
~10 concrete behavioral divergences, listed below with fixes.

## 2. Fidelity — verified ✅ and divergent ❌

### Verified exact against the published C source

- **Combat**: `swing(at_lvl, op_arm, wplus)` = `rnd(20) + wplus >= (20 - at_lvl) - op_arm` — identical to `fight.c`.
- **Strength tables**: `STR_PLUS[]` / `ADD_DAM[]` match `fight.c` verbatim (all 32 entries each).
- **Monster table**: all 26 monsters match `extern.c` — names (centaur, black unicorn), exp, levels, signed AC (dragon −1, unicorn −2), carry% (incl. medusa 40), damage strings (`1x8/1x8/3x10` etc.), HP = level d8.
- **XP curve**: `e_levels[]` thresholds match exactly (10 … 8,000,000).
- **Spawn depth logic**: our `randmonster()` index arithmetic reduces to the original's `level + rnd(10) − 6` range with identical clamps (verified algebraically against `monsters.c`), and `lvl_mons` order `KEBSHIROZLCQANYFTWPXUMVGJD` is correct; `lev_add` depth scaling past level 26 matches.
- **Item tables**: object-class probabilities (26/36/16/7/7/4/4), all potion/scroll/ring/wand probability columns, the nine original weapons with correct wield/hurl dice, and the eight armors match `extern.c`.
- **Hunger constants**: HUNGERTIME 1300, STOMACHSIZE 2000, MORETIME 150, STARVETIME 850 — match `rogue.h`.
- **Dungeon shape**: 3×3 grid, gone rooms (`rnd(4)`), dark rooms (`rnd(10) < level−1`), maze rooms (`rnd(15)==0`), spanning-tree corridors — matches `rooms.c`/`passages.c` structure.
- Player start HP 12 / STR 16, regen (`doctor()`), amulet-gated ascent, ISMEAN room aggro, no-diagonal doorway rule.

### Divergences found (recommended changes, highest impact first)

1. **Missing starting equipment** *(biggest gap)*. `init.c` gives the hero: 1
   food ration, **+1 ring mail (worn)**, **+1/+1 mace (wielded)**, **+1 short
   bow**, and **25–39 arrows** — all pre-identified. Our hero starts
   empty-handed, which makes the early game dramatically harder than the
   original and undercuts the throwing system. *Fix: add the original pack in
   the `Player`/`GameEngine` constructor.*
2. **Scroll of sleep affects the wrong side.** Original: *the reader* falls
   asleep (`no_command += rnd(SLEEPTIME)+4` — it's a bad scroll). Ours puts
   all monsters to sleep, turning a curse into a boon. *Fix: sleep the player
   4–8 turns.*
3. **Scroll of scare monster.** Original: reading it wastes it ("you hear
   maniacal laughter"); its power is when *dropped* — monsters refuse to step
   on its square. Ours scares every monster on read. *Fix: make reading a dud
   and give the dropped scroll a repel effect.*
4. **Scroll of hold monster radius.** Original holds monsters within ±2
   squares of the hero; ours freezes every monster on the level. *Fix: apply
   the 5×5 window.*
5. **Wandering monsters use the wrong table.** Original wanderers draw from
   `wand_mons`, which excludes letters that never wander (F, I, L, N, X, Z);
   ours uses `lvl_mons` for both. *Fix: add the `wand_mons` mask to
   `randMonsterLetter(level, wander)`.*
6. **Trap frequency.** Original: traps appear only when `rnd(10) < level`
   (rare early), count `rnd(level/4)+1`, max 10. Ours always places
   `1..1+level/2` traps, so level 1 is over-trapped. *Fix: gate placement on
   the level roll and use the original count.*
7. **Fainting from hunger.** Original: at food ≤ 0 the hero randomly loses
   turns (faints); death only after STARVETIME. Ours deals chip damage
   instead. *Fix: replace the 20% 1-damage roll with `frozen += rnd(8)+4`-style faints.*
8. **Potion of raise level** adds the next threshold to XP instead of setting
   XP *to* the next threshold (`e_exp = next`), slightly over-leveling. *Fix: set, don't add.*
9. **Xeroc doesn't disguise.** The `disguise` flag is defined but unused —
   the original xeroc appears as a random item until touched. *Fix or drop the flag.*
10. **Score formula.** Original score is essentially gold (with rank list);
    ours adds `depth*100 + level*100`. Fine as a house rule — but document it,
    or revert for purism.

Minor/acceptable (documented) simplifications: no secret doors, single-target
auto-aimed wands/throws, amulet placed at the level-26 down-stairs, generic
five-way identify UI, JS PRNG instead of the BSD `rnd()` stream.

## 3. Efficiency findings

The engine itself is fine for an 80×22 grid — the hot spots are at the
app/persistence boundary:

1. **Save-on-every-turn** (`App.tsx refresh()` → `saveGame()`): every keypress
   serializes the whole engine — tiles + `visible` + `explored` are ~5,300
   JSON scalars (~40–80 KB) — and writes it to AsyncStorage/localStorage
   (synchronous on web). *Fix: debounce saves (e.g. every 10 turns + on
   background/stairs/death), and pack the three per-cell layers as
   run-length-encoded strings. ~50× less I/O.*
2. **`getRenderData()` allocates a fresh 80×22×3 array every turn** even
   though only visibility changes. *Fix: return typed arrays / reuse buffers,
   or expose dirty-rect info. Low priority at this size, but free GC wins.*
3. **`DungeonView` renders 448 `<Text>` nodes per frame.** On low-end Android
   this is the render bottleneck. *Fix: one `<Text>` per row with nested
   colored spans (28→16 elements), or move to Skia/canvas later.*
4. **Per-monster BFS + `occupiedPositions()` rebuilt per action.** O(map)
   BFS per monster per turn; with ≤15 monsters it's fine, but a single
   Dijkstra flood-fill from the player per turn (shared by all monsters) is
   the classic roguelike optimization if monster counts ever grow.
5. `Scroll`/`Potion` `trueName()` does a linear `find()` per call — trivially
   cacheable; cosmetic.

## 4. Security findings

1. **Dependency audit**: 12 moderate vulnerabilities, **all** in the
   `expo`/`@expo/cli`/`@expo/config` build-time chain — none ship in the
   exported web bundle. *Fix: upgrade Expo SDK 54 → 56 (AGENTS.md already
   points at the v56 docs); re-run `npm audit`.*
2. **Save-file trust**: `deserializeEngine()` assigns `JSON.parse` output
   directly into engine internals (`(reg as any).identifiedMap = d…`). It's
   local-only data so today's blast radius is a crash/cheat, but (a) a
   malformed save bricks the "Continue" path until storage is cleared, and
   (b) the moment leaderboards exist this becomes an integrity boundary.
   *Fix: wrap in schema validation with safe fallback to a new game; keep the
   existing try/catch so corruption never blocks app start (it already
   returns null on throw — good).*
   - Related bug: `Weapon` save/restore doesn't persist `hurlDice`/`missile`/
     `launcher` (rebuilds as template 0 = mace), so a saved dagger reloads
     with mace throwing stats and loses its missile flag. Serialize the
     template index (same for Armor) instead of patching fields.
3. **CI supply chain**: workflow actions pinned by tag (`actions/checkout@v4`)
   rather than commit SHA; `permissions` are otherwise correctly minimal
   (`contents: read`, `pages: write`, `id-token: write`). *Fix: pin to SHAs.*
4. **PWA**: service worker is same-origin, cache keys are content-hashed, no
   third-party requests at runtime, no analytics, no secrets in the repo.
   Optionally add a CSP `<meta>` tag in `build-pwa.mjs` (default-src 'self')
   for defense-in-depth.
5. **Licensing** *(blocker for distribution)*: the only LICENSE file is
   Expo's template MIT (© 650 Industries). The engine is a clean-room
   reimplementation (formulas/data, no C code copied) of Rogue 5.4.4, whose
   source was released by its authors under a BSD-style license. *Fix: add
   the project's own LICENSE, an attribution note to Toy/Arnold/Wichman, and
   (if monetizing) rebrand — see MONETIZATION_PLAN.md.*

## 5. Recommended change list (prioritized)

| # | Change | Type | Effort |
|---|---|---|---|
| 1 | Add original starting pack (food, +1 ring mail, +1/+1 mace, +1 bow, 25–39 arrows) | fidelity | S |
| 2 | Fix sleep / scare / hold-monster scroll behaviors | fidelity | S |
| 3 | Fix Weapon (and Armor) save round-trip: serialize template index | bug | S |
| 4 | Debounce saves + compress map layers | perf | M |
| 5 | Original trap gating + hunger fainting | fidelity | S |
| 6 | `wand_mons` table for wanderers; raise-level set-not-add; xeroc disguise or drop flag | fidelity | S |
| 7 | Replace repo LICENSE with project license + Rogue attribution | legal | S |
| 8 | Upgrade Expo SDK 54 → 56; clear npm audit | security/maint | M |
| 9 | Pin GitHub Action SHAs; optional CSP meta | security | S |
| 10 | Row-level text rendering in DungeonView | perf | M |
| 11 | Save-schema validation (pre-req for leaderboards) | security | M |

Items 1–3 change gameplay/persistence and should land before any store
release; 4–6 next; 7–9 before monetization work begins.

## 6. Monetization

See **[MONETIZATION_PLAN.md](MONETIZATION_PLAN.md)** — written as a
self-contained execution brief that can be handed directly to a Claude Opus
session to implement.
