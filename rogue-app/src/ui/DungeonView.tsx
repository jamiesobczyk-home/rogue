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

const BLANK: Glyph = { ch: ' ', color: COLORS.bg };

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

export function DungeonView({ data, cellSize }: { data: RenderData; cellSize: number }) {
  const grid = useMemo(() => buildViewport(data), [data]);
  const fontSize = Math.floor(cellSize * 0.95);
  const lineHeight = cellSize;

  return (
    <View style={styles.container}>
      {grid.map((line, r) => (
        <View key={r} style={[styles.row, { height: lineHeight }]}>
          {line.map((g, c) => (
            <Text
              key={c}
              allowFontScaling={false}
              style={{
                width: cellSize,
                height: lineHeight,
                lineHeight,
                fontSize,
                fontFamily: MONO,
                color: g.color,
                textAlign: 'center',
              }}
            >
              {g.ch}
            </Text>
          ))}
        </View>
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
  row: {
    flexDirection: 'row',
  },
});
