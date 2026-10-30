import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/sim/types';
import { makeSim } from './helpers';

function playScript(seed: number) {
  const sim = makeSim('fernkampf', seed);
  const heroId = sim.state.heroes[0].id;
  const script: Record<number, Command> = {
    10: { heroId, type: 'moveTo', target: { x: 10, y: 20 } },
    120: { heroId, type: 'attackMove', target: { x: 30, y: 20 } },
    300: { heroId, type: 'stop' },
  };
  for (let t = 1; t <= 600; t++) sim.step(script[t] ? [script[t]] : []);
  return sim.state;
}

describe('Determinismus', () => {
  it('gleicher Seed und gleiche Befehle ergeben exakt denselben Zustand', () => {
    expect(JSON.stringify(playScript(42))).toBe(JSON.stringify(playScript(42)));
  });

  it('anderer Seed ergibt einen anderen Verlauf', () => {
    expect(JSON.stringify(playScript(1))).not.toBe(JSON.stringify(playScript(2)));
  });
});
