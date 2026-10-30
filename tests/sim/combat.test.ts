import { describe, expect, it } from 'vitest';
import { applyDamage } from '../../src/sim/combat';
import { arenaData, input, makeSim, noWaves, placeZombie, run } from './helpers';

const still = { x: 0, y: 0 };

/** Simulation mit einem Helden ohne Wellen; Zombies stehen still. */
function setup(heroId: 'rotschopf' | 'gaertnerin') {
  const sim = makeSim(heroId, 1, arenaData(noWaves));
  const h = sim.state.heroes[0];
  const zombie = (dx: number, dy: number, defId = 'brute') => {
    const z = placeZombie(sim, defId, h.pos.x + dx, h.pos.y + dy, 1000);
    z.speed = 0;
    z.damage = 0;
    return z;
  };
  const east = { x: h.pos.x + 10, y: h.pos.y };
  return { sim, h, zombie, east, attack: sim.heroDefs.get(heroId)!.attack };
}

describe('Kampf', () => {
  it('Schaden zieht Leben ab, Tod zählt einen Kill und entfernt den Zombie', () => {
    const sim = makeSim('rotschopf', 1, arenaData(noWaves));
    const z = placeZombie(sim, 'walker', 5, 5, 50);
    expect(applyDamage(sim, z, 20)).toBe(20);
    expect(z.hp).toBe(30);
    expect(applyDamage(sim, z, 100)).toBe(30);
    expect(z.hp).toBe(0);
    expect(sim.state.kills).toBe(1);
    expect(applyDamage(sim, z, 10)).toBe(0);
    sim.step();
    expect(sim.state.zombies).toHaveLength(0);
  });

  it('kein Auto-Attack: ohne gedrückte Taste wird nicht angegriffen', () => {
    for (const heroId of ['rotschopf', 'gaertnerin'] as const) {
      const { sim, zombie, east } = setup(heroId);
      const z = zombie(1.5, 0);
      sim.step([input(sim, still, east, false)]);
      run(sim, 40);
      expect(z.hp).toBe(1000);
      expect(sim.state.projectiles).toHaveLength(0);
    }
  });

  it('Nahkampf trifft alle Zombies im Bogen vorne, nicht hinten und nicht zu weit weg', () => {
    const { sim, h, zombie, east, attack } = setup('rotschopf');
    expect(attack.range).toBe(2.5);
    expect(attack.arc).toBe(120);
    const reach = h.radius + attack.range;
    const front = zombie(reach, 0, 'walker');
    const diagonal = zombie(reach * 0.6 * Math.cos(Math.PI / 4), reach * 0.6 * Math.sin(Math.PI / 4), 'walker');
    const behind = zombie(-1.5, 0, 'walker');
    const side = zombie(0, -2.2, 'walker'); // 90° neben der Blickrichtung
    const far = zombie(reach + 1.5, 0.5, 'walker');
    sim.step([input(sim, still, east, true)]);
    expect(front.hp).toBe(1000 - attack.damage);
    expect(diagonal.hp).toBe(1000 - attack.damage);
    expect(behind.hp).toBe(1000);
    expect(side.hp).toBe(1000);
    expect(far.hp).toBe(1000);
    expect(sim.state.events.some((e) => e.type === 'swing')).toBe(true);
  });

  it('gedrückt halten greift im Takt der Abklingzeit an', () => {
    const { sim, zombie, east, attack } = setup('rotschopf');
    const z = zombie(1.5, 0);
    sim.step([input(sim, still, east, true)]);
    run(sim, 40);
    const hits = Math.round((1000 - z.hp) / attack.damage);
    expect(hits).toBe(1 + Math.floor(2 / attack.cooldown));
  });

  it('Fernkampf: Projektil fliegt geradeaus und trifft nur den ersten Zombie', () => {
    const { sim, zombie, east, attack } = setup('gaertnerin');
    const first = zombie(4, 0);
    const second = zombie(7, 0);
    sim.step([input(sim, still, east, true)]);
    expect(sim.state.projectiles).toHaveLength(1);
    sim.step([input(sim, still, east, false)]);
    run(sim, 10);
    expect(first.hp).toBe(1000 - attack.damage);
    expect(second.hp).toBe(1000);
    expect(sim.state.projectiles).toHaveLength(0);
  });

  it('Fernkampf: Schuss neben den Zombie geht daneben und endet nach der Reichweite', () => {
    const { sim, h, zombie, attack } = setup('gaertnerin');
    const z = zombie(5, 0);
    // Nach Nordosten zielen, am Zombie vorbei.
    const aim = { x: h.pos.x + 10, y: h.pos.y - 10 };
    sim.step([input(sim, still, aim, true)]);
    sim.step([input(sim, still, aim, false)]);
    const flightTicks = Math.ceil((attack.range / attack.projectileSpeed!) * 20) + 1;
    run(sim, flightTicks);
    expect(z.hp).toBe(1000);
    expect(sim.state.projectiles).toHaveLength(0);
  });

  it('Fernkampf: Hindernisse stoppen das Projektil', () => {
    const { sim, h, zombie } = setup('gaertnerin');
    // Hecke bei (20, 15), Held bei (20, 22): Zombie dahinter wird nicht getroffen.
    const z = zombie(0, -8.3);
    const north = { x: h.pos.x, y: h.pos.y - 20 };
    sim.step([input(sim, still, north, true)]);
    sim.step([input(sim, still, north, false)]);
    run(sim, 20);
    expect(z.hp).toBe(1000);
    expect(sim.state.projectiles).toHaveLength(0);
  });

  it('Zombies greifen den Helden an; ein gefallener Held kommt nach dem Timer zurück', () => {
    const data = arenaData(noWaves);
    const sim = makeSim('rotschopf', 1, data);
    const h = sim.state.heroes[0];
    h.hp = 20;
    placeZombie(sim, 'brute', h.pos.x + 1.25, h.pos.y, 1e6);
    let t = 0;
    while (h.alive && t++ < 100) sim.step();
    expect(h.alive).toBe(false);
    expect(h.hp).toBe(0);
    expect(sim.state.gameOver).toBe(false);
    const wait = data.arena.respawn.base;
    expect(h.respawnAt).toBeCloseTo(sim.state.time + wait, 5);

    sim.state.zombies = [];
    run(sim, wait * 20 + 1);
    expect(h.alive).toBe(true);
    expect(h.hp).toBe(h.maxHp);
    expect(h.pos).toEqual(data.arena.heroStart);
  });
});
