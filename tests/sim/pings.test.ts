import { describe, expect, it } from 'vitest';
import { makeSim } from './helpers';

describe('Pings', () => {
  it('erzeugen ein Ereignis mit Held, Art und Position auf der Karte', () => {
    const sim = makeSim('pirat');
    const h = sim.state.heroes[0];
    sim.step([{ heroId: h.id, type: 'ping', kind: 'danger', pos: { x: 20, y: 30 } }]);
    expect(sim.state.events).toContainEqual({ type: 'ping', heroId: h.id, kind: 'danger', pos: { x: 20, y: 30 } });
    // Außerhalb der Karte: an den Rand gesetzt
    sim.step([{ heroId: h.id, type: 'ping', kind: 'here', pos: { x: 500, y: -500 } }]);
    const e = sim.state.events.find((x) => x.type === 'ping');
    expect(e).toMatchObject({ pos: { x: sim.arena.width, y: sim.arena.minY ?? 0 } });
  });

  it('höchstens 3 Pings in 5 s, unbekannte Arten werden verworfen', () => {
    const sim = makeSim('pirat');
    const h = sim.state.heroes[0];
    const pings = () => sim.state.events.filter((e) => e.type === 'ping').length;
    sim.step([{ heroId: h.id, type: 'ping', kind: 'boom' as never, pos: { x: 1, y: 1 } }]);
    expect(pings()).toBe(0);
    let total = 0;
    for (let i = 0; i < 5; i++) {
      sim.step([{ heroId: h.id, type: 'ping', kind: 'here', pos: { x: 10, y: 10 } }]);
      total += pings();
    }
    expect(total).toBe(3);
    for (let i = 0; i < 20 * 5; i++) sim.step();
    sim.step([{ heroId: h.id, type: 'ping', kind: 'omw', pos: { x: 10, y: 10 } }]);
    expect(pings()).toBe(1);
  });

  it('auch gefallene Helden dürfen pingen', () => {
    const sim = makeSim('pirat');
    const h = sim.state.heroes[0];
    h.alive = false;
    h.respawnAt = 1e9;
    sim.step([{ heroId: h.id, type: 'ping', kind: 'help', pos: { x: 10, y: 10 } }]);
    expect(sim.state.events.some((e) => e.type === 'ping')).toBe(true);
  });
});
