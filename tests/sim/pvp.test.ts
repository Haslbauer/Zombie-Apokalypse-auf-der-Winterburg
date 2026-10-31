import { describe, expect, it } from 'vitest';
import { encodeSnapshot } from '../../src/net/protocol';
import { applyDamage } from '../../src/sim/combat';
import { Simulation } from '../../src/sim/game';
import { handicapFor } from '../../src/sim/pvp';
import type { GameEvent } from '../../src/sim/types';
import { run, testData } from './helpers';

function pvp(heroes: string[], teams: number[], killsToWin = 3) {
  return new Simulation(testData(), { seed: 1, heroes, pvp: { teams, killsToWin } });
}

describe('PvP-Modus', () => {
  it('Teams, leere Plätze, Startplätze, keine Wellen und keine Zombies', () => {
    const sim = pvp(['rotschopf', 'grimm', 'pirat', 'libero'], [0, 1, -1, -1]);
    const [a, b, c] = sim.state.heroes;
    expect(a.team).toBe(0);
    expect(b.team).toBe(1);
    expect(c.benched).toBe(true);
    expect(c.alive).toBe(false);
    expect(Math.abs(a.pos.y - b.pos.y)).toBeGreaterThan(30);
    run(sim, 20 * 60);
    expect(sim.state.wave.number).toBe(1);
    expect(sim.state.zombies.every((z) => z.avatarOf !== undefined)).toBe(true);
    expect(c.alive).toBe(false);
    expect(a.gold).toBeGreaterThan(sim.data.economy.pvp!.startGold);
  });

  it('Angriffe treffen Gegner, nicht Mitspieler; Stellvertreter bleiben auf dem Server', () => {
    const sim = pvp(['grimm', 'rotschopf', 'pirat', 'libero'], [0, 1, 0, -1]);
    const [g, r, p] = sim.state.heroes;
    r.pos = { x: g.pos.x + 1.2, y: g.pos.y };
    p.pos = { x: g.pos.x - 1.2, y: g.pos.y };
    const hp = r.hp;
    const mateHp = p.hp;
    for (let i = 0; i < 40; i++) {
      sim.step([{ heroId: g.id, type: 'input', move: { x: 0, y: 0 }, aim: r.pos, attack: true }]);
    }
    expect(r.hp).toBeLessThan(hp);
    expect(p.hp).toBe(mateHp);
    // gleiche Seite: kein Schaden
    expect(applyDamage(sim, p, 50, g)).toBe(0);
    const snap = JSON.parse(encodeSnapshot(sim.state, [], sim.data.zombies.map((z) => z.id)));
    expect(snap.zombies).toHaveLength(0);
    expect(snap.pvp.teams).toEqual([0, 1, 0, -1]);
  });

  it('Kills zählen fürs Team; Sieg bei killsToWin', () => {
    const sim = pvp(['grimm', 'rotschopf'], [0, 1], 2);
    const [g, r] = sim.state.heroes;
    const events: GameEvent[] = [];
    for (let k = 0; k < 2; k++) {
      sim.step();
      r.alive = true;
      r.hp = 10;
      applyDamage(sim, r, 100, g);
      events.push(...sim.state.events);
    }
    expect(sim.state.pvp!.score).toEqual([2, 0]);
    expect(g.score.kills).toBe(2);
    const over = events.find((e) => e.type === 'gameOver');
    expect(over).toMatchObject({ winnerTeam: 0 });
  });

  it('Ausgleich für das kleinere Team (1:3)', () => {
    expect(handicapFor([0, 1, 1, 1], 0)).toBeCloseTo(Math.sqrt(3), 6);
    expect(handicapFor([0, 1, 1, 1], 1)).toBe(1);
    expect(handicapFor([0, 0, 1, 1], 0)).toBe(1);
  });
});
