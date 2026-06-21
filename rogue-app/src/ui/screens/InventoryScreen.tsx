import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Item, Player } from '../../engine';
import { COLORS, MONO, rgb } from '../theme';

interface Props {
  player: Player;
  identifyMode: boolean;
  identifyKind?: string;
  onUse: (item: Item) => void;
  onDrop: (item: Item) => void;
  onIdentify: (item: Item) => void;
  onClose: () => void;
}

const IDENTIFY_LABEL: Record<string, string> = {
  potion: 'potion',
  scroll: 'scroll',
  weapon: 'weapon',
  armor: 'armor',
  ringwand: 'ring or wand',
};

function equipTag(player: Player, item: Item): string {
  if (player.weapon === item) return ' (wielded)';
  if (player.armor === item) return ' (worn)';
  return '';
}

export function InventoryScreen({
  player,
  identifyMode,
  identifyKind,
  onUse,
  onDrop,
  onIdentify,
  onClose,
}: Props) {
  const idLabel = identifyKind && IDENTIFY_LABEL[identifyKind] ? IDENTIFY_LABEL[identifyKind] : 'item';
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} allowFontScaling={false}>
          {identifyMode ? `Identify which ${idLabel}?` : 'Inventory'}
        </Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.close} allowFontScaling={false}>
            ✕
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 24 }}>
        {player.inventory.length === 0 && (
          <Text style={styles.empty} allowFontScaling={false}>
            Your pack is empty.
          </Text>
        )}
        {player.inventory.map((item, idx) => {
          const slot = String.fromCharCode('a'.charCodeAt(0) + idx);
          return (
            <View key={idx} style={styles.itemRow}>
              <Pressable
                style={styles.itemMain}
                onPress={() => (identifyMode ? onIdentify(item) : undefined)}
              >
                <Text style={styles.slot} allowFontScaling={false}>
                  {slot})
                </Text>
                <Text style={[styles.glyph, { color: rgb(item.color) }]} allowFontScaling={false}>
                  {item.char}
                </Text>
                <Text style={styles.itemName} allowFontScaling={false}>
                  {item.displayName()}
                  {equipTag(player, item)}
                </Text>
              </Pressable>

              {!identifyMode && (
                <View style={styles.itemActions}>
                  <Pressable
                    onPress={() => onUse(item)}
                    style={({ pressed }) => [styles.actBtn, pressed && styles.actBtnPressed]}
                  >
                    <Text style={styles.actText} allowFontScaling={false}>
                      Use
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onDrop(item)}
                    style={({ pressed }) => [styles.actBtn, pressed && styles.actBtnPressed]}
                  >
                    <Text style={styles.actText} allowFontScaling={false}>
                      Drop
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.panelBorder,
  },
  title: {
    fontFamily: MONO,
    fontSize: 18,
    color: COLORS.accent,
  },
  close: {
    fontFamily: MONO,
    fontSize: 20,
    color: COLORS.text,
  },
  list: {
    flex: 1,
    paddingHorizontal: 12,
  },
  empty: {
    fontFamily: MONO,
    fontSize: 13,
    color: COLORS.textDim,
    padding: 16,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.panel,
    paddingVertical: 10,
  },
  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  slot: {
    fontFamily: MONO,
    fontSize: 13,
    color: COLORS.textDim,
    width: 24,
  },
  glyph: {
    fontFamily: MONO,
    fontSize: 16,
    width: 22,
    textAlign: 'center',
  },
  itemName: {
    flex: 1,
    fontFamily: MONO,
    fontSize: 13,
    color: COLORS.text,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actBtn: {
    backgroundColor: COLORS.button,
    borderWidth: 1,
    borderColor: COLORS.buttonBorder,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actBtnPressed: {
    backgroundColor: COLORS.buttonActive,
  },
  actText: {
    fontFamily: MONO,
    fontSize: 12,
    color: COLORS.text,
  },
});
