/**
 * Netzprotokoll für den Mehrspieler (JSON über WebSocket). Läuft ohne Browser:
 * Server und Client nutzen dieselben Typen, dieselbe Kodierung und dieselbe Prüfung.
 *
 * Der Server schickt 20× pro Sekunde einen Schnappschuss des Spielzustands.
 * Zombies gehen als kompakte Zahlenreihen übers Netz, alles andere als
 * gerundetes JSON. Ereignisse zwischen zwei Schnappschüssen werden gesammelt,
 * damit keines verloren geht. Eingaben tragen eine laufende Nummer (seq); der
 * Server bestätigt die zuletzt angewendete (ack), damit der Client die eigene
 * Bewegung vorhersagen und abgleichen kann.
 */
import { type BotDifficulty, type Command, type GameEvent, type GameState, type Hero, type HeroInput, type Objective, PING_KINDS, type Zombie } from '../sim/types';

/**
 * Raum: wer welchen Helden steuert. reserved: Platz wartet auf einen Spieler,
 * der kurz weg ist. phase: lobby (Sammeln, Heldenwahl, Bereit) oder playing.
 * In der Lobby ist defId der gewählte Held ('' = noch keiner, frei = Bot beim
 * Start), heroId −1; startsIn: Sekunden bis zum Start (null = warten auf alle).
 */
export type GameMode = 'koop' | 'pvp';

export interface RoomInfo {
  code: string;
  difficulty: BotDifficulty;
  phase: 'lobby' | 'playing';
  /** Spielmodus: Koop gegen Zombies oder PvP (Helden gegeneinander). */
  mode: GameMode;
  startsIn: number | null;
  slots: { heroId: number; defId: string; human: boolean; reserved: boolean; name: string | null; ready: boolean; spells: [string, string] | null; team: number }[];
}

/** Befehl ohne heroId: Der Server setzt den Helden der Verbindung ein. Eingaben gehen als eigene Nachricht. */
export type ClientCommand = Command extends infer C ? (C extends { heroId: number; type: infer T } ? (T extends 'input' ? never : Omit<C, 'heroId'>) : never) : never;

export type ClientMessage =
  | { t: 'create'; heroes: string[]; difficulty: BotDifficulty; name: string }
  | { t: 'info'; room: string }
  | { t: 'join'; room: string; slot: number; name: string }
  /** Nach einem Verbindungsabbruch: denselben Platz mit dem Token zurückholen. */
  | { t: 'resume'; room: string; token: string; name: string }
  /** Eingabe für einen Tick (WASD, Maus) mit laufender Nummer. */
  | ({ t: 'input'; seq: number } & HeroInput)
  | { t: 'cmd'; cmd: ClientCommand }
  | { t: 'restart' }
  /** Lobby: Held wählen, Zauber wählen, bereit melden, Bot-Stärke (nur Gastgeber). */
  | { t: 'pick'; heroId: string }
  | { t: 'spells'; spells: [string, string] }
  | { t: 'ready'; ready: boolean }
  | { t: 'difficulty'; difficulty: BotDifficulty }
  /** Lobby: Spielmodus (nur Gastgeber), eigenes Team im PvP (0 = Nord, 1 = Süd). */
  | { t: 'mode'; mode: GameMode }
  | { t: 'team'; team: number }
  /** Laufzeitmessung: Der Server schickt ts unverändert zurück. */
  | { t: 'ping'; ts: number };

export type ServerMessage =
  /** Nach dem Verbinden: Kennung des gebauten Spiels (null im Entwicklungsmodus). */
  | { t: 'hello'; build: string | null }
  | { t: 'info'; room: RoomInfo }
  /** Beitritt bestätigt (und beim Spielstart erneut): eigener Platz, Held (−1 in der Lobby), Token. */
  | { t: 'joined'; room: RoomInfo; heroId: number; token: string; slot?: number }
  | { t: 'room'; room: RoomInfo }
  /** ack: zuletzt angewendete Eingabe dieses Spielers. */
  | { t: 'state'; s: Snapshot; ack: number }
  | { t: 'pong'; ts: number }
  | { t: 'error'; msg: string }
  /** Server fährt herunter (z. B. Neustart). */
  | { t: 'bye'; msg: string };

