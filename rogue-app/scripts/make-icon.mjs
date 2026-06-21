// Generates the app/PWA icon: a gold "@" (the roguelike player glyph) on a
// dark tile. Drawn as pure vector shapes (no fonts) so rasterization is
// deterministic across machines.
//
// One-off generator. Requires sharp: `npm i -D sharp` (or `npm i sharp --no-save`).
// Run: `node scripts/make-icon.mjs` — writes assets/icon.png + assets/favicon.png.

import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOLD = '#dcb41e';
const BG = '#0d0d10';

// "@" built from: outer ring (open at lower-right), inner bowl, and the bowl's
// right stem — the three strokes that make the glyph read as an at-sign.
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="0" y="0" width="1024" height="1024" rx="190" fill="${BG}"/>
  <rect x="44" y="44" width="936" height="936" rx="150" fill="none"
        stroke="${GOLD}" stroke-width="10" opacity="0.22"/>
  <g fill="none" stroke="${GOLD}" stroke-width="58" stroke-linecap="round">
    <!-- outer ring, open toward the lower-right -->
    <path d="M 538 819 A 300 300 0 1 1 811 546"/>
    <!-- inner bowl -->
    <circle cx="512" cy="520" r="118"/>
    <!-- bowl stem -->
    <line x1="630" y1="402" x2="630" y2="672"/>
  </g>
</svg>`;

const buf = Buffer.from(svg);

await sharp(buf).resize(1024, 1024).png().toFile(path.join(root, 'assets', 'icon.png'));
await sharp(buf).resize(64, 64).png().toFile(path.join(root, 'assets', 'favicon.png'));

console.log('Wrote assets/icon.png (1024) and assets/favicon.png (64).');
