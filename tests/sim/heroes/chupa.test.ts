import { describe, expect, it } from 'vitest';
import { hasBuff, isFeared, isMarked, isRooted } from '../../../src/sim/status';
import { dist } from '../../../src/sim/vec';
import { heroSim, run } from '../helpers';

describe('Chupa', () => {
  it('Sprungbiss: springt zum ersten Zombie auf der Bahn, beißt und heilt', () => {
    const { sim, h, zombie, cast } = heroSim('chupa');
    h.hp = 200;
    const z = zombie(h.pos.x + 4, h.pos.y);
    cast(0, { x: h.pos.x + 6, y: h.pos.y });
    run(sim, 10);
    expect(z.hp).toBeLessThan(1000);
    expect(h.hp).toBeGreaterThan(200);
    expect(dist(h.pos, z.pos)).toBeLessThan(h.radius + z.radius + 0.5);
  });

  it('Fährte markiert nur verwundete Zombies', () => {
    const { sim, h, zombie, cast, east } = heroSim('chupa');
    const hurt = zombie(h.pos.x + 3, h.pos.y, 'walker', 1000);
    hurt.hp = 300;
    const healthy = zombie(h.pos.x - 3, h.pos.y);
    cast(1, east);
    expect(isMarked(sim, hurt)).toBe(true);
    expect(isMarked(sim, healthy)).toBe(false);
  });

  it('Heulen: erst Schadensreduktion, dann fliehen die Zombies', () => {
    const { sim, h, zombie, cast, east, value } = heroSim('chupa');
    const z = zombie(h.pos.x + 3, h.pos.y);
    z.speed = 1.8;
    cast(2, east);
    expect(h.buffs.some((b) => b.kind === 'damageReduction')).toBe(true);
    expect(isFeared(sim, z)).toBe(false);
    run(sim, value(2, 'duration') * 20 + 1);
    expect(isFeared(sim, z)).toBe(true);
  });

  it('Hetzjagd: ohne Ziel nichts, mit Ziel festhalten und beißen', () => {
    const { sim, h, zombie, cast, east } = heroSim('chupa');
    cast(3, east);
    expect(h.cooldowns[3]).toBe(0);
    const z = zombie(h.pos.x + 7, h.pos.y);
    cast(3, z.pos);
    expect(h.cooldowns[3]).toBeGreaterThan(0);
    run(sim, 10);
    expect(isRooted(sim, z)).toBe(true);
    expect(h.channel?.tag).toBe('hold');
    const hp = z.hp;
    run(sim, 20);
    expect(z.hp).toBeLessThan(hp);
    run(sim, 60);
    expect(h.channel).toBeNull();
    expect(isRooted(sim, z)).toBe(false);
  });

  it('Wittern: Bisse heilen', () => {
    const { h, zombie, attack } = heroSim('chupa');
    h.hp = 100;
    const z = zombie(h.pos.x + 1.2, h.pos.y);
    attack(z.pos);
    expect(h.hp).toBeGreaterThan(100);
    expect(hasBuff(h, 'invisible')).toBe(false);
  });
});
