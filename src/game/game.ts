// WICKSHIFT: one full-viewport stage. Build, Scout, Run, Result and Routes each
// accept their own actions; Pause keeps the mode underneath it.
import { CHASSIS, PARTS, type PartKind } from '../data/parts';
import { ROUTES } from '../data/routes';
import type { RouteDef } from '../data/routeTypes';
import { FixedStepper } from '../core/clock';
import { apply, clamp, compose, invApply, lerp, type Xf } from '../core/geom';
import {
  allSockets,
  checkLaunch,
  descendants,
  findPlacement,
  layout as bpLayout,
  proposeFit,
  removeBranch,
  rotatePlacement,
  type Blueprint,
  type FitResult,
  type SocketRef,
} from '../workshop/blueprint';
import { Workshop, type WorkshopSnapshot } from '../workshop/workshop';
import { massInfo, type MassInfo } from '../sim/cart';
import { Sim, type SimEvent } from '../sim/sim';
import { benchPose } from '../sim/seat';
import { audio } from '../audio/audio';
import { SaveStore } from '../save';
import { Camera, benchView } from '../render/camera';
import { C, FONT_STAMP, FONT_TEXT, TYPE } from '../render/palette';
import { FX, hatchedCross, printed, roughRect } from '../render/paint';
import { drawPart } from '../render/partsArt';
import { drawMoth, type MothPose } from '../render/moth';
import { buildBackdrop, drawBackdrop, drawVignette, drawChock, drawClamp, drawCounterBack, drawCounterFront, drawFlap, drawRoller, drawSeesaw, drawTerrain, drawWindowBack, type Backdrop } from '../render/scene';
import { drawCart, frameFromBench, frameFromSim, lerpXf, snapSim, type CartFrame, type SimSnap } from '../render/cartView';
import type * as planck from 'planck';
import { A11yLayer, type Control } from './a11y';
import { computeLayout, inRect, type Layout, type Rect } from './layout';
import {
  drawChalkTick,
  drawDial,
  drawDrawer,
  drawDrive,
  drawLampControls,
  drawLever,
  drawPlumb,
  drawSlip,
  drawTab,
  focusRing,
  paperNote,
  trayOrigin,
  wrapText,
} from './hud';
import { drawPauseSlip, drawRoutes, pauseControls, routesControls, type RoutesUi } from './menus';

export type Mode = 'bench' | 'scout' | 'run' | 'result' | 'routes';
type Device = 'keyboard' | 'mouse' | 'touch';

interface Selection {
  kind: PartKind;
  from: 'tray' | 'mounted';
  id?: string;
  rot?: number;
}

interface Drag extends Selection {
  pointerId: number;
  active: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** grab point in part-local metres */
  grab: [number, number];
  grow: number;
}

interface Target {
  ref: SocketRef;
  res: FitResult;
  x: number;
  y: number;
}

interface Fx {
  kind: 'dust' | 'shard' | 'ring' | 'reject' | 'glint';
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  dur: number;
  size: number;
  text?: string;
}

interface BenchRig {
  padX: number;
  padY: number;
  postX: number;
  chockX: number;
  mothX: number;
}

interface HoldControl extends Control {
  hold?: { down: () => void; up: () => void };
}

const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeBack = (t: number) => {
  const c = 1.7;
  const x = clamp(t, 0, 1) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};

