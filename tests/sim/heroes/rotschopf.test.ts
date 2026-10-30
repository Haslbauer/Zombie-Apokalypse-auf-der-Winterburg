import { describe, expect, it } from 'vitest';
import { kitOf } from '../../../src/sim/heroes/index';
import { hasBuff } from '../../../src/sim/status';
import { dist } from '../../../src/sim/vec';
import { heroSim, run } from '../helpers';

describe('Rotschopf', () => {
  it('Wuchtschlag trifft vorne mit einem von drei Zufallseffekten, gleicher Seed = gleicher Effekt', () => {
    const effects = (seed: number) => {
      const { sim, h, zombie, cast, value } = heroSim('rotschopf', seed);
      const z = zombie(h.pos.x + 2, h.pos.y);
      cast(0, { x: h.pos.x + 5, y: h.pos.y });
      const kind = sim.state.events.find((e) => e.type === 'effect')!;
      const lost = 1000 - z.hp;
      expect([value(0, 'damage'), value(0, 'damage') * 2]).toContain(lost);
      return (kind as { kind: string }).kind;
    };
    expect(['slam-stun', 'slam-double', 'slam-knockback']).toContain(effects(3));
    expect(effects(3)).toBe(effects(3));
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(effects));
    expect(seen.size).toBe(3);
  });

  it('Wutanfall gibt einen zufälligen Buff', () => {
    const { h, cast, east } = heroSim('rotschopf');
    cast(1, east);
    expect(h.buffs).toHaveLength(1);
    expect(['haste', 'shield', 'heal']).toContain(h.buffs[0].kind);
  });

  it('Ungezielter Sprung landet nahe am Ziel und macht Flächenschaden', () => {
    const { sim, h, zombie, cast, value } = heroSim('rotschopf', 2);
    const target = { x: h.pos.x + 6, y: h.pos.y };
    const z = zombie(target.x, target.y);
    cast(2, target);
    expect(h.dash).not.toBeNull();
    run(sim, 20);
    expect(h.dash).toBeNull();
    expect(dist(h.pos, target)).toBeLessThanOrEqual(value(2, 'deviation') + 1);
    expect(z.hp).toBe(1000 - value(2, 'damage'));
  });

  it('Amok: unaufhaltsam und doppelter Schaden', () => {
    const { sim, h, zombie, cast, attack, east } = heroSim('rotschopf');
    const z = zombie(h.pos.x + 1.5, h.pos.y);
    cast(3, east);
    expect(hasBuff(h, 'unstoppable')).toBe(true);
    attack(z.pos);
    expect(1000 - z.hp).toBe(sim.heroDefs.get('rotschopf')!.attack.damage * 2);
  });

  it('Jähzorn: schneller bei wenig Leben', () => {
    const { sim, h } = heroSim('rotschopf');
    expect(kitOf('rotschopf').attackSpeedBonus!(sim, h)).toBe(0);
    h.hp = h.maxHp / 2;
    expect(kitOf('rotschopf').attackSpeedBonus!(sim, h)).toBeCloseTo(0.3, 5);
  });
});
