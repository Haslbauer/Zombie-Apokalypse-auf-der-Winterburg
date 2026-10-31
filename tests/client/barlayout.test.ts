import { describe, expect, it } from 'vitest';
import { clampOffset, DEFAULT_BAR, loadBar, normalizeBar, saveBar } from '../../src/client/barlayout';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('Skillleiste: Lage, Größe, Deckkraft', () => {
  it('Vorgabe, Speichern und Laden, Grenzen', () => {
    const store = memory();
    expect(loadBar(store)).toEqual(DEFAULT_BAR);
    saveBar({ dx: 40, dy: -120, scale: 0.7, opacity: 0.5 }, store);
    expect(loadBar(store)).toEqual({ dx: 40, dy: -120, scale: 0.7, opacity: 0.5 });
    expect(normalizeBar({ scale: 5, opacity: 0, dx: Number.NaN })).toEqual({ dx: 0, dy: 0, scale: 1.2, opacity: 0.3 });
  });

  it('bleibt im Fenster', () => {
    const rect = { left: 300, top: 500, width: 400, height: 150 };
    const view = { width: 1000, height: 700 };
    expect(clampOffset(-1000, -1000, rect, view)).toEqual({ dx: -300, dy: -500 });
    expect(clampOffset(1000, 1000, rect, view)).toEqual({ dx: 300, dy: 50 });
    expect(clampOffset(20, -30, rect, view)).toEqual({ dx: 20, dy: -30 });
  });
});
