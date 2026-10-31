/**
 * Netzprotokoll für den Mehrspieler (JSON über WebSocket). Läuft ohne Browser:
 * Server und Client nutzen dieselben Typen und dieselbe Kodierung.
 *
 * Der Server schickt 20× pro Sekunde einen Schnappschuss des Spielzustands.
 * Zombies gehen als kompakte Zahlenreihen übers Netz, alles andere als
 * gerundetes JSON. Ereignisse zwischen zwei Schnappschüssen werden gesammelt.
 */
import type { BotDifficulty, Command, GameEvent, GameState, Hero, Zombie } from '../sim/types';

/** Raum: wer welchen Helden steuert. */
export interface RoomInfo {
  code: string;
  difficulty: BotDifficulty;
  slots: { heroId: number; defId: string; human: boolean; name: string | null }[];
}

/** Befehl ohne heroId: Der Server setzt den Helden der Verbindung ein. */
export type ClientCommand = Command extends infer C ? (C extends { heroId: number } ? Omit<C, 'heroId'> : never) : never;

export type ClientMessage =
  | { t: 'create'; heroes: string[]; difficulty: BotDifficulty; name: string }
  | { t: 'info'; room: string }
  | { t: 'join'; room: string; slot: number; name: string }
  | { t: 'cmd'; cmd: ClientCommand }
  | { t: 'restart' };

export type ServerMessage =
  | { t: 'info'; room: RoomInfo }
  | { t: 'joined'; room: RoomInfo; heroId: number }
  | { t: 'room'; room: RoomInfo }
  | { t: 'state'; s: Snapshot }
  | { t: 'error'; msg: string };

/** Zombie als Zahlenreihe: Id, Typ-Index, x, y, Blick, Leben, max. Leben, Zustände, Merkmale. */
type ZombieTuple = [number, number, number, number, number, number, number, number, number];

/** Zustands-Bits (Symbole und Färbung im Client). */
const ST_SLEEP = 1;
const ST_STUN = 2;
const ST_FEAR = 4;
const ST_BLIND = 8;
const ST_ROOT = 16;
const ST_MARKED = 32;
/** Merkmale: Postbote bzw. neutral (Lager). */
const F_COURIER = 1;
const F_NEUTRAL = 2;

export interface Snapshot extends Omit<GameState, 'zombies' | 'wave' | 'rng' | 'nextId'> {
  zombies: ZombieTuple[];
  wave: Omit<GameState['wave'], 'queue'> & { queue: number };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
/** Zahlen auf 2 Nachkommastellen runden (spart rund ein Drittel der Daten). */
const round = (_key: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? r2(v) : v);

/** Server: Zustand plus gesammelte Ereignisse in einen Schnappschuss packen. zombieTypes: Typ-Ids in fester Reihenfolge. */
export function encodeSnapshot(state: GameState, events: GameEvent[], zombieTypes: string[]): string {
  const t = state.time;
  const zombies = state.zombies.map((z): ZombieTuple => {
    const st = z.st;
    const bits =
      (t < st.sleepUntil ? ST_SLEEP : 0) |
      (t < st.stunUntil ? ST_STUN : 0) |
      (t < st.fearUntil ? ST_FEAR : 0) |
      (t < st.blindUntil ? ST_BLIND : 0) |
      (t < st.rootUntil ? ST_ROOT : 0) |
      (t < st.markedUntil ? ST_MARKED : 0);
    const flags = (z.courier ? F_COURIER : 0) | (z.neutral ? F_NEUTRAL : 0);
    return [z.id, zombieTypes.indexOf(z.defId), r2(z.pos.x), r2(z.pos.y), r2(z.facing), Math.ceil(z.hp), Math.ceil(z.maxHp), bits, flags];
  });
  // Bot-Gehirne bleiben auf dem Server; der Client muss nur wissen, wer ein Bot ist.
  const heroes = state.heroes.map((h) => (h.bot ? { ...h, bot: { difficulty: h.bot.difficulty } as Hero['bot'] } : h));
  const snap: Snapshot = {
    tick: state.tick,
    time: state.time,
    heroes,
    zombies,
    projectiles: state.projectiles,
    objectives: state.objectives,
    zones: state.zones,
    delayed: [],
    wave: { ...state.wave, queue: state.wave.queue.length },
    kills: state.kills,
    gameOver: state.gameOver,
    events,
    camps: state.camps,
  };
  return JSON.stringify({ t: 'state', s: snap } satisfies ServerMessage, round);
}

/** Client: Schnappschuss wieder in einen Spielzustand für Darstellung und HUD verwandeln. */
export function decodeSnapshot(s: Snapshot, zombieTypes: string[], radius: (defId: string) => number): GameState {
  const t = s.time;
  const until = (bits: number, bit: number) => (bits & bit ? t + 1 : 0);
  const zombies = s.zombies.map(([id, type, x, y, facing, hp, maxHp, bits, flags]): Zombie => {
    const defId = zombieTypes[type] ?? '';
    return {
      id,
      defId,
      pos: { x, y },
      radius: radius(defId),
      hp,
      maxHp,
      speed: 0,
      facing,
      attackTimer: 0,
      damage: 0,
      targetId: null,
      objectiveId: '',
      wander: 0,
      st: {
        slowUntil: 0,
        slowFactor: 1,
        stunUntil: until(bits, ST_STUN),
        sleepUntil: until(bits, ST_SLEEP),
        fearUntil: until(bits, ST_FEAR),
        fearFrom: { x: 0, y: 0 },
        blindUntil: until(bits, ST_BLIND),
        rootUntil: until(bits, ST_ROOT),
        markedUntil: until(bits, ST_MARKED),
        drowsy: 0,
        drowsyUntil: 0,
        heldBy: null,
        provokedBy: null,
        provokedUntil: 0,
      },
      courier: flags & F_COURIER ? { wp: 0, dir: 1, leaveAt: Infinity } : undefined,
      neutral: flags & F_NEUTRAL ? { campId: null, home: { x, y }, returning: false } : undefined,
    };
  });
  return {
    ...s,
    rng: 0,
    nextId: 0,
    zombies,
    wave: { ...s.wave, queue: Array<string>(s.wave.queue).fill('') },
  };
}
