import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS, MONO } from '../theme';

interface Props {
  hasSave: boolean;
  onNewGame: () => void;
  onContinue: () => void;
  onGuide: () => void;
}

export function MenuScreen({ hasSave, onNewGame, onContinue, onGuide }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title} allowFontScaling={false}>
        ROGUE
      </Text>
      <Text style={styles.subtitle} allowFontScaling={false}>
        Retrieve the Amulet of Yendor
      </Text>

      <View style={styles.menu}>
        {hasSave && (
          <Pressable
            onPress={onContinue}
            style={({ pressed }) => [styles.btn, styles.btnAccent, pressed && styles.btnPressed]}
          >
            <Text style={[styles.btnText, { color: COLORS.accent }]} allowFontScaling={false}>
              Continue
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={onNewGame}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Text style={styles.btnText} allowFontScaling={false}>
            New Game
          </Text>
        </Pressable>
        <Pressable
          onPress={onGuide}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Text style={styles.btnText} allowFontScaling={false}>
            How to Play
          </Text>
        </Pressable>
      </View>

      <Text style={styles.help} allowFontScaling={false}>
        Move with the D-pad. Bump enemies to attack. Find {'>'} stairs to descend
        through 26 levels, grab the Amulet, then climb back out alive.
      </Text>
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
    fontSize: 56,
    letterSpacing: 8,
    color: COLORS.accent,
    fontWeight: 'bold',
  },
  subtitle: {
    fontFamily: MONO,
    fontSize: 13,
    color: COLORS.textDim,
    marginTop: 8,
    marginBottom: 48,
  },
  menu: {
    width: '100%',
    maxWidth: 280,
    gap: 14,
  },
  btn: {
    backgroundColor: COLORS.button,
    borderWidth: 1,
    borderColor: COLORS.buttonBorder,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnAccent: {
    borderColor: COLORS.accent,
  },
  btnPressed: {
    backgroundColor: COLORS.buttonActive,
  },
  btnText: {
    fontFamily: MONO,
    fontSize: 18,
    color: COLORS.text,
  },
  help: {
    fontFamily: MONO,
    fontSize: 12,
    color: COLORS.textDim,
    textAlign: 'center',
    marginTop: 56,
    lineHeight: 18,
  },
});
