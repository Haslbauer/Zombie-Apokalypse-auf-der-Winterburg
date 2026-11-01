import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { addSting } from '../../src/sim/heroes/imker';
import { addPlague } from '../../src/sim/roles';
import { arenaData, noWaves, placeZombie, run, testData } from './helpers';

function setup(data = arenaData(noWaves)) {
  const sim = new Simulation(data, { seed: 1, heroes: ['imker', 'rotschopf'], startLevel: 6 });
  const [im, ally] = sim.state.heroes;
  for (const h of [im, ally]) {
    h.maxHp = 1000;
    h.hp = 1000;
    h.ranks = [1, 1, 1, 1];
    h.cooldowns = [0, 0, 0, 0];
  }
  im.pos = { x: 20, y: 20 };
  ally.pos = { x: 23, y: 20 };
  const cast = (slot: number, aim: { x: number; y: number }) => sim.step([{ heroId: im.id, type: 'cast', slot, aim }]);
  return { sim, im, ally, cast };
}

describe('Imker', () => {
  it('Bienenschwarm-Angriff hinterlässt Stiche, die über Zeit Schaden machen und sich stapeln', () => {
    const { sim, im } = setup();
    const z = placeZombie(sim, 'brute', 26, 20, 5000);
    for (let i = 0; i < 60; i++) sim.step([{ heroId: im.id, type: 'input', move: { x: 0, y: 0 }, aim: z.pos, attack: true }]);
    expect(z.st.stings?.n).toBeGreaterThanOrEqual(2);
    const hp = z.hp;
    run(sim, 20); // ohne weitere Angriffe: Stiche wirken weiter
    expect(z.hp).toBeLessThan(hp);
    addSting(sim, im, z, 99);
    expect(z.st.stings!.n).toBe(sim.heroDefs.get('imker')!.passive.values.maxStings);
  });

  it('Honigtopf heilt Mitspieler in der Fläche und lässt Zombies kleben', () => {
    const { sim, ally, cast } = setup();
    ally.hp = 500;
    const z = placeZombie(sim, 'walker', 24, 21);
    cast(0, ally.pos);
    expect(ally.hp).toBeGreaterThan(500);
    run(sim, 2);
    expect(sim.state.zones.some((x) => x.kind === 'honey')).toBe(true);
    expect(z.st.slowUntil).toBeGreaterThan(sim.state.time);
  });

  it('Smoker blendet und verlangsamt Zombies vorn', () => {
    const { sim, im, cast } = setup();
    im.facing = 0;
    const z = placeZombie(sim, 'walker', 23, 20);
    cast(1, { x: 25, y: 20 });
    expect(z.st.blindUntil).toBeGreaterThan(sim.state.time);
    expect(z.st.slowUntil).toBeGreaterThan(sim.state.time);
  });

  it('Wachbienen: wer den Mitspieler angreift, wird gestochen', () => {
    const { sim, ally, cast } = setup();
    cast(2, ally.pos);
    expect(ally.buffs.some((b) => b.kind === 'thorns')).toBe(true);
    const z = placeZombie(sim, 'brute', ally.pos.x + 1.2, ally.pos.y, 5000);
    run(sim, 60);
    expect(z.hp).toBeLessThan(5000);
  });

  it('Schwarm: Schaden über Zeit, volle Stiche, reinigt Seuche', () => {
    const { sim, im, ally, cast } = setup();
    addPlague(sim, ally, 3);
    const z = placeZombie(sim, 'brute', 24, 20, 5000);
    cast(3, { x: 23.5, y: 20 });
    run(sim, 20);
    expect(ally.plague).toBeNull();
    expect(z.st.stings?.n).toBe(sim.heroDefs.get('imker')!.passive.values.maxStings);
    expect(z.hp).toBeLessThan(5000 - 40);
    expect(im.stats!.damage).toBeGreaterThan(40);
  });

  it('Mein Volk: Stock heilt schneller, Heilung nahe am Stock stärker', () => {
    const sim = new Simulation(testData(noWaves), { seed: 1, heroes: ['imker', 'rotschopf'] });
    const [im, ally] = sim.state.heroes;
    const hive = sim.state.objectives.find((o) => o.kind === 'hive')!;
    hive.hp = hive.maxHp - 100;
    const before = hive.hp;
    run(sim, 20);
    expect(hive.hp - before).toBeGreaterThan(0.9);
    // Heilung nahe am Stock gegen weit weg
    const heal = (near: boolean) => {
      im.pos = near ? { x: hive.pos.x + 2, y: hive.pos.y } : { x: hive.pos.x + 40, y: hive.pos.y };
      ally.pos = { ...im.pos };
      ally.maxHp = 2000;
      ally.hp = 100;
      im.ranks[0] = 1;
      im.cooldowns[0] = 0;
      sim.step([{ heroId: im.id, type: 'cast', slot: 0, aim: ally.pos }]);
      return ally.hp - 100;
    };
    const near = heal(true);
    const far = heal(false);
    expect(near).toBeGreaterThan(far * 1.2);
  });
});
