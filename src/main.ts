import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/source-sans-3/latin-600.css';
import './style.css';
import { Game } from './game/game';

async function boot(): Promise<void> {
  try {
    await Promise.all([document.fonts.load('700 22px "Barlow Condensed"'), document.fonts.load('600 16px "Source Sans 3"')]);
  } catch {
    // fallback faces are in the font stacks
  }
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const stage = document.getElementById('stage') as HTMLElement;
  const game = new Game(canvas, stage);
  game.start();
  document.getElementById('boot')?.remove();
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('dev')) Object.assign(window, { __ws: game });
}

void boot();
