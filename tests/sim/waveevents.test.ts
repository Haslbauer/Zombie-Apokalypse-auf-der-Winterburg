import { describe, expect, it } from 'vitest';
import { awardGold } from '../../src/sim/economy';
import { Simulation } from '../../src/sim/game';
import { moveHero } from '../../src/sim/hero';
import { eventFactor, rollWaveEvent } from '../../src/sim/waveevents';
import { spawnZombieAt } from '../../src/sim/waves';
import type { WaveEventKind } from '../../src/sim/types';
import { testData } from './helpers';

const make = (seed = 1) => new Simulation(testData(), { seed, heroes: ['rotschopf'] });

/** Welle number mit Ereignis kind laufen lassen. */
function during(sim: Simulation, kind: WaveEventKind | null, number = 6): void {
  sim.state.wave.number = number;
  sim.state.wave.phase = 'wave';
  sim.state.wave.event = kind;
}

describe('Wellen-Ereignisse', () => {
  it('vor fromWave nie, danach deterministisch und höchstens alle gap Wellen', () => {
    const cfg = testData().waves.events!;
    const roll = (seed: number) => {
      const sim = make(seed);
      const got: (WaveEventKind | null)[] = [];
      for (let n = 1; n <= 30; n++) {
        sim.state.wave.number = n;
        got.push(rollWaveEvent(sim));
      }
      return got;
    };
    const a = roll(3);
    expect(roll(3)).toEqual(a);
    expect(a.slice(0, cfg.fromWave - 1).every((k) => k === null)).toBe(true);
    const at = a.map((k, i) => (k ? i + 1 : 0)).filter(Boolean);
    expect(at.length).toBeGreaterThan(0);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(cfg.gap);
    // über viele Seeds kommen alle drei Arten vor
    const kinds = new Set<string>();
    for (let s = 1; s <= 40; s++) for (const k of roll(s)) if (k) kinds.add(k);
    expect([...kinds].sort()).toEqual(['blutmond', 'nebel', 'regen']);
  });

  it('Ansage als Ereignis, Wirkung nur während der Welle', () => {
    const sim = make();
    sim.state.wave.number = 5;
    let kind: WaveEventKind | null = null;
    for (let i = 0; i < 50 && !kind; i++) {
      sim.state.wave.lastEventWave = undefined;
      kind = rollWaveEvent(sim);
    }
    expect(kind).not.toBeNull();
    expect(sim.state.events.some((e) => e.type === 'waveEvent' && e.kind === kind)).toBe(true);
    sim.state.wave.phase = 'pause';
    expect(eventFactor(sim, 'speed')).toBe(1);
  });

  it('kein Ereignis im PvP', () => {
    const sim = make();
    sim.state.pvp = { score: [0, 0], killsToWin: 10 } as never;
    sim.state.wave.number = 10;
    for (let i = 0; i < 30; i++) expect(rollWaveEvent(sim)).toBeNull();
  });

  it('Blutmond: Gold ×1,5', () => {
    const gold = (kind: WaveEventKind | null) => {
      const sim = make();
      during(sim, kind);
      const h = sim.state.heroes[0];
      const z = spawnZombieAt(sim, sim.zombieDefs.get('walker')!, { x: 10, y: 10 });
      const before = h.gold;
      awardGold(sim, z, h);
      return h.gold - before;
    };
    expect(gold('blutmond')).toBeCloseTo(gold(null) * 1.5, 0);
  });

  it('Blutmond: mehr Zwischenbosse in der Welle', () => {
    const elites = (blood: boolean) => {
      const sim = make(5);
      const data = sim.data.waves;
      // Welle mit fälligem Zwischenboss (fromWave + 2·every ≥ events.fromWave)
      sim.state.wave.number = data.elites!.fromWave! + 2 * data.elites!.every;
      sim.state.wave.phase = 'pause';
      sim.state.wave.timer = 0.01;
      data.events!.chance = blood ? 1 : 0;
      for (const k of Object.keys(data.events!.list)) if (k !== 'blutmond') delete (data.events!.list as Record<string, unknown>)[k];
      sim.step();
      return sim.state.wave.queue.filter((e) => e.startsWith('elite:')).length;
    };
    expect(elites(true)).toBeGreaterThan(elites(false));
  });

  it('Regen: Helden und Zombies langsamer; Nebel: kleinere Aggro-Reichweite', () => {
    const sim = make();
    during(sim, 'regen');
    expect(eventFactor(sim, 'speed')).toBeCloseTo(0.85);
    expect(eventFactor(sim, 'burn')).toBeCloseTo(0.5);
    const walk = (kind: WaveEventKind | null) => {
      const s = make();
      during(s, kind);
      const h = s.state.heroes[0];
      const x = h.pos.x;
      moveHero(s, h, { x: 1, y: 0 });
      return h.pos.x - x;
    };
    expect(walk('regen')).toBeCloseTo(walk(null) * 0.85, 6);
    during(sim, 'nebel');
    expect(eventFactor(sim, 'aggro')).toBeCloseTo(0.7);
    expect(eventFactor(sim, 'gold')).toBe(1);
  });
});