/** Größte erlaubte Nachricht vom Client (Bytes). */
export const MAX_CLIENT_MESSAGE = 4096;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vec = (v: unknown): v is { x: number; y: number } => !!v && typeof v === 'object' && finite((v as { x: unknown }).x) && finite((v as { y: unknown }).y);
const int = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

/** Befehl prüfen: nur bekannte Arten mit gültigen Feldern (sonst null). */
function parseCommand(c: unknown): ClientCommand | null {
  if (!c || typeof c !== 'object') return null;
  const o = c as Record<string, unknown>;
  switch (o.type) {
    case 'cast':
      return int(o.slot, 0, 3) && vec(o.aim) ? { type: 'cast', slot: o.slot, aim: { x: o.aim.x, y: o.aim.y } } : null;
    case 'levelUp':
      return int(o.slot, 0, 3) ? { type: 'levelUp', slot: o.slot } : null;
    case 'buy':
      return str(o.itemId, 40) ? { type: 'buy', itemId: o.itemId } : null;
    case 'sell':
      return int(o.slot, 0, 5) ? { type: 'sell', slot: o.slot, consumable: o.consumable === true } : null;
    case 'use':
      return int(o.slot, 0, 1) ? { type: 'use', slot: o.slot } : null;
    case 'startWave':
      return { type: 'startWave' };
    case 'spell':
      return int(o.slot, 0, 1) && vec(o.aim) ? { type: 'spell', slot: o.slot, aim: { x: o.aim.x, y: o.aim.y } } : null;
    case 'chooseSpells':
      return Array.isArray(o.spells) && o.spells.length === 2 && o.spells.every((s) => str(s, 24)) ? { type: 'chooseSpells', spells: [o.spells[0], o.spells[1]] as [string, string] } : null;
    case 'ping':
      return PING_KINDS.includes(o.kind as never) && vec(o.pos) ? { type: 'ping', kind: o.kind as (typeof PING_KINDS)[number], pos: { x: o.pos.x, y: o.pos.y } } : null;
    default:
      return null;
  }
}

/** Nachricht vom Client prüfen (Server). Ungültiges ergibt null und wird ignoriert. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_CLIENT_MESSAGE) return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const name = str(m.name, 64) ? m.name : '';
  switch (m.t) {
    case 'create':
      if (!Array.isArray(m.heroes) || m.heroes.length > 4 || !m.heroes.every((h) => str(h, 32))) return null;
      return { t: 'create', heroes: m.heroes as string[], difficulty: m.difficulty as BotDifficulty, name };
    case 'info':
      return str(m.room, 8) ? { t: 'info', room: m.room } : null;
    case 'join':
      // slot −1: nächster freier Platz (Lobby)
      return str(m.room, 8) && int(m.slot, -1, 3) ? { t: 'join', room: m.room, slot: m.slot, name } : null;
    case 'pick':
      return str(m.heroId, 32) ? { t: 'pick', heroId: m.heroId } : null;
    case 'spells':
      return Array.isArray(m.spells) && m.spells.length === 2 && m.spells.every((s) => str(s, 24)) ? { t: 'spells', spells: [m.spells[0], m.spells[1]] as [string, string] } : null;
    case 'ready':
      return { t: 'ready', ready: m.ready === true };
    case 'difficulty':
      return ['leicht', 'mittel', 'schwer'].includes(m.difficulty as string) ? { t: 'difficulty', difficulty: m.difficulty as BotDifficulty } : null;
    case 'mode':
      return m.mode === 'koop' || m.mode === 'pvp' ? { t: 'mode', mode: m.mode } : null;
    case 'team':
      return m.team === 0 || m.team === 1 ? { t: 'team', team: m.team } : null;
    case 'resume':
      return str(m.room, 8) && str(m.token, 64) ? { t: 'resume', room: m.room, token: m.token, name } : null;
    case 'input':
      if (!int(m.seq, 0, Number.MAX_SAFE_INTEGER) || !vec(m.move) || !vec(m.aim)) return null;
      return { t: 'input', seq: m.seq, move: { x: m.move.x, y: m.move.y }, aim: { x: m.aim.x, y: m.aim.y }, attack: m.attack === true };
    case 'cmd': {
      const cmd = parseCommand(m.cmd);
      return cmd ? { t: 'cmd', cmd } : null;
    }
    case 'restart':
      return { t: 'restart' };
    case 'ping':
      return finite(m.ts) ? { t: 'ping', ts: m.ts } : null;
    default:
      return null;
  }
}

/** Zombie als Zahlenreihe: Id, Typ-Index, x, y, Blick, Leben, max. Leben, Zustände, Merkmale. */
type ZombieTuple = [number, number, number, number, number, number, number, number, number];

