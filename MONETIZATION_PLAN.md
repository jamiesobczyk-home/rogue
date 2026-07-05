# Monetization Plan — Execution Brief for Claude Opus

> **How to use this document:** paste it (or point the session at it) as the
> primary instruction set for a Claude Opus coding session in this repository.
> It is written to be executed phase by phase. Each phase lists concrete
> tasks, the files involved, acceptance criteria, and explicit **STOP points**
> where a human decision (pricing, accounts, store credentials) is required.
> Do not skip STOP points. Do not begin a later phase before the earlier
> phase's acceptance criteria pass.

---

## 0. Context you must load first

- **Product**: a faithful TypeScript re-implementation of Rogue (1980),
  playable as an installable PWA (GitHub Pages) and built with Expo /
  React Native (SDK 54, upgrade to 56 planned).
- **Engine**: pure TypeScript in `rogue-app/src/engine/` — fully
  deterministic from a single string seed (`GameEngine(seed)`, sfc32 RNG in
  `src/engine/rng.ts`). This determinism is the technical foundation for
  daily challenges and cheat-resistant leaderboards: a run can be *verified*
  by replaying its input log against its seed.
- **State**: save/load in `rogue-app/src/state/saveGame.ts` (AsyncStorage).
  UI in `rogue-app/src/ui/`. PWA packaging in `rogue-app/scripts/build-pwa.mjs`.
  CI deploy in `.github/workflows/deploy-pages.yml`.
- **Read first**: `PROJECT_REVIEW.md` (root) — its change list items 1–3 and
  7–9 are prerequisites baked into Phase 1 below.
- **Tests**: `cd rogue-app && npm test` (78 passing) and `npm run typecheck`
  must stay green after every phase.

### Guiding principles (constraints on every decision)

1. **Never paywall the core game.** The classic Rogue experience stays 100%
   free and offline-capable. Monetize convenience, cosmetics, competition,
   and goodwill — not difficulty or power (no pay-to-win; it would destroy
   the roguelike audience instantly).
2. **No dark patterns.** No forced ads, no energy timers, no loot boxes.
   Rewarded/optional only.
3. **Offline-first must survive.** Every monetized feature degrades
   gracefully with no network.
4. **Privacy-lean.** No ad-tech SDK before Phase 4, analytics must be
   anonymous/aggregate, and a privacy policy ships before any SDK does.

## 1. Phase 1 — Legal & product hygiene (prerequisite, ~1 session)

The repo currently ships Expo's template MIT license and uses the name
"Rogue" verbatim. Fix before anything is sold:

1. **Rebrand.** The 5.4.4 mechanics are reimplemented clean-room (BSD-released
   source, no C code copied) — that is fine. But do not *sell* under the bare
   name "Rogue"; pick a distinct name (e.g. "Yendor", "Rogue Depths",
   "Amulet: a classic roguelike" — **STOP: human picks the name**) and update
   `app.json` (name/slug), PWA manifest in `build-pwa.mjs`, menu screen, and
   store copy. Marketing text may say "inspired by the 1980 classic Rogue".
2. **License & attribution.** Replace `rogue-app/LICENSE` (Expo's own MIT
   text) with the project's chosen license (**STOP: human choice** — MIT if
   staying open-source with paid builds, or proprietary for the app), plus an
   ATTRIBUTION section crediting Michael Toy, Ken Arnold, and Glenn Wichman
   and the BSD 5.4.4 source.
3. **Ship the fidelity/bug fixes** from `PROJECT_REVIEW.md` §5 items 1–6
   (starting pack, scroll fixes, weapon save round-trip, trap/hunger tuning)
   so the store release is the *good* version.
4. **Versioning + privacy policy page** (static, hosted with the PWA).

**Acceptance:** tests green; app renamed everywhere; LICENSE correct; a
`PRIVACY.md` exists and is linked from the menu screen.

## 2. Phase 2 — Reach: app stores + Steam-ready shell (revenue: paid installs)

