/**
 * Lage der Skillleiste (Heldenleiste unten): verschiebbar, skalierbar,
 * Deckkraft einstellbar; im Browser gespeichert.
 */
export interface BarLayout {
  /** Verschiebung gegenüber der Standardlage (unten mittig), in Pixeln. */
  dx: number;
  dy: number;
  /** Größe (0,6–1,2). */
  scale: number;
  /** Deckkraft, solange die Maus nicht darüber ist (0,3–1). */
  opacity: number;
}

export const DEFAULT_BAR: BarLayout = { dx: 0, dy: 0, scale: 0.85, opacity: 0.7 };
export const BAR_SCALE = { min: 0.6, max: 1.2 };
export const BAR_OPACITY = { min: 0.3, max: 1 };
const KEY = 'winterburg.skillbar';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function normalizeBar(raw: Partial<BarLayout> | null | undefined): BarLayout {
  const r = raw ?? {};
  return {
    dx: Math.round(num(r.dx, 0)),
    dy: Math.round(num(r.dy, 0)),
    scale: clamp(num(r.scale, DEFAULT_BAR.scale), BAR_SCALE.min, BAR_SCALE.max),
    opacity: clamp(num(r.opacity, DEFAULT_BAR.opacity), BAR_OPACITY.min, BAR_OPACITY.max),
  };
}

export function loadBar(store = storage()): BarLayout {
  try {
    return normalizeBar(JSON.parse(store?.getItem(KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_BAR };
  }
}

export function saveBar(layout: BarLayout, store = storage()): void {
  try {
    store?.setItem(KEY, JSON.stringify(layout));
  } catch {
    // ohne Speicher: gilt nur für diese Sitzung
  }
}

/**
 * Verschiebung so begrenzen, dass die Leiste im Fenster bleibt.
 * rect: Lage der Leiste ohne Verschiebung (Standardlage, bereits skaliert).
 */
export function clampOffset(dx: number, dy: number, rect: { left: number; top: number; width: number; height: number }, view: { width: number; height: number }): { dx: number; dy: number } {
  return {
    dx: Math.round(clamp(dx, -rect.left, view.width - rect.left - rect.width)),
    dy: Math.round(clamp(dy, -rect.top, view.height - rect.top - rect.height)),
  };
}
