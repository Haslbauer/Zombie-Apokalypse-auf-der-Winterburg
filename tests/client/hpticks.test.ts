import { describe, expect, it } from 'vitest';
import { HitMerger, tickMarks } from '../../src/client/hpticks';

describe('Lebensbalken-Striche', () => {
  it('je 100 Leben ein Strich, je 1000 ein dicker', () => {
    expect(tickMarks(80)).toEqual([]);
    const t = tickMarks(1250);
    expect(t).toHaveLength(12);
    expect(t.filter((m) => m.major)).toHaveLength(1);
    expect(t[9]).toEqual({ at: 1000 / 1250, major: true });
  });
  it('sehr viel Leben: höchstens 60 dünne Striche', () => {
    expect(tickMarks(20000).length).toBeLessThanOrEqual(60);
  });
});

describe('Schadenszahlen zusammenfassen', () => {
  it('Treffer innerhalb des Fensters ergeben eine Zahl je Ziel', () => {
    const m = new HitMerger(0.15);
    m.add(1, 10, { x: 0, y: 0 }, 0);
    m.add(1, 5, { x: 1, y: 0 }, 0.05, { bonus: true });
    m.add(2, 7, { x: 3, y: 0 }, 0.1);
    expect(m.flush(0.1)).toEqual([]);
    const out = m.flush(0.2);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ sum: 15, bonus: true, pos: { x: 1, y: 0 } });
    expect(m.flush(0.3)).toHaveLength(1);
  });
});
