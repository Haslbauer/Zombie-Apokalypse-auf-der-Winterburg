import { describe, expect, it } from 'vitest';
import { Lobby, RATE_LIMIT, type Client } from '../../server/lobby';
import { BACKPRESSURE_BYTES, RESERVE_MS, ZOMBIE_TYPES } from '../../server/room';
import { gameData } from '../../src/gameData';
import { decodeSnapshot, encodeSnapshot, MAX_CLIENT_MESSAGE, parseClientMessage, type ServerMessage } from '../../src/net/protocol';
import { Simulation } from '../../src/sim/game';

/** Lobby mit Spielern, die ihre Nachrichten sammeln; die Uhr wird von Hand gestellt. */
function setup() {
  let now = 1_000_000;
  const lobby = new Lobby({ now: () => now });
  const player = () => {
    const inbox: ServerMessage[] = [];
    const io = { buffered: 0, closed: false };
    const client = lobby.connect(
      (d) => inbox.push(JSON.parse(d)),
      () => io.buffered,
      () => (io.closed = true),
    );
    const send = (m: object) => lobby.message(client, JSON.stringify(m));
    const last = <T extends ServerMessage['t']>(t: T) => [...inbox].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined;
    const all = <T extends ServerMessage['t']>(t: T) => inbox.filter((m) => m.t === t) as Extract<ServerMessage, { t: T }>[];
    return { client, inbox, io, send, last, all };
  };
  const advance = (ms: number) => (now += ms);
  return { lobby, player, advance };
}

/** Host erstellt einen Raum, Gast tritt auf Platz 1 bei. */
function twoPlayers() {
  const t = setup();
  const host = t.player();
  host.send({ t: 'create', heroes: ['rotschopf'], difficulty: 'mittel', name: 'Anna' });
  const code = host.last('joined')!.room.code;
  const guest = t.player();
  guest.send({ t: 'join', room: code, slot: 1, name: 'Ben' });
  return { ...t, host, guest, code, room: t.lobby.rooms.get(code)! };
}

