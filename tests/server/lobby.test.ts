import { describe, expect, it } from 'vitest';
import { Lobby, type Client } from '../../server/lobby';
import { ZOMBIE_TYPES } from '../../server/room';
import { gameData } from '../../src/gameData';
import { decodeSnapshot, encodeSnapshot, type ServerMessage } from '../../src/net/protocol';
import { Simulation } from '../../src/sim/game';

/** Lobby mit Spielern, die ihre Nachrichten sammeln. */
function setup() {
  let now = 0;
  const lobby = new Lobby(() => now);
  const player = () => {
    const inbox: ServerMessage[] = [];
    const client = lobby.connect((d) => inbox.push(JSON.parse(d)));
    const send = (m: object) => lobby.message(client, JSON.stringify(m));
    const last = <T extends ServerMessage['t']>(t: T) => [...inbox].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined;
    return { client, inbox, send, last };
  };
  return { lobby, player, advance: (ms: number) => (now += ms) };
}

describe('Server: Räume', () => {
  it('Raum erstellen: Host steuert Platz 0, die übrigen drei Plätze Bots', () => {
    const { lobby, player } = setup();
    const host = player();
    host.send({ t: 'create', heroes: ['rotschopf'], difficulty: 'schwer', name: 'Anna' });
    const joined = host.last('joined')!;
    expect(joined.room.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(joined.room.slots).toHaveLength(4);
    expect(joined.room.slots[0]).toMatchObject({ defId: 'rotschopf', human: true, name: 'Anna' });
    expect(joined.room.slots.slice(1).every((s) => !s.human)).toBe(true);
    const room = lobby.rooms.get(joined.room.code)!;
    expect(room.sim.state.heroes[0].bot).toBeUndefined();
    expect(room.sim.state.heroes.slice(1).every((h) => h.bot)).toBe(true);
  });

  it('Beitreten per Code übernimmt einen Bot samt Fortschritt; Verlassen gibt ihn dem Bot zurück', () => {
    const { lobby, player } = setup();
    const host = player();
    host.send({ t: 'create', heroes: ['rotschopf'], difficulty: 'mittel', name: 'Anna' });
    const code = host.last('joined')!.room.code;
    const room = lobby.rooms.get(code)!;
    room.sim.state.heroes[2].gold = 999;

    const guest = player();
    guest.send({ t: 'info', room: code.toLowerCase() });
    expect(guest.last('info')!.room.slots[2].human).toBe(false);
    guest.send({ t: 'join', room: code, slot: 2, name: 'Ben' });
    const joined = guest.last('joined')!;
    expect(joined.heroId).toBe(room.sim.state.heroes[2].id);
    expect(room.sim.state.heroes[2].bot).toBeUndefined();
    expect(room.sim.state.heroes[2].gold).toBe(999);
    expect(host.last('room')!.room.slots[2]).toMatchObject({ human: true, name: 'Ben' });

    // Besetzter Platz
    const third = player();
    third.send({ t: 'join', room: code, slot: 2, name: 'Cem' });
    expect(third.last('error')!.msg).toMatch(/besetzt/);

    lobby.disconnect(guest.client as Client);
    expect(room.sim.state.heroes[2].bot).toBeDefined();
    expect(host.last('room')!.room.slots[2].human).toBe(false);
  });

  it('Befehle steuern nur den eigenen Helden; jeder Tick schickt einen Schnappschuss', () => {
    const { lobby, player } = setup();
    const host = player();
    host.send({ t: 'create', heroes: ['gaertnerin'], difficulty: 'mittel', name: 'Anna' });
    const room = lobby.rooms.get(host.last('joined')!.room.code)!;
    const h = room.sim.state.heroes[0];
    const start = { ...h.pos };
    host.send({ t: 'cmd', cmd: { type: 'input', move: { x: 1, y: 0 }, aim: { x: 50, y: 20 }, attack: false } });
    // Versuch, einen fremden Helden zu steuern: heroId wird ignoriert
    host.send({ t: 'cmd', cmd: { heroId: room.sim.state.heroes[1].id, type: 'startWave' } });
    for (let i = 0; i < 10; i++) lobby.tick();
    expect(h.pos.x).toBeGreaterThan(start.x + 1);
    const state = host.last('state')!;
    expect(state.s.heroes).toHaveLength(4);
    expect(state.s.tick).toBe(room.sim.state.tick);
  });

  it('ein Ping kommt bei allen Spielern im Raum an', () => {
    const { lobby, player } = setup();
    const host = player();
    host.send({ t: 'create', heroes: ['rotschopf'], difficulty: 'mittel', name: 'Anna' });
    const code = host.last('joined')!.room.code;
    const guest = player();
    guest.send({ t: 'join', room: code, slot: 1, name: 'Ben' });
    guest.send({ t: 'cmd', cmd: { type: 'ping', kind: 'attack', pos: { x: 12, y: 34 } } });
    lobby.tick();
    const guestId = guest.last('joined')!.heroId;
    for (const p of [host, guest]) {
      expect(p.last('state')!.s.events).toContainEqual({ type: 'ping', heroId: guestId, kind: 'attack', pos: { x: 12, y: 34 } });
    }
  });

  it('leere Räume stehen still und werden nach 5 Minuten geschlossen', () => {
    const { lobby, player, advance } = setup();
    const host = player();
    host.send({ t: 'create', heroes: ['pirat'], difficulty: 'leicht', name: 'Anna' });
    const code = host.last('joined')!.room.code;
    const room = lobby.rooms.get(code)!;
    lobby.disconnect(host.client as Client);
    const tick = room.sim.state.tick;
    lobby.tick();
    expect(room.sim.state.tick).toBe(tick);
    advance(5 * 60 * 1000 + 1);
    lobby.tick();
    expect(lobby.rooms.has(code)).toBe(false);
  });
});

describe('Netzprotokoll', () => {
  it('Schnappschuss: Zombies kompakt, Zustände und Merkmale bleiben erhalten, deutlich kleiner', () => {
    const sim = new Simulation(gameData, { seed: 1, heroes: ['rotschopf', 'pirat'], bots: [null, 'mittel'] });
    for (let i = 0; i < 20 * 40; i++) sim.step();
    const z = sim.state.zombies[0];
    z.st.sleepUntil = sim.state.time + 3;
    const text = encodeSnapshot(sim.state, [{ type: 'waveStart', number: 1 }], ZOMBIE_TYPES);
    expect(text.length).toBeLessThan(JSON.stringify(sim.state).length / 2);
    const msg = JSON.parse(text) as Extract<ServerMessage, { t: 'state' }>;
    const radius = (id: string) => gameData.zombies.find((d) => d.id === id)!.radius;
    const state = decodeSnapshot(msg.s, ZOMBIE_TYPES, radius);
    const back = state.zombies.find((x) => x.id === z.id)!;
    expect(back.defId).toBe(z.defId);
    expect(back.pos.x).toBeCloseTo(z.pos.x, 1);
    expect(back.hp).toBe(Math.ceil(z.hp));
    expect(state.time < back.st.sleepUntil).toBe(true);
    expect(!!back.neutral).toBe(!!z.neutral);
    expect(state.events).toEqual([{ type: 'waveStart', number: 1 }]);
    expect(state.wave.queue).toHaveLength(sim.state.wave.queue.length);
    // Bot-Gehirne bleiben auf dem Server
    expect(JSON.stringify(state.heroes[1].bot)).toBe(JSON.stringify({ difficulty: 'mittel' }));
  });
});
