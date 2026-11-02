import { gameData } from '../gameData';
import { decodeSnapshot, type ClientCommand, type ClientMessage, type RoomInfo, type ServerMessage } from '../net/protocol';
import { Simulation, type SimulationOptions } from '../sim/game';
import { face } from '../sim/movement';
import { type Command, DT, type GameState, type HeroInput } from '../sim/types';
import { Prediction } from './prediction';
import { SnapshotBuffer } from './snapshots';
import type { Snapshot } from './renderer';

/**
 * Eine laufende Partie aus Sicht des Clients: lokal (Einzelspieler, eigene
 * Simulation) oder auf dem Server (Mehrspieler, Zustände kommen übers Netz).
 */
export interface Session {
  readonly state: GameState;
  /** Held dieses Spielers (−1: nur zuschauen). */
  readonly heroId: number;
  readonly online: boolean;
  /** Positionen vor dem letzten Schritt (für weiche Bewegung zwischen zwei Zuständen). */
  readonly prev: Map<number, Snapshot>;
  /** Aktuelle Eingabe (WASD, Maus); gilt, bis eine neue kommt. */
  setInput(input: HeroInput): void;
  /** Einmaliger Befehl des Spielers (Fähigkeit, Kauf, Ping …). */
  send(cmd: ClientCommand): void;
  /**
   * Ein Bild weiter: Simulation bzw. neue Zustände verarbeiten. onStep läuft
   * für jeden neuen Zustand (Ereignisse). Gibt den Anteil zwischen vorigem
   * und aktuellem Zustand zurück (0–1).
   */
  frame(dt: number, onStep: (state: GameState) => void): number;
  /** Lokal: anhalten (Pausemenü). Im Mehrspieler läuft das Spiel weiter. */
  paused: boolean;
  close(): void;
}

function remember(prev: Map<number, Snapshot>, state: GameState): void {
  prev.clear();
  for (const u of [...state.heroes, ...state.zombies]) prev.set(u.id, { x: u.pos.x, y: u.pos.y, facing: u.facing });
  for (const p of state.projectiles) prev.set(p.id, { x: p.pos.x, y: p.pos.y, facing: 0 });
}

/** Einzelspieler: Die Simulation läuft im Browser, freie Plätze spielen Bots. */
export class LocalSession implements Session {
  readonly sim: Simulation;
  readonly heroId: number;
  readonly online = false;
  readonly prev = new Map<number, Snapshot>();
  paused = false;
  private accumulator = 0;
  private pending: Command[] = [];
  private input: Command | null = null;

  constructor(options: SimulationOptions, startWave: number, spectate: boolean) {
    this.sim = new Simulation(gameData, options);
    this.sim.state.wave.number = startWave;
    this.heroId = spectate ? -1 : this.sim.state.heroes[0].id;
  }

  get state(): GameState {
    return this.sim.state;
  }

  setInput(input: HeroInput): void {
    if (this.heroId >= 0) this.input = { heroId: this.heroId, type: 'input', ...input };
  }

  send(cmd: ClientCommand): void {
    if (this.paused) return;
    // Zuschauen: nur „Welle starten“
    if (this.heroId < 0 && cmd.type !== 'startWave') return;
    this.pending.push({ ...cmd, heroId: this.heroId } as Command);
  }

  frame(dt: number, onStep: (state: GameState) => void): number {
    if (this.paused) {
      this.pending = [];
      return 1;
    }
    this.accumulator += dt;
    while (this.accumulator >= DT) {
      remember(this.prev, this.sim.state);
      this.sim.step(this.input ? [this.input, ...this.pending] : this.pending);
      this.pending = [];
      onStep(this.sim.state);
      this.accumulator -= DT;
    }
    return this.sim.state.gameOver ? 1 : this.accumulator / DT;
  }

  close(): void {}
}

/** Adresse des Spielservers (gleicher Rechner und Port wie die Seite). */
export function serverUrl(): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

