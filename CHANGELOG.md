# Changelog

The app version is defined once in `rogue-app/app.json` (`expo.version`),
mirrored in `rogue-app/package.json`, exposed at runtime via
`rogue-app/src/version.ts`, and shown on the home screen. A test
(`__tests__/version.test.ts`) fails if the three drift apart. Bump the
version in both JSON files and add an entry here with every release.

## 1.1.0 — 2026-07-05

Fidelity fixes (verified against the published Rogue 5.4.4 C source):

- The hero now starts with the original pack: a food ration, +1 ring mail
  (worn), a +1,+1 mace (wielded), a +1 short bow, and 25–39 arrows.
- Missiles (arrows, darts, shuriken, daggers, spears) stack in one inventory
  slot; throwing peels one off and matching pickups merge back in.
- Scroll of sleep now puts the *reader* to sleep (it is a cursed scroll).
- Scroll of scare monster is a dud when read; dropped on the floor, monsters
  refuse to step onto its square.
- Scroll of hold monster only freezes monsters within 2 squares.
- Potion of raise level sets experience *to* the next threshold instead of
  adding it.
- Traps now follow the original placement odds (`rnd(10) < level`, count
  `rnd(level/4)+1`) — shallow levels are usually trap-free.
- Starving now causes fainting (lost turns) rather than chip damage; death
  still comes after STARVETIME turns.
- Wandering monsters draw from the original `wand_mons` table (ice monsters,
  leprechauns, nymphs, flytraps, xerocs, and dragons never wander).
- Xerocs disguise themselves as items until they wake.

Bug fixes:

- Weapons and armor round-trip through saves by template index — a saved
  dagger no longer reloads with mace throwing stats.
- Depth-scaled monster stats (level bonus, XP) now survive save/load.

Performance:

- Saves are debounced (every 10 turns, plus level changes and backgrounding)
  instead of every keypress.
- Save files pack map layers as strings (~10x smaller).
- The dungeon view renders colour runs per row instead of one text node per
  cell (~6x fewer elements).

Security / infrastructure:

- Save files are schema-validated before restore; corrupt or tampered saves
  fall back to a fresh game instead of half-restoring.
- Upgraded Expo SDK 54 → 56 (React Native 0.85, React 19.2); `npm audit`
  is clean (0 vulnerabilities).
- The PWA ships a same-origin Content-Security-Policy; service-worker
  registration moved to an external script so `script-src 'self'` holds.
- GitHub Actions are pinned to commit SHAs.
- Replaced the template LICENSE with the project's MIT license and original
  Rogue attribution.

UI:

- The home screen shows the app version.

## 1.0.0

Initial release: faithful Rogue 5.4.4 engine in TypeScript (phases 1–10 of
the fidelity plan), Expo/React Native UI, installable PWA on GitHub Pages.