/** Zustands-Bits (Symbole und Färbung im Client). */
const ST_SLEEP = 1;
const ST_STUN = 2;
const ST_FEAR = 4;
const ST_BLIND = 8;
const ST_ROOT = 16;
const ST_MARKED = 32;
const ST_BURN = 64;
const ST_WEAK = 128;
const ST_ENRAGE = 256;
const ST_GOLD = 512;
/** Merkmale: Postbote bzw. neutral (Lager). */
const F_COURIER = 1;
const F_NEUTRAL = 2;

export interface Snapshot extends Omit<GameState, 'zombies' | 'wave' | 'rng' | 'nextId' | 'heroes' | 'objectives'> {
  zombies: ZombieTuple[];
  wave: Omit<GameState['wave'], 'queue'> & { queue: number };
  /** Ohne full fehlen die selten wechselnden Felder (SLOW_HERO_KEYS); der Client nimmt die letzten bekannten. */
  heroes: Partial<Hero>[];
  objectives: Partial<Objective>[];
  /** Vollständiger Schnappschuss (alle Felder)? */
  full: boolean;
}

/** Heldenfelder, die sich selten ändern: nur in vollständigen Schnappschüssen. */
export const SLOW_HERO_KEYS = ['inventory', 'consumables', 'score', 'ranks', 'skillPoints', 'counters', 'xp', 'level', 'gold', 'maxHp', 'defId', 'slot', 'radius', 'name', 'spells'] as const;
/** Zielfelder, die sich oft ändern (der Rest nur in vollständigen Schnappschüssen). */
const FAST_OBJECTIVE_KEYS = ['id', 'hp', 'destroyed', 'aggroUntil'] as const;

/** Schlüssel der selten wechselnden Daten: ändert er sich, schickt der Server einen vollständigen Schnappschuss. */
export function slowKey(state: GameState): string {
  const heroes = state.heroes.map((h) => SLOW_HERO_KEYS.map((k) => (h as unknown as Record<string, unknown>)[k]));
  const objectives = state.objectives.map((o) => [o.regrowIn, o.maxHp]);
  return JSON.stringify([heroes, objectives]);
}

const r2 = (v: number) => Math.round(v * 100) / 100;
/** Zahlen auf 2 Nachkommastellen runden (spart rund ein Drittel der Daten). */
const round = (_key: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? r2(v) : v);

/**
 * Server: Zustand plus gesammelte Ereignisse als Schnappschuss-JSON (ohne
 * Hülle; stateMessage setzt je Spieler die Bestätigung davor). zombieTypes:
 * Typ-Ids in fester Reihenfolge.
 */
