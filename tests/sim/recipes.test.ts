import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/gameData';
import { parseGameData } from '../../src/sim/data';
import { buildPlan, itemStats } from '../../src/sim/items';
import { Simulation } from '../../src/sim/game';
import { makeSim, noWaves, run, testData } from './helpers';

function botSim(heroId: string) {
  const sim = new Simulation(testData(noWaves), { seed: 1, heroes: [heroId], bots: ['schwer'] });
  return { sim, h: sim.state.heroes[0] };
}

function shopSim(heroId = 'rotschopf') {
  const sim = makeSim(heroId, 1, testData(noWaves));
  const h = sim.state.heroes[0];
  const cmd = (c: object) => sim.step([{ heroId: h.id, ...c } as never]);
  return { sim, h, cmd, price: (id: string) => sim.data.items.find((i) => i.id === id)!.price };
}

describe('Item-Rezepte (wie in LoL)', () => {
  it('Bauteil wird verbraucht und auf den Preis angerechnet', () => {
    const { h, cmd, price } = shopSim();
    h.gold = 2000;
    cmd({ type: 'buy', itemId: 'baseballschlaeger' });
    cmd({ type: 'buy', itemId: 'laufschuhe' });
    const gold = h.gold;
    cmd({ type: 'buy', itemId: 'axt' });
    expect(h.inventory.slice(0, 2)).toEqual(['axt', 'laufschuhe']);
    expect(h.gold).toBe(gold - (price('axt') - price('baseballschlaeger')));
  });

  it('fehlende Bauteile zählen über ihre eigenen Bauteile (rekursiv)', () => {
    const { sim, h, cmd, price } = shopSim();
    h.inventory = ['arbeitshandschuhe', 'baseballschlaeger', 'lederjacke', null, null, null];
    const plan = buildPlan(sim, h, 'kettensaege');
    expect(plan.consumed).toEqual([0, 1]);
    expect(plan.cost).toBe(price('kettensaege') - price('arbeitshandschuhe') - price('baseballschlaeger'));
    h.gold = plan.cost;
    cmd({ type: 'buy', itemId: 'kettensaege' });
    expect(h.inventory).toEqual(['kettensaege', null, 'lederjacke', null, null, null]);
    expect(h.gold).toBe(0);
    expect(itemStats(sim, h).attackSpeed).toBeCloseTo(0.4);
  });

  it('Kombinieren geht auch bei vollem Inventar', () => {
    const { h, cmd } = shopSim();
    h.inventory = ['lederjacke', 'laufschuhe', 'laufschuhe', 'laufschuhe', 'laufschuhe', 'laufschuhe'];
    h.gold = 5000;
    cmd({ type: 'buy', itemId: 'pistole' });
    expect(h.inventory).not.toContain('pistole');
    cmd({ type: 'buy', itemId: 'kettenhemd' });
    expect(h.inventory[0]).toBe('kettenhemd');
  });

  it('Spieldaten: Rezepte werden geprüft', () => {
    const raw = (patch: (items: any[]) => void) => {
      const d: any = structuredClone(gameData);
      patch(d.items);
      return () => parseGameData(d);
    };
    expect(raw((items) => (items.find((i) => i.id === 'axt').from = ['gibtsnicht']))).toThrow(/unbekanntes Item gibtsnicht/);
    expect(raw((items) => (items.find((i) => i.id === 'axt').price = 100))).toThrow(/Summe der Bauteile/);
    expect(raw((items) => (items.find((i) => i.id === 'baseballschlaeger').from = ['axt']))).toThrow(/enthält sich selbst/);
    expect(raw((items) => (items.find((i) => i.id === 'axt').from = ['heiltrank']))).toThrow(/Verbrauchsgut/);
  });

  it('Bot kauft Bauteile, kombiniert und kauft Verbautes nicht doppelt', () => {
    const { sim, h } = botSim('rotschopf');
    h.pos = { x: 31.3, y: 37 };
    h.consumables[0] = { itemId: 'heiltrank', count: 2 };
    h.inventory = ['baseballschlaeger', 'lederjacke', null, null, null, null];
    // Axt fehlt: zuerst die Axt aus dem Schläger bauen
    h.gold = 450;
    run(sim, 20 * 3);
    expect(h.inventory).toContain('axt');
    expect(h.inventory).not.toContain('baseballschlaeger');
    // Für die Kettensäge reicht es nicht: erst die Arbeitshandschuhe
    h.gold = 400;
    run(sim, 20 * 3);
    expect(h.inventory).toContain('arbeitshandschuhe');
    h.gold = 1200;
    run(sim, 20 * 3);
    expect(h.inventory).toContain('kettensaege');
    expect(h.inventory).not.toContain('axt');
    // Liste geht weiter mit dem Kettenhemd, der Schläger wird nicht neu gekauft
    h.gold = 550;
    run(sim, 20 * 3);
    expect(h.inventory).toContain('kettenhemd');
    expect(h.inventory).not.toContain('baseballschlaeger');
  });
});
