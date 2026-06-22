import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Linking } from 'react-native';
import {
  MONSTER_TEMPLATES,
  PLAYER_COLOR,
  POTION_COLOR,
  SCROLL_COLOR,
  RING_COLOR,
  WAND_COLOR,
  WEAPON_COLOR,
  ARMOR_COLOR,
  FOOD_COLOR,
  GOLD_COLOR,
  AMULET_COLOR,
  BROWN,
  DARK_GRAY,
  YELLOW,
  RED,
  RGB,
} from '../../engine';
import { COLORS, MONO, rgb } from '../theme';

interface Props {
  onClose: () => void;
}

interface Entry {
  glyph: string;
  color: RGB;
  label: string;
}

const MAP_LEGEND: Entry[] = [
  { glyph: '@', color: PLAYER_COLOR, label: 'You, the adventurer' },
  { glyph: '.', color: DARK_GRAY, label: 'Room floor' },
  { glyph: '#', color: DARK_GRAY, label: 'Passage / corridor' },
  { glyph: '-', color: BROWN, label: 'Wall' },
  { glyph: '|', color: BROWN, label: 'Wall' },
  { glyph: '+', color: BROWN, label: 'Door' },
  { glyph: '>', color: YELLOW, label: 'Stairs down (Descend here)' },
  { glyph: '<', color: YELLOW, label: 'Stairs up (need the Amulet)' },
  { glyph: '^', color: RED, label: 'Trap (once discovered)' },
];

const ITEM_LEGEND: Entry[] = [
  { glyph: '!', color: POTION_COLOR, label: 'Potion — quaff for an effect' },
  { glyph: '?', color: SCROLL_COLOR, label: 'Scroll — read for an effect' },
  { glyph: '=', color: RING_COLOR, label: 'Ring — wear for a passive power' },
  { glyph: '/', color: WAND_COLOR, label: 'Wand / staff — zap a monster' },
  { glyph: ')', color: WEAPON_COLOR, label: 'Weapon — wield it' },
  { glyph: '[', color: ARMOR_COLOR, label: 'Armor — wear it' },
  { glyph: '%', color: FOOD_COLOR, label: 'Food — eat to stave off hunger' },
  { glyph: '*', color: GOLD_COLOR, label: 'Gold — picked up automatically' },
  { glyph: ',', color: AMULET_COLOR, label: 'The Amulet of Yendor — your goal' },
];

const STATUS_LEGEND: { tag: string; label: string }[] = [
  { tag: 'Hungry / Weak / Faint', label: 'Eat soon, or you will starve' },
  { tag: 'Conf', label: 'Confused — movement is random' },
  { tag: 'Blind', label: 'Blinded — you cannot see' },
  { tag: 'Fast', label: 'Hasted — you act twice as often' },
  { tag: 'Pois', label: 'Poisoned / weakened' },
  { tag: 'Held', label: 'Held or frozen — cannot move' },
  { tag: 'Amulet!', label: 'You carry the Amulet of Yendor' },
];

function Glyph({ glyph, color }: { glyph: string; color: RGB }) {
  return (
    <Text style={[styles.glyph, { color: rgb(color) }]} allowFontScaling={false}>
      {glyph}
    </Text>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} allowFontScaling={false}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ entry }: { entry: Entry }) {
  return (
    <View style={styles.row}>
      <Glyph glyph={entry.glyph} color={entry.color} />
      <Text style={styles.rowLabel} allowFontScaling={false}>
        {entry.label}
      </Text>
    </View>
  );
}

export function GuideScreen({ onClose }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} allowFontScaling={false}>
          How to Play
        </Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.close} allowFontScaling={false}>
            ✕
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 40 }}>
        <Section title="Your quest">
          <Text style={styles.body} allowFontScaling={false}>
            Descend through the dungeon to find the Amulet of Yendor on level 26, then
            climb back to the surface alive. Deeper levels hold deadlier monsters and
            better loot. Death is permanent.
          </Text>
        </Section>

        <Section title="Controls">
          <Text style={styles.body} allowFontScaling={false}>
            • Move with the D-pad. Walk into a monster to attack it.{'\n'}
            • Get — pick up the item under you.{'\n'}
            • Pack — open your inventory to use, wield, wear, drop, or throw items
            (Throw hurls a weapon at the nearest enemy you can see).{'\n'}
            • Down / Up — take stairs ({'>'} / {'<'}). You can only go up once you
            hold the Amulet.{'\n'}
            • Search — look for hidden traps in the squares around you.{'\n'}
            • · (center) — wait a turn. You slowly heal as turns pass.
          </Text>
        </Section>

        <Section title="The map">
          {MAP_LEGEND.map((e, i) => (
            <Row key={i} entry={e} />
          ))}
        </Section>

        <Section title="Items">
          {ITEM_LEGEND.map((e, i) => (
            <Row key={i} entry={e} />
          ))}
          <Text style={styles.note} allowFontScaling={false}>
            Potions, scrolls, rings and wands look unidentified at first (a colour, a
            label, a gem, a wood). Use one — or read a scroll of identify — to learn
            what it is. Some items are cursed; you cannot remove a cursed ring or armor.
          </Text>
        </Section>

        <Section title="Monsters (A–Z)">
          <View style={styles.monsterGrid}>
            {MONSTER_TEMPLATES.map((m) => (
              <View key={m.letter} style={styles.monsterCell}>
                <Glyph glyph={m.letter} color={m.color} />
                <Text style={styles.monsterName} allowFontScaling={false}>
                  {m.name}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Status (shown in the HUD)">
          {STATUS_LEGEND.map((s, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.statusTag} allowFontScaling={false}>
                {s.tag}
              </Text>
              <Text style={styles.rowLabel} allowFontScaling={false}>
                {s.label}
              </Text>
            </View>
          ))}
        </Section>

        <Section title="Learn more">
          <Pressable onPress={() => Linking.openURL('https://en.wikipedia.org/wiki/Rogue_(video_game)')}>
            <Text style={styles.link} allowFontScaling={false}>
              Rogue (1980) on Wikipedia ↗
            </Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL('https://britzl.github.io/roguearchive/')}>
            <Text style={styles.link} allowFontScaling={false}>
              The Rogue Archive (manuals & history) ↗
            </Text>
          </Pressable>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.panelBorder,
  },
  title: { fontFamily: MONO, fontSize: 18, color: COLORS.accent },
  close: { fontFamily: MONO, fontSize: 20, color: COLORS.text },
  list: { flex: 1, paddingHorizontal: 16 },
  section: { marginTop: 22 },
  sectionTitle: {
    fontFamily: MONO,
    fontSize: 14,
    color: COLORS.accent,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  body: { fontFamily: MONO, fontSize: 13, color: COLORS.text, lineHeight: 20 },
  note: { fontFamily: MONO, fontSize: 12, color: COLORS.textDim, lineHeight: 18, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  glyph: { fontFamily: MONO, fontSize: 16, width: 26, textAlign: 'center' },
  rowLabel: { fontFamily: MONO, fontSize: 13, color: COLORS.text, flex: 1 },
  statusTag: { fontFamily: MONO, fontSize: 12, color: COLORS.danger, width: 150 },
  monsterGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monsterCell: { flexDirection: 'row', alignItems: 'center', width: '50%', paddingVertical: 3 },
  monsterName: { fontFamily: MONO, fontSize: 12, color: COLORS.text },
  link: { fontFamily: MONO, fontSize: 13, color: COLORS.accent, paddingVertical: 6 },
});
