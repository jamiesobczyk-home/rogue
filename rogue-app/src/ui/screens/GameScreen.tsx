import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { RenderData } from '../../engine';
import { Hud } from '../Hud';
import { MessageLog } from '../MessageLog';
import { Controls } from '../Controls';
import { DungeonView, VIEWPORT_DIMS } from '../DungeonView';
import { COLORS } from '../theme';

interface Props {
  data: RenderData;
  onMove: (dx: number, dy: number) => void;
  onWait: () => void;
  onPickup: () => void;
  onInventory: () => void;
  onDescend: () => void;
  onAscend: () => void;
}

export function GameScreen(props: Props) {
  const { width } = useWindowDimensions();
  // Fit the viewport columns across the screen width with a small margin.
  const cellSize = Math.floor((width - 8) / VIEWPORT_DIMS.cols);

  return (
    <View style={styles.container}>
      <Hud data={props.data} />
      <View style={styles.viewport}>
        <DungeonView data={props.data} cellSize={cellSize} />
      </View>
      <MessageLog messages={props.data.messages} />
      <Controls
        onMove={props.onMove}
        onWait={props.onWait}
        onPickup={props.onPickup}
        onInventory={props.onInventory}
        onDescend={props.onDescend}
        onAscend={props.onAscend}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  viewport: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