export function encodeSnapshot(state: GameState, events: GameEvent[], zombieTypes: string[], full = true): string {
  const t = state.time;
  // PvP-Stellvertreter bleiben auf dem Server
  const zombies = state.zombies.filter((z) => z.avatarOf === undefined).map((z): ZombieTuple => {
    const st = z.st;
    const bits =
      (t < st.sleepUntil ? ST_SLEEP : 0) |
      (t < st.stunUntil ? ST_STUN : 0) |
      (t < st.fearUntil ? ST_FEAR : 0) |
      (t < st.blindUntil ? ST_BLIND : 0) |
      (t < st.rootUntil ? ST_ROOT : 0) |
      (t < st.markedUntil ? ST_MARKED : 0) |
      (t < (st.burnUntil ?? 0) ? ST_BURN : 0) |
      (t < (st.weakUntil ?? 0) ? ST_WEAK : 0) |
      (t < (st.enrageUntil ?? 0) ? ST_ENRAGE : 0) |
      (t < (st.goldUntil ?? 0) ? ST_GOLD : 0);
    const flags = (z.courier ? F_COURIER : 0) | (z.neutral ? F_NEUTRAL : 0);
    return [z.id, zombieTypes.indexOf(z.defId), r2(z.pos.x), r2(z.pos.y), r2(z.facing), Math.ceil(z.hp), Math.ceil(z.maxHp), bits, flags];
  });
  // Bot-Gehirne und Eingaben bleiben auf dem Server; der Client muss nur wissen, wer ein Bot ist.
  const heroes = state.heroes.map((h) => {
    const out: Partial<Hero> & Record<string, unknown> = { ...h, bot: h.bot ? ({ difficulty: h.bot.difficulty } as Hero['bot']) : undefined };
    delete out.input;
    delete out.pingTimes;
    // Endstatistik kommt erst fertig im gameOver-Ereignis
    delete out.stats;
    if (!full) for (const k of SLOW_HERO_KEYS) delete out[k];
    return out;
  });
  const objectives = full
    ? state.objectives
    : state.objectives.map((o) => Object.fromEntries(FAST_OBJECTIVE_KEYS.map((k) => [k, o[k]])) as Partial<Objective>);
  const snap: Snapshot = {
    tick: state.tick,
    time: state.time,
    heroes,
    zombies,
    projectiles: state.projectiles,
    objectives,
    full,
    zones: state.zones,
    delayed: [],
    wave: { ...state.wave, queue: state.wave.queue.length },
    kills: state.kills,
    pvp: state.pvp,
    gameOver: state.gameOver,
    events,
    camps: state.camps,
  };
  return JSON.stringify(snap, round);
}

/** Zustandsnachricht für einen Spieler: gemeinsamer Schnappschuss plus dessen ack (ohne erneutes Kodieren). */
export function stateMessage(snapshotJson: string, ack: number): string {
  return `{"t":"state","ack":${ack},"s":${snapshotJson}}`;
}

/** Client: Schnappschuss wieder in einen Spielzustand für Darstellung und HUD verwandeln. */
export function decodeSnapshot(s: Snapshot, zombieTypes: string[], radius: (defId: string) => number, prev?: GameState): GameState {
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
        burnUntil: until(bits, ST_BURN),
        weakUntil: until(bits, ST_WEAK),
        enrageUntil: until(bits, ST_ENRAGE),
        goldUntil: until(bits, ST_GOLD),
      },
      courier: flags & F_COURIER ? { wp: 0, dir: 1, leaveAt: Infinity } : undefined,
      neutral: flags & F_NEUTRAL ? { campId: null, home: { x, y }, returning: false } : undefined,
    };
  });
  // Fehlende (selten wechselnde) Felder vom letzten Zustand übernehmen
  const heroes = s.heroes.map((h) => {
    const old = prev?.heroes.find((x) => x.id === h.id);
    const merged = { ...old, ...h } as Hero;
    merged.input = { move: { x: 0, y: 0 }, aim: { ...merged.pos }, attack: false };
    return merged;
  });
  const objectives = s.objectives.map((o) => ({ ...prev?.objectives.find((x) => x.id === o.id), ...o }) as Objective);
  const { full: _full, ...rest } = s;
  return {
    ...rest,
    heroes,
    objectives,
    rng: 0,
    nextId: 0,
    zombies,
    wave: { ...s.wave, queue: Array<string>(s.wave.queue).fill('') },
  };
}
