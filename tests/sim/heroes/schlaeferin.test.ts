import { describe, expect, it } from 'vitest';
import { isSleeping } from '../../../src/sim/status';
import { heroSim, run } from '../helpers';

describe('Schläferin', () => {
  it('Berührung: Antritt zum Zombie, er schläft ein', () => {
    const { sim, h, zombie, cast } = heroSim('schlaeferin');
    const z = zombie(h.pos.x + 5, h.pos.y);
    cast(0, z.pos);
    run(sim, 10);
    expect(isSleeping(sim, z)).toBe(true);
  });

  it('Gähnen: Zombies im Kegel schlafen erst nach der Verzögerung ein', () => {
    const { sim, h, zombie, cast, value } = heroSim('schlaeferin');
    const front = zombie(h.pos.x + 4, h.pos.y);
    const behind = zombie(h.pos.x - 4, h.pos.y);
    cast(1, { x: h.pos.x + 7, y: h.pos.y });
    expect(isSleeping(sim, front)).toBe(false);
    run(sim, value(1, 'delay') * 20 + 1);
    expect(isSleeping(sim, front)).toBe(true);
    expect(isSleeping(sim, behind)).toBe(false);
  });

  it('Powernap: stillstehen heilt, Bewegen bricht ab', () => {
    const { sim, h, cast, east, value } = heroSim('schlaeferin');
    h.hp = 100;
    cast(2, east);
    sim.step([{ heroId: h.id, type: 'input', move: { x: 1, y: 0 }, aim: east, attack: false }]);
    expect(h.channel).toBeNull();
    expect(h.hp).toBeLessThan(110);

    h.cooldowns[2] = 0;
    sim.step([{ heroId: h.id, type: 'input', move: { x: 0, y: 0 }, aim: east, attack: false }]);
    cast(2, east);
    run(sim, value(2, 'channel') * 20 + 1);
    expect(h.hp).toBeGreaterThan(100 + value(2, 'heal') - 1);
    expect(h.buffs.some((b) => b.kind === 'haste')).toBe(true);
  });

  it('Gute Nacht: alle Zombies im Gebiet schlafen', () => {
    const { sim, h, zombie, cast } = heroSim('schlaeferin');
    const center = { x: h.pos.x + 8, y: h.pos.y };
    const zs = [zombie(center.x, center.y), zombie(center.x + 3, center.y + 3), zombie(center.x - 4, center.y)];
    const far = zombie(h.pos.x - 8, h.pos.y);
    cast(3, center);
    for (const z of zs) expect(isSleeping(sim, z)).toBe(true);
    expect(isSleeping(sim, far)).toBe(false);
  });

  it('Mondlicht: nach 3 Treffern schläft der Zombie', () => {
    const { sim, h, zombie, attack } = heroSim('schlaeferin');
    const z = zombie(h.pos.x + 3, h.pos.y);
    let slept = false;
    for (let i = 0; i < 60 && !slept; i++) {
      attack(z.pos);
      slept = isSleeping(sim, z);
    }
    expect(slept).toBe(true);
  });
});
