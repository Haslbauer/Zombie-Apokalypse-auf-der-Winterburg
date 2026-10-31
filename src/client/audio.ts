/**
 * Ton: Alle Geräusche und die Musik entstehen im Browser (Web-Audio):
 * Oszillatoren, Rauschen, Filter und Hüllkurven, leicht zufällig variiert.
 * Keine Dateien, keine Lizenzfragen.
 *
 * Kanäle (je eigener Regler, im Esc-Menü einstellbar): Effekte, Umgebung,
 * Musik, Oberfläche, darüber Gesamt. Geräusche mit Ort werden nach Abstand
 * zum Zuhörer (eigener Held bzw. Kamera) leiser und links/rechts verteilt.
 */

export type Channel = 'effects' | 'ambience' | 'music' | 'ui';

export interface AudioSettings {
  master: number;
  effects: number;
  ambience: number;
  music: number;
  ui: number;
  muted: boolean;
}

export const DEFAULT_AUDIO: AudioSettings = { master: 0.8, effects: 0.9, ambience: 0.6, music: 0.45, ui: 0.8, muted: false };
const STORAGE = 'winterburg.audio';

/** Einstellungen laden (fehlerhafte Werte → Vorgabe). */
export function loadAudioSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): AudioSettings {
  try {
    const raw = JSON.parse(storage?.getItem(STORAGE) ?? 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_AUDIO };
    const out = { ...DEFAULT_AUDIO };
    for (const k of ['master', 'effects', 'ambience', 'music', 'ui'] as const) {
      const v = raw[k];
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.min(1, v));
    }
    out.muted = raw.muted === true;
    return out;
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

export function saveAudioSettings(s: AudioSettings, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(STORAGE, JSON.stringify(s));
  } catch {
    // ohne Speicher: nur für diese Sitzung
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Wirksame Lautstärke eines Kanals (0 bei stumm). */
export function channelGain(s: AudioSettings, ch: Channel): number {
  return s.muted ? 0 : s.master * s[ch];
}

/**
 * Begrenzung gleichzeitiger Geräusche: insgesamt höchstens max, je Name
 * höchstens perName, und gleiche Geräusche frühestens nach minGap Sekunden
 * erneut (60 Zombies dürfen nicht übersteuern).
 */
export class VoiceLimiter {
  private active: { name: string; until: number }[] = [];
  private last = new Map<string, number>();
  constructor(
    readonly max = 24,
    readonly perName = 4,
    readonly minGap = 0.035,
  ) {}

  /** Darf ein Geräusch name jetzt (time) für duration Sekunden starten? */
  allow(name: string, time: number, duration: number): boolean {
    this.active = this.active.filter((v) => v.until > time);
    if (this.active.length >= this.max) return false;
    if (this.active.filter((v) => v.name === name).length >= this.perName) return false;
    if (time - (this.last.get(name) ?? -Infinity) < this.minGap) return false;
    this.active.push({ name, until: time + duration });
    this.last.set(name, time);
    return true;
  }
}

interface Vec {
  x: number;
  y: number;
}

/** Was jedes Bild für Umgebung und Musik gebraucht wird. */
export interface AudioFrame {
  listener: Vec;
  /** Zombies in der Nähe (für gelegentliches Stöhnen). */
  zombies: Vec[];
  /** Läuft gerade eine Welle, ist ein Boss da, wütende Bienen? */
  wave: boolean;
  boss: boolean;
  beesAngry: boolean;
}

/** Der Audio-Motor. */
export class Sound {
  settings: AudioSettings = loadAudioSettings();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses = new Map<Channel, GainNode>();
  private noiseBuf: AudioBuffer | null = null;
  private readonly limiter = new VoiceLimiter();
  private listener: Vec = { x: 0, y: 0 };
  // Umgebung
  private fires: Vec[] = [];
  private hive: Vec | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private fire: { gain: GainNode } | null = null;
  private bees: { gain: GainNode; osc: OscillatorNode } | null = null;
  private nextMoan = 0;
  private nextCrow = 8;
  // Musik
  private musicNext = 0;
  private musicStep = 0;
  private drone: GainNode | null = null;
  private intensity = 0;

  /** Feste Tonquellen der Karte: Feuer und Bienenstock. */
  setWorld(fires: Vec[], hive: Vec | null): void {
    this.fires = fires;
    this.hive = hive;
  }

  /** Browser erlauben Ton erst nach einer Nutzeraktion: beim ersten Klick bzw. Tastendruck aufrufen. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    for (const ch of ['effects', 'ambience', 'music', 'ui'] as Channel[]) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses.set(ch, g);
    }
    // Weißes Rauschen (2 s) für Wind, Treffer, Feuer …
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.applySettings();
    this.startAmbience();
    this.startDrone();
  }

  /** Regler übernehmen und speichern. */
  applySettings(save = false): void {
    if (save) saveAudioSettings(this.settings);
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.master, t, 0.05);
    for (const [ch, g] of this.buses) g.gain.setTargetAtTime(this.settings[ch], t, 0.05);
  }

  toggleMute(): void {
    this.settings.muted = !this.settings.muted;
    this.applySettings(true);
  }

  // ---------- Bausteine ----------

  /** Ausgang mit Abstand und Stereo-Position; null, wenn zu leise oder zu viele Geräusche laufen. */
  private out(name: string, ch: Channel, duration: number, pos?: Vec, volume = 1): AudioNode | null {
    const ctx = this.ctx;
    if (!ctx || this.settings.muted) return null;
    let gain = volume;
    let pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x;
      const dy = pos.y - this.listener.y;
      const d = Math.hypot(dx, dy);
      gain *= 1 / (1 + (d / 9) ** 2);
      pan = Math.max(-1, Math.min(1, dx / 14));
      if (gain < 0.03) return null;
    }
    if (!this.limiter.allow(name, ctx.currentTime, duration)) return null;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.buses.get(ch)!);
    return g;
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, peak: number, attack = 0.01): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(dest: AudioNode, filter: BiquadFilterType, f0: number, f1: number, t0: number, dur: number, peak: number, q = 1, attack = 0.005): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  private r(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }

  // ---------- Geräusche ----------

  /** Ein Geräusch abspielen (Name siehe unten), optional an einem Ort. */
  play(name: string, pos?: Vec, volume = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    const r = (a: number, b: number) => this.r(a, b);
    const def = SOUNDS[name];
    if (!def) return;
    const d = this.out(name, def.ch, def.dur, def.ch === 'ui' || def.ch === 'music' ? undefined : pos, volume);
    if (!d) return;
    def.make(this, d, t, r);
  }

  /** Interne Helfer für die Klangrezepte. */
  t(dest: AudioNode, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, peak: number, attack?: number): void {
    this.tone(dest, type, f0, f1, t0, dur, peak, attack);
  }
  n(dest: AudioNode, filter: BiquadFilterType, f0: number, f1: number, t0: number, dur: number, peak: number, q?: number, attack?: number): void {
    this.noise(dest, filter, f0, f1, t0, dur, peak, q, attack);
  }

  // ---------- Umgebung und Musik (jedes Bild) ----------

  update(dt: number, frame: AudioFrame): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.listener = frame.listener;
    const t = ctx.currentTime;
    // Feuer: am nächsten Feuer lauter
    if (this.fire) {
      let near = Infinity;
      for (const f of this.fires) near = Math.min(near, Math.hypot(f.x - this.listener.x, f.y - this.listener.y));
      this.fire.gain.gain.setTargetAtTime(0.5 / (1 + (near / 5) ** 2), t, 0.3);
      // einzelnes Knacken
      if (near < 12 && Math.random() < dt * 4) {
        const d = this.out('crackle', 'ambience', 0.08, undefined, 0.6 / (1 + (near / 5) ** 2));
        if (d) this.noise(d, 'highpass', 2500, 1800, t, this.r(0.02, 0.06), 0.5);
      }
    }
    // Bienen: Summen nahe dem Stock, wütend lauter und höher
    if (this.bees && this.hive) {
      const d = Math.hypot(this.hive.x - this.listener.x, this.hive.y - this.listener.y);
      this.bees.gain.gain.setTargetAtTime((frame.beesAngry ? 0.16 : 0.07) / (1 + (d / 6) ** 2), t, 0.3);
      this.bees.osc.frequency.setTargetAtTime(frame.beesAngry ? 230 : 180, t, 0.3);
    }
    // Wind schwankt langsam
    if (this.wind) this.wind.filter.frequency.setTargetAtTime(400 + Math.sin(t * 0.13) * 180 + Math.sin(t * 0.37) * 90, t, 1);
    // Stöhnen naher Zombies und gelegentliche Krähen
    this.nextMoan -= dt;
    if (this.nextMoan <= 0 && frame.zombies.length > 0) {
      this.nextMoan = this.r(0.7, 2.2) / Math.min(4, 1 + frame.zombies.length / 8);
      const z = frame.zombies[Math.floor(Math.random() * frame.zombies.length)];
      this.play('moan', z);
    }
    this.nextCrow -= dt;
    if (this.nextCrow <= 0) {
      this.nextCrow = this.r(12, 30);
      this.play('crow', { x: this.listener.x + this.r(-15, 15), y: this.listener.y + this.r(-15, 15) });
    }
    this.updateMusic(frame);
  }

  private startAmbience(): void {
    const ctx = this.ctx!;
    const bus = this.buses.get('ambience')!;
    const loop = (filterType: BiquadFilterType, freq: number, q: number, gain: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(bus);
      src.start();
      return { gain: g, filter: f };
    };
    this.wind = loop('bandpass', 450, 0.7, 0.18);
    this.fire = loop('lowpass', 700, 0.5, 0);
    // Bienen: Sägezahn mit Vibrato durch Tiefpass
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 180;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 12;
    lfo.connect(lfoGain).connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(lp).connect(g).connect(bus);
    osc.start();
    lfo.start();
    this.bees = { gain: g, osc };
  }

  /** Tiefer Bordun-Ton als Grundlage der Musik. */
  private startDrone(): void {
    const ctx = this.ctx!;
    const bus = this.buses.get('music')!;
    const g = ctx.createGain();
    g.gain.value = 0.06;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    for (const [f, det] of [
      [55, 0],
      [55, 7],
      [82.4, -5],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start();
    }
    lp.connect(g).connect(bus);
    this.drone = g;
  }

  /**
   * Musik: langsame Moll-Akkorde (Am – F – Dm – E) über dem Bordun. In der
   * Welle kommen Trommeln dazu und es wird schneller, bei Bossen intensiver.
   */
  private updateMusic(frame: AudioFrame): void {
    const ctx = this.ctx!;
    const target = frame.boss ? 2 : frame.wave ? 1 : 0;
    this.intensity += (target - this.intensity) * 0.02;
    const t = ctx.currentTime;
    if (this.drone) this.drone.gain.setTargetAtTime(0.05 + this.intensity * 0.02, t, 1);
    const beat = 60 / (70 + this.intensity * 22);
    while (this.musicNext < t + 0.2) {
      if (this.musicNext < t) this.musicNext = t + 0.05;
      const step = this.musicStep++;
      const bus = this.buses.get('music')!;
      // Akkord alle 8 Schläge
      if (step % 8 === 0) {
        const chords = [
          [220, 261.6, 329.6],
          [174.6, 220, 261.6],
          [146.8, 174.6, 220],
          [164.8, 207.7, 246.9],
        ];
        const chord = chords[(step / 8) % chords.length];
        for (const f of chord) this.tone(bus, 'triangle', f, f, this.musicNext, beat * 8, 0.035, beat * 2);
      }
      // Trommeln in der Welle (Kick auf 1 und 3, leiser Schlag auf 2 und 4), beim Boss dichter
      if (this.intensity > 0.3) {
        const k = Math.min(1, this.intensity - 0.3);
        if (step % 2 === 0) {
          this.tone(bus, 'sine', 120, 45, this.musicNext, 0.25, 0.25 * k);
          this.noise(bus, 'lowpass', 400, 100, this.musicNext, 0.08, 0.08 * k);
        } else if (this.intensity > 1.2 || step % 4 === 1) this.noise(bus, 'bandpass', 1800, 900, this.musicNext, 0.06, 0.05 * k, 2);
      }
      this.musicNext += beat;
    }
  }
}

