import { gameData } from '../gameData';
import { decodeSnapshot, type ClientCommand, type ClientMessage, type RoomInfo, type ServerMessage } from '../net/protocol';
import { Simulation, type SimulationOptions } from '../sim/game';
import { type Command, DT, type GameState } from '../sim/types';
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
  /** Befehl des Spielers (Fähigkeit, Kauf, Eingabe …). */
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

  send(cmd: ClientCommand): void {
    if (this.paused) return;
    // Zuschauen: nur „Welle starten“
    if (this.heroId < 0 && cmd.type !== 'startWave') return;
    const full = { ...cmd, heroId: this.heroId } as Command;
    if (full.type === 'input') this.input = full;
    else this.pending.push(full);
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

/** Eingaben höchstens so oft schicken (Sekunden): einmal pro Server-Tick. */
const INPUT_INTERVAL = DT;

/**
 * Mehrspieler: Der Server rechnet, der Client zeigt die Zustände an und
 * schickt Eingaben. Zwischen zwei Zuständen (50 ms) wird weich überblendet.
 */
export class RemoteSession implements Session {
  readonly online = true;
  readonly prev = new Map<number, Snapshot>();
  paused = false;
  heroId = -1;
  room: RoomInfo | null = null;
  state: GameState;
  private queue: GameState[] = [];
  private sinceState = 0;
  private sinceInput = 0;
  private lastInput = '';
  private readonly zombieTypes = gameData.zombies.map((z) => z.id);
  /** Raum-Infos (beigetreten, Mitspieler kommen und gehen). */
  onRoom: (room: RoomInfo) => void = () => {};
  onError: (msg: string) => void = () => {};
  onClose: () => void = () => {};

  private constructor(
    private readonly ws: WebSocket,
    initial: GameState,
  ) {
    this.state = initial;
    ws.addEventListener('message', (e) => this.receive(JSON.parse(String(e.data)) as ServerMessage));
    ws.addEventListener('close', () => this.onClose());
  }

  /** Verbindung aufbauen; erste Nachricht schicken, sobald sie steht. */
  static connect(first: ClientMessage, placeholder: GameState): Promise<RemoteSession> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(serverUrl());
      const session = new RemoteSession(ws, placeholder);
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify(first));
        resolve(session);
      });
      ws.addEventListener('error', () => reject(new Error('Server nicht erreichbar')));
    });
  }

  /** Raum-Infos abfragen, ohne beizutreten. */
  static async info(code: string): Promise<RoomInfo> {
    const ws = new WebSocket(serverUrl());
    return new Promise((resolve, reject) => {
      ws.addEventListener('open', () => ws.send(JSON.stringify({ t: 'info', room: code } satisfies ClientMessage)));
      ws.addEventListener('message', (e) => {
        const msg = JSON.parse(String(e.data)) as ServerMessage;
        ws.close();
        if (msg.t === 'info') resolve(msg.room);
        else reject(new Error(msg.t === 'error' ? msg.msg : 'Unerwartete Antwort'));
      });
      ws.addEventListener('error', () => reject(new Error('Server nicht erreichbar')));
    });
  }

  private receive(msg: ServerMessage): void {
    switch (msg.t) {
      case 'joined':
        this.heroId = msg.heroId;
        this.room = msg.room;
        this.onRoom(msg.room);
        break;
      case 'room':
        this.room = msg.room;
        this.onRoom(msg.room);
        break;
      case 'state':
        this.queue.push(decodeSnapshot(msg.s, this.zombieTypes, (id) => gameData.zombies.find((z) => z.id === id)?.radius ?? 0.4));
        break;
      case 'error':
        this.onError(msg.msg);
        break;
    }
  }

  send(cmd: ClientCommand): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    if (cmd.type === 'input') {
      // Eingaben gebündelt: nur bei Änderung oder einmal pro Tick
      const text = JSON.stringify(cmd);
      const due = text !== this.lastInput ? this.sinceInput >= INPUT_INTERVAL : this.sinceInput >= 0.5;
      if (!due) return;
      this.lastInput = text;
      this.sinceInput = 0;
    }
    this.ws.send(JSON.stringify({ t: 'cmd', cmd } satisfies ClientMessage));
  }

  restart(): void {
    this.ws.send(JSON.stringify({ t: 'restart' } satisfies ClientMessage));
  }

  frame(dt: number, onStep: (state: GameState) => void): number {
    this.sinceInput += dt;
    this.sinceState += dt;
    // Kommen mehrere Zustände auf einmal (Ruckler im Netz), alle Ereignisse abspielen
    for (const next of this.queue) {
      remember(this.prev, this.state);
      this.state = next;
      this.sinceState = 0;
      onStep(next);
    }
    this.queue = [];
    return Math.min(1, this.sinceState / DT);
  }

  close(): void {
    this.ws.close();
  }
}
