import { afterEach, describe, expect, it } from 'vitest';
import { channelGain, DEFAULT_AUDIO, loadAudioSettings, saveAudioSettings, Sound, SOUNDS, VoiceLimiter } from '../../src/client/audio';

/** Speicher-Attrappe für localStorage. */
function memory(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe('Ton-Einstellungen', () => {
  it('ohne gespeicherte Werte gilt die Vorgabe', () => {
    expect(loadAudioSettings(memory())).toEqual(DEFAULT_AUDIO);
    expect(loadAudioSettings(null)).toEqual(DEFAULT_AUDIO);
  });

  it('speichert und lädt, begrenzt auf 0..1, kaputte Werte → Vorgabe', () => {
    const store = memory();
    saveAudioSettings({ ...DEFAULT_AUDIO, music: 0.2, muted: true }, store);
    expect(loadAudioSettings(store)).toMatchObject({ music: 0.2, muted: true });
    const bad = memory({ 'winterburg.audio': JSON.stringify({ master: 5, effects: -1, music: 'laut', ui: null }) });
    expect(loadAudioSettings(bad)).toMatchObject({ master: 1, effects: 0, music: DEFAULT_AUDIO.music, ui: DEFAULT_AUDIO.ui, muted: false });
    expect(loadAudioSettings(memory({ 'winterburg.audio': '{kaputt' }))).toEqual(DEFAULT_AUDIO);
  });

  it('Kanal-Lautstärke = Gesamt × Kanal, stumm = 0', () => {
    const s = { ...DEFAULT_AUDIO, master: 0.5, effects: 0.8 };
    expect(channelGain(s, 'effects')).toBeCloseTo(0.4);
    expect(channelGain({ ...s, muted: true }, 'effects')).toBe(0);
  });
});

describe('Begrenzung gleichzeitiger Geräusche', () => {
  it('höchstens perName gleiche und max insgesamt, Mindestabstand', () => {
    const v = new VoiceLimiter(5, 2, 0.05);
    expect(v.allow('hit', 0, 1)).toBe(true);
    expect(v.allow('hit', 0.01, 1)).toBe(false); // zu kurz nach dem letzten
    expect(v.allow('hit', 0.1, 1)).toBe(true);
    expect(v.allow('hit', 0.2, 1)).toBe(false); // schon 2 aktiv
    for (let i = 0; i < 3; i++) expect(v.allow(`s${i}`, 0.3, 1)).toBe(true);
    expect(v.allow('neu', 0.3, 1)).toBe(false); // insgesamt 5
    // nach Ablauf wieder frei
    expect(v.allow('hit', 2, 1)).toBe(true);
  });
});

// ---------- Attrappe des Web-Audio-APIs ----------
let created = 0;
/** Gestartete Klangquellen ohne Ende (Dauerquellen). */
let endless = 0;
class Param {
  value = 0;
  setValueAtTime(v: number) {
    if (!Number.isFinite(v)) throw new Error(`ungültiger Wert ${v}`);
    this.value = v;
  }
  exponentialRampToValueAtTime(v: number) {
    if (!(v > 0) || !Number.isFinite(v)) throw new Error(`exponentielle Rampe braucht > 0, nicht ${v}`);
  }
  linearRampToValueAtTime() {}
  setTargetAtTime(v: number) {
    if (!Number.isFinite(v)) throw new Error(`ungültiger Wert ${v}`);
  }
}
class Node {
  constructor() {
    created++;
  }
  connect<T>(n: T): T {
    return n;
  }
  disconnect() {}
}
class Source extends Node {
  private stopped = false;
  start() {
    endless++;
  }
  stop() {
    if (!this.stopped) endless--;
    this.stopped = true;
  }
}
class Osc extends Source {
  type = 'sine';
  frequency = new Param();
  detune = new Param();
}
class Src extends Source {
  buffer: unknown = null;
  loop = false;
  playbackRate = new Param();
}
class FakeContext {
  currentTime = 1;
  sampleRate = 8000;
  state = 'running';
  destination = new Node();
  createGain = () => Object.assign(new Node(), { gain: new Param() });
  createOscillator = () => new Osc();
  createBufferSource = () => new Src();
  createBiquadFilter = () => Object.assign(new Node(), { type: 'lowpass', frequency: new Param(), Q: new Param() });
  createStereoPanner = () => Object.assign(new Node(), { pan: new Param() });
  createDynamicsCompressor = () => Object.assign(new Node(), { threshold: new Param(), ratio: new Param() });
  createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
  resume = async () => {};
}

describe('Audio-Motor', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('ohne Freischaltung passiert nichts (kein Fehler)', () => {
    const s = new Sound();
    expect(() => s.play('hit', { x: 0, y: 0 })).not.toThrow();
    expect(() => s.update(0.016, { listener: { x: 0, y: 0 }, zombies: [], wave: false, boss: false, beesAngry: false })).not.toThrow();
  });

  it('jedes Klangrezept läuft fehlerfrei, Umgebung und Musik auch', () => {
    (globalThis as { window?: unknown }).window = { AudioContext: FakeContext };
    const s = new Sound();
    s.setWorld([{ x: 2, y: 0 }], { x: -3, y: 1 });
    s.unlock();
    const ctx = (s as unknown as { ctx: FakeContext }).ctx;
    for (const name of Object.keys(SOUNDS)) {
      ctx.currentTime += 1; // Begrenzung umgehen
      const before = created;
      s.play(name, { x: 1, y: 1 });
      expect(created, name).toBeGreaterThan(before);
    }
    for (let i = 0; i < 200; i++) {
      ctx.currentTime += 0.05;
      s.update(0.05, { listener: { x: 0, y: 0 }, zombies: [{ x: 3, y: 3 }], wave: i > 50, boss: i > 120, beesAngry: i % 2 === 0 });
    }
  });

  it('fast still: keine Dauerquellen, in der Pause ohne Kampf kaum Geräusche, Musik nur in der Welle', () => {
    (globalThis as { window?: unknown }).window = { AudioContext: FakeContext };
    endless = 0;
    const s = new Sound();
    s.setWorld([{ x: 50, y: 50 }], { x: -50, y: -50 }); // Feuer und Stock weit weg
    s.unlock();
    const ctx = (s as unknown as { ctx: FakeContext }).ctx;
    expect(endless).toBe(0);
    const before = created;
    const frame = { listener: { x: 0, y: 0 }, zombies: [], wave: false, boss: false, beesAngry: false };
    for (let i = 0; i < 600; i++) {
      ctx.currentTime += 1 / 60;
      s.update(1 / 60, frame);
    }
    // 10 s Pause: höchstens eine Windböe (wenige Knoten)
    expect(created - before).toBeLessThan(15);
    expect(endless).toBe(0);
    // In der Welle setzt die Musik ein
    const inWave = created;
    for (let i = 0; i < 120; i++) {
      ctx.currentTime += 1 / 60;
      s.update(1 / 60, { ...frame, wave: true });
    }
    expect(created).toBeGreaterThan(inWave);
    expect(endless).toBe(0);
  });

  it('weit entfernte Geräusche und stumm erzeugen nichts', () => {
    (globalThis as { window?: unknown }).window = { AudioContext: FakeContext };
    const s = new Sound();
    s.unlock();
    s.update(0.01, { listener: { x: 0, y: 0 }, zombies: [], wave: false, boss: false, beesAngry: false });
    let before = created;
    s.play('hit', { x: 200, y: 0 });
    expect(created).toBe(before);
    s.settings.muted = true;
    before = created;
    s.play('waveStart');
    expect(created).toBe(before);
  });
});

describe('Klänge je Held', () => {
  it('jeder Held hat einen eigenen, vorhandenen Angriffsklang', async () => {
    const { HERO_ATTACK_SOUND } = await import('../../src/client/audio');
    const { testData } = await import('../sim/helpers');
    const heroes = testData().heroes.map((h) => h.id);
    for (const id of heroes) expect(SOUNDS[HERO_ATTACK_SOUND[id]], id).toBeDefined();
    expect(new Set(heroes.map((id) => HERO_ATTACK_SOUND[id])).size).toBe(heroes.length);
  });
});
