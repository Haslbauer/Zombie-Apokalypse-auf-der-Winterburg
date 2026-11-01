import { describe, expect, it } from 'vitest';
import { better, dailySetup, loadDaily, recordDaily, type DailyResult } from '../../src/client/daily';
import { Simulation } from '../../src/sim/game';
import { run, testData } from '../sim/helpers';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

const data = testData();
const ids = data.heroes.map((h) => h.id);

describe('Tägliche Herausforderung', () => {
  it('gleicher Tag → gleicher Aufbau; Team aus Tank, Schaden, Support; Sonntag Albtraum', () => {
    const a = dailySetup(data.bots, ids, new Date(2026, 10, 2, 9));
    const b = dailySetup(data.bots, ids, new Date(2026, 10, 2, 22));
    expect(b).toEqual(a);
    expect(a.key).toBe('2026-11-02');
    expect(a.heroes).toHaveLength(3);
    expect(a.heroes.map((id) => data.bots.heroes[id].teamRole).sort()).toEqual(['dmg', 'support', 'tank']);
    expect(dailySetup(data.bots, ids, new Date(2026, 10, 1)).level).toBe('albtraum'); // Sonntag
    expect(a.level).toBe('normal');
    // über einige Tage wechseln Team und Mutator
    const days = Array.from({ length: 14 }, (_, i) => dailySetup(data.bots, ids, new Date(2026, 10, 3 + i)));
    expect(new Set(days.map((d) => d.heroes.join())).size).toBeGreaterThan(3);
    expect(new Set(days.map((d) => d.event)).size).toBe(3);
  });

  it('Bestenliste: Sieg vor Welle vor Zeit, höchstens 5, Platz zurück', () => {
    const store = memory();
    const r = (wave: number, time: number, victory = false): DailyResult => ({ wave, time, victory, hero: 'grimm', date: '2026-11-02T10:00:00Z' });
    expect(recordDaily('d', r(5, 300), store)).toBe(1);
    expect(recordDaily('d', r(7, 500), store)).toBe(1);
    expect(recordDaily('d', r(7, 400), store)).toBe(1);
    expect(recordDaily('d', r(20, 2000, true), store)).toBe(1);
    expect(recordDaily('d', r(6, 100), store)).toBe(4);
    expect(recordDaily('d', r(1, 10), store)).toBeNull();
    expect(recordDaily('d', r(2, 10), store)).toBeNull();
    expect(loadDaily('d', store).map((x) => x.wave)).toEqual([20, 7, 7, 6, 5]);
    expect(loadDaily('anderer Tag', store)).toEqual([]);
    expect(better(r(3, 10), r(3, 20))).toBeLessThan(0);
  });

  it('Mutator: jede Welle mit dem Ereignis des Tages', () => {
    const sim = new Simulation(testData(), { seed: 1, heroes: ['rotschopf'], mutator: { event: 'regen' } });
    sim.state.wave.timer = 0.01;
    sim.step();
    expect(sim.state.wave.event).toBe('regen');
    expect(sim.state.events.some((e) => e.type === 'waveEvent')).toBe(true);
    sim.state.zombies = [];
    sim.state.wave.queue = [];
    run(sim, 20 * 3);
    sim.state.wave.timer = 0.01;
    run(sim, 2);
    expect(sim.state.wave.number).toBe(2);
    expect(sim.state.wave.event).toBe('regen');
  });
});
