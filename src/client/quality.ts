/**
 * Grafikqualität: Hoch, Mittel, Niedrig oder Automatisch. Automatisch misst
 * die Bildrate und stuft herunter, wenn sie dauerhaft unter 40 fps liegt
 * (und wieder hoch, wenn lange über 57 fps). Die Wahl bleibt im Browser
 * gespeichert.
 */
export type QualityLevel = 'hoch' | 'mittel' | 'niedrig';
export type QualitySetting = QualityLevel | 'auto';

export const QUALITY_LABELS: Record<QualitySetting, string> = {
  auto: 'Automatisch',
  hoch: 'Hoch',
  mittel: 'Mittel',
  niedrig: 'Niedrig',
};

const ORDER: QualityLevel[] = ['niedrig', 'mittel', 'hoch'];
const STORAGE = 'winterburg.graphics';
const PERF_STORAGE = 'winterburg.perf';
/** Messfenster für die Bildrate (s). */
const WINDOW = 3;

export class Quality {
  setting: QualitySetting = 'auto';
  level: QualityLevel = 'hoch';
  /** Leistungsanzeige (fps, Ping) eingeschaltet? */
  showPerf = false;
  /** Gemessene Bildrate (Mittel über WINDOW Sekunden). */
  fps = 60;
  private frames = 0;
  private time = 0;
  private goodFor = 0;
  private readonly listeners: ((level: QualityLevel) => void)[] = [];

  constructor() {
    try {
      const saved = localStorage.getItem(STORAGE) as QualitySetting | null;
      if (saved && saved in QUALITY_LABELS) this.setting = saved;
      this.showPerf = localStorage.getItem(PERF_STORAGE) === '1';
    } catch {
      // ohne Speicher: Standard
    }
    this.level = this.setting === 'auto' ? 'hoch' : this.setting;
  }

  onChange(fn: (level: QualityLevel) => void): void {
    this.listeners.push(fn);
    fn(this.level);
  }

  set(setting: QualitySetting): void {
    this.setting = setting;
    this.goodFor = 0;
    this.apply(setting === 'auto' ? 'hoch' : setting);
    try {
      localStorage.setItem(STORAGE, setting);
    } catch {
      // egal
    }
  }

  setShowPerf(on: boolean): void {
    this.showPerf = on;
    try {
      localStorage.setItem(PERF_STORAGE, on ? '1' : '0');
    } catch {
      // egal
    }
  }

  /** Jedes Bild aufrufen. */
  frame(dt: number): void {
    this.frames++;
    this.time += dt;
    if (this.time < WINDOW) return;
    this.fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (this.setting !== 'auto') return;
    const i = ORDER.indexOf(this.level);
    if (this.fps < 40 && i > 0) {
      this.goodFor = 0;
      this.apply(ORDER[i - 1]);
    } else if (this.fps > 57 && i < ORDER.length - 1) {
      // erst nach 60 s guter Bildrate wieder hochstufen (kein ständiges Hin und Her)
      this.goodFor += WINDOW;
      if (this.goodFor >= 60) {
        this.goodFor = 0;
        this.apply(ORDER[i + 1]);
      }
    } else this.goodFor = 0;
  }

  private apply(level: QualityLevel): void {
    if (level === this.level) return;
    this.level = level;
    for (const fn of this.listeners) fn(level);
  }
}
