import { describe, expect, it } from 'vitest';
import { shieldAmount } from '../../../src/sim/status';
import { dist } from '../../../src/sim/vec';
import { heroSim, run } from '../helpers';

describe('Libero', () => {
  it('Aufschlag: Ball trifft alle Zombies auf der Linie und bleibt am Ende liegen', () => {
    const { sim, h, zombie, cast, value } = heroSim('libero');
    const a = zombie(h.pos.x + 3, h.pos.y);
    const b = zombie(h.pos.x + 6, h.pos.y + 0.3);
    const target = { x: h.pos.x + 10, y: h.pos.y };
    cast(0, target);
    run(sim, 20);
    expect(a.hp).toBe(1000 - value(0, 'damage'));
    expect(b.hp).toBe(1000 - value(0, 'damage'));
    expect(h.ball!.heldBy).toBeNull();
    expect(dist(h.ball!.pos, target)).toBeLessThan(0.01);
  });

  it('liegenden Ball aufheben; zu weit weg kehrt er zurück', () => {
    const { sim, h, cast, east } = heroSim('libero');
    cast(0, east);
    run(sim, 20);
    for (let i = 0; i < 40 && h.ball!.heldBy === null; i++) {
      sim.step([{ heroId: h.id, type: 'input', move: { x: 1, y: 0 }, aim: east, attack: false }]);
    }
    expect(h.ball!.heldBy).toBe(h.id);

    h.ball!.heldBy = null;
    h.ball!.pos = { x: h.pos.x - 16, y: h.pos.y };
    sim.step([{ heroId: h.id, type: 'input', move: { x: 0, y: 0 }, aim: east, attack: false }]);
    expect(h.ball!.flight?.tag).toBe('return');
    run(sim, 30);
    expect(h.ball!.heldBy).toBe(h.id);
  });

  it('Block drängt Zombies zurück und betäubt sie kurz', () => {
    const { sim, h, zombie, cast, east } = heroSim('libero');
    const z = zombie(h.pos.x + 2, h.pos.y);
    const before = dist(z.pos, h.pos);
    cast(1, east);
    expect(dist(z.pos, h.pos)).toBeGreaterThan(before + 2);
    expect(sim.state.time < z.st.stunUntil).toBe(true);
  });

  it('Zuspiel ohne Mitspieler: Ball an sich selbst, mit Schild', () => {
    const { sim, h, cast, east } = heroSim('libero');
    cast(0, east);
    run(sim, 20);
    cast(2, h.pos);
    run(sim, 20);
    expect(h.ball!.heldBy).toBe(h.id);
    expect(shieldAmount(h)).toBeGreaterThan(0);
  });

  it('Schmetterball schlägt nach kurzer Verzögerung dort ein, wo der Ball liegt', () => {
    const { sim, h, zombie, cast, east, value } = heroSim('libero');
    const target = { x: h.pos.x + 8, y: h.pos.y };
    cast(0, target);
    run(sim, 20);
    const z = zombie(target.x + 2, target.y);
    const near = zombie(h.pos.x + 1.5, h.pos.y);
    cast(3, east);
    expect(z.hp).toBe(1000);
    run(sim, value(3, 'delay') * 20 + 1);
    expect(z.hp).toBe(1000 - value(3, 'damage'));
    expect(near.hp).toBe(1000);
  });
});