/** Kennung dieses Builds (von Vite eingesetzt; im Entwicklungsmodus null). */
declare const __BUILD_ID__: string | null;
export const BUILD_ID: string | null = typeof __BUILD_ID__ === 'undefined' ? null : __BUILD_ID__;

/** Laufzeitmessung alle … s. */
const PING_INTERVAL = 2;
/** Wartezeiten beim Wiederverbinden (s); danach alle 8 s. */
const RECONNECT_STEPS = [0, 0.5, 1, 2, 4, 8];
/** So lange wird es nach einem Abbruch versucht (s), solange der Platz reserviert ist … */
const RECONNECT_FOR = 120;
/** … bzw. beim ersten Verbindungsaufbau (kostenlose Server brauchen nach dem Schlafen bis zu einer Minute). */
const CONNECT_FOR = 90;

/** Verständlicher Grund für das Ende einer WebSocket-Verbindung. */
function closeReason(e: CloseEvent): string {
  if (e.reason) return e.reason;
  switch (e.code) {
    case 1001:
      return 'Server oder Tunnel wurde beendet';
    case 1006:
      return 'Verbindung abgerissen (Netz oder Tunnel)';
    case 1012:
      return 'Server startet neu';
    default:
      return `Code ${e.code}`;
  }
}

/** waking: erster Verbindungsaufbau dauert (Server startet), reconnecting: nach einem Abbruch. */
export type ConnectionStatus = 'online' | 'waking' | 'reconnecting' | 'lost';

/**
 * Mehrspieler: Der Server rechnet, der Client zeigt die Zustände an.
 * - Eingaben gehen 20× pro Sekunde mit laufender Nummer raus; die eigene
 *   Bewegung wird sofort vorhergesagt und mit dem Server abgeglichen.
 * - Alle anderen Einheiten werden 2 Ticks (100 ms) hinter dem neuesten
 *   Zustand gezeigt, zwischen zwei Zuständen nach Server-Tick (Jitter-Puffer).
 * - Bricht die Verbindung ab, verbindet sich die Sitzung selbst neu und holt
 *   mit dem Token denselben Helden zurück.
 */
export class RemoteSession implements Session {
  readonly online = true;
  readonly prev = new Map<number, Snapshot>();
  paused = false;
  heroId = -1;
  room: RoomInfo | null = null;
  /** Token zum Wiederverbinden (vom Server beim Beitritt). */
  token: string | null = null;
  /** Gemessene Laufzeit hin und zurück (ms), null bis zur ersten Messung. */
  rtt: number | null = null;
  state: GameState;
  /** Raum-Infos (beigetreten, Mitspieler kommen und gehen). */
  onRoom: (room: RoomInfo) => void = () => {};
  onError: (msg: string) => void = () => {};
  /** Verbindung: online, wird wiederhergestellt, endgültig verloren (msg: Grund). */
  onStatus: (status: ConnectionStatus, msg?: string) => void = () => {};
  /** Server hat einen anderen Build als diese Seite. */
  onVersionMismatch: () => void = () => {};

  private ws: WebSocket;
  private readonly snapshots = new SnapshotBuffer();
  private readonly prediction = new Prediction(gameData);
  private input: HeroInput = { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, attack: false };
  private seq = 0;
  private sinceInput = 0;
  private sincePing = PING_INTERVAL;
  private closed = false;
  private reconnecting = false;
  /** Eigener Platz im Raum (Lobby). */
  slot = -1;
  /** Nur zuschauen (kein Platz, keine Eingaben). */
  watching = false;
  /** Letzter entpackter Zustand (liefert fehlende, selten wechselnde Felder). */
  private lastDecoded: GameState | null = null;
  private reconnectStart = 0;
  private attempts = 0;
  private timer = 0;
  private name = '';
  /** Erste Nachricht (anlegen, beitreten, wiederverbinden) für Wiederholungen vor dem Beitritt. */
  private readonly first: ClientMessage;
  private readonly zombieTypes = gameData.zombies.map((z) => z.id);

