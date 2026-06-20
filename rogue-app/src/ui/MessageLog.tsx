// Scrolling message log — shows the most recent engine messages.
import React, { useEffect, useRef } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { COLORS, MONO } from './theme';

export function MessageLog({ messages }: { messages: string[] }) {
  const ref = useRef<ScrollView>(null);
  const recent = messages.slice(-6);

  useEffect(() => {
    ref.current?.scrollToEnd({ animated: false });
  }, [messages]);

  return (
    <ScrollView ref={ref} style={styles.log} contentContainerStyle={styles.content}>
      {recent.map((m, i) => (
        <Text
          key={messages.length - recent.length + i}
          allowFontScaling={false}
          style={[styles.msg, { opacity: 0.5 + (0.5 * (i + 1)) / recent.length }]}
        >
          {m}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  log: {
    backgroundColor: COLORS.bg,
    maxHeight: 92,
  },
  content: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  msg: {
    fontFamily: MONO,
    fontSize: 11,
    color: COLORS.text,
    marginVertical: 1,
  },
});
