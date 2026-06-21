import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { GameEngine, Item, RenderData, STATE_PLAYING, STATE_DEAD, STATE_WIN, STATE_IDENTIFY } from './src/engine';
import { saveGame, loadGame, hasSave, clearSave } from './src/state/saveGame';
import { MenuScreen } from './src/ui/screens/MenuScreen';
import { GameScreen } from './src/ui/screens/GameScreen';
import { InventoryScreen } from './src/ui/screens/InventoryScreen';
import { GameOverScreen } from './src/ui/screens/GameOverScreen';
import { COLORS } from './src/ui/theme';

type Screen = 'menu' | 'game' | 'inventory' | 'gameover';

export default function App() {
  const engineRef = useRef<GameEngine | null>(null);
  const [data, setData] = useState<RenderData | null>(null);
  const [screen, setScreen] = useState<Screen>('menu');
  const [saveExists, setSaveExists] = useState(false);

  useEffect(() => {
    hasSave().then(setSaveExists);
  }, []);

  // Persist when the app is backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && engineRef.current && engineRef.current.state === STATE_PLAYING) {
        saveGame(engineRef.current);
      }
    });
    return () => sub.remove();
  }, []);

  /** Refresh render data and react to terminal/identify states. Persists on each turn. */
  const refresh = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setData(engine.getRenderData());

    if (engine.state === STATE_DEAD || engine.state === STATE_WIN) {
      clearSave();
      setSaveExists(false);
      setScreen('gameover');
    } else if (engine.state === STATE_IDENTIFY) {
      setScreen('inventory');
    } else {
      saveGame(engine);
    }
  }, []);

  /** Run an engine mutation, then refresh. */
  const act = useCallback(
    (fn: (e: GameEngine) => void) => {
      const engine = engineRef.current;
      if (!engine) return;
      fn(engine);
      refresh();
    },
    [refresh],
  );

  const newGame = useCallback(() => {
    engineRef.current = new GameEngine();
    setData(engineRef.current.getRenderData());
    setScreen('game');
    saveGame(engineRef.current);
    setSaveExists(true);
  }, []);

  const continueGame = useCallback(async () => {
    const engine = await loadGame();
    if (!engine) {
      newGame();
      return;
    }
    engineRef.current = engine;
    setData(engine.getRenderData());
    setScreen(engine.state === STATE_DEAD || engine.state === STATE_WIN ? 'gameover' : 'game');
  }, [newGame]);

  // ---- Render ------------------------------------------------------

  let content: React.ReactNode = null;
  const engine = engineRef.current;

  if (screen === 'menu') {
    content = <MenuScreen hasSave={saveExists} onNewGame={newGame} onContinue={continueGame} />;
  } else if (screen === 'gameover' && engine && data) {
    content = (
      <GameOverScreen
        won={engine.state === STATE_WIN}
        score={engine.score()}
        depth={data.hud.dlevel}
        onNewGame={newGame}
      />
    );
  } else if (screen === 'inventory' && engine && data) {
    content = (
      <InventoryScreen
        player={engine.player}
        identifyMode={engine.state === STATE_IDENTIFY}
        identifyKind={engine.identifyKind}
        onUse={(item: Item) => {
          act((e) => e.actionUseItem(item));
          if (engineRef.current?.state === STATE_PLAYING) setScreen('game');
        }}
        onDrop={(item: Item) => {
          act((e) => e.actionDropItem(item));
        }}
        onIdentify={(item: Item) => {
          act((e) => e.actionIdentifyItem(item));
          // A wrong-category pick is rejected and keeps us in identify mode.
          if (engineRef.current?.state === STATE_PLAYING) setScreen('game');
        }}
        onClose={() => setScreen('game')}
      />
    );
  } else if (data) {
    content = (
      <GameScreen
        data={data}
        onMove={(dx, dy) => act((e) => e.actionMove(dx, dy))}
        onWait={() => act((e) => e.actionWait())}
        onPickup={() => act((e) => e.actionPickup())}
        onInventory={() => setScreen('inventory')}
        onDescend={() => act((e) => e.actionDescend())}
        onAscend={() => act((e) => e.actionAscend())}
        onSearch={() => act((e) => e.actionSearch())}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={styles.root}>{content}</View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
});
