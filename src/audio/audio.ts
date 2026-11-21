// Synthesized sound: every effect is built from oscillators and filtered noise,
// so nothing has to load and a missing context never blocks play.

type Bus = 'sfx' | 'music';

interface Voice {
  stop: () => void;
  epoch: number;
}

export class Audio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private voices = new Set<Voice>();
  private hiss: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private ambience: { gain: GainNode; src: AudioBufferSourceNode } | null = null;
  private nextTick = 0;
  private nextRustle = 0;
  private nextPhrase = 0;
  private hidden = false;
  /** Run epoch: voices from an abandoned run are cancelled. */
  epoch = 0;
  sfxLevel = 0.8;
  musicLevel = 0.5;
  muted = false;

  /** Create/resume the context on the first user gesture. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.musicBus.connect(this.master);
        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        let seed = 12345;
        for (let i = 0; i < len; i++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          d[i] = (seed / 0x7fffffff) * 2 - 1;
        }
        this.applyLevels();
        this.startAmbience();
        this.nextPhrase = this.ctx.currentTime + 6;
      }
      if (this.ctx.state === 'suspended' && !this.hidden) void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  applyLevels(): void {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.sfxLevel, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.musicLevel * 0.55, t, 0.02);
  }

  setHidden(h: boolean): void {
    this.hidden = h;
    if (!this.ctx) return;
    if (h) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  /** Room tone: quieter while the cart runs so the mechanism carries. */
  setAmbience(level: number): void {
    const a = this.ambience;
    if (!a || !this.ctx) return;
    a.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.4);
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private bus(b: Bus): GainNode | null {
    return b === 'sfx' ? this.sfxBus : this.musicBus;
  }

  private track(nodes: AudioScheduledSourceNode[], end: number, runBound: boolean): void {
    const v: Voice = {
      epoch: runBound ? this.epoch : -1,
      stop: () => {
        for (const n of nodes) {
          try {
            n.stop();
          } catch {
            /* already stopped */
          }
        }
      },
    };
    this.voices.add(v);
    const ms = Math.max(0, (end - (this.ctx?.currentTime ?? 0)) * 1000) + 60;
    window.setTimeout(() => this.voices.delete(v), ms);
  }

  /** Cancel every voice that belongs to an abandoned run. */
  cancelRun(): void {
    for (const v of this.voices) {
      if (v.epoch !== -1) {
        v.stop();
        this.voices.delete(v);
      }
    }
    this.setHiss(0);
  }

  /** Live voices; `runOnly` counts just those owned by a run (cancelled on retry). */
  activeVoices(runOnly = false): number {
    let n = 0;
    for (const v of this.voices) if (!runOnly || v.epoch !== -1) n++;
    return n;
  }

  private tone(opts: {
    f: number;
    f2?: number;
    type?: OscillatorType;
    at?: number;
    dur: number;
    gain: number;
    attack?: number;
    bus?: Bus;
    run?: boolean;
    q?: number;
  }): void {
    const ctx = this.ctx;
    const out = this.bus(opts.bus ?? 'sfx');
    if (!ctx || !out) return;
    const t = (opts.at ?? ctx.currentTime) + 0.005;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(opts.f, t);
    if (opts.f2) o.frequency.exponentialRampToValueAtTime(opts.f2, t + opts.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + opts.dur + 0.05);
    this.track([o], t + opts.dur, opts.run ?? false);
  }

  private noise(opts: {
    at?: number;
    dur: number;
    gain: number;
    type?: BiquadFilterType;
    f: number;
    f2?: number;
    q?: number;
    attack?: number;
    bus?: Bus;
    run?: boolean;
  }): void {
    const ctx = this.ctx;
    const out = this.bus(opts.bus ?? 'sfx');
    if (!ctx || !out || !this.noiseBuf) return;
    const t = (opts.at ?? ctx.currentTime) + 0.005;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const fl = ctx.createBiquadFilter();
    fl.type = opts.type ?? 'bandpass';
    fl.frequency.setValueAtTime(opts.f, t);
    if (opts.f2) fl.frequency.exponentialRampToValueAtTime(opts.f2, t + opts.dur);
    fl.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(fl).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + opts.dur + 0.05);
    this.track([src], t + opts.dur, opts.run ?? false);
  }

  // ------------------------------------------------------------ bench

  /** Dry material tap on pickup. */
  pickup(kind: string): void {
    const f = kind === 'reel' ? 1400 : kind === 'runner' ? 2600 : 1900;
    this.noise({ dur: 0.05, gain: 0.35, f, q: 4 });
    this.tone({ f: f * 0.5, dur: 0.04, gain: 0.08, type: 'triangle' });
  }

  /** Short two-piece clink when a part seats. */
  fit(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone({ f: 2350, dur: 0.09, gain: 0.22, at: t, type: 'triangle' });
    this.tone({ f: 3710, dur: 0.06, gain: 0.08, at: t });
    this.tone({ f: 1760, dur: 0.14, gain: 0.25, at: t + 0.045, type: 'triangle' });
    this.tone({ f: 2790, dur: 0.1, gain: 0.08, at: t + 0.045 });
    this.noise({ dur: 0.03, gain: 0.2, f: 4000, q: 2, at: t });
  }

  /** Low wooden knock on a rejected fit. */
  reject(): void {
    this.tone({ f: 170, f2: 120, dur: 0.16, gain: 0.5, type: 'sine' });
    this.noise({ dur: 0.08, gain: 0.25, f: 420, type: 'lowpass', q: 0.7 });
  }

  /** Paper-soft drop back into the drawer. */
  stow(): void {
    this.noise({ dur: 0.07, gain: 0.22, f: 900, q: 1.2 });
    this.tone({ f: 260, f2: 200, dur: 0.08, gain: 0.12, type: 'triangle' });
  }

  uiClick(): void {
    this.noise({ dur: 0.03, gain: 0.18, f: 2200, q: 3 });
  }

  // ------------------------------------------------------------ run

  /** Low latch clack as the dispatch lever releases the clamp. */
  latch(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise({ dur: 0.09, gain: 0.55, f: 600, type: 'lowpass', q: 0.8, at: t });
    this.tone({ f: 140, f2: 90, dur: 0.12, gain: 0.35, at: t, type: 'triangle' });
    this.noise({ dur: 0.03, gain: 0.3, f: 3200, q: 3, at: t + 0.06 });
  }

  /** Clockwork ticking: call every frame while the key turns; rate follows wheel speed. */
  ticking(active: boolean, rate: number): void {
    const ctx = this.ctx;
    if (!ctx || !active) {
      this.nextTick = 0;
      return;
    }
    const now = ctx.currentTime;
    if (this.nextTick < now) this.nextTick = now + 0.01;
    const interval = 1 / Math.max(5, Math.min(22, rate));
    while (this.nextTick < now + 0.08) {
      this.noise({ at: this.nextTick, dur: 0.018, gain: 0.16, f: 5200, q: 6, run: true });
      this.tone({ at: this.nextTick, f: 3100, dur: 0.012, gain: 0.03, run: true });
      this.nextTick += interval;
    }
  }

  slide(): void {
    this.noise({ dur: 0.12, gain: 0.12, f: 1800, f2: 2600, q: 2, run: true });
  }

  endStop(): void {
    this.tone({ f: 2900, dur: 0.05, gain: 0.16, type: 'triangle', run: true });
    this.noise({ dur: 0.02, gain: 0.12, f: 5000, q: 4, run: true });
  }

  /** Sustained paper hiss for a rubbing runner, scaled by contact speed. */
  setHiss(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf || !this.sfxBus) return;
    if (!this.hiss && level > 0.001) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1600;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.sfxBus);
      src.start();
      this.hiss = { src, gain, filter };
    }
    if (this.hiss) {
      const t = ctx.currentTime;
      const v = Math.min(1, level);
      this.hiss.gain.gain.setTargetAtTime(v * 0.22, t, level > 0 ? 0.03 : 0.015);
      this.hiss.filter.frequency.setTargetAtTime(900 + v * 2400, t, 0.05);
    }
  }

  /** Wet squeak of the ink roller turning under a wheel: Blue post. */
  ink(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone({ f: 980, f2: 1480, dur: 0.16, gain: 0.14, type: 'triangle', at: t, run: true });
    this.noise({ dur: 0.2, gain: 0.18, f: 1300, f2: 700, q: 3, at: t + 0.02, run: true });
    this.tone({ f: 1960, dur: 0.12, gain: 0.05, at: t + 0.05, run: true });
  }

  /** Dry wooden creak as the ruler starts to tip on its pencil. */
  creak(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this.noise({ dur: 0.05, gain: 0.16 - i * 0.025, f: 520 + i * 60, q: 9, at: t + i * 0.055, run: true });
    this.tone({ f: 180, f2: 140, dur: 0.3, gain: 0.07, type: 'sawtooth', at: t, attack: 0.04, run: true });
  }

  /** Paper flap lifted off the shelf. */
  rustle(): void {
    this.noise({ dur: 0.28, gain: 0.2, f: 2400, f2: 1200, q: 0.9, attack: 0.03, run: true });
  }

  /** Two short, decaying metallic tones for a brass strike. */
  strike(power: number): void {
    const g = Math.min(0.5, 0.08 + power * 0.08);
    const f = 520 + Math.min(1, power / 4) * 180;
    this.tone({ f, dur: 0.35, gain: g, type: 'triangle', run: true });
    this.tone({ f: f * 2.71, dur: 0.22, gain: g * 0.45, run: true });
    if (this.ctx) {
      const t = this.ctx.currentTime + 0.05;
      this.tone({ f: f * 1.19, dur: 0.28, gain: g * 0.7, type: 'triangle', at: t, run: true });
    }
    this.noise({ dur: 0.05, gain: g * 0.6, f: 300, type: 'lowpass', run: true });
  }

  /** Glass ping for a crack (separate from the brass strike). */
  crack(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone({ f: 3520, dur: 0.5, gain: 0.25, at: t, run: true });
    this.tone({ f: 5280, dur: 0.3, gain: 0.1, at: t, run: true });
    this.noise({ dur: 0.07, gain: 0.3, f: 6000, type: 'highpass', q: 0.7, at: t, run: true });
    this.tone({ f: 4460, dur: 0.25, gain: 0.08, at: t + 0.03, run: true });
  }

  /** Soft puff as the flame dies, then the mechanism stops. */
  puff(): void {
    this.noise({ dur: 0.35, gain: 0.35, f: 500, f2: 180, type: 'lowpass', q: 0.5, attack: 0.02, run: true });
  }

  /** Wick hiss, one tuned desk bell, then the flat thump of a rubber stamp. */
  deliver(mark: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise({ dur: 0.25, gain: 0.25, f: 3000, f2: 5000, type: 'highpass', q: 0.6, at: t, attack: 0.03, run: true });
    this.bell(784, t + 0.16, 0.38, 'sfx', true);
    this.tone({ f: 110, f2: 60, dur: 0.14, gain: 0.55, at: t + 0.62, type: 'sine', run: true });
    this.noise({ dur: 0.07, gain: 0.35, f: 380, type: 'lowpass', at: t + 0.62, run: true });
    if (mark) this.bell(1175, t + 0.86, 0.26, 'sfx', true);
  }

  /** Felted desk bell: inharmonic partials with a soft attack. */
  private bell(f: number, at: number, gain: number, bus: Bus, run = false): void {
    this.tone({ f, dur: 1.6, gain, at, attack: 0.006, bus, run });
    this.tone({ f: f * 2.76, dur: 0.7, gain: gain * 0.28, at, bus, run });
    this.tone({ f: f * 5.4, dur: 0.25, gain: gain * 0.1, at, bus, run });
    this.noise({ dur: 0.02, gain: gain * 0.3, f: 1200, q: 1, at, bus, run });
  }

  /** Plucked ruler: a twang with a falling wobble. */
  private ruler(f: number, at: number, gain: number): void {
    const ctx = this.ctx;
    const out = this.musicBus;
    if (!ctx || !out) return;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.setValueAtTime(14, at);
    lfo.frequency.exponentialRampToValueAtTime(5, at + 0.9);
    lg.gain.setValueAtTime(f * 0.03, at);
    lg.gain.exponentialRampToValueAtTime(f * 0.004, at + 0.9);
    lfo.connect(lg).connect(o.frequency);
    o.frequency.setValueAtTime(f * 1.02, at);
    o.frequency.exponentialRampToValueAtTime(f, at + 0.15);
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(f * 6, at);
    fl.frequency.exponentialRampToValueAtTime(f * 1.5, at + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
    o.connect(fl).connect(g).connect(out);
    o.start(at);
    lfo.start(at);
    o.stop(at + 1.2);
    lfo.stop(at + 1.2);
    this.track([o, lfo], at + 1.2, false);
  }

  // --------------------------------------------------------- room

  private startAmbience(): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf || !this.sfxBus) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 380;
    const gain = ctx.createGain();
    gain.gain.value = 0.025;
    src.connect(fl).connect(gain).connect(this.sfxBus);
    src.start();
    this.ambience = { gain, src };
  }

  /** Call every frame: paper rustle, timber ticks and the sparse four-note phrase. */
  update(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now > this.nextRustle) {
      if (Math.random() < 0.6) this.noise({ dur: 0.25 + Math.random() * 0.3, gain: 0.03, f: 1400 + Math.random() * 1200, q: 0.6, attack: 0.08 });
      else this.tone({ f: 900 + Math.random() * 300, dur: 0.03, gain: 0.03, type: 'triangle' });
      this.nextRustle = now + 2.5 + Math.random() * 5;
    }
    if (now > this.nextPhrase) {
      this.phrase(now + 0.05);
      // Several bars of silence between phrases.
      this.nextPhrase = now + 26 + Math.random() * 14;
    }
  }

  /** Four notes: plucked ruler answered by a felted bell. */
  private phrase(t: number): void {
    const notes = [392, 523.25, 466.16, 349.23];
    const beat = 0.62;
    this.ruler(notes[0]!, t, 0.12);
    this.ruler(notes[1]!, t + beat, 0.11);
    this.ruler(notes[2]!, t + beat * 2, 0.1);
    this.bell(notes[3]! * 2, t + beat * 3.2, 0.12, 'music');
  }
}

export const audio = new Audio();
