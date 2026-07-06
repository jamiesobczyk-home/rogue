// Monospace tile-grid renderer for the dungeon viewport.
//
// Composites tiles -> items -> monsters -> player into a centred viewport and
// draws it as rows of coloured monospace glyphs. Pure React Native (no Skia),
// so it runs in Expo Go.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  RenderData,
  RGB,
  TILE_CHARS,
  TILE_FG,
  TILE_FG_DIM,
  MAP_WIDTH,
  MAP_HEIGHT,
} from '../engine';
import { rgb, MONO, COLORS } from './theme';

// Viewport sized for a phone in portrait; centred on the player and clamped to
// the map. Narrower than the engine's 40-wide logical viewport so glyphs stay
// legible on a ~380px screen.
const VIEW_COLS = 28;
const VIEW_ROWS = 16;

interface Glyph {
  ch: string;
  color: string;
}

// Blank cells MUST be non-breaking spaces: rows render as text runs, and on
// react-native-web ordinary spaces are HTML whitespace — leading runs get
// stripped and inner runs collapse, shifting every glyph out of its column.
const NBSP = ' ';
const BLANK: Glyph = { ch: NBSP, color: COLORS.bg };

function buildViewport(data: RenderData): Glyph[][] {
  const [px, py] = data.player;

  // Top-left of the viewport in map coordinates, clamped to bounds.
  let ox = px - Math.floor(VIEW_COLS / 2);
  let oy = py - Math.floor(VIEW_ROWS / 2);
  ox = Math.max(0, Math.min(ox, MAP_WIDTH - VIEW_COLS));
  oy = Math.max(0, Math.min(oy, MAP_HEIGHT - VIEW_ROWS));

  // Position lookups for overlays.
  const itemAt = new Map<string, [string, RGB, boolean]>();
  for (const [x, y, ch, color, visible] of data.items) itemAt.set(`${x},${y}`, [ch, color, visible]);
  const monAt = new Map<string, [string, RGB, boolean]>();
  for (const [x, y, ch, color, visible] of data.monsters) monAt.set(`${x},${y}`, [ch, color, visible]);

  const grid: Glyph[][] = [];
  for (let row = 0; row < VIEW_ROWS; row++) {
    const y = oy + row;
    const line: Glyph[] = [];
    for (let col = 0; col < VIEW_COLS; col++) {
      const x = ox + col;
      if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) {
        line.push(BLANK);
        continue;
      }

      // Player always on top.
      if (x === px && y === py) {
        line.push({ ch: data.player[2], color: rgb(data.player[3]) });
        continue;
      }

      // Monster (only present in data when visible/detected).
      const m = monAt.get(`${x},${y}`);
      if (m) {
        line.push({ ch: m[0], color: rgb(m[1]) });
        continue;
      }

      // Item.
      const it = itemAt.get(`${x},${y}`);
      if (it) {
        const dim = !it[2];
        line.push({ ch: it[0], color: dimColor(it[1], dim) });
        continue;
      }

      // Tile.
      const [tileId, visible, explored] = data.tiles[y][x];
      if (!explored) {
        line.push(BLANK);
        continue;
      }
      const ch = TILE_CHARS[tileId] ?? ' ';
      const palette = visible ? TILE_FG[tileId] : TILE_FG_DIM[tileId];
      line.push({ ch, color: rgb(palette ?? [80, 80, 80]) });
    }
    grid.push(line);
  }
  return grid;
}

function dimColor(c: RGB, dim: boolean): string {
  if (!dim) return rgb(c);
  return rgb([Math.floor((c[0] * 3) / 10), Math.floor((c[1] * 3) / 10), Math.floor((c[2] * 3) / 10)]);
}

interface Run {
  text: string;
  color: string;
}

/** Collapse a row of glyphs into runs of consecutive same-colour text. */
function toRuns(line: Glyph[]): Run[] {
  const runs: Run[] = [];
  for (const g of line) {
    const ch = g.ch === ' ' ? NBSP : g.ch; // keep every source of blanks collapse-proof
    const last = runs[runs.length - 1];
    if (last && last.color === g.color) last.text += ch;
    else runs.push({ text: ch, color: g.color });
  }
  return runs;
}

export function DungeonView({ data, cellSize }: { data: RenderData; cellSize: number }) {
  // One <Text> per row with colour-run children (instead of one per cell)
  // cuts the element count ~6x — the render hot path on low-end devices.
  const rows = useMemo(() => buildViewport(data).map(toRuns), [data]);
  const fontSize = Math.floor(cellSize * 0.95);
  const lineHeight = cellSize;
  // Monospace advance is ~0.6em; pad with letterSpacing so cells stay square.
  const letterSpacing = Math.max(0, cellSize - fontSize * 0.6);

  return (
    <View style={styles.container}>
      {rows.map((runs, r) => (
        <Text
          key={r}
          testID={`dungeon-row-${r}`}
          allowFontScaling={false}
          numberOfLines={1}
          style={{
            height: lineHeight,
            lineHeight,
            fontSize,
            fontFamily: MONO,
            letterSpacing,
          }}
        >
          {runs.map((run, i) => (
            <Text key={i} style={{ color: run.color }}>
              {run.text}
            </Text>
          ))}
        </Text>
      ))}
    </View>
  );
}

export const VIEWPORT_DIMS = { cols: VIEW_COLS, rows: VIEW_ROWS };

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bg,
    alignSelf: 'center',
  },
});
