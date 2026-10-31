import { describe, expect, it } from 'vitest';
import { kitOf } from '../../../src/sim/heroes/index';
import { dist } from '../../../src/sim/vec';
import { heroSim, placeZombie, run } from '../helpers';

describe('Gärtnerin', () => {
  it('Pfeilschuss trifft und stößt zurück', () => {
    const { sim, h, zombie, cast, value } = heroSim('gaertnerin');
    const z = zombie(h.pos.x + 6, h.pos.y);
    const before = z.pos.x;
    cast(0, { x: h.pos.x + 12, y: h.pos.y });
    run(sim, 10);
    expect(z.hp).toBe(1000 - value(0, 'damage'));
    expect(z.pos.x).toBeGreaterThan(before + 1);
  });

  it('Saat: Dornen wachsen erst nach 2 s, verlangsamen und stechen; höchstens 3', () => {
    const { sim, h, zombie, cast, value } = heroSim('gaertnerin');
    const spot = { x: h.pos.x + 5, y: h.pos.y };
    const z = zombie(spot.x, spot.y);
    cast(1, spot);
    run(sim, 30);
    expect(z.hp).toBe(1000);
    run(sim, 20);
    expect(z.hp).toBeLessThan(1000);
    expect(sim.state.time < z.st.slowUntil).toBe(true);
    for (let i = 0; i < 4; i++) {
      h.cooldowns[1] = 0;
      cast(1, { x: h.pos.x + 3, y: h.pos.y + i });
    }
    expect(sim.state.zones.filter((zz) => zz.kind === 'thorns')).toHaveLength(value(1, 'maxSeeds'));
  });

  it('Kräutertee heilt über Zeit', () => {
    const { sim, h, cast, east, value } = heroSim('gaertnerin');
    h.hp = 100;
    cast(2, east);
    run(sim, value(2, 'duration') * 20);
    expect(h.hp).toBeGreaterThanOrEqual(100 + value(2, 'heal') - 1);
  });

  it('Mein Garten!: Zombies am Heckenring werden festgehalten und nehmen Schaden', () => {
    const { sim, h, cast } = heroSim('gaertnerin');
    const center = { x: h.pos.x + 8, y: h.pos.y };
    const radius = sim.heroDefs.get('gaertnerin')!.abilities[3].radius!;
    cast(3, center);
    // Laufender Zombie direkt auf dem Ring (macht keinen Schaden)
    const z = placeZombie(sim, 'walker', center.x - radius, center.y, 1000);
    z.damage = 0;
    const start = { ...z.pos };
    run(sim, 20);
    expect(dist(z.pos, start)).toBeLessThan(0.3);
    expect(z.hp).toBeLessThan(1000);
  });

  it('Sturschädel: im Kampf mehr Regeneration und mit der Zeit weniger Schaden', () => {
    const { sim, h } = heroSim('gaertnerin');
    const kit = kitOf('gaertnerin');
    expect(kit.damageReduction!(sim, h)).toBe(0);
    for (let i = 0; i < 200; i++) {
      h.lastCombatAt = sim.state.time;
      sim.step();
    }
    expect(kit.damageReduction!(sim, h)).toBeCloseTo(0.2, 5);
    expect(kit.regenBonus!(sim, h)).toBeGreaterThan(0);
  });
});

