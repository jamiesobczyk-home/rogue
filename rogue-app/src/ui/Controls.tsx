// Touch controls — 8-way D-pad plus action buttons.
import React from 'react';
import { View, Text, Pressable, StyleSheet, GestureResponderEvent } from 'react-native';
import { COLORS, MONO } from './theme';

interface Props {
  onMove: (dx: number, dy: number) => void;
  onWait: () => void;
  onPickup: () => void;
  onInventory: () => void;
  onDescend: () => void;
  onAscend: () => void;
  onSearch: () => void;
}

function Btn({
  label,
  onPress,
  flex,
  accent,
}: {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  flex?: number;
  accent?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        flex ? { flex } : null,
        pressed && styles.btnPressed,
        accent && styles.btnAccent,
      ]}
    >
      <Text style={styles.btnText} allowFontScaling={false}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Controls({ onMove, onWait, onPickup, onInventory, onDescend, onAscend, onSearch }: Props) {
  return (
    <View style={styles.container}>
      {/* D-pad */}
      <View style={styles.dpad}>
        <View style={styles.dpadRow}>
          <Btn label="↖" onPress={() => onMove(-1, -1)} flex={1} />
          <Btn label="↑" onPress={() => onMove(0, -1)} flex={1} />
          <Btn label="↗" onPress={() => onMove(1, -1)} flex={1} />
        </View>
        <View style={styles.dpadRow}>
          <Btn label="←" onPress={() => onMove(-1, 0)} flex={1} />
          <Btn label="·" onPress={onWait} flex={1} />
          <Btn label="→" onPress={() => onMove(1, 0)} flex={1} />
        </View>
        <View style={styles.dpadRow}>
          <Btn label="↙" onPress={() => onMove(-1, 1)} flex={1} />
          <Btn label="↓" onPress={() => onMove(0, 1)} flex={1} />
          <Btn label="↘" onPress={() => onMove(1, 1)} flex={1} />
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <View style={styles.actionsRow}>
          <Btn label="Get" onPress={onPickup} flex={1} accent />
          <Btn label="Pack" onPress={onInventory} flex={1} accent />
        </View>
        <View style={styles.actionsRow}>
          <Btn label="▼ Down" onPress={onDescend} flex={1} />
          <Btn label="▲ Up" onPress={onAscend} flex={1} />
        </View>
        <View style={styles.actionsRow}>
          <Btn label="Search" onPress={onSearch} flex={1} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 8,
    gap: 10,
  },
  dpad: {
    flex: 1.2,
    gap: 6,
  },
  dpadRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actions: {
    flex: 1,
    gap: 6,
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  btn: {
    backgroundColor: COLORS.button,
    borderWidth: 1,
    borderColor: COLORS.buttonBorder,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    backgroundColor: COLORS.buttonActive,
  },
  btnAccent: {
    borderColor: COLORS.accent,
  },
  btnText: {
    color: COLORS.text,
    fontFamily: MONO,
    fontSize: 16,
  },
});
