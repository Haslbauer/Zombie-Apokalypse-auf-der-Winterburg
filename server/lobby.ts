import { gameData } from '../src/gameData';
import { parseClientMessage, type ServerMessage } from '../src/net/protocol';
import { defaultTeam } from '../src/sim/bots/team';
import type { BotDifficulty } from '../src/sim/types';
import { type Player, Room } from './room';

/** Leere Räume bleiben so lange erhalten (ms), damit man nach einem Verbindungsabbruch zurückkommt. */
const EMPTY_ROOM_TTL = 5 * 60 * 1000;
/** Raum-Codes ohne leicht verwechselbare Zeichen. */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DIFFICULTIES: BotDifficulty[] = ['leicht', 'mittel', 'schwer'];
/** Nachrichten pro Sekunde und Verbindung: darüber wird ignoriert, ab dem Vielfachen getrennt. */
export const RATE_LIMIT = 60;
const RATE_KICK = 4 * RATE_LIMIT;
/** Eingaben pro Sekunde (normal 20; mehr wird ignoriert, nie getrennt). */
const INPUT_LIMIT = 60;

export interface Client extends Player {
  room: Room | null;
  /** Verbindung trennen (Missbrauch, Herunterfahren). */
  close(reason: string): void;
  /** Nachrichten im laufenden Sekundenfenster. */
  rate: { windowStart: number; count: number; inputs: number };
}

export interface LobbyOptions {
  now?: () => number;
  /** Höchstzahl gleichzeitiger Räume. */
  maxRooms?: number;
  /** Räume ohne Lobby sofort starten (für Tests des Spielbetriebs). */
  skipLobby?: boolean;
  log?: (line: string) => void;
  /** Spielzähler: Partie gestartet bzw. beendet (siehe server/stats.ts). */
  onPlay?: (kind: 'koop' | 'pvp', event: 'start' | 'win' | 'loss' | 'end') => void;
}

/** Alle Räume des Servers: anlegen, beitreten, wiederverbinden, Befehle verteilen, aufräumen. */
export class Lobby {
  readonly rooms = new Map<string, Room>();
  private readonly now: () => number;
  private readonly maxRooms: number;
  private readonly log: (line: string) => void;
  private readonly skipLobby: boolean;
  private readonly onPlay: LobbyOptions['onPlay'];

  constructor(options: LobbyOptions = {}) {
    this.skipLobby = options.skipLobby ?? false;
    this.now = options.now ?? (() => Date.now());
    this.maxRooms = options.maxRooms ?? 200;
    this.log = options.log ?? (() => {});
    this.onPlay = options.onPlay;
  }

  connect(send: (data: string) => void, buffered: () => number = () => 0, close: (reason: string) => void = () => {}): Client {
    return { name: 'Spieler', room: null, send, buffered, close, rate: { windowStart: this.now(), count: 0, inputs: 0 } };
  }

  message(client: Client, raw: string): void {
    // Zu viele Nachrichten: erst ignorieren, bei grobem Missbrauch trennen
    const now = this.now();
    if (now - client.rate.windowStart >= 1000) client.rate = { windowStart: now, count: 0, inputs: 0 };
    // Eingaben zählen getrennt: nach einem Ruckler schickt der Client bis zu 10
    // auf einmal nach, das darf nicht zum Rauswurf führen (der Raum puffert ohnehin nur wenige)
    if (raw.startsWith('{"t":"input"')) {
      if (++client.rate.inputs > INPUT_LIMIT) return;
    }
    const msg = parseClientMessage(raw);
    if (!msg) return;
    if (msg.t !== 'input') {
      if (++client.rate.count > RATE_LIMIT) {
        if (client.rate.count > RATE_KICK) client.close('Zu viele Nachrichten');
        return;
      }
    }
    switch (msg.t) {
      case 'create':
        this.create(client, msg.heroes, msg.difficulty, msg.name);
        break;
      case 'info': {
        const room = this.rooms.get(msg.room.toUpperCase());
        this.reply(client, room ? { t: 'info', room: room.info(now) } : { t: 'error', msg: 'Diesen Raum gibt es nicht (mehr)' });
        break;
      }
      case 'join':
        this.join(client, msg.room.toUpperCase(), msg.slot, msg.name);
        break;
      case 'resume':
        this.resume(client, msg.room.toUpperCase(), msg.token, msg.name);
        break;
      case 'input':
        client.room?.input(client, msg.seq, { move: msg.move, aim: msg.aim, attack: msg.attack });
        break;
      case 'cmd':
        client.room?.command(client, msg.cmd);
        break;
      case 'restart':
        if (client.room?.sim.state.gameOver) client.room.restart(now);
        break;
      case 'pick': {
        const err = client.room?.pick(client, msg.heroId, now);
        if (err) this.reply(client, { t: 'error', msg: err });
        break;
      }
      case 'spells':
        client.room?.chooseSpells(client, msg.spells, now);
        break;
      case 'ready': {
        const err = client.room?.setReady(client, msg.ready, now);
        if (err) this.reply(client, { t: 'error', msg: err });
        break;
      }
      case 'difficulty':
        client.room?.setDifficulty(client, msg.difficulty, now);
        break;
      case 'mode': {
        const err = client.room?.setMode(client, msg.mode, now);
        if (err) this.reply(client, { t: 'error', msg: err });
        break;
      }
      case 'team':
        client.room?.setTeam(client, msg.team, now);
        break;
      case 'level':
        client.room?.setLevel(client, msg.level, now);
        break;
      case 'pvpOptions':
        client.room?.setPvpOptions(client, msg, now);
        break;
      case 'ping':
        this.reply(client, { t: 'pong', ts: msg.ts });
        break;
    }
  }

