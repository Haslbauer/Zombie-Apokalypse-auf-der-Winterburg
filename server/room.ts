import { randomBytes } from 'node:crypto';
import { gameData } from '../src/gameData';
import { encodeSnapshot, slowKey, stateMessage, type ClientCommand, type RoomInfo } from '../src/net/protocol';
import { createBot } from '../src/sim/bots/brain';
import { defaultTeam, fillTeam } from '../src/sim/bots/team';
import { validSpells } from '../src/sim/spells';
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
/** Spätestens alle so viele Ticks ein vollständiger Schnappschuss (1 s). */
const FULL_EVERY = 20;
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
  /** Nächster Schnappschuss muss vollständig sein (neu beigetreten, Zustände ausgelassen). */
  needFull?: boolean;
  /** Lobby: gewählter Held (null = noch keiner), Zauber, bereit. */
  pick: string | null;
  spells: [string, string] | null;
  ready: boolean;
}

/** So lange läuft der Countdown, wenn alle bereit sind (ms). */
export const LOBBY_COUNTDOWN_MS = 15_000;

/**
 * Ein Raum mit vier Heldenplätzen. Die Simulation läuft hier; freie Plätze
 * steuern Bots. Ein Mensch übernimmt einen Bot-Platz samt Level, Gold und
 * Items; verlässt er den Raum, übernimmt wieder ein Bot. Bei einem
 * Verbindungsabbruch bleibt der Platz für ihn reserviert.
 */
export class Room {
  sim!: Simulation;
  private readonly slots: Slot[];
  /** Lobby (Sammeln, Heldenwahl, Bereit) oder laufendes Spiel. */
  phase: 'lobby' | 'playing' = 'lobby';
  /** Countdown bis zum Start (ms-Zeitstempel), null = warten, bis alle bereit sind. */
  startsAt: number | null = null;
  /** Bot-Stärke (der Gastgeber kann sie in der Lobby ändern). */
  difficulty: BotDifficulty;
  /** Zeitpunkt, seit dem niemand mehr im Raum ist (zum Aufräumen). */
  emptySince: number | null = null;
  /** Selten wechselnde Daten im letzten Schnappschuss (siehe slowKey). */
  private lastSlowKey = '';

  constructor(
    readonly code: string,
    /** Wunsch-Team des Gastgebers (sein Held zuerst); füllt beim Start freie Plätze. */
    public heroes: string[],
    difficulty: BotDifficulty,
    /** true: sofort spielen (ohne Lobby, z. B. Tests und alte Clients). */
    skipLobby = false,
  ) {
    this.difficulty = difficulty;
    this.slots = [0, 1, 2, 3].map(() => ({ player: null, token: null, reservedUntil: null, name: null, inputs: [], last: null, ack: 0, commands: [], backlog: [], pick: null, spells: null, ready: false }));
    this.slots.forEach((s, i) => (s.pick = skipLobby ? (heroes[i] ?? null) : null));
    this.newSim();
    if (skipLobby) this.phase = 'playing';
  }

  /** Neue Partie: zurück in die Lobby, alle bleiben im Raum, „bereit“ wird zurückgesetzt. */
  restart(now = Date.now()): void {
    this.phase = 'lobby';
    this.startsAt = null;
    for (const s of this.slots) s.ready = false;
    this.broadcastRoom(now);
  }

  /**
   * Helden der Partie: gewählte Helden auf ihren Plätzen, freie Plätze mit dem
   * Wunsch-Team des Gastgebers bzw. passenden Rollen auffüllen (keine doppelten).
   */
  private team(): string[] {
    const picks = this.slots.map((s) => s.pick).filter((h): h is string => !!h);
    const pool = [...this.heroes, ...defaultTeam(gameData.bots, this.heroes[0] ?? null), ...gameData.heroes.map((h) => h.id)].filter((id) => !picks.includes(id));
    // Bots füllen zuerst die Rollen, die den Menschen fehlen (Tank, Schaden, Support)
    const extra = fillTeam(gameData.bots, picks, pool, this.slots.length).slice(picks.length);
    return this.slots.map((s) => s.pick ?? extra.shift()!);
  }

  private newSim(): void {
    this.sim = new Simulation(gameData, {
      seed: (Math.random() * 2 ** 31) | 0,
      heroes: this.team(),
      bots: this.slots.map((s) => (s.player ? null : this.difficulty)),
      spells: this.slots.map((s) => (s.player ? s.spells : null)),
    });
    for (const s of this.slots) {
      s.inputs = [];
      s.last = null;
      s.commands = [];
      s.backlog = [];
      s.needFull = true;
    }
  }

  info(now = Date.now()): RoomInfo {
    const lobby = this.phase === 'lobby';
    return {
      code: this.code,
      difficulty: this.difficulty,
      phase: this.phase,
      startsIn: lobby && this.startsAt !== null ? Math.max(0, (this.startsAt - now) / 1000) : null,
      slots: this.slots.map((s, i) => {
        const h = this.sim.state.heroes[i];
        const reserved = !s.player && s.reservedUntil !== null && now < s.reservedUntil;
        return {
          heroId: lobby ? -1 : h.id,
          defId: lobby ? (s.player || reserved ? (s.pick ?? '') : '') : h.defId,
          human: s.player !== null,
          reserved,
          name: s.player || reserved ? s.name : null,
          ready: s.ready,
          spells: s.spells,
        };
      }),
    };
  }

