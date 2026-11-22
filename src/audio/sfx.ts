// Synthesized sound: no assets to load, nothing blocks play if audio is unavailable.

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Sfx {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private musicOn = false;
  private nextBeat = 0;
  private beat = 0;
  /** 0..1: how tense the music is (a fragile flame). */
  intensity = 0;
  boss = false;
  muted = false;

  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.8;
        this.master.connect(ctx.destination);
        this.sfx = ctx.createGain();
        this.sfx.gain.value = 0.9;
        this.sfx.connect(this.master);
        this.music = ctx.createGain();
        this.music.gain.value = 0.22;
        this.music.connect(this.master);
        const len = ctx.sampleRate;
        this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  suspend(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number, bus?: GainNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', delay = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  private note(semi: number): number {
    return 392 * Math.pow(2, semi / 12);
  }

  // ---------------------------------------------------------------- loops

  /** A continuous filtered-noise voice (rocket hiss, lantern roar, clockwork). */
  private loops = new Map<string, { gain: GainNode; filter: BiquadFilterNode }>();
  private loop(name: string, on: boolean, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    let l = this.loops.get(name);
    if (!l && on) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.sfx);
      src.start();
      l = { gain, filter };
      this.loops.set(name, l);
    }
    if (!l) return;
    l.gain.gain.setTargetAtTime(on ? vol : 0, ctx.currentTime, on ? 0.02 : 0.06);
    l.filter.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
  }
  rocket(on: boolean): void {
    this.loop('rocket', on, 0.16, 1800, 0.7);
  }
  lantern(on: boolean): void {
    this.loop('lantern', on, 0.09, 380, 0.8, 'lowpass');
  }
  private tickT = 0;
  /** Clockwork ticking while the keys drive. */
  drive(on: boolean, speed: number): void {
    const ctx = this.ctx;
    if (!ctx || !on) return;
    const gap = Math.max(0.05, 0.14 - speed * 0.012);
    if (ctx.currentTime - this.tickT > gap) {
      this.tickT = ctx.currentTime;
      this.tone(2400 + Math.random() * 300, 0.02, 'square', 0.018);
    }
  }
  stopLoops(): void {
    for (const k of this.loops.keys()) this.loop(k, false, 0, 1000);
  }

  // ---------------------------------------------------------------- effects

  /** Pin pushed into cork. */
  pin(): void {
    this.tone(1400, 0.04, 'square', 0.05);
    this.burst(0.05, 0.12, 900, 1.2, 'bandpass');
  }
  /** Matchstick laid. */
  stick(): void {
    this.tone(520, 0.06, 'triangle', 0.12);
    this.burst(0.04, 0.1, 2400, 1, 'bandpass');
  }
  unstick(): void {
    this.tone(300, 0.08, 'triangle', 0.1, 0, 180);
  }
  turn(): void {
    this.tone(880, 0.05, 'triangle', 0.08);
    this.tone(1175, 0.05, 'triangle', 0.06, 0.04);
  }
  go(): void {
    this.tone(this.note(0), 0.12, 'triangle', 0.14);
    this.tone(this.note(7), 0.14, 'triangle', 0.14, 0.07);
    this.burst(0.2, 0.08, 1200, 0.8, 'bandpass', 0.05, 3000);
  }
  /** Glass knocked: brighter for harder knocks. */
  knock(loss: number): void {
    const k = Math.min(1, loss * 6);
    this.tone(1800 + k * 1400, 0.12 + k * 0.1, 'sine', 0.06 + k * 0.12);
    this.tone(2700 + k * 900, 0.08, 'sine', 0.04 + k * 0.06, 0.01);
    this.burst(0.06, 0.05 + k * 0.15, 500, 0.8, 'lowpass');
  }
  boing(hit: boolean): void {
    if (!hit) {
      this.tone(500, 0.06, 'square', 0.04);
      return;
    }
    this.tone(180, 0.28, 'triangle', 0.2, 0, 620);
    this.tone(90, 0.12, 'sine', 0.2, 0, 50);
  }
  letter(): void {
    [12, 16, 19, 24].forEach((s, i) => this.tone(this.note(s), 0.14, 'triangle', 0.12, i * 0.05));
  }
  bell(): void {
    for (const [f, v, d] of [
      [1046, 0.18, 1.2],
      [1568, 0.08, 0.9],
      [2637, 0.04, 0.6],
    ] as const)
      this.tone(f, d, 'sine', v);
  }
  stamp(i = 0): void {
    this.tone(70, 0.12, 'sine', 0.4, 0, 40);
    this.burst(0.08, 0.25, 300, 1, 'lowpass');
    this.tone(this.note(PENTA[Math.min(PENTA.length - 1, i * 2 + 2)]), 0.2, 'triangle', 0.14, 0.03);
  }
  blowout(): void {
    this.burst(0.5, 0.25, 1400, 0.6, 'bandpass', 0, 200);
    this.tone(400, 0.4, 'sine', 0.1, 0, 120);
  }
  ignite(): void {
    this.burst(0.18, 0.18, 700, 0.8, 'bandpass', 0, 2600);
    this.tone(220, 0.1, 'sawtooth', 0.04, 0, 440);
  }
  splash(): void {
    this.burst(0.6, 0.3, 700, 0.6, 'lowpass', 0, 200);
    this.tone(220, 0.3, 'sine', 0.12, 0, 90);
  }
  click(): void {
    this.tone(600, 0.05, 'square', 0.05);
  }
  deny(): void {
    this.tone(160, 0.15, 'sawtooth', 0.06);
  }
  fanfare(win: boolean): void {
    const seq = win ? [0, 4, 7, 12, 16] : [7, 4, 0, -5];
    seq.forEach((s, i) => this.tone(this.note(s), 0.3, 'triangle', 0.16, i * 0.12));
  }

  // ---------------------------------------------------------------- music: a plucky night loop

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (on && this.ctx) this.nextBeat = Math.max(this.nextBeat, this.ctx.currentTime + 0.1);
  }

  update(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn) return;
    const bpm = this.boss ? 118 : 104 + this.intensity * 8;
    const spb = 60 / bpm / 2;
    const k = this.intensity;
    while (this.nextBeat < ctx.currentTime + 0.2) {
      const b = this.beat++;
      const d = this.nextBeat - ctx.currentTime;
      const bar = Math.floor(b / 8) % 4;
      const roots = this.boss ? [0, -4, -7, -2] : [0, -3, -7, -5];
      const root = roots[bar];
      if (b % 8 === 0 || b % 8 === 3 || b % 8 === 6) this.tone(this.note(root - 12) / 2, 0.25, 'triangle', 0.35, d, undefined, this.music);
      const arp = this.boss ? [0, 7, 12, 15, 12, 7, 3, 7] : [0, 7, 12, 16, 12, 7, 4, 7];
      if (b % 2 === 0 || bar === 3) this.tone(this.note(root + arp[b % 8]), 0.14, 'square', 0.04, d, undefined, this.music);
      // a fragile flame brings in a second voice and busier hats
      if (k > 0.55 && b % 2 === 1) this.tone(this.note(root + arp[(b + 3) % 8] + 12), 0.1, 'triangle', 0.035 * k, d, undefined, this.music);
      if (b % 4 === 2 || (k > 0.35 && b % 2 === 1)) this.burst(0.04, 0.02 + k * 0.025, 6000, 1, 'highpass', d);
      if (this.boss && b % 8 === 4) this.burst(0.08, 0.05, 200, 1, 'lowpass', d);
      this.nextBeat += spb;
    }
  }
}

export const sfx = new Sfx();
