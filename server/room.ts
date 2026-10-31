import { randomBytes } from 'node:crypto';
import { gameData } from '../src/gameData';
import { encodeSnapshot, stateMessage, type ClientCommand, type RoomInfo } from '../src/net/protocol';
import { createBot } from '../src/sim/bots/brain';
import { Simulation } from '../src/sim/game';
import type { BotDifficulty, Command, GameEvent, HeroInput } from '../src/sim/types';
import { DT } from '../src/sim/types';

/** Verbindung eines Spielers, unabhängig vom Transport (WebSocket im Betrieb, Attrappe im Test). */
export interface Player {
  name: string;
  send(data: string): void;
  /** Noch nicht abgeschickte Bytes (voller Sendepuffer = langsame Leitung). */
  buffered(): number;
}

/** Zombie-Typen in fester Reihenfolge für die kompakte Übertragung. */
export const ZOMBIE_TYPES = gameData.zombies.map((z) => z.id);
/** Ab so vielen wartenden Bytes bekommt ein Spieler keinen neuen Zustand, bis sein Puffer leerer ist. */
export const BACKPRESSURE_BYTES = 256 * 1024;
/** So lange bleibt der Platz eines Spielers nach einem Verbindungsabbruch für ihn reserviert (ms). */
export const RESERVE_MS = 2 * 60 * 1000;
/** Mehr wartende Eingaben werden verworfen (die ältesten), damit die Verzögerung nicht wächst. */
const MAX_QUEUED_INPUTS = 6;

/** Ein Heldenplatz: Spieler (oder Bot), Token zum Wiederverbinden, Eingaben, Rückstau. */
interface Slot {
  player: Player | null;
  token: string | null;
  /** Reserviert bis (ms) nach einem Verbindungsabbruch; null = frei bzw. besetzt. */
  reservedUntil: number | null;
  name: string | null;
  inputs: { seq: number; input: HeroInput }[];
  /** Zuletzt angewendete Eingabe (gilt weiter, wenn keine neue da ist) und ihre Nummer. */
  last: HeroInput | null;
  ack: number;
  commands: Command[];
  /** Ereignisse, die dieser Spieler wegen voller Leitung noch nicht bekommen hat. */
  backlog: GameEvent[];
}

/**
 * Ein Raum mit vier Heldenplätzen. Die Simulation läuft hier; freie Plätze
 * steuern Bots. Ein Mensch übernimmt einen Bot-Platz samt Level, Gold und
 * Items; verlässt er den Raum, übernimmt wieder ein Bot. Bei einem
 * Verbindungsabbruch bleibt der Platz für ihn reserviert.
 */
export class Room {
  sim!: Simulation;
  private readonly slots: Slot[];
  /** Zeitpunkt, seit dem niemand mehr im Raum ist (zum Aufräumen). */
  emptySince: number | null = null;

  constructor(
    readonly code: string,
    readonly heroes: string[],
    readonly difficulty: BotDifficulty,
  ) {
    this.slots = heroes.map(() => ({ player: null, token: null, reservedUntil: null, name: null, inputs: [], last: null, ack: 0, commands: [], backlog: [] }));
    this.restart();
  }

  /** Neue Partie mit denselben Helden; Menschen behalten ihre Plätze. */
  restart(): void {
    this.sim = new Simulation(gameData, {
      seed: (Math.random() * 2 ** 31) | 0,
      heroes: this.heroes,
      bots: this.slots.map((s) => (s.player ? null : this.difficulty)),
    });
    for (const s of this.slots) {
      s.inputs = [];
      s.last = null;
      s.commands = [];
      s.backlog = [];
    }
  }

  info(now = Date.now()): RoomInfo {
    return {
      code: this.code,
      difficulty: this.difficulty,
      slots: this.sim.state.heroes.map((h, i) => {
        const s = this.slots[i];
        const reserved = !s.player && s.reservedUntil !== null && now < s.reservedUntil;
        return { heroId: h.id, defId: h.defId, human: s.player !== null, reserved, name: s.player || reserved ? s.name : null };
      }),
    };
  }

  /** Menschen im Raum. */
  get humans(): Player[] {
    return this.slots.flatMap((s) => (s.player ? [s.player] : []));
  }

  slotOf(player: Player): number {
    return this.slots.findIndex((s) => s.player === player);
  }