  /** Verbindung weg: Ein Bot übernimmt, der Platz bleibt für das Token reserviert. */
  disconnect(client: Client): void {
    if (client.room) {
      this.log(`Raum ${client.room.code}: ${client.name} getrennt`);
      client.room.leave(client, this.now(), true);
    }
    client.room = null;
  }

  /** Alle Räume einen Tick weiter; lange leere Räume schließen. */
  tick(): void {
    const now = this.now();
    for (const [code, room] of this.rooms) {
      if (room.emptySince !== null && now - room.emptySince > EMPTY_ROOM_TTL) {
        this.rooms.delete(code);
        this.log(`Raum ${code} geschlossen (leer)`);
      } else room.tick(now);
    }
  }

  /** Alle Spieler zählen (für /health und Logs). */
  get playerCount(): number {
    let n = 0;
    for (const room of this.rooms.values()) n += room.humans.length;
    return n;
  }

  private create(client: Client, heroes: string[], difficulty: BotDifficulty, name: string): void {
    if (this.rooms.size >= this.maxRooms) return this.reply(client, { t: 'error', msg: 'Der Server ist voll. Bitte später noch einmal versuchen.' });
    const ids = new Set(gameData.heroes.map((h) => h.id));
    const list = heroes.filter((h) => ids.has(h));
    if (list.length === 0) return this.reply(client, { t: 'error', msg: 'Kein gültiger Held gewählt' });
    // Auf drei Helden auffüllen (wie im Einzelspieler: Tank, Schaden, Support), keine doppelten
    const team = [...new Set(list)].slice(0, 3);
    for (const id of defaultTeam(gameData.bots, team[0])) if (team.length < 3 && !team.includes(id)) team.push(id);
    const diff = DIFFICULTIES.includes(difficulty) ? difficulty : 'mittel';
    this.leaveRoom(client);
    const room = new Room(this.newCode(), team, diff, this.skipLobby);
    room.onPlay = this.onPlay;
    this.rooms.set(room.code, room);
    this.log(`Raum ${room.code} erstellt (${team.join(', ')}, ${diff})`);
    this.enter(client, room, 0, name);
    // Gastgeber hat seinen Helden schon gewählt
    if (room.phase === 'lobby') room.pick(client, team[0], this.now());
  }

  private join(client: Client, code: string, slot: number, name: string): void {
    const room = this.rooms.get(code);
    if (!room) return this.reply(client, { t: 'error', msg: 'Diesen Raum gibt es nicht (mehr)' });
    this.leaveRoom(client);
    this.enter(client, room, slot, name);
  }

  /** Nach einem Abbruch: Platz zum Token suchen und zurückgeben. */
  private resume(client: Client, code: string, token: string, name: string): void {
    const room = this.rooms.get(code);
    const slot = room ? room.slotForToken(token) : -1;
    if (!room || slot < 0) return this.reply(client, { t: 'error', msg: 'Dein Platz ist nicht mehr frei' });
    this.leaveRoom(client);
    this.enter(client, room, slot, name, token);
  }

  private enter(client: Client, room: Room, slot: number, name: string, token?: string): void {
    client.name = name.trim() ? name.trim().slice(0, 16) : `Spieler ${slot + 1}`;
    const result = room.join(client, slot, this.now(), token);
    if (typeof result === 'string') return this.reply(client, { t: 'error', msg: result });
    client.room = room;
    this.log(`Raum ${room.code}: ${client.name} ${token ? 'ist zurück' : 'beigetreten'} (Platz ${slot + 1})`);
    this.reply(client, { t: 'joined', room: room.info(this.now()), heroId: result.heroId, token: result.token, slot: result.slot });
    room.broadcastRoom(this.now());
  }

  /** Raum bewusst verlassen (anderer Raum): Platz wird nicht reserviert. */
  private leaveRoom(client: Client): void {
    if (client.room) client.room.leave(client, this.now());
    client.room = null;
  }

  private reply(client: Client, msg: ServerMessage): void {
    client.send(JSON.stringify(msg));
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }
}
