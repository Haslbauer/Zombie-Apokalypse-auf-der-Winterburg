import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { buy } from '../../src/sim/economy';
import { makeSim, noWaves, placeZombie, run, testData } from './helpers';

/** Winterburg ohne Wellen: Held steht im Innenhof, es ist Pause. */
function shopSim(heroId = 'rotschopf') {
  const sim = makeSim(heroId, 1, testData(noWaves));
  const h = sim.state.heroes[0];
  const cmd = (c: object) => sim.step([{ heroId: h.id, ...c } as never]);
  return { sim, h, cmd, eco: sim.data.economy, price: (id: string) => sim.data.items.find((i) => i.id === id)!.price };
}

describe('Gold und Shop', () => {
  it('Startgold, Kill-Gold für alle Helden im Umkreis, Wellenbonus', () => {
    const data = testData();
    const sim = new Simulation(data, { seed: 1, heroes: ['rotschopf', 'gaertnerin', 'pirat'] });
    const [a, b, far] = sim.state.heroes;
    expect(a.gold).toBe(data.economy.startGold);
    far.pos = { x: 5, y: 60 };
    const z = placeZombie(sim, 'walker', a.pos.x + 1, a.pos.y, 1);
    a.input = { move: { x: 0, y: 0 }, aim: z.pos, attack: true };
    sim.step();
    const gold = data.zombies.find((d) => d.id === 'walker')!.gold;
    expect(a.gold).toBe(data.economy.startGold + gold);
    expect(b.gold).toBe(data.economy.startGold + gold);
    expect(far.gold).toBe(data.economy.startGold);

    // Welle 1 abschließen: Bonus für alle
    sim.state.wave.phase = 'wave';
    sim.state.wave.queue = [];
    sim.state.zombies = [];
    a.input.attack = false;
    sim.step();
    const bonus = data.economy.waveBonusBase + data.economy.waveBonusPerWave;
    expect(far.gold).toBe(data.economy.startGold + bonus);
  });

  it('Kaufen geht nur in der Pause, im Innenhof und mit genug Gold', () => {
    const { sim, h, cmd, price } = shopSim();
    cmd({ type: 'buy', itemId: 'baseballschlaeger' });
    expect(h.inventory[0]).toBe('baseballschlaeger');
    expect(h.gold).toBe(sim.data.economy.startGold - price('baseballschlaeger'));

    cmd({ type: 'buy', itemId: 'axt' }); // zu teuer
    expect(h.inventory[1]).toBeNull();
    expect(sim.state.events).toContainEqual(expect.objectContaining({ type: 'shopDenied', reason: 'Nicht genug Gold' }));

    h.gold = 5000;
    h.pos = { x: 30, y: 50 }; // draußen im Garten
    cmd({ type: 'buy', itemId: 'axt' });
    expect(h.inventory[1]).toBeNull();

    h.pos = { x: 34, y: 20 };
    sim.state.wave.phase = 'wave';
    sim.state.wave.queue = ['walker'];
    sim.state.wave.spawnTimer = 1e9;
    cmd({ type: 'buy', itemId: 'axt' });
    expect(h.inventory[1]).toBeNull();
    expect(sim.state.events).toContainEqual(expect.objectContaining({ type: 'shopDenied', reason: 'Der Shop hat nur in der Pause geöffnet' }));
  });

  it('Inventar hat 6 Plätze; Verkaufen bringt 70 %', () => {
    const { sim, h, cmd, price } = shopSim();
    h.gold = 1e6;
    for (let i = 0; i < 7; i++) cmd({ type: 'buy', itemId: 'laufschuhe' });
    expect(h.inventory.filter((s) => s === 'laufschuhe')).toHaveLength(6);
    const gold = h.gold;
    cmd({ type: 'sell', slot: 2 });
    expect(h.inventory[2]).toBeNull();
    expect(h.gold).toBe(gold + Math.floor(price('laufschuhe') * sim.data.economy.sellFactor));
  });

  it('Verbrauchsgüter stapeln sich auf R/T; Heiltrank und Energiedrink wirken', () => {
    const { sim, h, cmd } = shopSim();
    h.gold = 1e6;
    for (let i = 0; i < 6; i++) cmd({ type: 'buy', itemId: 'heiltrank' });
    expect(h.consumables[0]).toEqual({ itemId: 'heiltrank', count: 5 });
    expect(h.consumables[1]).toEqual({ itemId: 'heiltrank', count: 1 });
    cmd({ type: 'buy', itemId: 'energiedrink' }); // kein Platz mehr
    expect(h.consumables.some((c) => c?.itemId === 'energiedrink')).toBe(false);

    h.hp = 100;
    cmd({ type: 'use', slot: 0 });
    expect(h.consumables[0]!.count).toBe(4);
    run(sim, 5 * 20);
    expect(h.hp).toBeGreaterThan(240);

    cmd({ type: 'sell', slot: 1, consumable: true });
    expect(h.consumables[1]).toBeNull();
    expect(buy(sim, h, 'energiedrink')).toBe(true);
    cmd({ type: 'use', slot: 1 });
    expect(h.buffs.some((b) => b.kind === 'haste')).toBe(true);
    expect(h.buffs.some((b) => b.kind === 'attackSpeed')).toBe(true);
    expect(h.consumables[1]).toBeNull();
  });
});
