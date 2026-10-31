import { gameData } from '../src/gameData';
import type { ClientMessage, ServerMessage } from '../src/net/protocol';
import { defaultTeam } from '../src/sim/bots/team';
import type { BotDifficulty } from '../src/sim/types';
import { type Player, Room } from './room';

/** Leere Räume bleiben so lange erhalten (ms), damit man nach einem Verbindungsabbruch zurückkommt. */
const EMPTY_ROOM_TTL = 5 * 60 * 1000;
/** Raum-Codes ohne leicht verwechselbare Zeichen. */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DIFFICULTIES: BotDifficulty[] = ['leicht', 'mittel', 'schwer'];

export interface Client extends Player {
  room: Room | null;
}

/** Alle Räume des Servers: anlegen, beitreten, Befehle verteilen, aufräumen. */
export class Lobby {
  readonly rooms = new Map<string, Room>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  connect(send: (data: string) => void): Client {
    return { name: 'Spieler', room: null, send };
  }

  message(client: Client, raw: string): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.t) {
      case 'create':
        this.create(client, msg.heroes, msg.difficulty, msg.name);
        break;
      case 'info': {
        const room = this.rooms.get(String(msg.room).toUpperCase());
        this.reply(client, room ? { t: 'info', room: room.info() } : { t: 'error', msg: 'Diesen Raum gibt es nicht (mehr)' });
        break;
      }
      case 'join':
        this.join(client, String(msg.room).toUpperCase(), Number(msg.slot), msg.name);
        break;
      case 'cmd':
        if (client.room && msg.cmd && typeof msg.cmd === 'object') client.room.command(client, msg.cmd);
        break;
      case 'restart':
        if (client.room?.sim.state.gameOver) {
          client.room.restart();
          client.room.broadcastRoom();
        }
        break;
    }
  }

  disconnect(client: Client): void {
    client.room?.leave(client, this.now());
    client.room = null;
  }

  /** Alle Räume einen Tick weiter; lange leere Räume schließen. */
  tick(): void {
    const now = this.now();
    for (const [code, room] of this.rooms) {
      if (room.emptySince !== null && now - room.emptySince > EMPTY_ROOM_TTL) this.rooms.delete(code);
      else room.tick();
    }
  }

  private create(client: Client, heroes: unknown, difficulty: unknown, name: unknown): void {
    const ids = new Set(gameData.heroes.map((h) => h.id));
    const list = Array.isArray(heroes) ? heroes.filter((h): h is string => typeof h === 'string' && ids.has(h)) : [];
    if (list.length === 0) return this.reply(client, { t: 'error', msg: 'Kein gültiger Held gewählt' });
    // Auf vier Helden auffüllen (wie im Einzelspieler), keine doppelten
    const team = [...new Set(list)].slice(0, 4);
    for (const id of defaultTeam(gameData.bots, team[0])) if (team.length < 4 && !team.includes(id)) team.push(id);
    const diff = DIFFICULTIES.includes(difficulty as BotDifficulty) ? (difficulty as BotDifficulty) : 'mittel';
    this.leaveRoom(client);
    const room = new Room(this.newCode(), team, diff);
    this.rooms.set(room.code, room);
    this.enter(client, room, 0, name);
  }

  private join(client: Client, code: string, slot: number, name: unknown): void {
    const room = this.rooms.get(code);
    if (!room) return this.reply(client, { t: 'error', msg: 'Diesen Raum gibt es nicht (mehr)' });
    this.leaveRoom(client);
    this.enter(client, room, slot, name);
  }

  private enter(client: Client, room: Room, slot: number, name: unknown): void {
    client.name = typeof name === 'string' && name.trim() ? name.trim().slice(0, 16) : `Spieler ${slot + 1}`;
    const result = room.join(client, slot);
    if (typeof result === 'string') return this.reply(client, { t: 'error', msg: result });
    client.room = room;
    this.reply(client, { t: 'joined', room: room.info(), heroId: result });
    room.broadcastRoom();
  }

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
