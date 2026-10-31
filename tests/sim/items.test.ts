import { describe, expect, it } from 'vitest';
import { applyDamage } from '../../src/sim/combat';
import { itemStats } from '../../src/sim/items';
import { refreshMaxHp } from '../../src/sim/items';
import { heroSim, run } from './helpers';

function equip(h: { inventory: (string | null)[] }, ...ids: string[]) {
  ids.forEach((id, i) => (h.inventory[i] = id));
}

describe('Items', () => {
  it('Schadenswaffe der passenden Klasse wirkt voll, sonst halb', () => {
    const melee = heroSim('rotschopf');
    equip(melee.h, 'axt');
    expect(itemStats(melee.sim, melee.h).damage).toBeCloseTo(0.3, 6);
    const z = melee.zombie(melee.h.pos.x + 1.5, melee.h.pos.y);
    melee.attack(z.pos);
    expect(1000 - z.hp).toBeCloseTo(melee.sim.heroDefs.get('rotschopf')!.attack.damage * 1.3, 6);

    const ranged = heroSim('gaertnerin');
    equip(ranged.h, 'axt');
    expect(itemStats(ranged.sim, ranged.h).damage).toBeCloseTo(0.15, 6);
  });

  it('Angriffstempo: Armbrust lässt öfter schießen', () => {
    const count = (withItem: boolean) => {
      const { sim, h, zombie, attack } = heroSim('gaertnerin');
      if (withItem) equip(h, 'armbrust');
      const z = zombie(h.pos.x + 4, h.pos.y, 'brute', 1e6);
      let shots = 0;
      for (let i = 0; i < 400; i++) {
        attack(z.pos);
        shots += sim.state.events.filter((e) => e.type === 'shot').length;
      }
      return shots;
    };
    // +40 % Angriffstempo; durch das Tick-Raster (0,05 s) etwas weniger als rechnerisch.
    expect(count(true)).toBeGreaterThan(count(false) * 1.2);
  });

  it('Gewehr: Projektil fliegt weiter', () => {
    const reach = (withItem: boolean) => {
      const { sim, h, attack, east } = heroSim('gaertnerin');
      if (withItem) equip(h, 'gewehr');
      attack(east);
      return sim.state.projectiles[0].remaining;
    };
    // Nach dem ersten Tick ist das Projektil schon gleich weit geflogen; der Rest unterscheidet sich um 25 % der Reichweite.
    expect(reach(true) - reach(false)).toBeCloseTo(8 * 0.25, 5);
  });

  it('Rüstung verringert erlittenen Schaden', () => {
    const { sim, h } = heroSim('rotschopf');
    equip(h, 'kettenhemd');
    // Ragnar ist Tank (Rollen-Abzug), dazu das Kettenhemd (−20 %)
    const tank = sim.data.economy.roles!.tank.damageReduction;
    expect(applyDamage(sim, h, 100)).toBeCloseTo(100 * (1 - tank) * 0.8, 6);
  });

  it('Laufschuhe, Lebensamulett und Taschenuhr', () => {
    const { sim, h, cast, east } = heroSim('rotschopf');
    equip(h, 'laufschuhe', 'lebensamulett', 'taschenuhr');
    refreshMaxHp(sim, h);
    const def = sim.heroDefs.get('rotschopf')!;
    expect(h.maxHp).toBe(def.hp + 200);
    const start = { ...h.pos };
    sim.step([{ heroId: h.id, type: 'input', move: { x: 1, y: 0 }, aim: east, attack: false }]);
    expect(h.pos.x - start.x).toBeCloseTo((h.speed * 1.12) / 20, 6);
    cast(1, east);
    const cd = def.abilities[1].cooldown as number[];
    // Im selben Tick läuft die Abklingzeit schon um einen Tick (0,05 s) herunter.
    expect(h.cooldowns[1]).toBeCloseTo(cd[0] * 0.85 - 0.05, 6);
    h.inventory = Array(6).fill(null);
    refreshMaxHp(sim, h);
    expect(h.maxHp).toBe(def.hp);
    expect(h.hp).toBeLessThanOrEqual(h.maxHp);
    run(sim, 1);
  });
});
