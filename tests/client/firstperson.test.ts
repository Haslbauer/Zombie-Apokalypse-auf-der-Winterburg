import { describe, expect, it } from 'vitest';
import { rotateToView } from '../../src/client/input';

describe('Ego-Sicht: Laufen relativ zur Blickrichtung', () => {
  const close = (v: { x: number; y: number }, x: number, y: number) => {
    expect(v.x).toBeCloseTo(x, 6);
    expect(v.y).toBeCloseTo(y, 6);
  };

  it('Blick nach Norden: W = Norden, D = Osten (wie in der Schrägsicht)', () => {
    const north = -Math.PI / 2;
    close(rotateToView({ x: 0, y: -1 }, north), 0, -1);
    close(rotateToView({ x: 1, y: 0 }, north), 1, 0);
    close(rotateToView({ x: 0, y: 1 }, north), 0, 1);
  });

  it('Blick nach Osten: W = Osten, A = Norden, D = Süden', () => {
    close(rotateToView({ x: 0, y: -1 }, 0), 1, 0);
    close(rotateToView({ x: -1, y: 0 }, 0), 0, -1);
    close(rotateToView({ x: 1, y: 0 }, 0), 0, 1);
  });

  it('schräg bleibt die Länge erhalten', () => {
    const v = rotateToView({ x: Math.SQRT1_2, y: -Math.SQRT1_2 }, 1.1);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
  });
});