type Recipe = { ch: Channel; dur: number; make: (s: Sound, d: AudioNode, t: number, r: (a: number, b: number) => number) => void };

/** Klangrezepte: Name → Kanal, ungefähre Dauer, Erzeugung. */
export const SOUNDS: Record<string, Recipe> = {
  // Kampf
  swing: { ch: 'effects', dur: 0.25, make: (s, d, t, r) => (s.n(d, 'highpass', r(500, 800), 3000, t, 0.18, 0.5, 0.8, 0.04), s.t(d, 'sine', 140, 60, t + 0.12, 0.12, 0.3)) },
  bow: { ch: 'effects', dur: 0.3, make: (s, d, t, r) => (s.t(d, 'triangle', r(330, 380), 110, t, 0.12, 0.4), s.n(d, 'bandpass', 4000, 1500, t + 0.02, 0.25, 0.25, 2)) },
  throw: { ch: 'effects', dur: 0.3, make: (s, d, t, r) => (s.t(d, 'sine', r(180, 220), 90, t, 0.1, 0.35), s.n(d, 'bandpass', 900, 2500, t + 0.03, 0.22, 0.3, 1.5, 0.05)) },
  hook: { ch: 'effects', dur: 0.35, make: (s, d, t, r) => { for (let i = 0; i < 5; i++) s.t(d, 'square', r(1400, 2200), 900, t + i * 0.045, 0.04, 0.08); } },
  magic: { ch: 'effects', dur: 0.4, make: (s, d, t, r) => { for (let i = 0; i < 4; i++) s.t(d, 'sine', 900 * 1.26 ** i * r(0.98, 1.02), 1800, t + i * 0.05, 0.25, 0.12); } },
  hit: { ch: 'effects', dur: 0.15, make: (s, d, t, r) => (s.t(d, 'sine', r(150, 190), 60, t, 0.12, 0.45), s.n(d, 'lowpass', 1500, 300, t, 0.08, 0.35)) },
  heroHit: { ch: 'effects', dur: 0.2, make: (s, d, t, r) => (s.t(d, 'sine', r(95, 110), 40, t, 0.18, 0.55), s.n(d, 'bandpass', 500, 300, t, 0.12, 0.3, 2)) },
  // Zombies
  moan: { ch: 'effects', dur: 1.4, make: (s, d, t, r) => { const f = r(70, 120); s.t(d, 'sawtooth', f, f * r(0.7, 0.95), t, r(0.8, 1.4), 0.07, 0.3); s.n(d, 'bandpass', r(400, 700), r(250, 400), t, 1.1, 0.05, 6, 0.3); } },
  zombieAttack: { ch: 'effects', dur: 0.3, make: (s, d, t, r) => (s.t(d, 'sawtooth', r(90, 130), 60, t, 0.25, 0.12), s.n(d, 'bandpass', 600, 300, t, 0.2, 0.25, 3)) },
  zombieDeath: { ch: 'effects', dur: 0.8, make: (s, d, t, r) => (s.t(d, 'sawtooth', r(80, 100), 35, t, 0.7, 0.12, 0.05), s.n(d, 'lowpass', 900, 150, t, 0.6, 0.15)) },
  roar: { ch: 'effects', dur: 1.2, make: (s, d, t) => (s.t(d, 'sawtooth', 70, 45, t, 1.1, 0.25, 0.15), s.n(d, 'lowpass', 1200, 200, t, 1, 0.35, 1, 0.15)) },
  slam: { ch: 'effects', dur: 0.6, make: (s, d, t) => (s.t(d, 'sine', 90, 30, t, 0.5, 0.6), s.n(d, 'lowpass', 600, 80, t, 0.45, 0.5)) },
  whoosh: { ch: 'effects', dur: 0.5, make: (s, d, t) => s.n(d, 'bandpass', 300, 2500, t, 0.45, 0.35, 1.5, 0.2) },
  sting: { ch: 'effects', dur: 0.1, make: (s, d, t, r) => s.t(d, 'square', r(1800, 2400), 1200, t, 0.06, 0.05) },
  // Spielablauf
  waveStart: { ch: 'ui', dur: 1.6, make: (s, d, t) => (s.t(d, 'sawtooth', 110, 104, t, 1.5, 0.18, 0.4), s.t(d, 'sawtooth', 165, 156, t, 1.5, 0.12, 0.4)) },
  waveCleared: { ch: 'ui', dur: 1.2, make: (s, d, t) => { [261.6, 329.6, 392, 523.3].forEach((f, i) => s.t(d, 'triangle', f, f, t + i * 0.12, 0.8, 0.15)); } },
  breach: { ch: 'ui', dur: 1, make: (s, d, t) => { for (let i = 0; i < 3; i++) s.t(d, 'square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, t + i * 0.22, 0.18, 0.1); } },
  courier: { ch: 'ui', dur: 1, make: (s, d, t) => { [392, 523.3, 659.3, 784].forEach((f, i) => s.t(d, 'triangle', f, f, t + i * 0.1, 0.4, 0.14)); } },
  bossKill: { ch: 'ui', dur: 1.5, make: (s, d, t) => { s.t(d, 'sine', 80, 40, t, 0.6, 0.5); [220, 277.2, 329.6, 440].forEach((f) => s.t(d, 'triangle', f, f, t + 0.15, 1.2, 0.1, 0.05)); } },
  victory: { ch: 'ui', dur: 2.5, make: (s, d, t) => { [261.6, 329.6, 392, 523.3, 659.3, 784].forEach((f, i) => s.t(d, 'triangle', f, f, t + i * 0.14, 1.6 - i * 0.1, 0.14)); } },
  defeat: { ch: 'ui', dur: 2.5, make: (s, d, t) => { [329.6, 293.7, 261.6, 220, 164.8].forEach((f, i) => s.t(d, 'sawtooth', f, f * 0.98, t + i * 0.3, 0.6, 0.08, 0.05)); } },
  // Oberfläche
  gold: { ch: 'ui', dur: 0.25, make: (s, d, t, r) => (s.t(d, 'sine', 1318 * r(0.98, 1.02), 1318, t, 0.08, 0.12), s.t(d, 'sine', 1760, 1760, t + 0.07, 0.15, 0.1)) },
  levelUp: { ch: 'ui', dur: 0.8, make: (s, d, t) => { [523.3, 659.3, 784, 1046.5].forEach((f, i) => s.t(d, 'triangle', f, f, t + i * 0.08, 0.4, 0.13)); } },
  buy: { ch: 'ui', dur: 0.3, make: (s, d, t) => (s.t(d, 'sine', 1046.5, 1046.5, t, 0.08, 0.1), s.t(d, 'sine', 1568, 1568, t + 0.08, 0.15, 0.1)) },
  click: { ch: 'ui', dur: 0.05, make: (s, d, t) => s.t(d, 'square', 1200, 900, t, 0.03, 0.05) },
  tick: { ch: 'ui', dur: 0.12, make: (s, d, t) => s.t(d, 'sine', 880, 880, t, 0.1, 0.15) },
  go: { ch: 'ui', dur: 0.5, make: (s, d, t) => s.t(d, 'triangle', 1318, 1318, t, 0.45, 0.18) },
  pingHere: { ch: 'ui', dur: 0.3, make: (s, d, t) => (s.t(d, 'sine', 880, 880, t, 0.1, 0.12), s.t(d, 'sine', 880, 880, t + 0.13, 0.1, 0.12)) },
  pingAttack: { ch: 'ui', dur: 0.3, make: (s, d, t) => s.t(d, 'square', 660, 990, t, 0.18, 0.08) },
  pingDanger: { ch: 'ui', dur: 0.4, make: (s, d, t) => (s.t(d, 'square', 440, 440, t, 0.15, 0.08), s.t(d, 'square', 330, 330, t + 0.17, 0.2, 0.08)) },
  pingHelp: { ch: 'ui', dur: 0.4, make: (s, d, t) => { for (let i = 0; i < 3; i++) s.t(d, 'sine', 990, 990, t + i * 0.1, 0.07, 0.1); } },
  pingOmw: { ch: 'ui', dur: 0.3, make: (s, d, t) => (s.t(d, 'sine', 523.3, 523.3, t, 0.1, 0.1), s.t(d, 'sine', 659.3, 659.3, t + 0.1, 0.15, 0.1)) },
  // Zauber
  blitz: { ch: 'effects', dur: 0.35, make: (s, d, t) => (s.t(d, 'sawtooth', 2000, 200, t, 0.25, 0.12), s.n(d, 'highpass', 3000, 1000, t, 0.2, 0.3)) },
  teleport: { ch: 'effects', dur: 1, make: (s, d, t) => s.t(d, 'sine', 200, 1600, t, 0.9, 0.15, 0.3) },
  heal: { ch: 'effects', dur: 0.8, make: (s, d, t) => { [523.3, 659.3, 784].forEach((f, i) => s.t(d, 'sine', f, f, t + i * 0.06, 0.7, 0.1)); } },
  shield: { ch: 'effects', dur: 0.6, make: (s, d, t) => (s.t(d, 'sine', 600, 900, t, 0.5, 0.12, 0.05), s.n(d, 'bandpass', 3000, 5000, t, 0.4, 0.08, 4)) },
  ghost: { ch: 'effects', dur: 0.7, make: (s, d, t) => s.n(d, 'bandpass', 600, 2400, t, 0.6, 0.2, 3, 0.2) },
  ignite: { ch: 'effects', dur: 0.6, make: (s, d, t) => (s.n(d, 'lowpass', 2000, 400, t, 0.5, 0.35, 0.7, 0.03), s.t(d, 'sawtooth', 200, 80, t, 0.3, 0.06)) },
  exhaust: { ch: 'effects', dur: 0.6, make: (s, d, t) => s.t(d, 'triangle', 300, 120, t, 0.55, 0.15, 0.05) },
  smite: { ch: 'effects', dur: 1.2, make: (s, d, t) => (s.n(d, 'lowpass', 3000, 60, t, 1.1, 0.6, 0.7, 0.005), s.t(d, 'sine', 70, 30, t, 0.8, 0.5)) },
  cleanse: { ch: 'effects', dur: 0.6, make: (s, d, t) => { [1046.5, 1318.5, 1568].forEach((f, i) => s.t(d, 'sine', f, f, t + i * 0.05, 0.5, 0.07)); } },
  crow: { ch: 'ambience', dur: 0.8, make: (s, d, t, r) => { for (let i = 0; i < 2; i++) { const f = r(700, 900); s.t(d, 'sawtooth', f, f * 0.7, t + i * 0.28, 0.2, 0.06, 0.02); s.n(d, 'bandpass', 1200, 900, t + i * 0.28, 0.2, 0.08, 5); } } },
};

/** Ein gemeinsamer Audio-Motor für das Spiel. */
export const sound = new Sound();
