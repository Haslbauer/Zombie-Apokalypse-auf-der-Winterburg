import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import type { PingKind } from '../../src/sim/types';
import { dist, type Vec2 } from '../../src/sim/vec';
import { spawnCourier } from '../../src/sim/waves';
import { noWaves, run, testData } from './helpers';

/** Ein Mensch (Slot 0) und drei Bots, Welle läuft ohne Spawns. */
function teamSim(seed = 2) {
  const sim = new Simulation(testData(noWaves), { seed, heroes: ['rotschopf', 'pirat', 'gaertnerin', 'libero'], bots: [null, 'schwer', 'schwer', 'schwer'], startLevel: 9 });
  Object.assign(sim.state.wave, { number: 6, phase: 'wave', queue: ['walker'], spawnTimer: 1e9 });
  const [me, ...bots] = sim.state.heroes;
  return { sim, me, bots };
}

const ping = (sim: Simulation, heroId: number, kind: PingKind, pos: Vec2) => sim.step([{ heroId, type: 'ping', kind, pos }]);

describe('Bots folgen Pings', () => {
  it('Angriffs-Ping auf den Postboten: alle Bots greifen an und besiegen ihn', () => {
    const { sim, me, bots } = teamSim();
    sim.data.arena.camps = [];
    sim.state.zombies = [];
    const z = spawnCourier(sim)!;
    me.pos = { x: 5, y: 75 }; // der Mensch steht weit weg und hilft nicht
    me.maxHp = me.hp = 1e9;
    ping(sim, me.id, 'attack', z.pos);
    // Jeder Bot nimmt den Auftrag an und antwortet „Bin unterwegs“
    const replies = sim.state.events.filter((e) => e.type === 'ping' && e.kind === 'omw');
    expect(replies.map((e) => (e as { heroId: number }).heroId).sort()).toEqual(bots.map((b) => b.id).sort());
    for (const b of bots) expect(b.bot!.order).toMatchObject({ kind: 'attack', targetId: z.id });
    for (let i = 0; i < 20 * 70 && z.hp > 0; i++) sim.step();
    expect(z.hp).toBe(0);
    expect(sim.state.events.some((e) => e.type === 'courier' || e.type === 'bossKill') || z.hp === 0).toBe(true);
  });

  it('Hilfe-Ping: Bots laufen zum Helden', () => {
    const { sim, me, bots } = teamSim();
    sim.state.zombies = [];
    me.pos = { x: 48, y: 62 };
    ping(sim, me.id, 'help', me.pos);
    run(sim, 20 * 10);
    for (const b of bots) expect(dist(b.pos, me.pos)).toBeLessThan(5);
  });

  it('Hier-Ping: nur die zwei nächsten Bots kommen', () => {
    const { sim, me, bots } = teamSim();
    sim.state.zombies = [];
    const spot = { x: 48, y: 62 };
    ping(sim, me.id, 'here', spot);
    expect(bots.filter((b) => b.bot!.order).length).toBe(2);
  });

  it('Gefahr-Ping: Bots verlassen den Bereich', () => {
    const { sim, me, bots } = teamSim();
    sim.state.zombies = [];
    const center = { ...bots[0].pos };
    ping(sim, me.id, 'danger', center);
    run(sim, 20 * 6);
    expect(dist(bots[0].pos, center)).toBeGreaterThan(9);
  });

  it('Bots pingen nicht zurück auf Pings anderer Bots (kein Ping-Pingpong)', () => {
    const { sim, bots } = teamSim();
    ping(sim, bots[0].id, 'attack', bots[1].pos);
    expect(bots[1].bot!.order ?? null).toBeNull();
  });
});
