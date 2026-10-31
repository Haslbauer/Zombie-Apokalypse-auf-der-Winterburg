import { describe, expect, it } from 'vitest';
import { waveComposition, waveScaling, waveSize, waveWeights } from '../../src/sim/waves';
import { makeSim, run, testData } from './helpers';

const cfg = testData().waves;

describe('Wellenaufbau', () => {
  it('Welle n hat mehr und stärkere Zombies als Welle n-1', () => {
    for (let n = 2; n <= 30; n++) {
      expect(waveSize(n, cfg)).toBeGreaterThan(waveSize(n - 1, cfg));
      expect(waveScaling(n, cfg).hp).toBeGreaterThan(waveScaling(n - 1, cfg).hp);
      expect(waveScaling(n, cfg).damage).toBeGreaterThan(waveScaling(n - 1, cfg).damage);
    }
  });

  it('Zusammensetzung ergibt genau die Wellengröße und folgt den Gewichten', () => {
    for (let n = 1; n <= 30; n++) {
      const comp = waveComposition(n, cfg);
      expect(Object.values(comp).reduce((a, b) => a + b, 0)).toBe(waveSize(n, cfg));
    }
    for (const n of [1, 2, 3, 4, 10]) {
      const comp = waveComposition(n, cfg);
      const weights = waveWeights(n, cfg);
      const sum = Object.values(weights).reduce((x, y) => x + y, 0);
      for (const [id, w] of Object.entries(weights)) {
        expect(Math.abs((comp[id] ?? 0) - (waveSize(n, cfg) * w) / sum)).toBeLessThan(1);
      }
    }
    // Ab Welle 3 kommen Kriecher, ab Welle 4 Brutes dazu
    expect(waveComposition(2, cfg).kriecher).toBeUndefined();
    expect(waveComposition(3, cfg).kriecher).toBeGreaterThan(0);
    expect(waveComposition(4, cfg).brute).toBeGreaterThan(0);
  });

  it('Ablauf: Pause, Welle spawnt komplett, nach dem Leeren folgt die nächste Pause', () => {
    const sim = makeSim('gaertnerin');
    expect(sim.state.wave.phase).toBe('pause');
    run(sim, cfg.firstPauseDuration * 20 + 1);
    expect(sim.state.wave.phase).toBe('wave');
    run(sim, Math.ceil(cfg.spawnInterval * 20 * (waveSize(1, cfg) + 1)) + 1);
    expect(sim.state.wave.queue).toHaveLength(0);
    // Dazu ein kleiner Hornissenschwarm mit 2–3 Tieren (ab Welle 1)
    const spawned = sim.state.zombies.filter((z) => !z.neutral).length + sim.state.kills;
    expect(spawned).toBeGreaterThanOrEqual(waveSize(1, cfg) + 2);
    expect(spawned).toBeLessThanOrEqual(waveSize(1, cfg) + 3);
    // Ziele nur Herz oder Bienenstock.
    for (const z of sim.state.zombies.filter((x) => !x.neutral)) expect(['heart', 'hive']).toContain(z.objectiveId);

    // Alle Zombies entfernen: Die Welle gilt als geschafft.
    sim.state.zombies = [];
    sim.step();
    expect(sim.state.events).toContainEqual({ type: 'waveCleared', number: 1 });
    expect(sim.state.wave).toMatchObject({ number: 2, phase: 'pause' });
  });

  it('„Welle starten“ beendet die Pause sofort', () => {
    const sim = makeSim('rotschopf');
    const h = sim.state.heroes[0];
    expect(sim.state.wave.timer).toBe(cfg.firstPauseDuration);
    sim.step([{ heroId: h.id, type: 'startWave' }]);
    sim.step();
    expect(sim.state.wave.phase).toBe('wave');
  });
});

describe('Sieg', () => {
  it('wer die letzte Welle übersteht, gewinnt', async () => {
    const { Simulation } = await import('../../src/sim/game');
    const { testData } = await import('./helpers');
    const sim = new Simulation(testData(), { seed: 1, heroes: ['rotschopf'] });
    const last = sim.data.waves.victoryWave!;
    expect(last).toBe(20);
    Object.assign(sim.state.wave, { number: last, phase: 'wave', queue: [] });
    sim.state.zombies = sim.state.zombies.filter((z) => z.neutral);
    sim.step();
    expect(sim.state.gameOver).toBe(true);
    expect(sim.state.victory).toBe(true);
  });
});
