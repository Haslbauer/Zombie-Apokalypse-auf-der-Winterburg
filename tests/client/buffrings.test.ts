import { describe, expect, it } from 'vitest';
import { buffRings, coinCount, MAX_RINGS } from '../../src/client/buffrings';
import type { Buff } from '../../src/sim/types';

const buff = (kind: Buff['kind'], value: number, until: number, source = 'x'): Buff => ({ kind, value, until, source });

describe('Buff-Ringe', () => {
  it('gleiche Arten zusammengefasst, Team-Buff erkannt, abgelaufene weg', () => {
    const rings = buffRings(
      {
        buffs: [buff('haste', 0.3, 20, 'spell-geist'), buff('haste', 0.15, 80, 'team-riesenspinne'), buff('damageMult', 1.2, 5), buff('attackSpeed', 0.2, 9)],
        plague: null,
      },
      10,
    );
    expect(rings.map((r) => r.key)).toEqual(['speed']);
    const speed = rings.find((r) => r.key === 'speed')!;
    expect(speed.team).toBe(true);
    expect(speed.left).toBe(70);
    expect(rings.some((r) => r.key === 'damage')).toBe(false); // abgelaufen
    expect(rings[0].key).toBe('speed'); // Team-Buff zuerst
  });

  it('Seuche als Schwächung; Verlangsamung und Betäubung zeigen keinen Ring; höchstens 4', () => {
    const rings = buffRings(
      {
        buffs: [
          buff('haste', -0.4, 50),
          buff('stunned', 1, 50),
          buff('damageMult', 1.2, 50),
          buff('attackSpeed', 0.2, 50),
          buff('heal', 10, 50),
          buff('shield', 100, 50),
          buff('haste', 0.2, 50),
        ],
        plague: { stacks: 3, until: 30 },
      },
      10,
    );
    expect(rings).toHaveLength(MAX_RINGS);
    expect(rings[0]).toMatchObject({ key: 'plague', debuff: true });
  });

  it('Münzen je Betrag: 1 bis 8', () => {
    expect(coinCount(3)).toBe(1);
    expect(coinCount(16)).toBe(2);
    expect(coinCount(250)).toBe(8);
    expect(coinCount(10000)).toBe(8);
  });
});