  /** Lobby: Held wählen (nur, wenn ihn kein anderer Mensch hat). */
  pick(player: Player, heroId: string, now: number): string | null {
    const s = this.slots[this.slotOf(player)];
    if (!s || this.phase !== 'lobby') return 'Die Heldenwahl ist nur in der Lobby möglich';
    if (!gameData.heroes.some((h) => h.id === heroId)) return 'Unbekannter Held';
    if (this.slots.some((o) => o !== s && o.pick === heroId && (o.player || o.reservedUntil !== null))) return 'Diesen Helden hat schon jemand gewählt';
    s.pick = heroId;
    this.updateCountdown(now);
    this.broadcastRoom(now);
    return null;
  }

  /** Lobby: Beschwörerzauber wählen. */
  chooseSpells(player: Player, spells: [string, string], now: number): void {
    const s = this.slots[this.slotOf(player)];
    if (!s || !validSpells(this.sim, spells)) return;
    s.spells = [spells[0], spells[1]];
    this.broadcastRoom(now);
  }

  /** Lobby: bereit melden (nur mit gewähltem Helden). */
  setReady(player: Player, ready: boolean, now: number): string | null {
    const s = this.slots[this.slotOf(player)];
    if (!s || this.phase !== 'lobby') return null;
    if (ready && !s.pick) return 'Wähle zuerst einen Helden';
    s.ready = ready;
    this.updateCountdown(now);
    this.broadcastRoom(now);
    return null;
  }

  /** Bot-Stärke (nur der Gastgeber auf Platz 0, nur in der Lobby). */
  setDifficulty(player: Player, difficulty: BotDifficulty, now: number): void {
    if (this.phase !== 'lobby' || this.slotOf(player) !== 0) return;
    this.difficulty = difficulty;
    this.broadcastRoom(now);
  }

  /** Countdown starten, wenn alle Menschen bereit sind, sonst abbrechen. */
  private updateCountdown(now: number): void {
    if (this.phase !== 'lobby') return;
    const humans = this.slots.filter((s) => s.player);
    const all = humans.length > 0 && humans.every((s) => s.ready && s.pick);
    if (all && this.startsAt === null) this.startsAt = now + LOBBY_COUNTDOWN_MS;
    if (!all) this.startsAt = null;
  }

  /** Countdown abgelaufen: Partie mit den gewählten Helden starten, freie Plätze spielen Bots. */
  private start(now: number): void {
    this.phase = 'playing';
    this.startsAt = null;
    this.newSim();
    for (const s of this.slots) {
      s.ready = false;
      if (!s.player) continue;
      const i = this.slots.indexOf(s);
      s.player.send(JSON.stringify({ t: 'joined', room: this.info(now), heroId: this.sim.state.heroes[i].id, token: s.token, slot: i }));
    }
    this.broadcastRoom(now);
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
  join(player: Player, slot: number, now: number, token?: string): { heroId: number; token: string; slot: number } | string {
    // Lobby: ohne festen Platz den nächsten freien nehmen
    if (slot < 0) slot = this.slots.findIndex((x) => !x.player && !(x.reservedUntil !== null && now < x.reservedUntil));
    if (slot < 0) return 'Der Raum ist voll';
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
    s.needFull = true;
    this.emptySince = null;
    if (this.phase === 'lobby') {
      // Neuer Spieler: noch kein Held (außer beim Wiederverbinden), nicht bereit; Countdown neu prüfen
      if (!token) s.pick = null;
      s.ready = false;
      this.updateCountdown(now);
      return { heroId: -1, token: s.token, slot };
    }
    s.pick = hero.defId;
    hero.bot = undefined;
    hero.input = { move: { x: 0, y: 0 }, aim: hero.input.aim, attack: false };
    return { heroId: hero.id, token: s.token, slot };
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
    s.needFull = true;
    s.reservedUntil = keep ? now + RESERVE_MS : null;
    if (!keep) s.token = null;
    if (this.phase === 'lobby') {
      s.ready = false;
      if (!keep) s.pick = null;
      if (this.humans.length === 0) this.emptySince = now;
      this.updateCountdown(now);
      this.broadcastRoom(now);
      return;
    }
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
  tick(now = Date.now()): void {
    // Lobby: nur der Countdown läuft
    if (this.phase === 'lobby') {
      if (this.startsAt !== null && now >= this.startsAt) this.start(now);
      return;
    }
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
    // Selten wechselnde Daten (Inventar, Ränge, Punkte …) nur bei Änderung und
    // zur Sicherheit jede Sekunde vollständig schicken
    const key = slowKey(this.sim.state);
    const full = key !== this.lastSlowKey || this.sim.state.tick % FULL_EVERY === 0;
    this.lastSlowKey = key;
    // Ein Schnappschuss für alle; nur wer einen Rückstau hat, bekommt einen eigenen
    let shared: string | null = null;
    for (const s of this.slots) {
      if (!s.player) continue;
      if (s.player.buffered() > BACKPRESSURE_BYTES) {
        // Leitung voll: Zustand auslassen (der nächste ist vollständig), Ereignisse aufheben
        s.backlog.push(...events);
        s.needFull = true;
        continue;
      }
      let json: string;
      if (s.backlog.length > 0 || s.needFull) {
        json = encodeSnapshot(this.sim.state, [...s.backlog, ...events], ZOMBIE_TYPES, true);
        s.backlog = [];
        s.needFull = false;
      } else json = shared ??= encodeSnapshot(this.sim.state, events, ZOMBIE_TYPES, full);
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
