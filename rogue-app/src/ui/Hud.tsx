// Status bar — mirrors the two-line HUD from the Kivy version.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RenderData, HUNGER_HUNGRY, HUNGER_WEAK } from '../engine';
import { COLORS, MONO } from './theme';

function hungerLabel(h: number): string {
  if (h <= 0) return 'Faint';
  if (h <= HUNGER_WEAK) return 'Weak';
  if (h <= HUNGER_HUNGRY) return 'Hungry';
  return '';
}

export function Hud({ data }: { data: RenderData }) {
  const h = data.hud;
  const status: string[] = [];
  if (h.confused) status.push('Conf');
  if (h.blinded) status.push('Blind');
  if (h.hasted) status.push('Fast');
  if (h.poisoned) status.push('Pois');
  if (h.frozen) status.push('Held');
  const hunger = hungerLabel(h.hunger);
  if (hunger) status.push(hunger);
  if (h.hasAmulet) status.push('Amulet!');

  const hpColor = h.hp <= h.maxHp * 0.25 ? COLORS.danger : COLORS.text;

  return (
    <View style={styles.hud}>
      <Text style={styles.line} allowFontScaling={false}>
        <Text style={{ color: hpColor }}>HP {h.hp}/{h.maxHp}</Text>
        <Text>   Str {h.str}   AC {h.ac}   Lvl {h.level}   Exp {h.exp}</Text>
      </Text>
      <Text style={styles.line} allowFontScaling={false}>
        <Text style={{ color: COLORS.accent }}>Gold {h.gold}</Text>
        <Text>   Depth {h.dlevel}   Turn {h.turn}</Text>
        {status.length > 0 ? <Text style={{ color: COLORS.danger }}>   {status.join(' ')}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.panel,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.panelBorder,
  },
  line: {
    fontFamily: MONO,
    fontSize: 12,
    color: COLORS.text,
  },
});
