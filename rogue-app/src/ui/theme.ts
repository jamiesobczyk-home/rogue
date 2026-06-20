// Shared UI theme helpers.
import { RGB } from '../engine';

/** Convert an engine [r,g,b] tuple to a CSS rgb() string. */
export function rgb([r, g, b]: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export const COLORS = {
  bg: '#0a0a0a',
  panel: '#141414',
  panelBorder: '#2a2a2a',
  text: '#d0d0d0',
  textDim: '#808080',
  accent: '#dcb41e', // gold
  danger: '#c83232',
  button: '#1e1e1e',
  buttonActive: '#333333',
  buttonBorder: '#3a3a3a',
};

// A monospace font stack that exists on both iOS and Android.
export const MONO = 'monospace';
