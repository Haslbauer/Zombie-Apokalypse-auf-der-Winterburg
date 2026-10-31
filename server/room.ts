import { gameData } from '../src/gameData';
import { encodeSnapshot, type ClientCommand, type RoomInfo } from '../src/net/protocol';
import { createBot } from '../src/sim/bots/brain';
import { Simulation } from '../src/sim/game';
import type { BotDifficulty, Command, GameEvent } from '../src/sim/types';
import { DT } from '../src/sim/types';

/** Verbindung eines Spielers, unabhängig vom Transport (WebSocket im Betrieb, Attrappe im Test). */
export interface Player {
  name: string;
  send(data: string): void;
}

/** Zombie-Typen in fester Reihenfolge für die kompakte Übertragung. */
export const ZOMBIE_TYPES = gameData.zombies.map((z) => z.id);

/**
 * Ein Raum mit vier Heldenplätzen. Die Simulation läuft hier; freie Plätze
 * steuern Bots. Ein Mensch übernimmt einen Bot-Platz samt Level, Gold und
 * Items; verlässt er den Raum, übernimmt wieder ein Bot.
 */
export class Room {
  sim!: Simulation;
  /** Spieler je Heldenplatz (null = Bot). */
  readonly players: (Player | null)[];
  /** Letzte Eingabe und einmalige Befehle je Platz bis zum nächsten Tick. */
  private readonly commands: Command[][];
  private readonly inputs: (Command | null)[];
  private events: GameEvent[] = [];
  /** Zeitpunkt, seit dem niemand mehr im Raum ist (zum Aufräumen). */
  emptySince: number | null = null;

  constructor(
    readonly code: string,
    readonly heroes: string[],
    readonly difficulty: BotDifficulty,
  ) {
    this.players = heroes.map(() => null);
    this.commands = heroes.map(() => []);
    this.inputs = heroes.map(() => null);
    this.restart();
  }

  /** Neue Partie mit denselben Helden; Menschen behalten ihre Plätze. */
  restart(): void {
    this.sim = new Simulation(gameData, {
      seed: (Math.random() * 2 ** 31) | 0,
      heroes: this.heroes,
      bots: this.heroes.map((_, i) => (this.players[i] ? null : this.difficulty)),
    });
    this.events = [];
    this.inputs.fill(null);
    for (const c of this.commands) c.length = 0;
  }

  info(): RoomInfo {
    return {
      code: this.code,
      difficulty: this.difficulty,
      slots: this.sim.state.heroes.map((h, i) => ({ heroId: h.id, defId: h.defId, human: this.players[i] !== null, name: this.players[i]?.name ?? null })),
    };
  }

  /** Menschen im Raum. */
  get humans(): Player[] {
    return this.players.filter((p): p is Player => p !== null);
  }

  /** Spieler übernimmt einen Bot-Platz. Gibt die Helden-Id zurück oder einen Fehlertext. */
  join(player: Player, slot: number): number | string {
    const hero = this.sim.state.heroes[slot];
    if (!hero) return 'Diesen Platz gibt es nicht';
    if (this.players[slot]) return 'Der Platz ist schon besetzt';
    this.players[slot] = player;
    hero.bot = undefined;
    hero.input = { move: { x: 0, y: 0 }, aim: hero.input.aim, attack: false };
    this.emptySince = null;
    return hero.id;
  }

  /** Spieler geht: Ein Bot übernimmt seinen Helden. */
  leave(player: Player, now: number): void {
    const slot = this.players.indexOf(player);
    if (slot < 0) return;
    this.players[slot] = null;
    this.inputs[slot] = null;
    this.commands[slot].length = 0;
    const hero = this.sim.state.heroes[slot];
    hero.bot = createBot(this.sim, this.difficulty, slot);
    hero.input = { move: { x: 0, y: 0 }, aim: hero.input.aim, attack: false };
    if (this.humans.length === 0) this.emptySince = now;
    this.broadcastRoom();
  }

  /** Befehl eines Spielers; die Eingabe (WASD, Maus) gilt bis zur nächsten. */
  command(player: Player, cmd: ClientCommand): void {
    const slot = this.players.indexOf(player);
    if (slot < 0) return;
    const full = { ...cmd, heroId: this.sim.state.heroes[slot].id } as Command;
    if (full.type === 'input') this.inputs[slot] = full;
    else if (this.commands[slot].length < 20) this.commands[slot].push(full);
  }

  /** Ein Tick: Befehle anwenden, simulieren, Zustand verschicken. */
  tick(): void {
    // Leerer Raum: Spiel steht still, bis wieder jemand da ist
    if (this.humans.length === 0) return;
    const cmds: Command[] = [];
    this.players.forEach((p, i) => {
      if (!p) return;
      const input = this.inputs[i];
      if (input) cmds.push(input);
      cmds.push(...this.commands[i]);
      this.commands[i].length = 0;
    });
    this.sim.step(cmds);
    this.events.push(...this.sim.state.events);
    const data = encodeSnapshot(this.sim.state, this.events, ZOMBIE_TYPES);
    this.events = [];
    for (const p of this.humans) p.send(data);
  }

  broadcastRoom(): void {
    const data = JSON.stringify({ t: 'room', room: this.info() });
    for (const p of this.humans) p.send(data);
  }
}

/** Sekunden pro Tick (für die Server-Schleife). */
export const TICK_MS = DT * 1000;
