import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/sim/types';
import { input, makeSim } from './helpers';

function playScript(seed: number) {
  const sim = makeSim('fernkampf', seed);
  const script: Record<number, Command> = {
    10: input(sim, { x: -1, y: 0 }, { x: 0, y: 20 }),
    80: input(sim, { x: 1, y: 1 }, { x: 20, y: 0 }, true),
    200: input(sim, { x: 0, y: 0 }, { x: 40, y: 20 }, true),
    400: input(sim, { x: 0, y: -1 }, { x: 20, y: 40 }, false),
  };
  for (let t = 1; t <= 600; t++) sim.step(script[t] ? [script[t]] : []);
  return sim.state;
}

describe('Determinismus', () => {
  it('gleicher Seed und gleiche Eingaben ergeben exakt denselben Zustand', () => {
    expect(JSON.stringify(playScript(42))).toBe(JSON.stringify(playScript(42)));
  });

  it('anderer Seed ergibt einen anderen Verlauf', () => {
    expect(JSON.stringify(playScript(1))).not.toBe(JSON.stringify(playScript(2)));
  });
});
