// Save/resume round-trip — verifies the new persistence capability preserves
// game state. AsyncStorage is mocked since these are pure-node tests.

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async () => {}),
    getItem: jest.fn(async () => null),
    removeItem: jest.fn(async () => {}),
  },
}));

import { GameEngine } from '../src/engine';
import { serializeEngine, deserializeEngine } from '../src/state/saveGame';

const MOVES: [number, number][] = [
  [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1],
];

function played(seed: string, steps: number): GameEngine {
  const e = new GameEngine(seed);
  for (let i = 0; i < steps; i++) e.actionMove(...MOVES[i % MOVES.length]);
  return e;
}

describe('Save/resume round-trip', () => {
  it('restores an equivalent render state', () => {
    const original = played('save-seed', 40);
    const json = serializeEngine(original);
    const restored = deserializeEngine(json);

    const a = original.getRenderData();
    const b = restored.getRenderData();

    expect(b.tiles).toEqual(a.tiles);
    expect(b.player).toEqual(a.player);
    expect(b.monsters).toEqual(a.monsters);
    expect(b.items).toEqual(a.items);
    expect(b.hud).toEqual(a.hud);
    expect(b.state).toEqual(a.state);
  });

  it('preserves dungeon level, turn, gold, and inventory', () => {
    const original = played('progress', 60);
    original.player.gold = 123;
    original.dungeonLevel = 4;
    const restored = deserializeEngine(serializeEngine(original));

    expect(restored.dungeonLevel).toBe(4);
    expect(restored.turn).toBe(original.turn);
    expect(restored.player.gold).toBe(123);
    expect(restored.player.inventory.length).toBe(original.player.inventory.length);
  });

  it('the restored engine continues to play without throwing', () => {
    const restored = deserializeEngine(serializeEngine(played('continue', 30)));
    for (let i = 0; i < 100; i++) restored.actionMove(...MOVES[i % MOVES.length]);
    expect(restored.getRenderData().tiles.length).toBeGreaterThan(0);
  });
});