describe('Server: Räume', () => {
  it('Raum erstellen: Host steuert Platz 0, die übrigen drei Plätze Bots', () => {
    const { lobby, player } = setup();
    const host = player();
    host.send({ t: 'create', heroes: ['rotschopf'], difficulty: 'schwer', name: 'Anna' });
    const joined = host.last('joined')!;
    expect(joined.room.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(joined.token).toMatch(/^[0-9a-f]{32}$/);
    expect(joined.room.slots).toHaveLength(4);
    expect(joined.room.slots[0]).toMatchObject({ defId: 'rotschopf', human: true, name: 'Anna' });
    expect(joined.room.slots.slice(1).every((s) => !s.human)).toBe(true);
    const room = lobby.rooms.get(joined.room.code)!;
    expect(room.sim.state.heroes[0].bot).toBeUndefined();
    expect(room.sim.state.heroes.slice(1).every((h) => h.bot)).toBe(true);
  });

  it('Beitreten übernimmt einen Bot samt Fortschritt; bewusst gehen gibt ihn dem Bot zurück', () => {
    const { player, host, guest, code, room, lobby } = twoPlayers();
    expect(guest.last('joined')!.heroId).toBe(room.sim.state.heroes[1].id);
    expect(room.sim.state.heroes[1].bot).toBeUndefined();
    expect(host.last('room')!.room.slots[1]).toMatchObject({ human: true, name: 'Ben' });
    // Besetzter Platz
    const third = player();
    third.send({ t: 'join', room: code, slot: 1, name: 'Cem' });
    expect(third.last('error')!.msg).toMatch(/besetzt/);
    // Gast erstellt einen eigenen Raum: alter Platz wird nicht reserviert
    guest.send({ t: 'create', heroes: ['pirat'], difficulty: 'mittel', name: 'Ben' });
    expect(room.sim.state.heroes[1].bot).toBeDefined();
    expect(host.last('room')!.room.slots[1]).toMatchObject({ human: false, reserved: false });
    expect(lobby.rooms.size).toBe(2);
  });

  it('Verbindungsabbruch: Bot übernimmt, Platz bleibt reserviert, mit Token zurück auf denselben Helden', () => {
    const { lobby, player, advance, host, guest, code, room } = twoPlayers();
    const token = guest.last('joined')!.token;
    room.sim.state.heroes[1].gold = 777;
    lobby.disconnect(guest.client as Client);
    expect(room.sim.state.heroes[1].bot).toBeDefined();
    expect(host.last('room')!.room.slots[1]).toMatchObject({ human: false, reserved: true, name: 'Ben' });

    // Fremde dürfen den reservierten Platz nicht nehmen, und ein falsches Token hilft nicht
    const other = player();
    other.send({ t: 'join', room: code, slot: 1, name: 'Cem' });
    expect(other.last('error')!.msg).toMatch(/reserviert/);
    other.send({ t: 'resume', room: code, token: 'falsch', name: 'Cem' });
    expect(other.last('error')).toBeDefined();
    expect(other.last('joined')).toBeUndefined();

    // Zurück mit dem Token (neue Verbindung)
    advance(30_000);
    const back = player();
    back.send({ t: 'resume', room: code, token, name: '' });
    const joined = back.last('joined')!;
    expect(joined.heroId).toBe(room.sim.state.heroes[1].id);
    expect(joined.token).toBe(token);
    expect(room.sim.state.heroes[1].bot).toBeUndefined();
    expect(room.sim.state.heroes[1].gold).toBe(777);
    // Ohne Namen (z. B. nach dem Neuladen) bleibt der bisherige
    expect(joined.room.slots[1].name).toBe('Ben');

    // Nach Ablauf der Reservierung ist der Platz wieder frei
    lobby.disconnect(back.client as Client);
    advance(RESERVE_MS + 1);
    other.send({ t: 'join', room: code, slot: 1, name: 'Cem' });
    expect(other.last('joined')).toBeDefined();
  });

  it('Eingaben: genau eine pro Tick in Reihenfolge, Bestätigung (ack) im Zustand, nur der eigene Held', () => {
    const { lobby, host, room } = twoPlayers();
    const h = room.sim.state.heroes[0];
    const start = { ...h.pos };
    for (let seq = 1; seq <= 4; seq++) host.send({ t: 'input', seq, move: { x: 1, y: 0 }, aim: { x: 50, y: 20 }, attack: false });
    // Doppelte bzw. alte Nummern werden ignoriert
    host.send({ t: 'input', seq: 2, move: { x: -1, y: 0 }, aim: { x: 0, y: 0 }, attack: false });
    lobby.tick();
    expect(host.last('state')!.ack).toBe(1);
    lobby.tick();
    lobby.tick();
    lobby.tick();
    expect(host.last('state')!.ack).toBe(4);
    const moved = h.pos.x - start.x;
    expect(moved).toBeGreaterThan(0);
    // Keine neue Eingabe: die letzte gilt weiter, ack bleibt
    lobby.tick();
    expect(h.pos.x - start.x).toBeGreaterThan(moved);
    expect(host.last('state')!.ack).toBe(4);
    // heroId im Befehl wird ignoriert: Der Server setzt immer den eigenen Helden ein
    host.send({ t: 'cmd', cmd: { heroId: room.sim.state.heroes[2].id, type: 'ping', kind: 'help', pos: { x: 1, y: 2 } } });
    lobby.tick();
    expect(host.last('state')!.s.events).toContainEqual(expect.objectContaining({ type: 'ping', heroId: h.id }));
  });

  it('volle Leitung: Zustände werden ausgelassen, Ereignisse kommen trotzdem alle an', () => {
    const { lobby, host, guest } = twoPlayers();
    guest.io.buffered = BACKPRESSURE_BYTES + 1;
    host.send({ t: 'cmd', cmd: { type: 'ping', kind: 'danger', pos: { x: 5, y: 5 } } });
    lobby.tick();
    lobby.tick();
    const before = guest.all('state').length;
    host.send({ t: 'cmd', cmd: { type: 'ping', kind: 'omw', pos: { x: 6, y: 6 } } });
    lobby.tick();
    expect(guest.all('state').length).toBe(before);
    guest.io.buffered = 0;
    lobby.tick();
    // Nur die Pings des Gastgebers (Bots antworten auf „Bin unterwegs“ mit eigenen Pings)
    const pings = guest.last('state')!.s.events.filter((e) => e.type === 'ping') as { heroId: number; kind: string }[];
    const events = pings.filter((e) => e.heroId === pings[0].heroId);
    expect(events.map((e) => e.kind)).toEqual(['danger', 'omw']);
    expect(host.all('state').length).toBe(4);
  });

  it('Rate-Limit: zu viele Nachrichten werden ignoriert, grober Missbrauch trennt', () => {
    const { host, guest, advance } = twoPlayers();
    for (let i = 0; i < RATE_LIMIT + 10; i++) host.send({ t: 'ping', ts: i });
    expect(host.all('pong').length).toBe(RATE_LIMIT - 1); // eine Nachricht (create) zählt schon
    advance(1000);
    host.send({ t: 'ping', ts: 1 });
    expect(host.last('pong')!.ts).toBe(1);
    for (let i = 0; i < RATE_LIMIT * 5; i++) guest.send({ t: 'ping', ts: i });
    expect(guest.io.closed).toBe(true);
  });

  it('nachgeschickte Eingaben nach einem Ruckler führen nicht zur Trennung', () => {
    const { host } = twoPlayers();
    // Ruckler: 10 Eingaben auf einmal, das mehrere Male in einer Sekunde, plus normale Nachrichten
    let seq = 0;
    for (let burst = 0; burst < 30; burst++) for (let i = 0; i < 10; i++) host.send({ t: 'input', seq: ++seq, move: { x: 1, y: 0 }, aim: { x: 0, y: 0 }, attack: false });
    for (let i = 0; i < 20; i++) host.send({ t: 'ping', ts: i });
    expect(host.io.closed).toBe(false);
    expect(host.last('pong')).toBeTruthy();
  });

  it('Schnappschuss ohne selten wechselnde Felder: Client übernimmt sie vom letzten Zustand', () => {
    const sim = new Simulation(gameData, { seed: 1, heroes: ['rotschopf', 'pirat'], bots: [null, 'mittel'] });
    for (let i = 0; i < 20 * 10; i++) sim.step();
    sim.state.heroes[0].inventory[0] = 'laufschuhe';
    const radius = (id: string) => gameData.zombies.find((d) => d.id === id)!.radius;
    const full = decodeSnapshot(JSON.parse(encodeSnapshot(sim.state, [], ZOMBIE_TYPES, true)), ZOMBIE_TYPES, radius);
    sim.step();
    const partialText = encodeSnapshot(sim.state, [], ZOMBIE_TYPES, false);
    expect(partialText.length).toBeLessThan(encodeSnapshot(sim.state, [], ZOMBIE_TYPES, true).length);
    expect(partialText).not.toContain('laufschuhe');
    const next = decodeSnapshot(JSON.parse(partialText), ZOMBIE_TYPES, radius, full);
    expect(next.heroes[0].inventory[0]).toBe('laufschuhe');
    expect(next.heroes[0].level).toBe(sim.state.heroes[0].level);
    expect(next.heroes[0].pos.x).toBeCloseTo(sim.state.heroes[0].pos.x, 1);
    expect(next.objectives[0].maxHp).toBe(sim.state.objectives[0].maxHp);
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
    const radius = (id: string) => gameData.zombies.find((d) => d.id === id)!.radius;
    const state = decodeSnapshot(JSON.parse(text), ZOMBIE_TYPES, radius);
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

  it('Prüfung eingehender Nachrichten: Unsinn, falsche Typen und zu Großes werden verworfen', () => {
    expect(parseClientMessage('kein json')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'hack' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'input', seq: 1, move: { x: 'a', y: 0 }, aim: { x: 0, y: 0 } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'input', seq: -1, move: { x: 1, y: 0 }, aim: { x: 0, y: 0 } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { type: 'cast', slot: 9, aim: { x: 0, y: 0 } } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { type: 'ping', kind: 'boom', pos: { x: 0, y: 0 } } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'join', room: 'ABCD', slot: 7, name: 'x' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'ping', ts: 1, pad: 'x'.repeat(MAX_CLIENT_MESSAGE) }))).toBeNull();
    // Gültiges kommt bereinigt durch (fremde Felder fallen weg)
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { type: 'cast', slot: 2, aim: { x: 1, y: 2 }, heroId: 99, extra: 1 } }))).toEqual({
      t: 'cmd',
      cmd: { type: 'cast', slot: 2, aim: { x: 1, y: 2 } },
    });
    expect(parseClientMessage(JSON.stringify({ t: 'input', seq: 3, move: { x: 1, y: 0 }, aim: { x: 2, y: 2 }, attack: 'ja' }))).toEqual({
      t: 'input',
      seq: 3,
      move: { x: 1, y: 0 },
      aim: { x: 2, y: 2 },
      attack: false,
    });
  });
});
