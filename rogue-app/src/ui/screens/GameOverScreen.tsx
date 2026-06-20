import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS, MONO } from '../theme';

interface Props {
  won: boolean;
  score: number;
  depth: number;
  onNewGame: () => void;
}

export function GameOverScreen({ won, score, depth, onNewGame }: Props) {
  return (
    <View style={styles.container}>
      <Text
        style={[styles.title, { color: won ? COLORS.accent : COLORS.danger }]}
        allowFontScaling={false}
      >
        {won ? 'VICTORY' : 'YOU DIED'}
      </Text>
      <Text style={styles.detail} allowFontScaling={false}>
        {won ? 'You escaped with the Amulet of Yendor!' : `You fell on dungeon level ${depth}.`}
      </Text>
      <Text style={styles.score} allowFontScaling={false}>
        Score: {score}
      </Text>

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
  score: {
    fontFamily: MONO,
    fontSize: 18,
    color: COLORS.accent,
    marginTop: 24,
    marginBottom: 48,
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
