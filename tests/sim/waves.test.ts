import { describe, expect, it } from 'vitest';
import { waveComposition, waveScaling, waveSize } from '../../src/sim/waves';
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
    expect(waveComposition(1, cfg)).toEqual({ walker: 6 });
    // Welle 2: 9 Zombies im Verhältnis 4:1
    expect(waveComposition(2, cfg)).toEqual({ walker: 7, runner: 2 });
    // Ab Welle 4 kommen Brutes dazu (15 Zombies, 4:2:1)
    expect(waveComposition(4, cfg)).toEqual({ walker: 9, runner: 4, brute: 2 });
  });

  it('Ablauf: Pause, Welle spawnt komplett, nach dem Leeren folgt die nächste Pause', () => {
    const sim = makeSim('fernkampf');
    expect(sim.state.wave.phase).toBe('pause');
    run(sim, cfg.firstPauseDuration * 20 + 1);
    expect(sim.state.wave.phase).toBe('wave');
    run(sim, Math.ceil(cfg.spawnInterval * 20 * waveSize(1, cfg)) + 1);
    expect(sim.state.wave.queue).toHaveLength(0);
    expect(sim.state.zombies.length + sim.state.kills).toBe(waveSize(1, cfg));

    // Alle Zombies entfernen: Die Welle gilt als geschafft.
    sim.state.zombies = [];
    sim.step();
    expect(sim.state.events).toContainEqual({ type: 'waveCleared', number: 1 });
    expect(sim.state.wave).toMatchObject({ number: 2, phase: 'pause' });
  });
});
