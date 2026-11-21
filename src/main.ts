import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/source-sans-3/latin-400.css';
import '@fontsource/source-sans-3/latin-600.css';
import './style.css';
import { readDevFlags } from './render/paint';
import { Game } from './game/game';
import { audio } from './audio/audio';

async function boot(): Promise<void> {
  readDevFlags();
  // Canvas text needs the faces loaded before the first paint.
  try {
    await Promise.all([
      document.fonts.load('700 22px "Barlow Condensed"'),
      document.fonts.load('400 16px "Source Sans 3"'),
      document.fonts.load('600 16px "Source Sans 3"'),
    ]);
  } catch {
    // Fallback faces are listed in the palette.
  }
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const stage = document.getElementById('stage') as HTMLElement;
  const game = new Game(canvas, stage);
  game.start();
  document.getElementById('boot')?.remove();
  // Test handle for the dev tools: always in dev, and in a production build only with ?dev.
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('dev')) {
    Object.assign(window, { __wickshift: game, __wickaudio: audio });
  }
}

void boot();
