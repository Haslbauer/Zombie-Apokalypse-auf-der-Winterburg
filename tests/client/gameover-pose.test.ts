import { describe, expect, it } from 'vitest';
import { heroLost } from '../../src/client/renderer';

describe('Pose nach Spielende', () => {
  it('Koop: bei Niederlage liegen alle, bei Sieg niemand, im Spiel niemand', () => {
    expect(heroLost({ gameOver: true, victory: undefined, pvp: undefined }, {})).toBe(true);
    expect(heroLost({ gameOver: true, victory: true, pvp: undefined }, {})).toBe(false);
    expect(heroLost({ gameOver: false, victory: undefined, pvp: undefined }, {})).toBe(false);
  });

  it('PvP: nur das unterlegene Team liegt', () => {
    const pvp = { teams: [0, 1], score: [10, 3] as [number, number], killsToWin: 10, winner: 0 };
    expect(heroLost({ gameOver: true, victory: true, pvp }, { team: 1 })).toBe(true);
    expect(heroLost({ gameOver: true, victory: true, pvp }, { team: 0 })).toBe(false);
  });
});
