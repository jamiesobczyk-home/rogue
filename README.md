# rogue

A faithful, mobile-friendly re-implementation of the classic **Rogue** (the
1980 dungeon crawler), built with Expo / React Native and shipped as an
installable PWA. The game logic is being aligned with the original **Rogue
5.4.4** C source — see [`ORIGINAL_ROGUE_COMPARISON.md`](ORIGINAL_ROGUE_COMPARISON.md)
for the comparison and the phased fidelity plan.

The pure-TypeScript game engine lives in `rogue-app/src/engine/` and is the
single source of truth (a former Python/Kivy prototype was retired).

## Develop
```bash
cd rogue-app
npm install
npm test          # engine unit tests (jest)
npm start         # Expo dev server
npm run web       # run in the browser
```

## Build the PWA
```bash
cd rogue-app
npm run build:web
```
Deployed to GitHub Pages via `.github/workflows/deploy-pages.yml`.
