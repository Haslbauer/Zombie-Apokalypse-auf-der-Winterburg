import { describe, expect, it } from 'vitest';
import { applyDamage } from '../../src/sim/combat';
import { Simulation } from '../../src/sim/game';
import { minionsOf } from '../../src/sim/minions';
import { arenaData, noWaves, placeZombie, run } from './helpers';

function setup(level = 1) {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['lotte'], startLevel: level });
  const h = sim.state.heroes[0];
  h.maxHp = h.hp = 1000;
  h.ranks = [1, 1, 1, 1];
  h.cooldowns = [0, 0, 0, 0];
  h.pos = { x: 20, y: 20 };
  const cast = (slot: number, aim: { x: number; y: number }) => sim.step([{ heroId: h.id, type: 'cast', slot, aim }]);
  return { sim, h, cast };
}

describe('Lotte und ihre Trolle', () => {
  it('Trollruf: Troll läuft zum Zombie, greift an und verschwindet nach 12 s', () => {
    const { sim, h, cast } = setup();
    const z = placeZombie(sim, 'brute', 26, 20, 5000);
    z.speed = 0;
    cast(0, { x: 22, y: 20 });
    expect(minionsOf(sim, h.id)).toHaveLength(1);
    run(sim, 60);
    expect(z.hp).toBeLessThan(5000);
    expect(h.stats!.damage).toBeGreaterThan(0); // Trollschaden zählt für Lotte
    run(sim, 12 * 20);
    expect(minionsOf(sim, h.id)).toHaveLength(0);
  });

  it('Brückentroll zieht Zombies auf sich; Zombies schlagen Trolle', () => {
    const { sim, h, cast } = setup();
    h.pos = { x: 14, y: 20 };
    cast(1, { x: 20, y: 20 });
    const bridge = minionsOf(sim, h.id)[0];
    expect(bridge.kind).toBe('bridge');
    const hp = bridge.hp;
    placeZombie(sim, 'walker', 23, 20);
    run(sim, 60);
    expect(bridge.hp).toBeLessThan(hp);
  });

  it('Wutanfall braucht Trolle; Trollfamilie ruft drei, einer riesig; Trolle wachsen mit dem Level', () => {
    const lo = setup(1);
    expect(lo.sim.state.heroes[0].cooldowns[2]).toBe(0);
    lo.cast(2, lo.h.pos);
    expect(lo.h.cooldowns[2]).toBe(0); // ohne Trolle nicht möglich
    lo.cast(3, { x: 24, y: 20 });
    const fam = minionsOf(lo.sim, lo.h.id);
    expect(fam.map((m) => m.kind).sort()).toEqual(['giant', 'troll', 'troll']);
    lo.cast(2, lo.h.pos);
    expect(fam.every((m) => (m.rageUntil ?? 0) > lo.sim.state.time)).toBe(true);
    const hi = setup(11);
    hi.cast(0, { x: 22, y: 20 });
    lo.h.cooldowns[0] = 0;
    lo.cast(0, { x: 22, y: 22 });
    // Trollruf Rang 1: 300 Leben auf Level 1, auf Level 11 um 10 × 6 % mehr
    const called = (s: typeof lo) => minionsOf(s.sim, s.h.id).find((m) => m.kind === 'troll' && m.maxHp < 500)!;
    expect(called(lo).maxHp).toBe(300);
    expect(called(hi).maxHp).toBeCloseTo(300 * 1.6, 6);
  });

  it('Beste Freunde: mit Troll in der Nähe weniger Schaden', () => {
    const { sim, h, cast } = setup();
    const alone = applyDamage(sim, h, 100);
    cast(0, { x: 21, y: 20 });
    const guarded = applyDamage(sim, h, 100);
    expect(guarded).toBeLessThan(alone * 0.85);
  });
});