  /**
   * Spieler übernimmt einen Bot-Platz (token: zum Wiederverbinden, sonst neu).
   * Gibt Helden-Id und Token zurück oder einen Fehlertext.
   */
  join(player: Player, slot: number, now: number, token?: string): { heroId: number; token: string } | string {
    const hero = this.sim.state.heroes[slot];
    const s = this.slots[slot];
    if (!hero || !s) return 'Diesen Platz gibt es nicht';
    if (s.player) return 'Der Platz ist schon besetzt';
    const reserved = s.reservedUntil !== null && now < s.reservedUntil;
    if (reserved && token !== s.token) return 'Der Platz ist für einen Spieler reserviert, der gleich zurückkommt';
    // Beim Wiederverbinden ohne Namen den bisherigen behalten
    if (token && token === s.token && s.name && /^Spieler \d$/.test(player.name)) player.name = s.name;
    s.player = player;
    s.name = player.name;
    s.token = token && token === s.token ? token : randomBytes(16).toString('hex');
    s.reservedUntil = null;
    s.inputs = [];
    s.last = null;
    s.ack = 0;
    s.commands = [];
    s.backlog = [];
    hero.bot = undefined;
    hero.input = { move: { x: 0, y: 0 }, aim: hero.input.aim, attack: false };
    this.emptySince = null;
    return { heroId: hero.id, token: s.token };
  }

  /** Mit Token zurückkommen: den Platz finden, der zu diesem Token gehört (−1: keiner). */
  slotForToken(token: string): number {
    return this.slots.findIndex((s) => s.token === token);
  }

  /**
   * Spieler geht: Ein Bot übernimmt seinen Helden. Bei einem Abbruch
   * (keep = true) bleibt der Platz für sein Token reserviert.
   */
  leave(player: Player, now: number, keep = false): void {
    const slot = this.slotOf(player);
    if (slot < 0) return;
    const s = this.slots[slot];
    s.player = null;
    s.inputs = [];
    s.last = null;
    s.commands = [];
    s.backlog = [];
    s.reservedUntil = keep ? now + RESERVE_MS : null;
    if (!keep) s.token = null;
    const hero = this.sim.state.heroes[slot];
    hero.bot = createBot(this.sim, this.difficulty, slot);
    hero.input = { move: { x: 0, y: 0 }, aim: hero.input.aim, attack: false };
    if (this.humans.length === 0) this.emptySince = now;
    this.broadcastRoom(now);
  }

  /** Eingabe für einen Tick; sie wird genau einmal angewendet, in der Reihenfolge der Nummern. */
  input(player: Player, seq: number, input: HeroInput): void {
    const s = this.slots[this.slotOf(player)];
    if (!s || seq <= s.ack || s.inputs.some((i) => i.seq >= seq)) return;
    s.inputs.push({ seq, input });
    if (s.inputs.length > MAX_QUEUED_INPUTS) s.inputs.splice(0, s.inputs.length - MAX_QUEUED_INPUTS);
  }

  /** Einmaliger Befehl (Fähigkeit, Kauf, Ping …). */
  command(player: Player, cmd: ClientCommand): void {
    const slot = this.slotOf(player);
    if (slot < 0) return;
    const s = this.slots[slot];
    if (s.commands.length < 20) s.commands.push({ ...cmd, heroId: this.sim.state.heroes[slot].id } as Command);
  }

  /** Ein Tick: Eingaben und Befehle anwenden, simulieren, Zustand verschicken. */
  tick(): void {
    // Leerer Raum: Spiel steht still, bis wieder jemand da ist
    if (this.humans.length === 0) return;
    const cmds: Command[] = [];
    this.slots.forEach((s, i) => {
      if (!s.player) return;
      // Pro Tick genau eine Eingabe; fehlt eine (Netz-Ruckler), gilt die letzte weiter
      const next = s.inputs.shift();
      if (next) {
        s.last = next.input;
        s.ack = next.seq;
      }
      const heroId = this.sim.state.heroes[i].id;
      if (s.last) cmds.push({ heroId, type: 'input', ...s.last });
      cmds.push(...s.commands);
      s.commands = [];
    });
    this.sim.step(cmds);
    const events = this.sim.state.events;
    // Ein Schnappschuss für alle; nur wer einen Rückstau hat, bekommt einen eigenen
    let shared: string | null = null;
    for (const s of this.slots) {
      if (!s.player) continue;
      if (s.player.buffered() > BACKPRESSURE_BYTES) {
        // Leitung voll: Zustand auslassen (der nächste ist vollständig), Ereignisse aufheben
        s.backlog.push(...events);
        continue;
      }
      let json: string;
      if (s.backlog.length > 0) {
        json = encodeSnapshot(this.sim.state, [...s.backlog, ...events], ZOMBIE_TYPES);
        s.backlog = [];
      } else json = shared ??= encodeSnapshot(this.sim.state, events, ZOMBIE_TYPES);
      s.player.send(stateMessage(json, s.ack));
    }
  }

  broadcastRoom(now = Date.now()): void {
    const data = JSON.stringify({ t: 'room', room: this.info(now) });
    for (const p of this.humans) p.send(data);
  }
}

/** Millisekunden pro Tick (für die Server-Schleife). */
export const TICK_MS = DT * 1000;
