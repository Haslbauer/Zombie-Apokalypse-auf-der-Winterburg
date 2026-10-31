import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { applyDamage } from '../../src/sim/combat';
import { noWaves, run, testData } from './helpers';

function campSim() {
  const sim = new Simulation(testData(noWaves), { seed: 2, heroes: ['rotschopf', 'gaertnerin'] });
  sim.step();
  return { sim, camps: sim.data.arena.camps! };
}

describe('Neutrale Lager (Dschungel)', () => {
  it('sind zu Spielbeginn besetzt, liegen im Gelände und zählen nicht zur Welle', () => {
    const { sim, camps } = campSim();
    expect(camps.length).toBeGreaterThanOrEqual(3);
    const g = sim.data.arena.garden!;
    for (const c of camps) {
      const units = sim.state.zombies.filter((z) => z.neutral?.campId === c.id);
      expect(units.map((u) => u.defId)).toEqual(c.units);
      expect(Math.abs(c.x - g.x) > g.w / 2 || Math.abs(c.y - g.y) > g.h / 2, c.id).toBe(true);
    }
    // Welle ohne Zombies: geschafft, obwohl die Lager besetzt sind
    Object.assign(sim.state.wave, { phase: 'wave', queue: [], number: 1 });
    sim.step();
    expect(sim.state.wave.phase).toBe('pause');
  });

  it('ruhig, bis man sie angreift; dann wehrt sich das ganze Lager', () => {
    const { sim, camps } = campSim();
    const camp = camps.find((c) => c.units.length > 1)!;
    const units = sim.state.zombies.filter((z) => z.neutral?.campId === camp.id);
    const h = sim.state.heroes[0];
    h.pos = { x: camp.x + 2.5, y: camp.y };
    run(sim, 20 * 2);
    expect(h.hp).toBe(h.maxHp);
    applyDamage(sim, units[1], 1, h);
    run(sim, 20 * 3);
    expect(units.every((u) => u.targetId === h.id)).toBe(true);
    expect(h.hp).toBeLessThan(h.maxHp);
  });

  it('Leine: wer wegläuft, verliert sie; sie kehren heim und heilen sich', () => {
    const { sim, camps } = campSim();
    const camp = camps[0];
    const [u] = sim.state.zombies.filter((z) => z.neutral?.campId === camp.id);
    const h = sim.state.heroes[0];
    h.pos = { x: camp.x + 2, y: camp.y };
    applyDamage(sim, u, 20, h);
    run(sim, 20);
    h.pos = { ...sim.data.arena.heroStart };
    run(sim, 20 * 10);
    expect(u.targetId).toBeNull();
    expect(u.hp).toBe(u.maxHp);
    expect(Math.hypot(u.pos.x - u.neutral!.home.x, u.pos.y - u.neutral!.home.y)).toBeLessThan(0.5);
  });

  it('besiegt: Gold und XP für Helden in der Nähe, nach der Wartezeit wieder besetzt', () => {
    const { sim, camps } = campSim();
    const camp = camps[0];
    const h = sim.state.heroes[0];
    h.pos = { x: camp.x + 2, y: camp.y };
    const gold = h.gold;
    for (const u of sim.state.zombies.filter((z) => z.neutral?.campId === camp.id)) applyDamage(sim, u, u.hp + 1, h);
    sim.step();
    expect(h.gold).toBeGreaterThan(gold);
    expect(sim.state.camps.find((c) => c.id === camp.id)!.respawnAt).not.toBeNull();
    run(sim, camp.respawn * 20 + 2);
    expect(sim.state.zombies.filter((z) => z.neutral?.campId === camp.id)).toHaveLength(camp.units.length);
  });

  it('unerreichbarer Angreifer (z. B. hinter dem Zaun): Lager setzt sich zurück, unverwundbar auf dem Rückweg', () => {
    const { sim, camps } = campSim();
    const camp = camps.find((c) => c.id === 'spinnen-west')!;
    const [h] = sim.state.heroes;
    h.maxHp = h.hp = 1e6;
    const spiders = sim.state.zombies.filter((z) => z.neutral?.campId === camp.id);
    const big = spiders.find((z) => z.defId === 'riesenspinne')!;
    // Der Held steht in Reichweite des Lagers, die Spinnen kommen aber nicht hin (wie hinter einem Zaun)
    h.pos = { x: camp.x + 6, y: camp.y };
    const speeds = spiders.map((z) => z.speed);
    for (const z of spiders) z.speed = 0;
    applyDamage(sim, big, 200, h);
    run(sim, 20);
    expect(big.targetId).toBe(h.id);
    let reset = false;
    for (let i = 0; i < 20 * 5; i++) {
      sim.step();
      if (sim.state.events.some((e) => e.type === 'camp' && e.phase === 'reset')) reset = true;
    }
    expect(reset).toBe(true);
    // Die Spinne stand noch am Platz: sofort heim und voll geheilt, Ziel vergessen
    expect(big.hp).toBe(big.maxHp);
    expect(big.targetId).toBeNull();
    // Auf dem Rückweg kein Schaden
    spiders.forEach((z, i) => (z.speed = speeds[i]));
    big.neutral!.returning = true;
    big.pos = { x: big.pos.x + 3, y: big.pos.y };
    expect(applyDamage(sim, big, 100, h)).toBe(0);
    expect(big.hp).toBe(big.maxHp);
  });

  it('wer zuschlägt, bleibt im Kampf (kein Zurücksetzen, solange die Spinne trifft)', () => {
    const { sim, camps } = campSim();
    const camp = camps.find((c) => c.id === 'spinnen-west')!;
    const [h] = sim.state.heroes;
    h.maxHp = h.hp = 1e6;
    const big = sim.state.zombies.find((z) => z.neutral?.campId === camp.id && z.defId === 'riesenspinne')!;
    h.pos = { x: big.pos.x + big.radius + h.radius + 0.2, y: big.pos.y };
    applyDamage(sim, big, 50, h);
    run(sim, 20 * 10);
    expect(big.neutral!.returning).toBe(false);
    expect(big.targetId).toBe(h.id);
  });
});

