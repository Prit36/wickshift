// The loop and the three screens: job board -> bench <-> run.
import type { App, Screen } from './app';
import { Input } from './input';
import { Fx } from './fx';
import { loadSave, writeSave, type Save } from './save';
import { Menu } from './menu';
import { Bench } from './bench';
import { Play } from './play';
import { LEVELS } from '../sim/levels';
import type { LevelDef } from '../sim/level';
import { clone, emptyBlueprint, type Blueprint } from '../sim/blueprint';
import type { Stars } from '../sim/stars';
import { sfx } from '../audio/sfx';

export class Game implements App {
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  W = 1280;
  H = 720;
  s = 1;
  t = 0;
  input: Input;
  fx = new Fx();
  save: Save;
  screen: Screen;
  menu: Menu;
  bench: Bench | null = null;
  play: Play | null = null;
  private last = 0;
  /** Builds in progress this session, per level (also saved on launch). */
  private drafts = new Map<string, Blueprint>();

  constructor(
    private canvas: HTMLCanvasElement,
    stage: HTMLElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.input = new Input(stage);
    this.save = loadSave();
    this.fx.reduced = this.save.reduced;
    sfx.muted = this.save.muted;
    this.input.onFirstGesture = () => {
      sfx.unlock();
      sfx.setMusic(true);
    };
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => sfx.suspend(document.hidden));
    this.resize();
    this.menu = new Menu(this, { open: (L) => this.openBench(L) });
    this.screen = this.menu;
    this.input.sink = this.menu;
  }

  start(): void {
    const frame = (ms: number) => {
      const now = ms / 1000;
      const dt = this.last ? Math.min(0.1, now - this.last) : 1 / 60;
      this.last = now;
      this.step(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private step(dt: number): void {
    this.t += dt;
    if (this.canvas.clientWidth !== this.W || this.canvas.clientHeight !== this.H) this.resize();
    this.screen.update(dt);
    this.fx.update(dt);
    sfx.update();
    this.screen.draw();
    this.input.endFrame();
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = this.canvas.clientWidth || window.innerWidth;
    const H = this.canvas.clientHeight || window.innerHeight;
    this.dpr = dpr;
    this.W = W;
    this.H = H;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.s = Math.max(0.7, Math.min(1.35, Math.min(W / 1280, H / 760)));
  }

  private setScreen(s: Screen): void {
    this.screen = s;
    this.input.sink = s;
  }

  persist(): void {
    writeSave(this.save);
  }

  toggleMute(): void {
    this.save.muted = !this.save.muted;
    sfx.setMuted(this.save.muted);
    this.persist();
  }

  // ---------------------------------------------------------------- flow

  openBench(L: LevelDef): void {
    const start = this.drafts.get(L.id) ?? this.save.levels[L.id]?.build ?? L.starter ?? emptyBlueprint();
    this.fx.clear();
    sfx.stopLoops();
    this.bench = new Bench(this, L, start, {
      launch: (bp) => this.launch(L, bp),
      back: () => {
        if (this.bench) this.drafts.set(L.id, clone(this.bench.bp));
        this.toMenu();
      },
    });
    this.setScreen(this.bench);
  }

  private launch(L: LevelDef, bp: Blueprint): void {
    this.drafts.set(L.id, clone(bp));
    const ls = (this.save.levels[L.id] ??= { stars: [false, false, false] });
    ls.build = clone(bp);
    this.persist();
    this.fx.clear();
    this.play = new Play(this, L, bp, {
      rebuild: () => this.rebuild(),
      next: () => {
        const i = LEVELS.indexOf(L);
        if (i + 1 < LEVELS.length) this.openBench(LEVELS[i + 1]);
        else this.toMenu();
      },
      levels: () => this.toMenu(),
      hasNext: () => LEVELS.indexOf(L) + 1 < LEVELS.length,
      record: (stars) => this.record(L, stars),
    }, this.bench?.camera ?? null);
    this.setScreen(this.play);
  }

  /** Back to the bench with the build exactly as launched. Instant. */
  private rebuild(): void {
    sfx.stopLoops();
    this.fx.clear();
    if (this.bench && this.play && this.bench.level === this.play.level) {
      this.setScreen(this.bench);
      return;
    }
    if (this.play) this.openBench(this.play.level);
  }

  private record(L: LevelDef, stars: Stars): boolean[] {
    const ls = (this.save.levels[L.id] ??= { stars: [false, false, false] });
    const fresh = stars.map((v, i) => v && !ls.stars[i]);
    ls.stars = ls.stars.map((v, i) => v || stars[i]) as Stars;
    this.persist();
    return fresh;
  }

  private toMenu(): void {
    sfx.stopLoops();
    this.fx.clear();
    this.setScreen(this.menu);
  }
}