export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly a11y: A11yLayer;
  readonly save = new SaveStore();
  L!: Layout;
  cam = new Camera();
  backdrop: Backdrop | null = null;
  stepper = new FixedStepper();

  route: RouteDef = ROUTES[0]!;
  ws!: Workshop;
  mode: Mode = 'bench';
  paused = false;
  device: Device = 'mouse';
  keyboardFocus = false;
  time = 0;
  private lastNow = 0;
  frameCount = 0;
  loops = 0;

  // ---- bench
  pose: Xf = { x: 0, y: 0, a: 0 };
  private poseFrom: Xf | null = null;
  private poseT = 1;
  legal = false;
  com: MassInfo = { mass: 1, cx: 0, cy: 0 };
  proposedCom: MassInfo | null = null;
  sel: Selection | null = null;
  drag: Drag | null = null;
  target: Target | null = null;
  private targets: Target[] = [];
  private targetsKey = '';
  private fitSettle = new Map<string, number>();
  private rejectAt: { x: number; y: number; t: number; reason: string } | null = null;
  private leverNote = 0;
  private leverRattle = 0;
  private leverFree = 0;
  private wasLegal = false;
  private trayLift: Partial<Record<PartKind, number>> = {};
  private benchCam = { cx: 0, cy: 0, ppm: 90 };
  private peek = false;
  private peekT = 0;
  private scoutCam = { cx: 0, cy: 0, ppm: 60 };
  private pan: { id: number; x: number; y: number; cx: number; cy: number } | null = null;
  /** Hint flags (retired after use). */
  hints = { drive: false, shift: false };
  private shiftHintActive = false;
  private everFitKey = false;

  // ---- run
  sim: Sim | null = null;
  private prev: SimSnap | null = null;
  private cur: SimSnap | null = null;
  private alpha = 1;
  private preRun: WorkshopSnapshot | null = null;
  private runBp: Blueprint | null = null;
  epoch = 0;
  runT = 0;
  private keys = new Set<string>();
  driveLatched = false;
  private touchDrive = new Set<number>();
  private lampHold = { back: new Set<number>(), fwd: new Set<number>() };
  private drawerRetract = 0;
  private clampOpen = 0;
  private clampAnchor: BenchRig | null = null;
  private mothFrom: MothPose = 'brace';
  private mothPose: MothPose = 'brace';
  private mothT = 1;
  private mothHop = 1;
  private hopFrom = { x: 0, y: 0 };
  private camVel = 0;
  private lean = 0;
  private lastLampVx = 0;
  private shake = 0;
  private stopGlint = 0;
  private stopSide = 0;
  private ember = 0;
  private wickT = 0;
  chalk: { x: number; y: number } | null = null;
  private stripePart: string | null = null;
  private fx: Fx[] = [];

  // ---- result
  result: { kind: 'delivered' | 'failed' | 'rest'; text: string; t: number; mark: boolean; at: { x: number; y: number } | null; firstDelivery: boolean } | null = null;
  private stampT = 0;
  private markT = 0;
  private windowLit = new Map<string, number>();

  // ---- menus
  routesUi: RoutesUi = { selected: 0, t: 0, finale: false };
  private resumeFocus: string | null = null;
  pauseT = 0;
  private saveNote = 0;

  // ---- frame
  private controls: HoldControl[] = [];
  hover: string | null = null;
  pressed: string | null = null;
  pointer = { x: -1, y: -1 };

  constructor(canvas: HTMLCanvasElement, host: HTMLElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.a11y = new A11yLayer(host);
    this.a11y.onFocusChange = () => undefined;
    const st = this.save.data.settings;
    const sys = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    FX.reducedMotion = st.reducedMotion ?? sys;
    audio.sfxLevel = st.sfx;
    audio.musicLevel = st.music;
    audio.muted = st.muted;
    if (!this.save.storageOk) this.saveNote = 6;
    const last = ROUTES.find((r) => r.id === this.save.data.lastRoute) ?? ROUTES[0]!;
    this.loadRoute(this.save.isUnlocked(last.index) ? last : ROUTES[0]!, false);
    this.bind();
    this.resize();
  }

  // =============================================================== setup

  loadRoute(route: RouteDef, announce = true): void {
    this.disposeRun();
    this.route = route;
    this.ws = new Workshop(route, this.save.data.builds[route.id]);
    this.mode = 'bench';
    this.sel = null;
    this.drag = null;
    this.target = null;
    this.chalk = null;
    this.result = null;
    this.stripePart = null;
    this.poseT = 1;
    this.poseFrom = null;
    this.drawerRetract = 0;
    this.clampOpen = 0;
    this.clampAnchor = null;
    this.save.data.lastRoute = route.id;
    this.save.scheduleSave();
    if (this.L) this.L = computeLayout(this.L.cssW, this.L.cssH, window.devicePixelRatio, route.kit);
    this.refreshBench(false);
    this.wasLegal = this.legal;
    this.setMoth(this.legal ? 'stand' : 'brace', true);
    this.mothHop = 1;
    if (this.L) this.placeBenchCamera();
    if (announce) this.a11y.announce(`Job ${route.index + 1}, ${route.name}. ${this.route.mark.name}: ${this.route.mark.condition}.`);
  }

  private placeBenchCamera(): void {
    this.benchCam = benchView(this.L.W, this.L.H, this.route.start.x, this.route.start.groundY);
    this.cam.set(this.benchCam);
    this.cam.W = this.L.W;
    this.cam.H = this.L.H;
  }

  resize(): void {
    const cssW = Math.max(320, window.innerWidth || 0);
    const cssH = Math.max(180, window.innerHeight || 0);
    this.L = computeLayout(cssW, cssH, window.devicePixelRatio, this.route.kit);
    const { dpr } = this.L;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.cam.W = this.L.W;
    this.cam.H = this.L.H;
    const res = dpr * this.L.s;
    this.backdrop = buildBackdrop(this.L.W, this.L.H, Math.min(2, res));
    const wasBench = this.mode === 'bench' && !this.peek;
    this.benchCam = benchView(this.L.W, this.L.H, this.route.start.x, this.route.start.groundY);
    if (wasBench) this.cam.set(this.benchCam);

  }

  private res(): number {
    return this.L.dpr * this.L.s;
  }

  // =============================================================== bench

  refreshBench(animate: boolean): void {
    const bp = this.ws.bp;
    const chk = checkLaunch(bp, this.route.kit);
    const next = benchPose(bp, this.route);
    if (animate && !FX.reducedMotion) {
      this.poseFrom = this.displayPose();
      this.poseT = 0;
    } else {
      this.poseT = 1;
      this.poseFrom = null;
    }
    this.pose = next;
    this.legal = chk.ok;
    this.com = massInfo(bp, this.route.lampStart);
    if (this.legal && !this.wasLegal) {
      this.leverFree = 1;
      this.setMoth('stand');
    } else if (!this.legal && this.wasLegal) this.setMoth('brace');
    this.wasLegal = this.legal;
    this.targetsKey = '';

  }

  displayPose(): Xf {
    if (!this.poseFrom || this.poseT >= 1) return this.pose;
    const t = easeBack(this.poseT);
    return { x: lerp(this.poseFrom.x, this.pose.x, t), y: lerp(this.poseFrom.y, this.pose.y, t), a: lerp(this.poseFrom.a, this.pose.a, t) };
  }

  private benchFrame(): CartFrame {
    return frameFromBench(this.ws.bp, this.displayPose(), this.route.lampStart);
  }

  /** Sockets (world positions) for placing `kind`, with full validation of each. */
  private computeTargets(kind: PartKind, movingId: string | undefined, rot: number | undefined): Target[] {
    const key = `${kind}|${movingId ?? ''}|${rot ?? ''}|${JSON.stringify(this.ws.bp.placements)}|${this.poseT >= 1}`;
    if (key === this.targetsKey) return this.targets;
    const bp = this.ws.bp;
    const branch = movingId ? new Set([movingId, ...descendants(bp, movingId)]) : new Set<string>();
    const pose = this.pose;
    const out: Target[] = [];
    for (const s of allSockets(bp)) {
      if (branch.has(s.parent)) continue;
      if (s.occupant && s.occupant !== movingId) continue;
      const res = proposeFit(bp, this.route.kit, kind, s, { movingId, rot });
      const [x, y] = apply(pose, [s.x, s.y]);
      out.push({ ref: { parent: s.parent, socket: s.socket }, res, x, y });
    }
    this.targets = out;
    this.targetsKey = key;
    return out;
  }

  private nearestTarget(wx: number, wy: number, kind: PartKind, movingId?: string, rot?: number): Target | null {
    let best: Target | null = null;
    let bd = 0.62;
    for (const t of this.computeTargets(kind, movingId, rot)) {
      if (movingId) {
        const p = findPlacement(this.ws.bp, movingId);
        if (p && p.parent === t.ref.parent && p.socket === t.ref.socket) {
          // its own socket: allowed (a no-op move)
        }
      }
      const d = Math.hypot(t.x - wx, t.y - wy);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  private commitFit(res: FitResult & { ok: true }, at: { x: number; y: number }): void {
    this.ws.commit(res.bp);
    this.fitSettle.set(res.placement.id, 0);
    audio.fit();
    if (res.placement.kind === 'keyWheel') this.everFitKey = true;
    this.spawnRing(at.x, at.y);
    this.afterEdit();
  }

  private reject(reason: string, x: number, y: number): void {
    audio.reject();
    this.rejectAt = { x, y, t: 0, reason };
    this.a11y.announce(reason);
  }

  private afterEdit(): void {
    this.sel = null;
    this.target = null;
    this.proposedCom = null;
    this.refreshBench(true);
    this.save.data.builds[this.route.id] = this.ws.bp;
    this.save.scheduleSave();
  }

  private undo(): void {
    if (this.mode !== 'bench' || !this.ws.undo()) return;
    audio.uiClick();
    this.afterEdit();
  }
  private redo(): void {
    if (this.mode !== 'bench' || !this.ws.redo()) return;
    audio.uiClick();
    this.afterEdit();
  }

  private removeSelected(): void {
    if (this.mode !== 'bench' || !this.sel || this.sel.from !== 'mounted' || !this.sel.id) return;
    const next = removeBranch(this.ws.bp, this.sel.id);
    this.ws.commit(next);
    audio.stow();
    this.afterEdit();
  }

  private rotate(dir: 1 | -1): void {
    if (this.mode !== 'bench') return;
    if (this.drag && this.drag.active) {
      const n = PARTS[this.drag.kind].rotations.length;
      if (n < 2) return;
      // Start from the orientation the player currently sees, then step (wrapping).
      const res = this.target?.res;
      const seen = res && res.ok ? res.placement.rot : this.drag.kind === 'spar' ? 1 : 0;
      const base = this.drag.rot ?? seen;
      this.drag.rot = (base + dir + n) % n;
      this.targetsKey = '';
      audio.uiClick();
      return;
    }
    if (this.sel?.from === 'mounted' && this.sel.id) {
      const res = rotatePlacement(this.ws.bp, this.sel.id, dir);
      const id = this.sel.id;
      if (res.ok) {
        this.ws.commit(res.bp);
        audio.fit();
        this.afterEdit();
        this.sel = { kind: res.placement.kind, from: 'mounted', id };
      } else {
        const p = findPlacement(this.ws.bp, id);
        const lp = p ? bpLayout(this.ws.bp).get(id) : null;
        const w = lp ? apply(this.pose, [lp.xf.x, lp.xf.y]) : [0, 0];
        this.reject(res.reason, w[0]!, w[1]!);
      }
    } else if (this.sel?.from === 'tray' && PARTS[this.sel.kind].rotations.length > 1) {
      const n = PARTS[this.sel.kind].rotations.length;
      this.sel.rot = ((this.sel.rot ?? (this.sel.kind === 'spar' ? 1 : 0)) + dir + n) % n;
      this.targetsKey = '';
      audio.uiClick();
    }
  }

  selectTray(kind: PartKind): void {
    if (this.mode !== 'bench') return;
    if (this.ws.stock()[kind] <= 0) {
      audio.reject();
      return;
    }
    if (this.sel?.from === 'tray' && this.sel.kind === kind) {
      this.sel = null;
      return;
    }
    this.sel = { kind, from: 'tray' };
    this.trayLift[kind] = 1;
    audio.pickup(kind);
    this.targetsKey = '';
    this.a11y.announce(`${PARTS[kind].label} picked up. ${PARTS[kind].blurb}`);
    if (this.device === 'keyboard') {
      // Move keyboard focus to the first socket that accepts it.
      window.setTimeout(() => {
        const t = this.computeTargets(kind, undefined, undefined).find((x) => x.res.ok);
        if (t) this.a11y.focus(`socket:${t.ref.parent}:${t.ref.socket}`);
      }, 0);
    }
  }

  selectMounted(id: string): void {
    const p = findPlacement(this.ws.bp, id);
    if (!p) return;
    if (this.sel?.id === id) {
      this.sel = null;
      return;
    }
    this.sel = { kind: p.kind, from: 'mounted', id };
    audio.pickup(p.kind);
    this.targetsKey = '';
    this.a11y.announce(`${PARTS[p.kind].label} selected. Choose a socket, press Delete to remove${PARTS[p.kind].rotations.length > 1 ? ', Q or E to rotate' : ''}.`);
  }

  /** Place the current selection at a socket (click or keyboard). */
  placeSelection(ref: SocketRef): void {
    if (!this.sel || this.mode !== 'bench') return;
    const res = proposeFit(this.ws.bp, this.route.kit, this.sel.kind, ref, { movingId: this.sel.id, rot: this.sel.rot });
    const t = this.computeTargets(this.sel.kind, this.sel.id, this.sel.rot).find((x) => x.ref.parent === ref.parent && x.ref.socket === ref.socket);
    const at = t ? { x: t.x, y: t.y } : { x: this.pose.x, y: this.pose.y };
    if (res.ok) {
      const from = this.sel;
      this.commitFit(res, at);
      if (from.from === 'tray') this.trayLift[from.kind] = 0;
    } else this.reject(res.reason, at.x, at.y);
  }

  // ============================================================ dispatch

  dispatch(): void {
    if (this.mode !== 'bench' || this.paused) return;
    const chk = checkLaunch(this.ws.bp, this.route.kit);
    if (!chk.ok) {
      this.leverRattle = 1;
      this.leverNote = 3;
      audio.reject();
      this.a11y.announce(`Dispatch is locked: ${chk.missing}.`);
      return;
    }
    audio.latch();
    audio.setAmbience(0.012);
    this.cancelDrag();
    this.sel = null;
    this.target = null;
    this.peek = false;
    this.cam.set(this.benchCam);
    this.preRun = this.ws.snapshot();
    this.runBp = this.ws.bp;
    this.epoch++;
    audio.epoch = this.epoch;
    const pose = this.pose;
    this.poseT = 1;
    this.sim = new Sim(this.route, this.ws.bp, pose, this.route.lampStart);
    this.prev = snapSim(this.sim);
    this.cur = this.prev;
    this.alpha = 1;
    this.mode = 'run';
    this.runT = 0;
    this.result = null;
    this.stripePart = null;
    this.ember = 0;
    this.wickT = 0;
    this.stampT = 0;
    this.markT = 0;
    this.lean = 0;
    this.lastLampVx = 0;
    this.shiftHintActive = false;
    this.driveLatched = false;
    this.touchDrive.clear();
    this.lampHold.back.clear();
    this.lampHold.fwd.clear();
    this.fx = [];
    // The clamp and chock stay in the world where the bench was.
    this.hopFrom = this.mothBenchSpot();
    this.clampAnchor = this.benchRig(pose);
    this.mothHop = FX.reducedMotion ? 1 : 0;
    this.setMoth('ride', FX.reducedMotion);
    this.save.data.builds[this.route.id] = this.ws.bp;
    this.save.scheduleSave();

    // Retire drawer tab stops and move focus to a driving control.
    window.setTimeout(() => {
      if (this.mode === 'run' && this.a11y.focused() === null && this.device === 'keyboard') this.a11y.focus('drive');
      else if (this.mode === 'run' && this.a11y.focused()?.startsWith('tray')) this.a11y.focus('drive');
    }, 0);
  }

  private disposeRun(): void {
    if (this.sim) {
      this.sim.dispose();
      this.sim = null;
    }
    audio.cancelRun();
    this.prev = this.cur = null;
  }

  /** R / Back to bench: exact pre-run build, history and full wind. */
  backToBench(): void {
    if (this.mode !== 'run' && this.mode !== 'result') return;
    this.disposeRun();
    audio.setAmbience(0.025);
    if (this.preRun) this.ws.restore(this.preRun);
    this.mode = 'bench';
    this.result = null;
    this.keys.clear();
    this.driveLatched = false;
    this.touchDrive.clear();
    this.lampHold.back.clear();
    this.lampHold.fwd.clear();
    this.stripePart = null;
    this.fx = [];
    this.shake = 0;
    this.clampOpen = 0;
    this.clampAnchor = null;
    this.drawerRetract = FX.reducedMotion ? 0 : 0.6;
    this.refreshBench(false);
    this.cam.set(this.benchCam);
    this.setMoth(this.legal ? 'stand' : 'brace', true);
    this.mothHop = 1;

    window.setTimeout(() => {
      const f = this.a11y.focused();
      if (this.device === 'keyboard' && (!f || !this.a11y.has(f))) this.a11y.focus('lever');
    }, 0);
  }

  runAgain(): void {
    if (this.mode !== 'run' && this.mode !== 'result') return;
    this.backToBench();
    this.dispatch();
  }

  nextWindow(): void {
    const next = ROUTES[this.route.index + 1];
    if (next && this.save.isUnlocked(next.index)) {
      this.loadRoute(next);
    } else {
      this.openRoutes(true);
    }
  }

  // ================================================================ run

  private runInput(): { drive: boolean; lamp: -1 | 0 | 1 } {
    const drive = this.keys.has('Space') || this.driveLatched || this.touchDrive.size > 0;
    const back = this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.lampHold.back.size > 0;
    const fwd = this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.lampHold.fwd.size > 0;
    const lamp = (fwd ? 1 : 0) - (back ? 1 : 0);
    return { drive, lamp: lamp as -1 | 0 | 1 };
  }

  private tick(): void {
    const sim = this.sim;
    if (!sim || sim.outcome !== 'running') return;
    const input = this.runInput();
    if (input.drive && !this.hints.drive && sim.tick > 12) this.hints.drive = true;
    if (input.lamp > 0 && this.shiftHintActive) {
      this.hints.shift = true;
      this.shiftHintActive = false;
    }
    if (input.lamp !== 0 && sim.tick % 9 === 0) {
      const tr = sim.rig.lampJoint.getJointTranslation();
      const atEnd = input.lamp > 0 ? tr >= sim.rig.lampJoint.getUpperLimit() - 0.01 : tr <= sim.rig.lampJoint.getLowerLimit() + 0.01;
      if (!atEnd) audio.slide();
    }
    this.prev = this.cur;
    const ev = sim.step(input);
    this.cur = snapSim(sim);
    for (const e of ev) this.onSimEvent(e);
    this.propCues(sim);
  }

  /** One-shot sounds for the route's moving props: the ruler going, the flap lifting. */
  private cueState: { sim: Sim | null; tipped: boolean; lifted: boolean } = { sim: null, tipped: false, lifted: false };
  private propCues(sim: Sim): void {
    const c = this.cueState;
    if (c.sim !== sim) Object.assign(c, { sim, tipped: false, lifted: false });
    const ss = this.route.seesaw;
    if (sim.seesaw && ss && !c.tipped && sim.seesaw.getAngle() < ss.angle0 - 0.04) {
      c.tipped = true;
      audio.creak();
      this.a11y.announce('The ruler tips.');
    }
    if (sim.flap && !c.lifted && sim.flap.getAngle() > 0.08) {
      c.lifted = true;
      audio.rustle();
    }
  }

  private onSimEvent(e: SimEvent): void {
    const sim = this.sim!;
    switch (e.type) {
      case 'knock': {
        if (e.kind === 'lamp') audio.strike(e.power * 0.6);
        else if (e.kind === 'chassis' || e.kind === 'spar' || e.kind === 'fork' || e.kind === 'carrier') audio.strike(Math.min(4, e.power));
        else audio.strike(Math.min(1.5, e.power * 0.4));
        if (e.power > 1.2 && e.kind !== 'lamp') this.spawnDust(e.x, e.y, Math.min(1, e.power / 4));
        break;
      }
      case 'crack': {
        audio.crack();
        this.spawnShards(sim.rig.lamp.getPosition().x, sim.rig.lamp.getPosition().y + 0.3, 6);
        this.kick(0.6);
        this.chalk = { x: e.x, y: e.y };
        this.a11y.announce('The lamp glass cracked.');
        break;
      }
      case 'snuff':
        audio.puff();
        this.chalk = { x: e.x, y: e.y };
        this.kick(1);
        this.finishFail(sim.failReason);
        break;
      case 'fall':
        audio.puff();
        this.chalk = sim.decisive ? { x: sim.decisive.x, y: sim.decisive.y } : null;
        this.finishFail(sim.failReason);
        break;
      case 'deliver':
        this.finishDeliver();
        break;
      case 'roller':
        this.stripePart = e.part;
        audio.ink();
        this.a11y.announce('Blue ink from the high roller.');
        break;
      case 'endstop':
        audio.endStop();
        this.stopGlint = 1;
        this.stopSide = e.side;
        break;
      case 'windOut':
        audio.uiClick();
        break;
      case 'rest':
        if (sim.outcome === 'running' && this.mode === 'run') {
          this.result = { kind: 'rest', text: sim.describeRest(), t: 0, mark: false, at: null, firstDelivery: false };
          this.a11y.announce(`${this.result.text}. Back to bench with R.`);
        }
        break;
      case 'liftStart':
        this.setMoth('reach');
        if (this.route.id === 'ruler-rise' && !this.hints.shift && sim.chassisPose().x > 5.5) this.shiftHintActive = true;
        break;
      case 'liftEnd':
        this.setMoth('ride');
        break;
    }
  }

  private finishFail(text: string): void {
    this.mode = 'result';
    this.result = { kind: 'failed', text, t: 0, mark: false, at: this.chalk, firstDelivery: false };
    this.setMoth('hatCatch');
    this.ember = 0;
    this.a11y.announce(`${text}. Press R for the bench, or run again.`);
  }

  private markEarned(): boolean {
    const sim = this.sim!;
    switch (this.route.mark.id) {
      case 'wind':
        return sim.wind >= 0.25;
      case 'short':
        return !(this.runBp?.placements ?? []).some((p) => p.kind === 'spar');
      case 'clear':
        return sim.cracks === 0;
      case 'blue':
        return sim.rollerPart !== null;
    }
  }

  private finishDeliver(): void {
    const mark = this.markEarned();
    const first = !this.save.data.delivered[this.route.id];
    // Store progress before the stamp animation starts.
    this.save.data.delivered[this.route.id] = true;
    if (mark) this.save.data.marks[this.route.id] = true;
    if (this.runBp) this.save.data.builds[this.route.id] = this.runBp;
    this.save.flush();
    this.mode = 'result';
    this.result = { kind: 'delivered', text: '', t: 0, mark, at: null, firstDelivery: first };
    this.wickT = 0;
    audio.deliver(mark);
    this.setMoth('tip');
    if (first) this.windowLit.set(this.route.id, 0);
    const next = ROUTES[this.route.index + 1];
    this.a11y.announce(`Delivered to window ${this.route.index + 1}.${mark ? ` ${this.route.mark.name} earned.` : ''}${next ? ' Next window is open.' : ' The night shift is done.'}`);
    window.setTimeout(() => {
      if (this.mode === 'result' && this.device === 'keyboard') this.a11y.focus('act:next');
    }, 0);
  }

  // =========================================================== camera

  private updateRunCamera(dt: number, frame: CartFrame): void {
    const sim = this.sim;
    if (!sim) return;
    const W = this.L.W;
    const ppm = this.cam.ppm;
    const v = sim.rig.chassis.getLinearVelocity();
    // Lead by ~1/3 s of forward speed, capped at 15% of the width.
    const capM = (W * 0.15) / ppm;
    const leadTarget = this.mode === 'result' && this.result?.kind === 'delivered' ? 0 : clamp(v.x * 0.33, -capM, capM);
    const k = 1 - Math.exp(-dt * 3.2);
    this.camVel += (leadTarget - this.camVel) * k;
    let tx = frame.chassis.x + this.camVel + (W / 2 - W * 0.34) / ppm;
    // Vertical dead zone: only follow once the frame leaves a band.
    const groundRef = this.cam.cy - (this.benchCam.cy - this.route.start.groundY);
    let ty = this.cam.cy;
    const dy = frame.chassis.y - 0.6 - groundRef;
    const band = 0.9;
    if (dy > band) ty = this.cam.cy + (dy - band);
    if (dy < -band * 0.6) ty = this.cam.cy + (dy + band * 0.6);
    // Frame the landing before the cart leaves the lip.
    const land = this.route.landing;
    if (land && frame.chassis.x > land.fromX && frame.chassis.x < land.toX) {
      const t = clamp((frame.chassis.x - land.fromX) / 1.5, 0, 1);
      const focusX = land.focus[0] - (W * 0.15) / ppm;
      tx = lerp(tx, Math.max(tx, focusX), t);
      ty = lerp(ty, Math.min(ty, land.focus[1] + 1.2), t * 0.7);
    }
    if (this.mode === 'result' && this.result?.kind === 'delivered') {
      tx = lerp(tx, this.route.arch.x - 2.2, 0.6);
    }
    const kx = 1 - Math.exp(-dt * 6);
    const ky = 1 - Math.exp(-dt * 3);
    this.cam.cx += (tx - this.cam.cx) * kx;
    this.cam.cy += (ty - this.cam.cy) * ky;
  }

  kick(amount: number): void {
    if (!FX.shake || FX.reducedMotion) return;
    this.shake = Math.max(this.shake, amount);
  }

  // ======================================================== moth poses

  private setMoth(p: MothPose, instant = false): void {
    if (this.mothPose === p) return;
    this.mothFrom = this.mothPose;
    this.mothPose = p;
    this.mothT = instant || FX.reducedMotion ? 1 : 0;
  }

  private mothBenchSpot(): { x: number; y: number } {
    return { x: this.benchRig(this.displayPose()).mothX, y: this.route.start.groundY };
  }

  /** Where the bench furniture stands for this build: clamp post, pad, chock, moth. */
  private benchRig(pose: Xf): BenchRig {
    let rear: number = -CHASSIS.halfLength;
    let front: number = CHASSIS.halfLength;
    for (const lp of bpLayout(this.ws.bp).values()) {
      for (const s of lp.solids) {
        if (s.type === 'circle') {
          rear = Math.min(rear, s.x - s.r);
          front = Math.max(front, s.x + s.r);
        } else {
          for (const q of s.pts) {
            rear = Math.min(rear, q[0]);
            front = Math.max(front, q[0]);
          }
        }
      }
    }
    const [padX, padY] = apply(pose, [-1.06, CHASSIS.top]);
    const postX = pose.x + rear - 0.75;
    const mothX = postX - 0.7;
    return { padX, padY, postX, chockX: pose.x + front + 0.1, mothX };
  }

  // ======================================================== effects

  private spawnRing(x: number, y: number): void {
    if (FX.reducedMotion) return;
    this.fx.push({ kind: 'ring', x, y, vx: 0, vy: 0, t: 0, dur: 0.22, size: 0.12 });
  }
  private spawnDust(x: number, y: number, p: number): void {
    if (FX.reducedMotion || !FX.decor) return;
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.15 + 0.7 * ((i + 0.5) / 5));
      this.fx.push({ kind: 'dust', x, y, vx: Math.cos(a) * (0.6 + p), vy: Math.sin(a) * (0.5 + p * 0.6), t: 0, dur: 0.45, size: 0.03 + p * 0.03 });
    }
  }
  private spawnShards(x: number, y: number, n: number): void {
    if (FX.reducedMotion) return;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.4;
      this.fx.push({ kind: 'shard', x, y, vx: Math.cos(a) * 1.6, vy: -Math.sin(a) * 1.4 + 1.2, t: 0, dur: 0.6, size: 0.04 });
    }
  }

  // ============================================================ routes

  openRoutes(fromFinish = false): void {
    if (this.drag) this.cancelDrag();
    if (this.mode === 'run' || this.mode === 'result') {
      this.disposeRun();
      if (this.preRun) this.ws.restore(this.preRun);
    }
    this.paused = false;
    this.mode = 'routes';
    this.routesUi.t = 0;
    this.routesUi.selected = this.route.index;
    const allDone = ROUTES.every((r) => this.save.data.delivered[r.id]);
    this.routesUi.finale = allDone;
    if (fromFinish && allDone) this.routesUi.selected = 0;
    this.a11y.announce(allDone ? 'All four windows are lit. Choose any window to reopen its bench.' : 'Routes. Choose a sorting window.');
    window.setTimeout(() => this.a11y.focus(`route:${this.routesUi.selected}`), 0);
  }

  openRoute(index: number): void {
    const r = ROUTES[index];
    if (!r || !this.save.isUnlocked(index)) {
      audio.reject();
      return;
    }
    audio.latch();
    this.loadRoute(r);
    window.setTimeout(() => {
      if (this.device === 'keyboard') this.a11y.focus('lever');
    }, 0);
  }

  // ============================================================= pause

  togglePause(): void {
    if (this.mode === 'routes' && !this.paused) {
      // From routes, pause still opens settings.
    }
    if (!this.paused) {
      this.resumeFocus = this.a11y.focused();
      this.paused = true;
      this.pauseT = 0;
      this.keys.clear();
      this.touchDrive.clear();
      this.lampHold.back.clear();
      this.lampHold.fwd.clear();
      this.cancelDrag();
      this.a11y.announce('Paused.');
      window.setTimeout(() => this.a11y.focus('pause:resume'), 0);
    } else {
      this.paused = false;
      this.stepper.reset();
      const f = this.resumeFocus;
      window.setTimeout(() => {
        if (f && this.a11y.has(f)) this.a11y.focus(f);
        else (document.activeElement as HTMLElement | null)?.blur?.();
      }, 0);
    }

  }

  setReducedMotion(v: boolean): void {
    FX.reducedMotion = v;
    this.save.data.settings.reducedMotion = v;
    this.save.scheduleSave();
  }

  setLevels(sfx: number, music: number, muted: boolean): void {
    audio.sfxLevel = sfx;
    audio.musicLevel = music;
    audio.muted = muted;
    audio.applyLevels();
    this.save.data.settings.sfx = sfx;
    this.save.data.settings.music = music;
    this.save.data.settings.muted = muted;
    this.save.scheduleSave();
  }

  toggleFullscreen(): void {
    const d = document as Document & { webkitFullscreenElement?: Element };
    if (document.fullscreenElement || d.webkitFullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  // ============================================================= input

  private bind(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onCancel(e));
    c.addEventListener('lostpointercapture', (e) => this.onCancel(e, true));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => this.onBlur());
    // A save still waiting on its short timer is written before the page goes away.
    window.addEventListener('pagehide', () => this.save.flush());
    document.addEventListener('visibilitychange', () => {
      audio.setHidden(document.hidden);
      if (document.hidden) this.onBlur();
      else this.stepper.reset();
    });
    document.addEventListener('fullscreenchange', () => this.resize());
  }

  private onBlur(): void {
    // Pause and clear held input; abandon any pending drag.
    this.keys.clear();
    this.touchDrive.clear();
    this.lampHold.back.clear();
    this.lampHold.fwd.clear();
    this.cancelDrag();
    this.pan = null;
    this.peek = false;
    if ((this.mode === 'run') && !this.paused && this.sim?.outcome === 'running') this.togglePause();
    this.stepper.reset();
  }

  private toLogical(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.L.s, y: (e.clientY - r.top) / this.L.s };
  }

  private controlAt(x: number, y: number): HoldControl | null {
    for (let i = this.controls.length - 1; i >= 0; i--) {
      const c = this.controls[i]!;
      if (c.id.startsWith('socket:') || c.id.startsWith('part:') || c.id.startsWith('tray:')) continue;
      if (inRect(c.rect, x, y, 2)) return c;
    }
    return null;
  }

  private onDown(e: PointerEvent): void {
    audio.unlock();
    this.device = e.pointerType === 'touch' ? 'touch' : 'mouse';
    this.keyboardFocus = false;
    const p = this.toLogical(e);
    this.pointer = p;
    const ctl = this.controlAt(p.x, p.y);
    if (ctl) {
      if (!ctl.enabled) {
        if (ctl.id === 'lever') this.dispatch();
        else audio.reject();
        return;
      }
      this.pressed = ctl.id;
      if (ctl.hold) {
        this.canvas.setPointerCapture(e.pointerId);
        ctl.hold.down();
        (this as unknown as { holdIds: Map<number, HoldControl> }).holdIds ??= new Map();
        (this as unknown as { holdIds: Map<number, HoldControl> }).holdIds.set(e.pointerId, ctl);
      } else {
        // The lever moves on press; other controls act on press too (immediate binding).
        ctl.onActivate();
      }
      e.preventDefault();
      return;
    }
    if (this.paused) return;
    if (this.mode === 'bench') this.benchDown(e, p);
    else if (this.mode === 'scout') {
      this.canvas.setPointerCapture(e.pointerId);
      this.pan = { id: e.pointerId, x: p.x, y: p.y, cx: this.cam.cx, cy: this.cam.cy };
    } else if (this.mode === 'routes') {
      // Windows are controls; clicking empty space does nothing.
    }
  }

  private benchDown(e: PointerEvent, p: { x: number; y: number }): void {
    const wx = this.cam.wx(p.x);
    const wy = this.cam.wy(p.y);
    // Chalk tick: removable with a rub.
    if (this.chalk && Math.hypot(this.cam.sx(this.chalk.x) - p.x, this.cam.sy(this.chalk.y) - p.y) < 16) {
      this.chalk = null;
      audio.stow();
      return;
    }
    // Drawer recesses.
    for (const { kind, r } of this.L.recesses) {
      if (!inRect(r, p.x, p.y, 6)) continue;
      if (this.ws.stock()[kind] <= 0) {
        audio.reject();
        return;
      }
      const [ox, oy] = trayOrigin(kind, r, this.L.trayK);
      const k = this.L.trayK;
      this.startDrag(e, { kind, from: 'tray' }, [(p.x - ox) / k, -(p.y - oy) / k]);
      return;
    }
    // With a part in hand, a click on (or right by) a socket places it, even
    // where that socket sits under a fitted wheel.
    if (this.sel) {
      const t = this.nearestTarget(wx, wy, this.sel.kind, this.sel.id, this.sel.rot);
      if (t && Math.hypot(t.x - wx, t.y - wy) < 0.3) {
        this.placeSelection(t.ref);
        return;
      }
    }
    // Mounted parts (nearest pick shape).
    const frame = this.benchFrame();
    let best: { id: string; kind: PartKind; d: number; local: [number, number] } | null = null;
    for (const part of frame.parts) {
      const def = PARTS[part.kind];
      const [cx, cy] = apply(part.pose, [def.pick.x, def.pick.y]);
      const d = Math.hypot(cx - wx, cy - wy);
      if (d < def.pick.r && (!best || d < best.d)) {
        const local = invApply(part.pose, [wx, wy]);
        best = { id: part.id, kind: part.kind, d, local };
      }
    }
    if (best) {
      this.startDrag(e, { kind: best.kind, from: 'mounted', id: best.id }, best.local);
      return;
    }
    // Click on a socket with a selection.
    if (this.sel) {
      const t = this.nearestTarget(wx, wy, this.sel.kind, this.sel.id, this.sel.rot);
      if (t) {
        this.placeSelection(t.ref);
        return;
      }
      this.sel = null;
    }
  }

  private startDrag(e: PointerEvent, s: Selection, grab: [number, number]): void {
    const p = this.toLogical(e);
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = { ...s, pointerId: e.pointerId, active: false, startX: p.x, startY: p.y, x: p.x, y: p.y, grab, grow: 0 };
  }

  private onMove(e: PointerEvent): void {
    const p = this.toLogical(e);
    this.pointer = p;
    if (e.pointerType === 'mouse') {
      const c = this.controlAt(p.x, p.y);
      const h = c ? c.id : null;
      if (h !== this.hover) {
        this.hover = h;
        this.canvas.style.cursor = c && c.enabled ? 'pointer' : 'default';
      }
    }
    const d = this.drag;
    if (d && d.pointerId === e.pointerId) {
      d.x = p.x;
      d.y = p.y;
      if (!d.active && Math.hypot(p.x - d.startX, p.y - d.startY) > 5) {
        d.active = true;
        this.sel = null;
        audio.pickup(d.kind);
        if (d.from === 'tray') this.trayLift[d.kind] = 0;
        this.targetsKey = '';
      }
      if (d.active) this.updateDragTarget();
    }
    if (this.pan && this.pan.id === e.pointerId) {
      this.cam.cx = this.pan.cx - (p.x - this.pan.x) / this.cam.ppm;
      this.cam.cy = this.pan.cy + (p.y - this.pan.y) / this.cam.ppm;
      this.clampScout();
    }
  }

  private dragOrigin(d: Drag): { x: number; y: number } {
    const k = this.cam.ppm;
    const wx = this.cam.wx(d.x) - d.grab[0] * (k / k);
    // grab is in part-local metres; at world scale it maps 1:1 in metres.
    return { x: wx - 0 * k, y: this.cam.wy(d.y) - d.grab[1] };
  }

  private updateDragTarget(): void {
    const d = this.drag;
    if (!d) return;
    const o = this.dragOrigin(d);
    const t = this.nearestTarget(o.x, o.y, d.kind, d.from === 'mounted' ? d.id : undefined, d.rot);
    if (t?.ref.parent !== this.target?.ref.parent || t?.ref.socket !== this.target?.ref.socket || t?.res !== this.target?.res) {
      this.target = t;
      this.proposedCom = t && t.res.ok ? massInfo(t.res.bp, this.route.lampStart) : null;
    }
  }

  private onUp(e: PointerEvent): void {
    const holdIds = (this as unknown as { holdIds?: Map<number, HoldControl> }).holdIds;
    const h = holdIds?.get(e.pointerId);
    if (h) {
      h.hold!.up();
      holdIds!.delete(e.pointerId);
    }
    this.pressed = null;
    if (this.pan && this.pan.id === e.pointerId) this.pan = null;
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    this.drag = null;
    const p = this.toLogical(e);
    if (!d.active) {
      // A click: select (or deselect).
      if (d.from === 'tray') this.selectTray(d.kind);
      else if (d.id) this.selectMounted(d.id);
      return;
    }
    const t = this.target;
    this.target = null;
    this.proposedCom = null;
    const inside = p.x >= 0 && p.y >= 0 && p.x <= this.L.W && p.y <= this.L.H;
    if (t && inside) {
      if (t.res.ok) {
        this.commitFit(t.res, t);
        return;
      }
      this.reject(t.res.reason, t.x, t.y);
      this.returnPiece(d);
      return;
    }
    if (inside && d.from === 'mounted' && d.id && p.y > this.L.drawer.y - 10) {
      // Dropped on the drawer: remove the branch as one undoable edit.
      this.ws.commit(removeBranch(this.ws.bp, d.id));
      audio.stow();
      this.afterEdit();
      return;
    }
    this.returnPiece(d);
  }

  private returnPiece(d: Drag): void {
    audio.stow();
    if (d.from === 'tray') this.trayLift[d.kind] = 0;
    this.targetsKey = '';
  }

  private onCancel(e: PointerEvent, lost = false): void {
    const holdIds = (this as unknown as { holdIds?: Map<number, HoldControl> }).holdIds;
    const h = holdIds?.get(e.pointerId);
    if (h) {
      h.hold!.up();
      holdIds!.delete(e.pointerId);
    }
    if (this.drag && this.drag.pointerId === e.pointerId && (!lost || this.drag)) {
      // Abandon without changing stock or the build.
      if (lost && !this.drag.active) return;
      this.cancelDrag();
    }
    if (this.pan && this.pan.id === e.pointerId) this.pan = null;
  }

  cancelDrag(): void {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    this.target = null;
    this.proposedCom = null;
    if (d.active) this.returnPiece(d);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const code = e.code;
    if (down) {
      audio.unlock();
      if (code === 'Tab' || code.startsWith('Arrow') || code === 'Enter') {
        this.device = 'keyboard';
        this.keyboardFocus = true;
      } else if (['Space', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyV'].includes(code)) this.device = 'keyboard';
    }
    if (code === 'Escape' && down) {
      if (this.drag) this.cancelDrag();
      else if (this.sel) {
        this.sel = null;
        this.a11y.announce('Selection cleared.');
      } else if (this.mode === 'scout' && !this.paused) this.exitScout();
      else this.togglePause();
      e.preventDefault();
      return;
    }
    if (this.paused) {
      if (down && (code === 'ArrowUp' || code === 'ArrowDown')) {
        this.a11y.moveInGroup(code === 'ArrowDown' ? 1 : -1);
        e.preventDefault();
      } else if (down && (code === 'ArrowLeft' || code === 'ArrowRight')) {
        const f = this.a11y.focused();
        const ctl = f ? this.controls.find((c) => c.id === f) : null;
        if (ctl && (ctl as HoldControl & { adjust?: (d: number) => void }).adjust) {
          (ctl as HoldControl & { adjust: (d: number) => void }).adjust(code === 'ArrowRight' ? 1 : -1);
          e.preventDefault();
        }
      }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (this.mode === 'run' || this.mode === 'result') {
      if (['Space', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
        if (down) this.keys.add(code);
        else this.keys.delete(code);
        return;
      }
      if (code === 'KeyR' && down && !e.repeat) {
        this.backToBench();
        e.preventDefault();
      }
      return;
    }
    if (this.mode === 'bench') {
      if (down && mod && code === 'KeyZ') {
        if (e.shiftKey) this.redo();
        else this.undo();
        e.preventDefault();
        return;
      }
      if (down && mod && code === 'KeyY') {
        this.redo();
        e.preventDefault();
        return;
      }
      if (down && (code === 'KeyQ' || code === 'KeyE')) {
        this.rotate(code === 'KeyE' ? -1 : 1);
        e.preventDefault();
        return;
      }
      if (down && (code === 'Delete' || code === 'Backspace')) {
        this.removeSelected();
        e.preventDefault();
        return;
      }
      if (code === 'KeyV' && !mod) {
        // Quick look at the next obstacle while the bench is idle.
        if (down && !this.drag) this.peek = true;
        if (!down) this.peek = false;
        e.preventDefault();
        return;
      }
      if (down && code.startsWith('Arrow')) {
        const dir = code === 'ArrowRight' || code === 'ArrowDown' ? 1 : -1;
        if (!this.a11y.moveInGroup(dir as 1 | -1)) {
          if (!this.a11y.focused()) {
            const first = this.controls.find((c) => c.group === 'tray' || c.group === 'socket');
            if (first) this.a11y.focus(first.id);
          }
        }
        e.preventDefault();
      }
      return;
    }
    if (this.mode === 'scout' && down && code.startsWith('Arrow')) {
      const step = 1.2;
      if (code === 'ArrowLeft') this.cam.cx -= step;
      if (code === 'ArrowRight') this.cam.cx += step;
      if (code === 'ArrowUp') this.cam.cy += step * 0.6;
      if (code === 'ArrowDown') this.cam.cy -= step * 0.6;
      this.clampScout();
      e.preventDefault();
    }
    if (this.mode === 'routes' && down && code.startsWith('Arrow')) {
      this.a11y.moveInGroup(code === 'ArrowRight' || code === 'ArrowDown' ? 1 : -1);
      e.preventDefault();
    }
  }

  // ============================================================ scout

  enterScout(): void {
    if (this.mode !== 'bench') return;
    this.cancelDrag();
    this.mode = 'scout';
    const b = this.route.bounds;
    const ppm = Math.min(70, (this.L.H - 120) / (b.y1 - b.y0));
    this.scoutCam = { cx: this.cam.cx + 6, cy: (b.y0 + b.y1) / 2, ppm };
    this.cam.set(this.scoutCam);
    this.clampScout();
    audio.uiClick();
    this.a11y.announce('Scout: drag or use the arrow keys to look along the course. Escape returns to the bench.');
    window.setTimeout(() => this.a11y.focus('scout:back'), 0);
  }

  exitScout(): void {
    if (this.mode !== 'scout') return;
    this.mode = 'bench';
    this.pan = null;
    // Exact bench camera, focus and selection are restored.
    this.cam.set(this.benchCam);
    audio.uiClick();
    window.setTimeout(() => {
      if (this.device === 'keyboard') this.a11y.focus('scout');
    }, 0);
  }

  private clampScout(): void {
    const b = this.route.bounds;
    const halfW = this.L.W / 2 / this.cam.ppm;
    const halfH = this.L.H / 2 / this.cam.ppm;
    this.cam.cx = clamp(this.cam.cx, b.x0 + halfW * 0.6, Math.max(b.x0 + halfW * 0.6, b.x1 - halfW * 0.6));
    this.cam.cy = clamp(this.cam.cy, b.y0 + halfH * 0.5, Math.max(b.y0 + halfH * 0.5, b.y1 - halfH * 0.4));
  }

  // ============================================================ loop

  start(): void {
    const loop = (now: number) => {
      this.frame(now);
      requestAnimationFrame(loop);
    };
    this.loops++;
    requestAnimationFrame(loop);
  }

  frame(now: number): void {
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 1 / 60;
    this.lastNow = now;
    this.time += dt;
    this.frameCount++;
    const { steps, alpha } = this.stepper.advance(now);
    if (!this.paused && this.sim && (this.mode === 'run' || this.mode === 'result')) {
      for (let i = 0; i < steps; i++) this.tick();
      this.alpha = alpha;
    } else this.alpha = 1;
    this.update(dt);
    this.render();
    audio.update();
  }

  private update(dt: number): void {
    const rm = FX.reducedMotion;
    const step = (v: number, dur: number) => (rm ? 1 : Math.min(1, v + dt / dur));
    if (this.poseT < 1) this.poseT = step(this.poseT, 0.32);
    this.mothT = step(this.mothT, 0.18);
    if (this.mothHop < 1) this.mothHop = step(this.mothHop, 0.3);
    for (const [id, t] of this.fitSettle) {
      const n = t + dt / 0.12;
      if (n >= 1 || rm) this.fitSettle.delete(id);
      else this.fitSettle.set(id, n);
    }
    for (const k of Object.keys(this.trayLift) as PartKind[]) {
      if (this.sel?.from === 'tray' && this.sel.kind === k) continue;
      this.trayLift[k] = Math.max(0, (this.trayLift[k] ?? 0) - dt * 8);
    }
    if (this.rejectAt) {
      this.rejectAt.t += dt;
      if (this.rejectAt.t > 1.6) this.rejectAt = null;
    }
    this.leverRattle = Math.max(0, this.leverRattle - dt * 3);
    this.leverNote = Math.max(0, this.leverNote - dt);
    this.leverFree = Math.max(0, this.leverFree - dt * 1.5);
    this.stopGlint = Math.max(0, this.stopGlint - dt * 4);
    this.shake = Math.max(0, this.shake - dt * 4);
    this.saveNote = Math.max(0, this.saveNote - dt);
    if (this.drag) this.drag.grow = rm ? 1 : Math.min(1, this.drag.grow + dt / 0.1);
    const running = this.mode === 'run' || this.mode === 'result';
    this.drawerRetract = running ? step(this.drawerRetract, 0.26) : rm ? 0 : Math.max(0, this.drawerRetract - dt / 0.25);
    this.clampOpen = running ? step(this.clampOpen, 0.22) : 0;
    if (this.mode === 'run') this.runT += dt;
    if (this.result) {
      this.result.t += dt;
      if (this.result.kind === 'delivered') {
        const t = this.result.t;
        this.wickT = rm ? 1 : clamp(t / 0.12, 0, 1);
        const lit = rm || !this.result.firstDelivery ? 1 : clamp((t - 0.15) / 0.2, 0, 1);
        this.windowLit.set(this.route.id, lit);
        this.stampT = rm ? (t > 0.6 ? 1 : 0) : clamp((t - 0.6) / 0.16, 0, 1);
        this.markT = this.result.mark ? (rm ? (t > 0.86 ? 1 : 0) : clamp((t - 0.86) / 0.16, 0, 1)) : 0;
      }
      if (this.result.kind === 'failed') this.ember = Math.min(1, this.ember + dt / 1.2);
    }
    if (this.paused) this.pauseT = step(this.pauseT, 0.18);
    if (this.mode === 'routes') this.routesUi.t = step(this.routesUi.t, 0.4);
    // Fx particles.
    for (const f of this.fx) {
      f.t += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.kind === 'shard') f.vy -= 6 * dt;
      if (f.kind === 'dust') {
        f.vx *= 0.9;
        f.vy *= 0.9;
      }
    }
    this.fx = this.fx.filter((f) => f.t < f.dur);
    // Bench peek (hold V): ease toward the next obstacle, restore exactly.
    if (this.mode === 'bench') {
      const target = this.peek ? 1 : 0;
      this.peekT = rm ? target : this.peekT + (target - this.peekT) * (1 - Math.exp(-dt * 8));
      if (Math.abs(this.peekT - target) < 0.002) this.peekT = target;
      if (this.peekT === 0) this.cam.set(this.benchCam);
      else {
        const pk = this.route.peek;
        const pv = { cx: pk[0], cy: pk[1] + 0.8, ppm: this.benchCam.ppm };
        this.cam.cx = lerp(this.benchCam.cx, pv.cx, this.peekT);
        this.cam.cy = lerp(this.benchCam.cy, pv.cy, this.peekT);
      }
    }
  }

  // ============================================================ render

  private render(): void {
    const ctx = this.ctx;
    const L = this.L;
    const res = this.res();
    ctx.setTransform(res, 0, 0, res, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const controls: HoldControl[] = [];

    if (this.mode === 'routes') {
      drawRoutes(ctx, this, L);
      controls.push(...(routesControls(this, L) as HoldControl[]));
    } else {
      this.renderWorld(ctx, controls);
    }
    if (this.paused) {
      drawPauseSlip(ctx, this, L);
      this.controls = pauseControls(this, L) as HoldControl[];
    } else this.controls = controls;
    if (this.saveNote > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.saveNote);
      paperNote(ctx, 'Saving is off in this browser: progress lasts for this session.', L.W / 2, L.H - 140, { align: 'center', size: TYPE.body, maxW: 420 });
      ctx.restore();
    }
    this.a11y.sync(this.controls, L.s);
  }

  private renderWorld(ctx: CanvasRenderingContext2D, controls: HoldControl[]): void {

    const cam = this.cam;
    const res = this.res();
    const sim = this.sim;
    const running = (this.mode === 'run' || this.mode === 'result') && sim && this.prev && this.cur;
    const frame = running ? frameFromSim(sim, this.prev!, this.cur!, this.alpha) : this.benchFrame();
    if (running) this.updateRunCamera(1 / 60, frame);
    // Shake offsets only the view, never the simulation.
    const sx = this.shake > 0 ? (Math.sin(this.time * 90) * 4 * this.shake) / cam.ppm : 0;
    const sy = this.shake > 0 ? (Math.cos(this.time * 77) * 3 * this.shake) / cam.ppm : 0;
    cam.cx += sx;
    cam.cy += sy;

    if (this.backdrop) drawBackdrop(ctx, cam, this.backdrop, FX.reducedMotion || !FX.decor);
    drawCounterBack(ctx, cam, this.route);
    drawTerrain(ctx, cam, this.route, false);
    drawCounterFront(ctx, cam, this.route);
    drawWindowBack(ctx, cam, this.route, {
      // A window lit on an earlier night stays lit; a first delivery lights it on cue.
      lit: this.windowLit.get(this.route.id) ?? (this.save.data.delivered[this.route.id] ? 1 : 0),
      wick: this.result?.kind === 'delivered' ? this.wickT : 0,
      clerk: this.result?.kind === 'delivered' ? clamp((this.result.t - 0.15) / 0.3, 0, 1) : 0,
      time: this.time,
    });
    const propPose = (b: planck.Body | null) => (b && this.cur && this.cur.bodies.has(b) ? lerpXf(this.prev?.bodies.get(b), this.cur.bodies.get(b)!, this.alpha) : null);
    const seesawPose = propPose(sim?.seesaw ?? null);
    drawSeesaw(ctx, cam, this.route, seesawPose ?? (this.route.seesaw ? { x: this.route.seesaw.pivot[0] + Math.cos(this.route.seesaw.angle0) * this.route.seesaw.offset, y: this.route.seesaw.pivot[1] + Math.sin(this.route.seesaw.angle0) * this.route.seesaw.offset + this.route.seesaw.thickness / 2, a: this.route.seesaw.angle0 } : null));
    const rollerPose = propPose(sim?.roller ?? null);
    drawRoller(ctx, cam, this.route, !!this.stripePart, rollerPose?.a ?? 0);
    const flapPose = propPose(sim?.flap ?? null);
    drawFlap(ctx, cam, this.route, flapPose);
    if (this.chalk) drawChalkTick(ctx, cam.sx(this.chalk.x), cam.sy(this.chalk.y));

    // Bench furniture: chock and clamp (they stay in the world when the cart leaves).
    const rig = running ? this.clampAnchor : this.benchRig(this.displayPose());
    if (rig) {
      const gy = cam.sy(this.route.start.groundY);
      drawChock(ctx, cam.ppm, cam.sx(rig.chockX), gy, this.clampOpen);
      drawClamp(ctx, cam.ppm, { open: this.clampOpen, padX: cam.sx(rig.padX), padY: cam.sy(rig.padY), postX: cam.sx(rig.postX), groundY: gy });
    }

    // Bench moth stands beside the cart, leaning into the clamp until it is safe to let go.
    const benchMoth = !running || this.mothHop < 1;
    if (benchMoth && this.mode !== 'run' && this.mode !== 'result') {
      const spot = this.mothBenchSpot();
      ctx.save();
      ctx.translate(cam.sx(spot.x), cam.sy(spot.y));
      drawMoth(ctx, { k: cam.ppm, pose: this.mothPose, t: ease(this.mothT), time: this.time }, this.mothFrom);
      ctx.restore();
    }

    // The cart.
    const lit = sim ? sim.lit : true;
    const cracks = sim ? sim.cracks : 0;
    if (running && sim) {
      const v = sim.rig.lamp.getLinearVelocity();
      const ax = (v.x - this.lastLampVx) * 60;
      this.lastLampVx = v.x;
      const target = clamp(-ax * 0.03, -0.5, 0.5);
      this.lean += (target - this.lean) * 0.2;
    } else this.lean *= 0.8;
    const hidden = this.drag?.active && this.drag.from === 'mounted' ? this.drag.id ?? null : null;
    const hiddenSet = hidden ? new Set([hidden, ...descendants(this.ws.bp, hidden)]) : null;
    const drawnFrame: CartFrame = hiddenSet ? { ...frame, parts: frame.parts.filter((p) => !hiddenSet.has(p.id)) } : frame;
    // Fit settle: the gap closes and the part overshoots a pixel or two.
    if (this.fitSettle.size && !running) {
      drawnFrame.parts = drawnFrame.parts.map((p) => {
        const t = this.fitSettle.get(p.id);
        if (t === undefined) return p;
        const off = (t < 0.5 ? -3 + t * 2 * 4.5 : 1.5 * (1 - (t - 0.5) * 2)) / cam.ppm;
        return { ...p, pose: { ...p.pose, y: p.pose.y - off } };
      });
    }
    const mothOnCart = running;
    drawCart(ctx, cam, drawnFrame, {
      res,
      stripePart: this.stripePart,
      selected: this.sel?.from === 'mounted' ? this.sel.id ?? null : null,
      lamp: {
        cracks,
        lit,
        lean: FX.reducedMotion ? this.lean * 0.5 : this.lean,
        flicker: FX.reducedMotion ? 0 : (Math.sin(this.time * 13) + Math.sin(this.time * 7.3)) * 0.5,
        ember: this.ember,
        stopGlint: this.stopGlint,
        stopSide: this.stopSide,
      },
      moth: mothOnCart
        ? (c, seat) => {
            const hop = ease(this.mothHop);
            const x = lerp(cam.sx(this.hopFrom.x), cam.sx(seat.x), hop);
            const y = lerp(cam.sy(this.hopFrom.y), cam.sy(seat.y), hop) - Math.sin(hop * Math.PI) * 30;
            c.save();
            c.translate(x, y);
            c.rotate(-seat.a * hop);
            drawMoth(c, { k: cam.ppm, pose: this.mothPose, t: ease(this.mothT), time: this.time }, this.mothFrom);
            c.restore();
          }
        : undefined,
    });
    drawTerrain(ctx, cam, this.route, true);
    this.drawFx(ctx);

    if (this.backdrop && FX.decor) drawVignette(ctx, this.backdrop, this.L.W, this.L.H);
    // Bench overlays: plumb marks, sockets, drag.
    if (this.mode === 'bench') this.drawBenchOverlays(ctx, frame);
    if (FX.overlay) this.drawDevOverlay(ctx, frame);
    cam.cx -= sx;
    cam.cy -= sy;

    this.drawHud(ctx, controls, frame);
  }

  private drawFx(ctx: CanvasRenderingContext2D): void {
    const cam = this.cam;
    for (const f of this.fx) {
      const a = 1 - f.t / f.dur;
      const x = cam.sx(f.x);
      const y = cam.sy(f.y);
      ctx.save();
      ctx.globalAlpha = a;
      if (f.kind === 'dust') {
        ctx.fillStyle = C.paperShade;
        ctx.beginPath();
        ctx.arc(x, y, f.size * cam.ppm * (1 + f.t * 2), 0, Math.PI * 2);
        ctx.fill();
      } else if (f.kind === 'shard') {
        ctx.fillStyle = 'rgba(230,245,240,0.95)';
        ctx.translate(x, y);
        ctx.rotate(f.t * 12);
        ctx.beginPath();
        ctx.moveTo(-3, -2);
        ctx.lineTo(4, 0);
        ctx.lineTo(-1, 3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      } else if (f.kind === 'ring') {
        ctx.strokeStyle = C.brassGlint;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, (0.06 + f.t * 0.5) * cam.ppm, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawBenchOverlays(ctx: CanvasRenderingContext2D, frame: CartFrame): void {
    const cam = this.cam;
    const k = cam.ppm;
    const pose = frame.chassis;
    // Plumb mark (solid) below the rail, from real masses including the lamp.
    const plumbY = (CHASSIS.bottom + CHASSIS.top) / 2;
    const [px, py] = apply(pose, [this.com.cx, plumbY]);
    drawPlumb(ctx, cam.sx(px), cam.sy(py), false);
    if (this.proposedCom) {
      const [hx, hy] = apply(pose, [this.proposedCom.cx, plumbY]);
      drawPlumb(ctx, cam.sx(hx), cam.sy(hy), true);
    }
    // Sockets for the held or selected part.
    const kind = this.drag?.active ? this.drag.kind : this.sel?.kind;
    const moving = this.drag?.active ? (this.drag.from === 'mounted' ? this.drag.id : undefined) : this.sel?.id;
    const rot = this.drag?.active ? this.drag.rot : this.sel?.rot;
    const focused = this.a11y.focused();
    if (kind) {
      const ts = this.computeTargets(kind, moving, rot);
      for (const t of ts) {
        const x = cam.sx(t.x);
        const y = cam.sy(t.y);
        const isTarget = this.target && this.target.ref.parent === t.ref.parent && this.target.ref.socket === t.ref.socket;
        const isFocus = focused === `socket:${t.ref.parent}:${t.ref.socket}`;
        if (t.res.ok) {
          // Open brass ring: this hole accepts the part.
          ctx.save();
          ctx.strokeStyle = C.ink;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = C.brassGlint;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
        } else if (isTarget || isFocus) {
          hatchedCross(ctx, x, y, 12);
        }
        if (isFocus && this.sel && !this.drag) {
          // Keyboard preview of the fitted silhouette.
          if (t.res.ok) {
            this.drawGhost(ctx, t.res.bp, t.res.placement.id, pose);
            if (!this.proposedCom || this.targetsKey) {
              const pc = massInfo(t.res.bp, this.route.lampStart);
              const [hx, hy] = apply(pose, [pc.cx, plumbY]);
              drawPlumb(ctx, cam.sx(hx), cam.sy(hy), true);
            }
          }
          focusRing(ctx, { x: x - 14, y: y - 14, w: 28, h: 28 }, 14);
        }
      }
    }
    // The dragged piece: snapped preview at a legal socket, else under the pointer.
    const d = this.drag;
    if (d?.active) {
      const t = this.target;
      if (t && t.res.ok) {
        this.drawGhost(ctx, t.res.bp, t.res.placement.id, pose, true);
      }
      const o = this.dragOrigin(d);
      const sc = lerp(this.L.trayK / k, 1, d.grow);
      ctx.save();
      ctx.translate(cam.sx(o.x), cam.sy(o.y));
      // Lifted 2-3 px away from its shadow.
      ctx.save();
      ctx.translate(3, 6);
      ctx.globalAlpha = 0.35;
      ctx.filter = 'brightness(0)';
      this.drawBranch(ctx, d, k * sc);
      ctx.restore();
      ctx.translate(0, -3);
      if (t && t.res.ok) ctx.globalAlpha = 0.5;
      this.drawBranch(ctx, d, k * sc);
      ctx.restore();
      if (t && !t.res.ok) {
        hatchedCross(ctx, cam.sx(t.x), cam.sy(t.y), 12);
      }
    }
    // Rejection: hatch just the incompatible hole, reason beside it.
    if (this.rejectAt && this.rejectAt.t < 0.45) hatchedCross(ctx, cam.sx(this.rejectAt.x), cam.sy(this.rejectAt.y), 12);
    if (this.mode === 'bench' && this.legal && !this.drag && !this.sel) {
      // nothing
    }
    void k;
  }

  /** Dragged part plus its children, drawn in the moving part's frame. */
  private drawBranch(ctx: CanvasRenderingContext2D, d: Drag, k: number): void {
    const res = this.res();
    if (d.from === 'mounted' && d.id) {
      const L = bpLayout(this.ws.bp);
      const root = L.get(d.id);
      if (root) {
        const inv = { x: -root.xf.x, y: -root.xf.y, a: 0 };
        const ids = [d.id, ...descendants(this.ws.bp, d.id)];
        for (const id of ids.reverse()) {
          const lp = L.get(id);
          if (!lp) continue;
          const rel = compose(inv, lp.xf);
          ctx.save();
          ctx.translate(rel.x * k, -rel.y * k);
          ctx.rotate(-rel.a);
          drawPart(ctx, lp.p.kind, { k, res });
          ctx.restore();
        }
        return;
      }
    }
    ctx.save();
    const rots = PARTS[d.kind].rotations;
    const a = rots[d.rot ?? (d.kind === 'spar' ? 1 : 0)] ?? 0;
    ctx.rotate(-a);
    drawPart(ctx, d.kind, { k, res, spin: d.kind === 'keyWheel' ? 0.4 : 0 });
    ctx.restore();
  }

  /** Exact fitted silhouette at the target socket. */
  private drawGhost(ctx: CanvasRenderingContext2D, bp: Blueprint, id: string, pose: Xf, solid = false): void {
    const cam = this.cam;
    const L = bpLayout(bp);
    const ids = [id, ...descendants(bp, id)];
    ctx.save();
    ctx.globalAlpha = solid ? 0.92 : 0.7;
    for (const pid of ids) {
      const lp = L.get(pid);
      if (!lp) continue;
      const w = compose(pose, lp.xf);
      ctx.save();
      ctx.translate(cam.sx(w.x), cam.sy(w.y));
      if (lp.p.kind !== 'keyWheel' && lp.p.kind !== 'reel') ctx.rotate(-w.a);
      drawPart(ctx, lp.p.kind, { k: cam.ppm, res: this.res(), spin: pose.a });
      ctx.restore();
    }
    ctx.restore();
  }

  private drawDevOverlay(ctx: CanvasRenderingContext2D, frame: CartFrame): void {
    const cam = this.cam;
    ctx.save();
    ctx.lineWidth = 1;
    if (this.sim) {
      for (let b = this.sim.world.getBodyList(); b; b = b.getNext()) {
        const p = b.getPosition();
        const a = b.getAngle();
        for (let f = b.getFixtureList(); f; f = f.getNext()) {
          const s = f.getShape();
          ctx.strokeStyle = f.isSensor() ? '#ff00ff' : '#00ff66';
          ctx.beginPath();
          if (s.getType() === 'circle') {
            const c = s as unknown as { m_p: { x: number; y: number }; m_radius: number };
            const [x, y] = apply({ x: p.x, y: p.y, a }, [c.m_p.x, c.m_p.y]);
            ctx.arc(cam.sx(x), cam.sy(y), c.m_radius * cam.ppm, 0, Math.PI * 2);
          } else {
            const v = (s as unknown as { m_vertices: { x: number; y: number }[] }).m_vertices;
            v.forEach((q, i) => {
              const [x, y] = apply({ x: p.x, y: p.y, a }, [q.x, q.y]);
              i ? ctx.lineTo(cam.sx(x), cam.sy(y)) : ctx.moveTo(cam.sx(x), cam.sy(y));
            });
            if (s.getType() !== 'chain') ctx.closePath();
          }
          ctx.stroke();
        }
      }
    } else {
      for (const lp of bpLayout(this.ws.bp).values()) {
        for (const s of lp.solids) {
          ctx.strokeStyle = '#00ff66';
          ctx.beginPath();
          if (s.type === 'circle') {
            const [x, y] = apply(frame.chassis, [s.x, s.y]);
            ctx.arc(cam.sx(x), cam.sy(y), s.r * cam.ppm, 0, Math.PI * 2);
          } else {
            s.pts.forEach((q, i) => {
              const [x, y] = apply(frame.chassis, q);
              i ? ctx.lineTo(cam.sx(x), cam.sy(y)) : ctx.moveTo(cam.sx(x), cam.sy(y));
            });
            ctx.closePath();
          }
          ctx.stroke();
        }
      }
      for (const piece of this.route.pieces) {
        ctx.strokeStyle = '#00ffff';
        ctx.beginPath();
        piece.pts.forEach((q, i) => (i ? ctx.lineTo(cam.sx(q[0]), cam.sy(q[1])) : ctx.moveTo(cam.sx(q[0]), cam.sy(q[1]))));
        ctx.closePath();
        ctx.stroke();
      }
    }
    for (const s of allSockets(this.ws.bp)) {
      const [x, y] = apply(frame.chassis, [s.x, s.y]);
      ctx.fillStyle = '#ff3366';
      ctx.fillRect(cam.sx(x) - 2, cam.sy(y) - 2, 4, 4);
    }
    const a = this.route.arch;
    ctx.strokeStyle = '#ff00ff';
    ctx.strokeRect(cam.sx(a.x - a.w / 2), cam.sy(a.y + a.h / 2), a.w * cam.ppm, a.h * cam.ppm);
    ctx.restore();
  }

  // ============================================================== HUD

  private drawHud(ctx: CanvasRenderingContext2D, controls: HoldControl[], frame: CartFrame): void {
    const L = this.L;
    const focused = this.keyboardFocus || this.device === 'keyboard' ? this.a11y.focused() : null;
    const bench = this.mode === 'bench';
    const running = this.mode === 'run' || this.mode === 'result';
    const stock = this.ws.stock();
    const best = (id: string) => ({ focus: focused === id, hover: this.hover === id, pressed: this.pressed === id });

    // Route slip (top left).
    const slipRect = L.compact ? { ...L.slip, w: 260, h: 120 } : L.slip;
    drawSlip(ctx, slipRect, this.route, {
      delivered: !!this.save.data.delivered[this.route.id] && !(this.result?.kind === 'delivered' && this.stampT < 1),
      mark: !!this.save.data.marks[this.route.id] && !(this.result?.kind === 'delivered' && this.result.mark && this.markT < 1),
      stamp: this.result?.kind === 'delivered' ? this.stampT : 0,
      markStamp: this.result?.kind === 'delivered' && this.result.mark ? this.markT : 0,
      blue: this.route.mark.id === 'blue' && !!this.stripePart && this.result?.kind === 'delivered' && this.stampT > 0,
      outstanding: !this.save.data.marks[this.route.id],
    }, false);

    // Pause (top right).
    controls.push({ id: 'pause', label: 'Pause', rect: L.pause, enabled: true, onActivate: () => this.togglePause() });
    drawTab(ctx, L.pause, 'pause', 'Pause', { enabled: true, ...best('pause') });

    if (bench || this.mode === 'scout') {
      // Drawer, recesses and the lever.
      if (this.mode === 'bench') {
        L.recesses.forEach(({ kind, r }) => {
          const n = stock[kind];
          controls.push({
            id: `tray:${kind}`,
            label: `${PARTS[kind].label}, ${n} in the drawer${this.sel?.from === 'tray' && this.sel.kind === kind ? ', picked up' : ''}`,
            rect: r,
            enabled: n > 0,
            group: 'tray',
            onActivate: () => this.selectTray(kind),
          });
        });
      }
      drawDrawer(ctx, L.drawer, L.recesses, L.trayK, {
        stock,
        kit: this.route.kit as Record<PartKind, number>,
        retract: this.drawerRetract,
        held: this.drag?.active && this.drag.from === 'tray' ? this.drag.kind : null,
        selectedKind: this.sel?.from === 'tray' ? this.sel.kind : null,
        focus: focused,
        hoverKind: null,
        res: this.res(),
        time: this.time,
        lift: this.trayLift,
      });
      if (this.mode === 'bench') {
        controls.push({ id: 'undo', label: 'Undo', rect: L.undo, enabled: this.ws.canUndo(), onActivate: () => this.undo() });
        controls.push({ id: 'redo', label: 'Redo', rect: L.redo, enabled: this.ws.canRedo(), onActivate: () => this.redo() });
        controls.push({ id: 'scout', label: 'Scout the course', rect: L.scout, enabled: true, onActivate: () => this.enterScout() });
        drawTab(ctx, L.undo, 'undo', 'Undo', { enabled: this.ws.canUndo(), ...best('undo') });
        drawTab(ctx, L.redo, 'redo', 'Redo', { enabled: this.ws.canRedo(), ...best('redo') });
        drawTab(ctx, L.scout, 'scout', 'Scout', { enabled: true, ...best('scout') });
        // Mounted parts and sockets as focusable controls (keyboard editing).
        const fr = frame;
        for (const part of fr.parts) {
          const def = PARTS[part.kind];
          const [cx, cy] = apply(part.pose, [def.pick.x, def.pick.y]);
          const r = def.pick.r * this.cam.ppm;
          controls.push({
            id: `part:${part.id}`,
            label: `Fitted ${def.label}${this.sel?.id === part.id ? ', selected' : ''}`,
            rect: { x: this.cam.sx(cx) - r, y: this.cam.sy(cy) - r, w: r * 2, h: r * 2 },
            enabled: true,
            group: 'part',
            onActivate: () => this.selectMounted(part.id),
          });
        }
        if (this.sel) {
          for (const t of this.computeTargets(this.sel.kind, this.sel.id, this.sel.rot)) {
            const ref = t.ref;
            controls.push({
              id: `socket:${ref.parent}:${ref.socket}`,
              label: `${ref.parent === 'chassis' ? `Frame socket ${ref.socket + 1}` : `Socket on ${PARTS[findPlacement(this.ws.bp, ref.parent)?.kind ?? 'spar'].label}`}${t.res.ok ? '' : `: ${t.res.reason}`}`,
              rect: { x: this.cam.sx(t.x) - 14, y: this.cam.sy(t.y) - 14, w: 28, h: 28 },
              enabled: true,
              group: 'socket',
              onActivate: () => this.placeSelection(ref),
            });
          }
        }
      }
      const chk = checkLaunch(this.ws.bp, this.route.kit);
      controls.push({ id: 'lever', label: chk.ok ? 'Dispatch: pull the lever to launch' : `Dispatch, locked: ${chk.missing}`, rect: L.lever, enabled: chk.ok && this.mode === 'bench', onActivate: () => this.dispatch() });
      drawLever(ctx, L.lever, {
        locked: !chk.ok,
        missing: chk.ok ? null : chk.missing,
        pull: 0,
        focus: focused === 'lever',
        hover: this.hover === 'lever',
        retract: this.drawerRetract,
        rattle: this.leverRattle,
        free: this.leverFree,
      });
      if (this.mode === 'scout') {
        const back: Rect = { x: L.W - 250, y: 110, w: 220, h: 56 };
        controls.push({ id: 'scout:back', label: 'Back to the bench', rect: back, enabled: true, onActivate: () => this.exitScout() });
        drawTab(ctx, back, 'back', 'Back to bench', { enabled: true, glyph: 'Esc', primary: true, ...best('scout:back') });
        ctx.save();
        ctx.font = `600 ${TYPE.body}px ${FONT_TEXT}`;
        ctx.fillStyle = C.paper;
        ctx.textAlign = 'center';
        ctx.fillText('Scouting · drag to look along the course', L.W / 2, 40);
        ctx.restore();
      }
    } else if (running) {
      // Drawer retracting away.
      if (this.drawerRetract < 1) {
        drawDrawer(ctx, L.drawer, L.recesses, L.trayK, {
          stock,
          kit: this.route.kit as Record<PartKind, number>,
          retract: this.drawerRetract,
          held: null,
          selectedKind: null,
          focus: null,
          hoverKind: null,
          res: this.res(),
          time: this.time,
          lift: {},
        });
        drawLever(ctx, L.lever, { locked: false, missing: null, pull: 1, focus: false, hover: false, retract: this.drawerRetract, rattle: 0, free: 0 });
      }
      const show = this.drawerRetract;
      const sim = this.sim!;
      drawDial(ctx, L.dial, sim.wind, show, this.time, this.runInput().drive && sim.wind > 0);
      const input = this.runInput();
      if (this.mode === 'run' || this.result?.kind === 'rest') {
        const touch = this.device === 'touch';
        controls.push({
          id: 'drive',
          label: `Drive, ${input.drive ? 'on' : 'off'}`,
          rect: L.drive,
          enabled: true,
          pressed: input.drive,
          onActivate: () => {
            this.driveLatched = !this.driveLatched;
            audio.uiClick();
          },
          hold: touch
            ? {
                down: () => this.touchDrive.add(1),
                up: () => this.touchDrive.delete(1),
              }
            : undefined,
        });
        drawDrive(ctx, L.drive, { on: input.drive, focus: focused === 'drive', hover: this.hover === 'drive', touch, show, hint: false, wind: sim.wind });
        controls.push({ id: 'lamp:back', label: 'Slide lamp toward the back (hold)', rect: L.lampBack, enabled: true, group: 'lamp', onActivate: () => this.nudgeLamp(-1), hold: { down: () => this.lampHold.back.add(1), up: () => this.lampHold.back.delete(1) } });
        controls.push({ id: 'lamp:fwd', label: 'Slide lamp toward the nose (hold)', rect: L.lampFwd, enabled: true, group: 'lamp', onActivate: () => this.nudgeLamp(1), hold: { down: () => this.lampHold.fwd.add(1), up: () => this.lampHold.fwd.delete(1) } });
        drawLampControls(ctx, L.lampBack, L.lampFwd, { back: input.lamp < 0, fwd: input.lamp > 0, show, focusBack: focused === 'lamp:back', focusFwd: focused === 'lamp:fwd' });
      }
      this.drawResultActions(ctx, controls, focused);
    }

    this.drawHints(ctx, frame, focused);
  }

  /** Keyboard activation of a lamp control nudges for a few ticks. */
  private nudgeLamp(dir: -1 | 1): void {
    const key = dir < 0 ? 'KeyA' : 'KeyD';
    this.keys.add(key);
    window.setTimeout(() => this.keys.delete(key), 160);
  }

  private drawResultActions(ctx: CanvasRenderingContext2D, controls: HoldControl[], focused: string | null): void {
    const L = this.L;
    const r = this.result;
    const best = (id: string) => ({ focus: focused === id, hover: this.hover === id, pressed: this.pressed === id });
    const x = L.W - 262;
    let y = 104;
    const add = (id: string, label: string, act: () => void, glyph: string | undefined, primary: boolean) => {
      const rect: Rect = { x, y, w: 240, h: 56 };
      controls.push({ id, label, rect, enabled: true, onActivate: act });
      drawTab(ctx, rect, id === 'act:next' ? 'next' : id === 'act:again' ? 'again' : id === 'act:routes' ? 'routes' : 'back', label, { enabled: true, glyph, primary, ...best(id) });
      y += 66;
    };
    if (!r || r.kind === 'rest' || this.mode === 'run') {
      if (this.mode === 'run') {
        // Retry is one action at any moment.
        add('act:back', 'Back to bench', () => this.backToBench(), 'R', r?.kind === 'rest');
        if (r?.kind === 'rest') add('act:again', 'Run again', () => this.runAgain(), undefined, false);
      }
    } else if (r.kind === 'delivered') {
      const next = ROUTES[this.route.index + 1];
      add('act:next', next ? 'Next window' : 'See the shift', () => this.nextWindow(), 'Enter', true);
      add('act:again', 'Run again', () => this.runAgain(), undefined, false);
      add('act:back', 'Back to bench', () => this.backToBench(), 'R', false);
    } else {
      add('act:back', 'Back to bench', () => this.backToBench(), 'R', true);
      add('act:again', 'Run again', () => this.runAgain(), undefined, false);
    }
    void L;
  }

  private drawHints(ctx: CanvasRenderingContext2D, frame: CartFrame, focused: string | null): void {
    const cam = this.cam;
    const L = this.L;
    const glyphFor = (what: 'drive' | 'fwd') => (this.device === 'keyboard' ? (what === 'drive' ? 'Space' : 'D') : this.device === 'touch' ? (what === 'drive' ? 'HOLD' : '▶') : what === 'drive' ? 'DRIVE' : '▶');
    // One contextual hint at a time, in priority order.
    if (this.mode === 'bench') {
      if (this.rejectAt) {
        paperNote(ctx, this.rejectAt.reason, cam.sx(this.rejectAt.x) + 26, cam.sy(this.rejectAt.y) - 62, { leader: [cam.sx(this.rejectAt.x), cam.sy(this.rejectAt.y) - 12], size: TYPE.body, seed: 3 });
        return;
      }
      if (this.drag?.active && this.target && !this.target.res.ok) {
        paperNote(ctx, this.target.res.reason, cam.sx(this.target.x) + 26, cam.sy(this.target.y) - 64, { leader: [cam.sx(this.target.x), cam.sy(this.target.y) - 12], size: TYPE.body, seed: 4 });
        return;
      }
      if (this.leverNote > 0) {
        const chk = checkLaunch(this.ws.bp, this.route.kit);
        if (!chk.ok) {
          paperNote(ctx, chk.missing, L.lever.x - 10, L.lever.y + 20, { leader: [L.lever.x + 40, L.lever.y + 80], size: TYPE.hint, seed: 8, maxW: 200 });
          // Point at the precise missing part in the drawer as well.
          if (chk.kind) {
            const rec = L.recesses.find((x) => x.kind === chk.kind);
            if (rec) focusRing(ctx, rec.r, 10);
          }
          return;
        }
      }
      const sel = this.drag?.active ? this.drag.kind : this.sel?.kind;
      if (sel && !this.drag?.active) {
        const rec = L.recesses.find((x) => x.kind === sel);
        const ax = rec ? rec.r.x + rec.r.w / 2 : L.W / 2;
        paperNote(ctx, PARTS[sel].blurb, Math.min(L.W - 520, Math.max(20, ax - 120)), L.drawer.y - 56, { leader: rec && this.sel?.from === 'tray' ? [ax, L.drawer.y + 6] : null, size: TYPE.body, maxW: 440, seed: 11 });
        return;
      }
      const stock = this.ws.stock();
      if (!this.drag && stock.keyWheel > 0 && !this.everFitKey && !this.ws.bp.placements.some((p) => p.kind === 'keyWheel')) {
        // "Fit the key wheel" beside the empty mount.
        const ts = this.computeTargets('keyWheel', undefined, undefined).filter((t) => t.res.ok);
        const t = ts[0];
        if (t) {
          const sx = cam.sx(t.x);
          const sy = cam.sy(t.y);
          paperNote(ctx, 'Fit the key wheel', sx - 250, sy - 150, { leader: [sx, sy], size: TYPE.hint + 2, seed: 2 });
        }
        return;
      }
    }
    if (this.mode === 'run' && this.sim) {
      if (this.shiftHintActive && !this.hints.shift) {
        const lx = cam.sx(frame.lamp.x);
        const ly = cam.sy(frame.lamp.y) - 0.62 * cam.ppm;
        paperNote(ctx, 'Shift lamp forward', lx + 40, ly - 30, { leader: [lx + 8, ly + 6], size: TYPE.hint, glyph: glyphFor('fwd'), seed: 13 });
        return;
      }
      if (!this.hints.drive && this.runT < 12) {
        if (this.device === 'keyboard') {
          const cx = cam.sx(frame.chassis.x);
          const cy = cam.sy(frame.chassis.y) - 1.6 * cam.ppm;
          paperNote(ctx, 'Hold to drive', cx - 60, cy, { size: TYPE.hint, glyph: glyphFor('drive'), seed: 14 });
        } else {
          const r = L.drive;
          paperNote(ctx, this.device === 'touch' ? 'Hold DRIVE to wind forward' : 'Click DRIVE to latch it on', r.x - 250, r.y + 30, { leader: [r.x - 4, r.y + 40], size: TYPE.hint, seed: 15, maxW: 220 });
          focusRing(ctx, r, 12);
        }
        return;
      }
    }
    if (this.result && this.result.kind !== 'delivered') {
      const r = this.result;
      if (r.kind === 'failed' || r.kind === 'rest') {
        const at = r.at ?? (this.sim ? { x: this.sim.chassisPose().x, y: this.sim.chassisPose().y } : null);
        if (at) {
          const x = clamp(cam.sx(at.x), 80, L.W - 560);
          const y = clamp(cam.sy(at.y) - 120, 190, L.H - 200);
          paperNote(ctx, r.text, x, y, { leader: [cam.sx(at.x), cam.sy(at.y) - 6], size: TYPE.hint, seed: 17, maxW: 300 });
        }
      }
    }
    void focused;
    void wrapText;
    void FONT_STAMP;
    void printed;
    void roughRect;
  }
}
