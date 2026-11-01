import { describe, expect, it } from 'vitest';
import { stickVector } from '../../src/client/touch';

describe('Touch-Sticks', () => {
  it('Totzone, Länge höchstens 1, Richtung bleibt', () => {
    expect(stickVector(5, 0, 56)).toEqual({ x: 0, y: 0 });
    const half = stickVector(28, 0, 56);
    expect(half.x).toBeCloseTo(0.5);
    const far = stickVector(0, -200, 56);
    expect(far.y).toBeCloseTo(-1);
    const diag = stickVector(100, 100, 56);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1);
    expect(diag.x).toBeCloseTo(diag.y);
  });
});