  private constructor(first: ClientMessage, initial: GameState) {
    this.state = initial;
    this.first = first;
    if ('name' in first) this.name = first.name;
    this.ws = this.open(first);
  }

  /** Verbindung aufbauen; die erste Nachricht geht raus, sobald sie steht. */
  static connect(first: ClientMessage, placeholder: GameState): RemoteSession {
    return new RemoteSession(first, placeholder);
  }

  /** Raum-Infos abfragen, ohne beizutreten. */
  static async info(code: string): Promise<RoomInfo> {
    const ws = new WebSocket(serverUrl());
    return new Promise((resolve, reject) => {
      ws.addEventListener('open', () => ws.send(JSON.stringify({ t: 'info', room: code } satisfies ClientMessage)));
      ws.addEventListener('message', (e) => {
        const msg = JSON.parse(String(e.data)) as ServerMessage;
        if (msg.t === 'hello') return;
        ws.close();
        if (msg.t === 'info') resolve(msg.room);
        else reject(new Error(msg.t === 'error' ? msg.msg : 'Unerwartete Antwort'));
      });
      ws.addEventListener('error', () => reject(new Error('Server nicht erreichbar')));
    });
  }

  private open(first: ClientMessage): WebSocket {
    const ws = new WebSocket(serverUrl());
    ws.addEventListener('open', () => ws.send(JSON.stringify(first)));
    ws.addEventListener('message', (e) => this.receive(JSON.parse(String(e.data)) as ServerMessage));
    ws.addEventListener('close', (e) => {
      if (ws === this.ws && !this.closed) this.scheduleReconnect(closeReason(e));
    });
    return ws;
  }

