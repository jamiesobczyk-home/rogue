import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS, MONO } from '../theme';

interface Props {
  won: boolean;
  score: number;
  depth: number;
  gold: number;
  turns: number;
  cause: string;
  onNewGame: () => void;
}

// A small RIP tombstone, in the spirit of the original death screen.
function Tombstone({ cause, depth, gold }: { cause: string; depth: number; gold: number }) {
  const lines = [
    '  __________  ',
    ' /          \\ ',
    '/   R I P    \\',
    '|            |',
    '|  the brave |',
    '|   rogue    |',
    `|  ${`L${depth} · ${gold}g`.padEnd(9).slice(0, 9)} |`,
    '|            |',
    '*  *  *  *  * ',
  ];
  return (
    <View style={styles.stone}>
      {lines.map((l, i) => (
        <Text key={i} style={styles.stoneText} allowFontScaling={false}>
          {l}
        </Text>
      ))}
      <Text style={styles.cause} allowFontScaling={false}>
        {cause}
      </Text>
    </View>
  );
}

export function GameOverScreen({ won, score, depth, gold, turns, cause, onNewGame }: Props) {
  return (
    <View style={styles.container}>
      <Text
        style={[styles.title, { color: won ? COLORS.accent : COLORS.danger }]}
        allowFontScaling={false}
      >
        {won ? 'VICTORY' : 'YOU DIED'}
      </Text>

      {won ? (
        <Text style={styles.detail} allowFontScaling={false}>
          You escaped the dungeon with the Amulet of Yendor!
        </Text>
      ) : (
        <Tombstone cause={cause} depth={depth} gold={gold} />
      )}

      <View style={styles.statsBox}>
        <Text style={styles.stat} allowFontScaling={false}>
          Depth reached: {depth}
        </Text>
        <Text style={styles.stat} allowFontScaling={false}>
          Gold collected: {gold}
        </Text>
        <Text style={styles.stat} allowFontScaling={false}>
          Turns survived: {turns}
        </Text>
        <Text style={[styles.stat, styles.scoreLine]} allowFontScaling={false}>
          Score: {score}
        </Text>
      </View>

      <Pressable
        onPress={onNewGame}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      >
        <Text style={styles.btnText} allowFontScaling={false}>
          New Game
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontFamily: MONO,
    fontSize: 40,
    letterSpacing: 4,
    fontWeight: 'bold',
  },
  detail: {
    fontFamily: MONO,
    fontSize: 14,
    color: COLORS.text,
    marginTop: 16,
    textAlign: 'center',
  },
  stone: {
    marginTop: 20,
    alignItems: 'center',
  },
  stoneText: {
    fontFamily: MONO,
    fontSize: 14,
    color: COLORS.textDim,
    lineHeight: 16,
  },
  cause: {
    fontFamily: MONO,
    fontSize: 13,
    color: COLORS.text,
    marginTop: 12,
    textAlign: 'center',
  },
  statsBox: {
    marginTop: 24,
    marginBottom: 36,
    alignItems: 'center',
    gap: 4,
  },
  stat: {
    fontFamily: MONO,
    fontSize: 13,
    color: COLORS.textDim,
  },
  scoreLine: {
    fontSize: 18,
    color: COLORS.accent,
    marginTop: 8,
  },
  btn: {
    backgroundColor: COLORS.button,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 48,
  },
  btnPressed: {
    backgroundColor: COLORS.buttonActive,
  },
  btnText: {
    fontFamily: MONO,
    fontSize: 18,
    color: COLORS.text,
  },
});
