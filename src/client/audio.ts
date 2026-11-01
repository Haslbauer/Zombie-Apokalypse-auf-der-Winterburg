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

export const DEFAULT_AUDIO: AudioSettings = { master: 0.8, effects: 0.9, ambience: 0.4, music: 0.3, ui: 0.8, muted: false };
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
  // Umgebung: keine Dauerquellen, nur gelegentliche leise Einzelgeräusche
  private fires: Vec[] = [];
  private hive: Vec | null = null;
  private nextMoan = 2;
  private nextCrow = 25;
  private nextGust = 10;
  private nextCrackle = 0;
  private nextBuzz = 0;
  // Musik: weiche Akkorde nur in Wellen, sanft ein- und ausgeblendet
  private musicGain: GainNode | null = null;
  private musicNext = 0;
  private musicStep = 0;
  private musicOn = false;

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
    // Musik-Strang: Tiefpass gegen Schärfe, eigene Lautstärke zum Ein-/Ausblenden
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(lp).connect(this.buses.get('music')!);
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
    const near = (p: Vec) => Math.hypot(p.x - this.listener.x, p.y - this.listener.y);
    // Feuer: nur leises Knacken, nur ganz nah
    this.nextCrackle -= dt;
    if (this.nextCrackle <= 0) {
      this.nextCrackle = this.r(0.5, 1.2);
      const fire = this.fires.find((f) => near(f) < 6);
      if (fire) this.play('crackle', fire, 0.6);
    }
    // Bienen: kurzes weiches Summen nahe dem Stock, wütend häufiger und lauter
    this.nextBuzz -= dt;
    if (this.nextBuzz <= 0) {
      this.nextBuzz = frame.beesAngry ? this.r(2, 4) : this.r(4, 8);
      if (this.hive && near(this.hive) < 6) this.play(frame.beesAngry ? 'buzzAngry' : 'buzz', this.hive);
    }
    // Windböe ab und zu
    this.nextGust -= dt;
    if (this.nextGust <= 0) {
      this.nextGust = this.r(20, 45);
      this.play('gust');
    }
    // Stöhnen naher Zombies: selten
    this.nextMoan -= dt;
    if (this.nextMoan <= 0 && frame.zombies.length > 0) {
      this.nextMoan = this.r(2.5, 5);
      this.play('moan', frame.zombies[Math.floor(Math.random() * frame.zombies.length)], 0.7);
    }
    // Krähe selten
    this.nextCrow -= dt;
    if (this.nextCrow <= 0) {
      this.nextCrow = this.r(30, 60);
      this.play('crow', { x: this.listener.x + this.r(-12, 12), y: this.listener.y + this.r(-12, 12) }, 0.6);
    }
    this.updateMusic(frame);
  }

  /**
   * Musik: nur in Wellen leise, weiche Akkorde (Am – F – Dm – E), lang ein- und
   * ausgeblendet, keine Trommeln; beim Boss kommt ein höherer Ton dazu. In der
   * Pause ist Stille.
   */
  private updateMusic(frame: AudioFrame): void {
    const ctx = this.ctx!;
    const gain = this.musicGain;
    if (!gain) return;
    const t = ctx.currentTime;
    if (frame.wave !== this.musicOn) {
      this.musicOn = frame.wave;
      gain.gain.setTargetAtTime(frame.wave ? 1 : 0, t, frame.wave ? 1.5 : 1.3);
      if (frame.wave) this.musicNext = Math.max(this.musicNext, t + 0.1);
    }
    if (!this.musicOn) return;
    const bar = 6;
    while (this.musicNext < t + 0.2) {
      if (this.musicNext < t) this.musicNext = t + 0.05;
      const chords = [
        [110, 220, 261.6, 329.6],
        [87.3, 174.6, 220, 261.6],
        [73.4, 146.8, 174.6, 220],
        [82.4, 164.8, 207.7, 246.9],
      ];
      const chord = chords[this.musicStep++ % chords.length];
      chord.forEach((f, i) => this.tone(gain, i === 0 ? 'sine' : 'triangle', f, f, this.musicNext, bar + 1.5, i === 0 ? 0.05 : 0.022, 2));
      if (frame.boss) this.tone(gain, 'sine', chord[3] * 2, chord[3] * 2, this.musicNext + bar / 2, bar / 2 + 1, 0.012, 1);
      this.musicNext += bar;
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
  // Eigene Angriffsklänge je Held (siehe HERO_ATTACK_SOUND)
  hammer: { ch: 'effects', dur: 0.4, make: (s, d, t, r) => (s.t(d, 'sine', r(130, 150), 45, t + 0.1, 0.22, 0.55), s.n(d, 'lowpass', 1200, 200, t + 0.1, 0.15, 0.4), s.t(d, 'triangle', r(780, 840), 760, t + 0.1, 0.25, 0.05)) },
  growl: { ch: 'effects', dur: 0.4, make: (s, d, t, r) => (s.t(d, 'sawtooth', r(95, 110), 70, t, 0.3, 0.14, 0.04), s.n(d, 'bandpass', 420, 300, t, 0.3, 0.22, 4, 0.04), s.n(d, 'highpass', 2500, 4000, t + 0.28, 0.05, 0.25)) },
  slingStone: { ch: 'effects', dur: 0.3, make: (s, d, t, r) => (s.t(d, 'triangle', r(480, 540), 180, t, 0.12, 0.35), s.n(d, 'highpass', 2000, 3000, t, 0.03, 0.3)) },
  ballPlop: { ch: 'effects', dur: 0.15, make: (s, d, t, r) => (s.t(d, 'sine', r(380, 420), 170, t, 0.09, 0.55), s.n(d, 'lowpass', 900, 300, t, 0.04, 0.25)) },
  chain: { ch: 'effects', dur: 0.45, make: (s, d, t, r) => { for (let i = 0; i < 7; i++) s.t(d, 'square', r(2400, 3000) - i * 120, 1500, t + i * 0.04, 0.035, 0.06); s.n(d, 'bandpass', 4000, 2500, t, 0.3, 0.1, 3); } },
  bell: { ch: 'effects', dur: 0.9, make: (s, d, t, r) => { const f = r(1500, 1640); s.t(d, 'sine', f, f, t, 0.8, 0.1, 0.005); s.t(d, 'sine', f * 2.4, f * 2.4, t, 0.4, 0.04, 0.005); } },
  buzzShot: { ch: 'effects', dur: 0.35, make: (s, d, t, r) => (s.t(d, 'sawtooth', r(225, 240), 260, t, 0.3, 0.05, 0.03), s.t(d, 'sawtooth', r(232, 246), 268, t, 0.3, 0.05, 0.03)) },
  goldClink: { ch: 'effects', dur: 0.3, make: (s, d, t, r) => (s.t(d, 'sine', r(2550, 2700), 2600, t, 0.12, 0.1), s.t(d, 'sine', r(3100, 3200), 3150, t + 0.05, 0.18, 0.08), s.n(d, 'highpass', 5000, 7000, t, 0.03, 0.08)) },
  slingFlick: { ch: 'effects', dur: 0.25, make: (s, d, t, r) => (s.n(d, 'highpass', 1500, 4000, t, 0.12, 0.3, 1, 0.02), s.t(d, 'square', r(900, 1100), 600, t + 0.1, 0.03, 0.06)) },
  bigBell: { ch: 'effects', dur: 1.2, make: (s, d, t, r) => { const f = r(392, 420); s.t(d, 'sine', f, f, t, 1.1, 0.14, 0.004); s.t(d, 'sine', f * 2.76, f * 2.76, t, 0.5, 0.05, 0.004); s.t(d, 'triangle', f / 2, f / 2, t, 0.9, 0.05, 0.01); } },
  axeChop: { ch: 'effects', dur: 0.4, make: (s, d, t, r) => (s.n(d, 'highpass', 600, 2500, t, 0.12, 0.3, 0.7, 0.03), s.t(d, 'square', r(160, 190), 70, t + 0.12, 0.08, 0.2), s.n(d, 'bandpass', 900, 500, t + 0.12, 0.18, 0.3, 2)) },
  sweepSwish: { ch: 'effects', dur: 0.35, make: (s, d, t, r) => (s.n(d, 'bandpass', r(1800, 2200), 700, t, 0.28, 0.35, 1.2, 0.04), s.t(d, 'sine', r(150, 170), 90, t + 0.05, 0.1, 0.15)) },
  bubble: { ch: 'effects', dur: 0.6, make: (s, d, t, r) => { for (let i = 0; i < 3; i++) s.t(d, 'sine', r(280, 380), r(800, 1000), t + i * 0.07, 0.07, 0.12); s.t(d, 'triangle', 220, 210, t + 0.05, 0.45, 0.08, 0.005); s.t(d, 'triangle', 331, 325, t + 0.05, 0.35, 0.04, 0.005); } },
  // Zombies
  moan: { ch: 'effects', dur: 1.4, make: (s, d, t, r) => { const f = r(80, 120); s.t(d, 'triangle', f, f * r(0.75, 0.9), t, r(0.9, 1.3), 0.06, 0.35); s.n(d, 'bandpass', r(350, 550), r(250, 350), t, 1, 0.025, 5, 0.35); } },
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
  // Umgebung (gelegentlich, leise)
  gust: { ch: 'ambience', dur: 5, make: (s, d, t, r) => s.n(d, 'lowpass', r(350, 500), r(250, 400), t, r(3.5, 5), 0.06, 0.5, 1.8) },
  crackle: { ch: 'ambience', dur: 0.1, make: (s, d, t, r) => s.n(d, 'bandpass', r(1800, 3000), 1500, t, r(0.02, 0.05), 0.12, 1.5) },
  buzz: { ch: 'ambience', dur: 1.6, make: (s, d, t, r) => s.t(d, 'sine', r(210, 240), r(200, 230), t, r(1.1, 1.6), 0.03, 0.4) },
  buzzAngry: { ch: 'ambience', dur: 1.4, make: (s, d, t, r) => (s.t(d, 'sine', r(260, 300), r(250, 290), t, r(1, 1.4), 0.05, 0.2), s.t(d, 'triangle', r(520, 560), 500, t, 0.9, 0.012, 0.2)) },
  crow: { ch: 'ambience', dur: 0.8, make: (s, d, t, r) => { for (let i = 0; i < 2; i++) { const f = r(700, 900); s.t(d, 'sawtooth', f, f * 0.7, t + i * 0.28, 0.2, 0.06, 0.02); s.n(d, 'bandpass', 1200, 900, t + i * 0.28, 0.2, 0.08, 5); } } },
};

/** Angriffsklang je Held (Nahkampf-Hieb bzw. Schuss); fehlt einer, gilt der allgemeine. */
export const HERO_ATTACK_SOUND: Record<string, string> = {
  rotschopf: 'hammer',
  grimm: 'growl',
  gaertnerin: 'slingStone',
  libero: 'ballPlop',
  pirat: 'chain',
  schlaeferin: 'bell',
  imker: 'buzzShot',
  goldschmied: 'goldClink',
  lotte: 'slingFlick',
  taucher: 'bubble',
  gloecknerin: 'bigBell',
  foerster: 'axeChop',
  schornsteinfeger: 'sweepSwish',
};

/** Ein gemeinsamer Audio-Motor für das Spiel. */
export const sound = new Sound();