  /**
   * Verbindung weg oder (noch) nicht zustande gekommen: mit wachsenden Pausen
   * neu versuchen. Nach dem Beitritt mit dem Token (derselbe Held), vorher mit
   * der ersten Nachricht.
   */
  private scheduleReconnect(reason?: string): void {
    const joined = this.heroId >= 0;
    if (!this.reconnecting) {
      this.reconnecting = true;
      this.reconnectStart = performance.now();
      this.attempts = 0;
      if (reason) console.warn(`Verbindung getrennt: ${reason}`);
      this.onStatus(joined ? 'reconnecting' : 'waking', reason);
    }
    if ((performance.now() - this.reconnectStart) / 1000 > (joined ? RECONNECT_FOR : CONNECT_FOR)) {
      this.closed = true;
      this.onStatus('lost', joined ? 'Die Verbindung zum Spielserver ist abgebrochen.' : 'Server nicht erreichbar');
      return;
    }
    const wait = RECONNECT_STEPS[Math.min(this.attempts++, RECONNECT_STEPS.length - 1)];
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (this.closed) return;
      const msg: ClientMessage = joined && this.room && this.token ? { t: 'resume', room: this.room.code, token: this.token, name: this.name } : this.first;
      this.ws = this.open(msg);
    }, wait * 1000);
  }

  private receive(msg: ServerMessage): void {
    switch (msg.t) {
      case 'hello':
        if (msg.build && BUILD_ID && msg.build !== BUILD_ID) this.onVersionMismatch();
        break;
      case 'joined': {
        this.heroId = msg.heroId;
        if (msg.slot !== undefined) this.slot = msg.slot;
        this.token = msg.token;
        this.room = msg.room;
        this.prediction.reset();
        if (this.reconnecting) {
          this.reconnecting = false;
          this.onStatus('online');
        }
        this.onRoom(msg.room);
        break;
      }
      case 'watching':
        this.watching = true;
        this.room = msg.room;
        if (this.reconnecting) {
          this.reconnecting = false;
          this.onStatus('online');
        }
        this.onRoom(msg.room);
        break;
      case 'room':
        this.room = msg.room;
        this.onRoom(msg.room);
        break;
      case 'state': {
        const state = decodeSnapshot(msg.s, this.zombieTypes, (id) => gameData.zombies.find((z) => z.id === id)?.radius ?? 0.4, this.lastDecoded ?? undefined);
        // Vor dem ersten vollständigen Schnappschuss fehlen Heldendaten: abwarten
        if (!msg.s.full && !this.lastDecoded) return;
        this.lastDecoded = state;
        this.snapshots.push(state);
        const me = state.heroes.find((h) => h.id === this.heroId);
        if (me) this.prediction.reconcile(state, me, msg.ack);
        break;
      }
      case 'pong':
        this.rtt = performance.now() - msg.ts;
        break;
      case 'error':
        // Wiederverbinden gescheitert (Platz weg): endgültig
        if (this.reconnecting && this.heroId >= 0) {
          this.closed = true;
          this.ws.close();
          this.onStatus('lost', msg.msg);
        } else this.onError(msg.msg);
        break;
      case 'bye':
        // Server startet neu: wie ein Abbruch behandeln (die Sitzung versucht es weiter)
        break;
    }
  }

  private sendRaw(msg: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  setInput(input: HeroInput): void {
    this.input = input;
  }

  send(cmd: ClientCommand): void {
    this.sendRaw({ t: 'cmd', cmd });
  }

  restart(): void {
    this.sendRaw({ t: 'restart' });
  }

  /** Lobby: Held wählen, Zauber, bereit, Bot-Stärke. */
  lobby(msg: Extract<ClientMessage, { t: 'pick' | 'spells' | 'ready' | 'difficulty' | 'mode' | 'team' | 'level' | 'pvpOptions' }>): void {
    this.sendRaw(msg);
  }

  frame(dt: number, onStep: (state: GameState) => void): number {
    if (this.ws.readyState === WebSocket.OPEN && this.heroId >= 0) {
      // Eingaben im Server-Takt, jede mit eigener Nummer; die Bewegung sofort vorhersagen
      this.sinceInput += dt;
      // Bei sehr niedriger Bildrate alle fälligen Eingaben nachschicken (höchstens 10 = 0,5 s)
      let n = 0;
      while (this.sinceInput >= DT && n++ < 10) {
        this.sinceInput -= DT;
        this.seq++;
        this.sendRaw({ t: 'input', seq: this.seq, ...this.input });
        this.prediction.apply(this.seq, this.input.move);
      }
      if (n > 10) this.sinceInput = 0;
      this.sincePing += dt;
      if (this.sincePing >= PING_INTERVAL) {
        this.sincePing = 0;
        this.sendRaw({ t: 'ping', ts: performance.now() });
      }
    }
    return this.present(dt, onStep);
  }

  /** Zustände aus dem Jitter-Puffer darstellen; der eigene Held kommt aus der Vorhersage. */
  private present(dt: number, onStep: (state: GameState) => void): number {
    const frame = this.snapshots.advance(dt, onStep);
    if (!frame) return 1;
    const { from, to, alpha } = frame;
    remember(this.prev, from);
    // Eigener Held: vorhergesagte Position, Blick sofort zur Maus
    const predicted = this.prediction.display(dt, this.sinceInput / DT);
    this.state = { ...to, heroes: to.heroes.map((h) => (h.id === this.heroId ? { ...h, pos: predicted ?? h.pos } : h)) };
    const me = this.state.heroes.find((h) => h.id === this.heroId);
    if (me) {
      if (predicted) this.prev.set(me.id, { x: predicted.x, y: predicted.y, facing: me.facing });
      if (me.alive && !me.dash) {
        face(me, this.input.aim);
        const p = this.prev.get(me.id);
        if (p) p.facing = me.facing;
      }
    }
    return alpha;
  }

  /** Nur für Tests (?debug): Verbindung hart trennen, als wäre das Netz weg. */
  dropConnection(): void {
    this.ws.close();
  }

  /** Eigener Held im neuesten Zustand vom Server (ohne Vorhersage). */
  serverHero(): GameState['heroes'][number] | undefined {
    return this.snapshots.newest?.heroes.find((h) => h.id === this.heroId);
  }

  close(): void {
    this.closed = true;
    window.clearTimeout(this.timer);
    this.ws.close();
  }
}
