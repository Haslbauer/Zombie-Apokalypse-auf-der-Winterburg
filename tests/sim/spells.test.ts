import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { heroCC } from '../../src/sim/status';
import { dist } from '../../src/sim/vec';
import { arenaData, noWaves, placeZombie, run, testData } from './helpers';

function setup(spells: [string, string], heroes = ['rotschopf']) {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes, spells: [spells], startLevel: 5 });
  const h = sim.state.heroes[0];
  h.maxHp = h.hp = 1000;
  h.pos = { x: 20, y: 20 };
  return { sim, h };
}
const cast = (sim: Simulation, heroId: number, slot: number, aim: { x: number; y: number }) => sim.step([{ heroId, type: 'spell', slot, aim }]);

describe('Beschwörerzauber', () => {
  it('Vorgaben je Rolle, gewählte Zauber beim Start, Wechsel nur in der Pause', () => {
    const sim = new Simulation(testData(), { seed: 1, heroes: ['rotschopf', 'gaertnerin', 'grimm'], spells: [['geist', 'barriere']] });
    expect(sim.state.heroes[0].spells).toEqual(['geist', 'barriere']);
    expect(sim.state.heroes[1].spells).toEqual(['blitz', 'heilen']);
    expect(sim.state.heroes[2].spells).toEqual(['blitz', 'zerschmettern']);
    const h = sim.state.heroes[0];
    sim.step([{ heroId: h.id, type: 'chooseSpells', spells: ['blitz', 'blitz'] }]);
    expect(h.spells).toEqual(['geist', 'barriere']); // zweimal derselbe: ungültig
    sim.step([{ heroId: h.id, type: 'chooseSpells', spells: ['teleport', 'reinigen'] }]);
    expect(h.spells).toEqual(['teleport', 'reinigen']);
    sim.state.wave.phase = 'wave';
    sim.step([{ heroId: h.id, type: 'chooseSpells', spells: ['blitz', 'heilen'] }]);
    expect(h.spells).toEqual(['teleport', 'reinigen']);
  });

  it('Blitz: springt bis 4,5 m zum Zeiger, dann Abklingzeit', () => {
    const { sim, h } = setup(['blitz', 'geist']);
    cast(sim, h.id, 0, { x: 30, y: 20 });
    expect(h.pos.x).toBeGreaterThan(24);
    expect(h.pos.x).toBeLessThan(24.7);
    expect(h.spellCooldowns[0]).toBeGreaterThan(100);
    const x = h.pos.x;
    cast(sim, h.id, 0, { x: 30, y: 20 });
    expect(h.pos.x).toBeCloseTo(x, 1);
  });

  it('Entzünden: Brand über 5 s; Zerschmettern: großer Treffer', () => {
    const { sim, h } = setup(['entzuenden', 'zerschmettern']);
    const z = placeZombie(sim, 'brute', 24, 20, 5000);
    z.speed = 0;
    z.damage = 0;
    cast(sim, h.id, 0, z.pos);
    run(sim, 20 * 6);
    const burned = 5000 - z.hp;
    expect(burned).toBeGreaterThan(150);
    expect(burned).toBeLessThan(200);
    const before = z.hp;
    cast(sim, h.id, 1, z.pos);
    expect(before - z.hp).toBeCloseTo(380 + 40 * h.level, 0);
  });

  it('Heilen heilt dich und den schwächsten Mitspieler, Barriere fängt Schaden ab', () => {
    const { sim, h } = setup(['heilen', 'barriere'], ['rotschopf', 'pirat']);
    const friend = sim.state.heroes[1];
    friend.pos = { x: 22, y: 20 };
    h.hp = 300;
    friend.hp = friend.maxHp * 0.3;
    const fhp = friend.hp;
    cast(sim, h.id, 0, h.pos);
    expect(h.hp).toBeGreaterThan(300 + 90);
    expect(friend.hp).toBeGreaterThan(fhp + 90);
    cast(sim, h.id, 1, h.pos);
    expect(h.buffs.some((b) => b.kind === 'shield' && b.value > 100)).toBe(true);
  });

  it('Erschöpfen: Zombie langsamer und schwächer', () => {
    const { sim, h } = setup(['erschoepfen', 'geist']);
    const z = placeZombie(sim, 'walker', 21.2, 20, 1e6);
    cast(sim, h.id, 0, z.pos);
    expect(z.st.slowFactor).toBeCloseTo(0.6);
    const hp = h.hp;
    z.attackTimer = 0;
    run(sim, 30);
    const def = sim.zombieDefs.get('walker')!;
    expect(hp - h.hp).toBeLessThanOrEqual(def.damage * 0.6 * 2 + 1);
  });

  it('Teleport: nach 3 s beim Mitspieler, Laufen bricht ab', () => {
    const { sim, h } = setup(['teleport', 'geist'], ['rotschopf', 'pirat']);
    const friend = sim.state.heroes[1];
    friend.pos = { x: 8, y: 8 };
    cast(sim, h.id, 0, friend.pos);
    expect(h.channel?.tag).toBe('teleport');
    run(sim, 20 * 3 + 2);
    expect(dist(h.pos, friend.pos)).toBeLessThan(2);

    const b = setup(['teleport', 'geist'], ['rotschopf', 'pirat']);
    b.sim.state.heroes[1].pos = { x: 8, y: 8 };
    cast(b.sim, b.h.id, 0, { x: 8, y: 8 });
    b.sim.step([{ heroId: b.h.id, type: 'input', move: { x: 1, y: 0 }, aim: { x: 30, y: 20 }, attack: false }]);
    run(b.sim, 20 * 3);
    expect(dist(b.h.pos, { x: 8, y: 8 })).toBeGreaterThan(8);
    expect(b.h.spellCooldowns[0]).toBeGreaterThan(0);
  });

  it('Reinigen löst Betäubung und schützt kurz', () => {
    const { sim, h } = setup(['reinigen', 'geist']);
    heroCC(sim, h, 'stunned', 3);
    cast(sim, h.id, 0, h.pos);
    expect(h.buffs.some((b) => b.kind === 'stunned')).toBe(false);
    heroCC(sim, h, 'rooted', 2);
    expect(h.buffs.some((b) => b.kind === 'rooted')).toBe(false);
  });
});
