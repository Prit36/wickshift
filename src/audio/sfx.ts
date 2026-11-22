// Synthesized sound: no assets to load, nothing blocks play if audio is unavailable.

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Sfx {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private musicOn = false;
  private nextBeat = 0;
  private beat = 0;
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

  // ---------------------------------------------------------------- engine

  engineUpdate(speed: number, throttle: number, running: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.engine && running) {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'square';
      osc2.type = 'sawtooth';
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      gain.gain.value = 0;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.sfx);
      osc.start();
      osc2.start();
      this.engine = { osc, osc2, gain, filter };
    }
    if (!this.engine) return;
    const t = ctx.currentTime;
    const e = this.engine;
    const v = running ? Math.abs(speed) : 0;
    e.osc.frequency.setTargetAtTime(38 + v * 5 + throttle * 12, t, 0.05);
    e.osc2.frequency.setTargetAtTime(76 + v * 10 + throttle * 20, t, 0.05);
    e.filter.frequency.setTargetAtTime(350 + v * 60 + Math.max(0, throttle) * 500, t, 0.08);
    e.gain.gain.setTargetAtTime(running ? 0.025 + Math.max(0, throttle) * 0.035 + Math.min(v, 14) * 0.002 : 0, t, 0.06);
  }

  // ---------------------------------------------------------------- effects

  takeoff(): void {
    this.burst(0.25, 0.08, 800, 0.7, 'bandpass', 0, 2400);
  }
  land(power: number): void {
    const p = Math.min(1, power / 12);
    this.tone(90, 0.18, 'sine', 0.25 + p * 0.3, 0, 45);
    this.burst(0.12, 0.1 + p * 0.25, 500, 0.8, 'lowpass');
  }
  trick(sparks: number, big: boolean): void {
    const s = Math.min(PENTA.length - 3, sparks);
    this.tone(this.note(PENTA[s]), 0.18, 'triangle', 0.18);
    this.tone(this.note(PENTA[s + 2]), 0.22, 'triangle', 0.14, 0.06);
    if (big) this.tone(this.note(PENTA[s + 4] ?? 24), 0.3, 'sine', 0.12, 0.12);
  }
  letter(n: number): void {
    this.tone(this.note(12 + (n % 5) * 2), 0.12, 'sine', 0.14);
    this.tone(this.note(19 + (n % 5) * 2), 0.1, 'sine', 0.08, 0.04);
  }
  spark(i: number): void {
    const s = PENTA[Math.min(PENTA.length - 1, i)];
    this.tone(this.note(s + 7), 0.09, 'square', 0.05);
    this.tone(this.note(s + 19), 0.12, 'sine', 0.08);
  }
  bell(): void {
    for (const [f, v, d] of [
      [1046, 0.18, 1.2],
      [1568, 0.08, 0.9],
      [2637, 0.04, 0.6],
    ] as const)
      this.tone(f, d, 'sine', v);
  }
  stamp(): void {
    this.tone(70, 0.12, 'sine', 0.4, 0, 40);
    this.burst(0.08, 0.25, 300, 1, 'lowpass');
  }
  whoosh(): void {
    this.burst(0.35, 0.12, 400, 0.9, 'bandpass', 0, 2000);
  }
  blowout(): void {
    this.burst(0.5, 0.25, 1400, 0.6, 'bandpass', 0, 200);
    this.tone(400, 0.4, 'sine', 0.1, 0, 120);
  }
  crash(): void {
    this.burst(0.5, 0.35, 3000, 0.5, 'highpass');
    for (let i = 0; i < 5; i++) this.tone(2000 + Math.random() * 2500, 0.15, 'sine', 0.06, 0.02 + i * 0.03);
    this.tone(120, 0.3, 'sine', 0.3, 0, 50);
  }
  emptyPost(): void {
    this.tone(180, 0.12, 'square', 0.06);
    this.tone(140, 0.15, 'square', 0.06, 0.08);
  }
  coin(i = 0): void {
    this.tone(1318 + i * 80, 0.08, 'square', 0.05);
    this.tone(1975 + i * 80, 0.18, 'sine', 0.1, 0.05);
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
    const spb = 60 / 104 / 2;
    while (this.nextBeat < ctx.currentTime + 0.2) {
      const b = this.beat++;
      const d = this.nextBeat - ctx.currentTime;
      const bar = Math.floor(b / 8) % 4;
      const roots = [0, -3, -7, -5];
      const root = roots[bar];
      if (b % 8 === 0 || b % 8 === 3 || b % 8 === 6) this.tone(this.note(root - 12) / 2, 0.25, 'triangle', 0.35, d, undefined, this.music);
      const arp = [0, 7, 12, 16, 12, 7, 4, 7];
      if (b % 2 === 0 || bar === 3) this.tone(this.note(root + arp[b % 8]), 0.14, 'square', 0.04, d, undefined, this.music);
      if (b % 4 === 2) this.burst(0.04, 0.03, 6000, 1, 'highpass', d);
      this.nextBeat += spb;
    }
  }
}

export const sfx = new Sfx();
