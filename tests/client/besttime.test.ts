import { describe, expect, it } from 'vitest';
import { formatClock, loadBestTime, recordVictory } from '../../src/client/besttime';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('Speedrun-Bestzeit', () => {
  it('erster Sieg ist Bestzeit, langsamer nicht, schneller schon', () => {
    const store = memory();
    expect(loadBestTime(store)).toBeNull();
    expect(recordVictory(1500, ['rotschopf'], store).isNew).toBe(true);
    const slower = recordVictory(1600, ['grimm'], store);
    expect(slower.isNew).toBe(false);
    expect(slower.previous?.time).toBe(1500);
    expect(recordVictory(1400.5, ['grimm'], store).isNew).toBe(true);
    expect(loadBestTime(store)).toMatchObject({ time: 1400.5, heroes: ['grimm'] });
  });

  it('kaputte Werte werden ignoriert', () => {
    const store = memory();
    store.setItem('winterburg.bestzeit', '{"time":"schnell"}');
    expect(loadBestTime(store)).toBeNull();
  });

  it('Uhr-Format', () => {
    expect(formatClock(0)).toBe('0:00,0');
    expect(formatClock(83.47)).toBe('1:23,4');
    expect(formatClock(3725.9)).toBe('1:02:05,9');
  });
});