The PWA is free forever; the *convenient* packaged builds are the first
product. Roguelike players demonstrably pay $3–8 for a good mobile port
(cf. Pixel Dungeon derivatives, Shattered's donations, Brogue ports).

1. **EAS builds**: configure `eas.json`; produce Android (AAB) and iOS builds
   from the existing Expo project. **STOP: human must create Apple/Google
   developer accounts and decide price point (recommended: free PWA, $3.99
   one-time on stores, no IAP at launch).**
2. **Store assets**: icon already exists; generate screenshots (portrait
   gameplay, inventory, tombstone), store descriptions.
3. **Desktop/Steam candidate**: add a `scripts/build-desktop.mjs` Tauri (or
   Electron) wrapper around the exported web build with keyboard controls
   (the engine already exposes discrete actions; add a key map — vi-keys
   hjklyubn + arrows). Steam roguelike buyers skew high-margin.
   **STOP: Steam direct fee / account is a human decision.**

**Acceptance:** `eas build` profiles committed and documented in README;
keyboard input works on web build; store listing text drafted in
`store/listing.md`.

## 3. Phase 3 — Retention engine: daily challenge, stats, achievements (free)

No revenue directly — this builds the habit loop that every later revenue
stream depends on. All offline-capable.

1. **Daily challenge mode**: seed = `daily-YYYY-MM-DD` (UTC) fed to
   `new GameEngine(seed)`; one attempt per day; local streak counter.
   The deterministic RNG makes this a ~1-day task.
2. **Run history & stats screen**: persist per-run summaries (seed, depth,
   gold, cause of death, turns, score) to AsyncStorage; show personal bests,
   win rate, kill stats.
3. **Achievements** (local): "Reached depth 10", "Won without armor",
   "Killed a dragon", "Starved" (~20 total, defined in one data file).
4. **Input log recording**: append each player action to the run record
   (action enum + params). This is deliberately built *now* so Phase 5's
   server-side replay verification needs no migration.

**Acceptance:** daily seed reproduces the identical dungeon on two devices;
run history survives app restart; input log replays a finished game to the
same final state in a jest test.

## 4. Phase 4 — First direct revenue: Supporter Pack (IAP) + optional rewarded ads

1. **Supporter Pack** (one-time IAP, ~$4.99, via RevenueCat or
   `expo-in-app-purchases` — RevenueCat recommended for cross-platform
   receipts; **STOP: human creates the products in App Store
   Connect/Play Console and picks prices**). Contents (all cosmetic/
   convenience, never power):
   - Color themes (amber/green CRT phosphor, high-contrast, colorblind-safe).
   - Glyph/tileset options (classic ASCII stays default; add a Unicode set
     and, later, a minimal pixel tileset toggle in `DungeonView`).
   - Tombstone/victory screen styles + "supporter" badge on the menu.
   - Extra save slots (3 named slots; refactor `SAVE_KEY` into a keyed store).
   - Cloud save (when Phase 5 backend exists) auto-included.
2. **Web equivalent**: on the PWA (no app-store IAP), gate the same pack
   behind a one-time unlock code sold via itch.io/Ko-fi ("pay what you want,
   $3 minimum") — zero backend needed: signed unlock token validated
   offline with a public key embedded in the app.
3. **Rewarded ads — optional and only if the human opts in** (**STOP:
   explicit human decision; default recommendation is NO ads at launch** —
   the audience is ad-hostile and the pack + paid builds are cleaner).
   If approved: AdMob rewarded-only, shown *only* when the player taps
   "Watch ad to continue this run once" on the tombstone (single revive per
   run, disabled in daily challenge to protect leaderboard integrity).
4. **Analytics (privacy-lean)**: aggregate, anonymous event counts
   (run started/won/died, IAP viewed/purchased) via a self-hosted or
   privacy-first provider (e.g. Aptabase/PostHog EU). Update PRIVACY.md.

**Acceptance:** purchases restore correctly on reinstall; every pack feature
works offline after unlock; game remains fully playable with zero purchases;
no ad SDK present unless explicitly opted in.

## 5. Phase 5 — Competition: accounts, cloud saves, verified leaderboards

This is the moat: Rogue's determinism makes *provably legitimate*
leaderboards possible, which almost no casual roguelike has.

1. **Backend** (small): Supabase or Cloudflare Workers + D1/KV
   (**STOP: human picks provider & billing**). Endpoints: anonymous
   device-account upsert (optional email link), run submission, daily/all-time
   leaderboards, cloud save blob.
2. **Anti-cheat via replay**: a run submission = `{seed, inputLog, claimed
   summary}`. The server (or a Worker running the same TS engine — it's
   dependency-free, so it runs anywhere) replays the log against the seed and
   accepts only if the recomputed outcome matches. Client-side score
   tampering becomes useless. Also enforce the save-schema validation from
   PROJECT_REVIEW.md §4.2.
3. **Leaderboards UI**: daily challenge board (primary), all-time depth/score
   boards, friends-by-code. Names filtered through a profanity list; no
   free-text beyond a handle.
4. **Cloud save** for supporters (Phase 4 pack): last save + run history
   synced.

**Acceptance:** a tampered summary is rejected by replay verification in an
integration test; leaderboard renders offline from last cached copy; backend
monthly cost estimate documented (< $10/mo at 10k MAU on the recommended
stack).

## 6. Phase 6 — Expansion content (second SKU, only after traction)

Trigger condition: >5k MAU or >500 pack sales. Ideas ranked by fit:

1. **"Ascension" expansion IAP (~$2.99)**: post-amulet *ascent* gauntlet with
   new mean monster variants on the way up (the engine already supports
   infinite depth scaling — mirror it upward), alternate starting kits
   ("Archer", "Tourist"-style), and seeded weekly gauntlet mode.
2. **Rogue-adjacent rule mods** (free, drives engagement): permadeath-off
   casual toggle (excluded from leaderboards), blitz mode (500-turn cap).
3. **Merch/donations**: Ko-fi/GitHub Sponsors link on the tombstone screen
   ("enjoyed dying? buy us a coffee") — trivial to add, surprisingly
   effective in this genre.

## 7. KPIs & guardrails dashboard

Track from Phase 4 onward (aggregate only): D1/D7 retention, daily-challenge
participation rate, conversion to Supporter Pack (target 2–5% of MAU),
ARPDAU if ads enabled (kill ads if < $0.005 or D7 retention drops >10%
relative), refund rate (<2%).

## 8. Explicit out-of-scope (do not build)

- Loot boxes, gacha, energy systems, consumable currency IAPs.
- Pay-for-power items usable in leaderboard modes.
- Selling user data; any third-party tracking beyond §4.4 analytics.
- NFTs/crypto anything.

## 9. Summary decision queue for the human owner

| # | Decision | Needed before | Recommendation |
|---|---|---|---|
| 1 | Product name (rebrand) | Phase 1 | pick a distinct name, subtitle "a classic roguelike" |
| 2 | License (open vs proprietary app) | Phase 1 | MIT engine + proprietary assets/brand |
| 3 | Store accounts + price | Phase 2 | $3.99 one-time, free PWA stays |
| 4 | Steam yes/no | Phase 2 | yes, after mobile ships |
| 5 | IAP platform (RevenueCat?) + pack price | Phase 4 | RevenueCat, $4.99 |
| 6 | Ads yes/no | Phase 4 | **no** at launch; revisit at 10k MAU |
| 7 | Backend provider | Phase 5 | Cloudflare Workers (engine replays in-Worker) |
