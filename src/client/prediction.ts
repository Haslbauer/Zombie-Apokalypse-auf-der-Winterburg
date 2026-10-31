import type { SimContext } from '../sim/context';
import { collisionArena } from '../sim/game';
import { resolveObstacles } from '../sim/grid';
import { moveHero } from '../sim/hero';
import { hasBuff } from '../sim/status';
import type { ArenaDef, GameData, GameState, Hero, HeroDef, ZombieDef } from '../sim/types';
import type { Vec2 } from '../sim/vec';

/** Ab dieser Abweichung zur Server-Position wird sofort umgesetzt statt weich ausgeglichen (m). */
const SNAP_DISTANCE = 2;
/** Zeitkonstante des weichen Ausgleichs (s). */
const SMOOTH_TIME = 0.15;

/**
 * Vorhersage der eigenen Bewegung im Mehrspieler: Der Client bewegt den
 * eigenen Helden sofort mit derselben Formel wie die Simulation (moveHero und
 * Hindernisse). Jeder Zustand vom Server bestätigt Eingaben bis ack; die
 * übrigen werden auf die Server-Position erneut angewendet. Abweichungen
 * werden weich ausgeglichen. Im Sprung, beim Kanalisieren, betäubt oder
 * festgehalten gilt einfach die Server-Position.
 *
 * Gezeichnet wird zwischen der Position vor und nach dem letzten Eingabe-Tick
 * (Anteil alpha), sonst sähe man die 50-ms-Schritte als Ruckeln.
 */
export class Prediction {
  private readonly arena: ArenaDef;
  private readonly heroDefs: Map<string, HeroDef>;
  private readonly zombieDefs: Map<string, ZombieDef>;
  private pending: { seq: number; move: Vec2 }[] = [];
  /** Vorhergesagte Position nach dem letzten Eingabe-Tick (null: Server-Position gilt) … */
  private pos: Vec2 | null = null;
  /** … und davor (für das Überblenden zwischen zwei Ticks). */
  private before: Vec2 | null = null;
  /** Darstellungsversatz, der nach einer Korrektur abklingt. */
  private offset: Vec2 = { x: 0, y: 0 };
  private server: Hero | null = null;
  private state: GameState | null = null;

  constructor(private readonly data: GameData) {
    this.arena = collisionArena(data);
    this.heroDefs = new Map(data.heroes.map((h) => [h.id, h]));
    this.zombieDefs = new Map(data.zombies.map((z) => [z.id, z]));
  }

  /** Kann die eigene Bewegung gerade vorhergesagt werden? */
  static movable(h: Hero): boolean {
    return h.alive && !h.dash && !h.channel && !hasBuff(h, 'stunned') && !hasBuff(h, 'rooted');
  }

  /** Neue Eingabe (lokal sofort anwenden). */
  apply(seq: number, move: Vec2): void {
    this.pending.push({ seq, move: { ...move } });
    if (this.pending.length > 120) this.pending.shift(); // ohne Server-Antwort nicht endlos sammeln
    if (this.server && this.state && this.pos && Prediction.movable(this.server)) {
      this.before = this.pos;
      this.pos = this.step(this.pos, move);
    }
  }

  /** Zustand vom Server: Server-Position plus noch unbestätigte Eingaben. */
  reconcile(state: GameState, hero: Hero, ack: number): void {
    this.state = state;
    this.server = hero;
    this.pending = this.pending.filter((p) => p.seq > ack);
    if (!Prediction.movable(hero)) {
      this.pos = null;
      this.before = null;
      this.offset = { x: 0, y: 0 };
      return;
    }
    let p = { ...hero.pos };
    let before = p;
    for (const input of this.pending) {
      before = p;
      p = this.step(p, input.move);
    }
    if (this.pos) {
      // Bisher gezeigter Ort minus neuer Ort = Fehler, der weich abgebaut wird
      const ex = this.pos.x + this.offset.x - p.x;
      const ey = this.pos.y + this.offset.y - p.y;
      this.offset = Math.hypot(ex, ey) > SNAP_DISTANCE ? { x: 0, y: 0 } : { x: ex, y: ey };
    }
    this.pos = p;
    this.before = before;
  }

  /**
   * Darzustellende Position (null: Server-Position verwenden). alpha: Anteil
   * der Zeit seit dem letzten Eingabe-Tick (0–1); dt baut den Korrekturversatz ab.
   */
  display(dt: number, alpha = 1): Vec2 | null {
    if (!this.pos) return null;
    const k = Math.exp(-dt / SMOOTH_TIME);
    this.offset = { x: this.offset.x * k, y: this.offset.y * k };
    const from = this.before ?? this.pos;
    const a = Math.max(0, Math.min(1, alpha));
    return { x: from.x + (this.pos.x - from.x) * a + this.offset.x, y: from.y + (this.pos.y - from.y) * a + this.offset.y };
  }

  reset(): void {
    this.pending = [];
    this.pos = null;
    this.before = null;
    this.offset = { x: 0, y: 0 };
    this.server = null;
  }

  /** Ein Tick Bewegung ab p, wie in der Simulation (Tempo, Buffs, Items, Fähigkeit, Hindernisse). */
  private step(p: Vec2, move: Vec2): Vec2 {
    const h = this.server!;
    const ghost: Hero = { ...h, pos: { ...p }, input: { ...h.input, move } };
    // Die Bewegung liest nur Zustand, Daten, Karte und Definitionen; mehr braucht die Vorhersage nicht.
    const ctx = { state: this.state!, data: this.data, arena: this.arena, heroDefs: this.heroDefs, zombieDefs: this.zombieDefs } as unknown as SimContext;
    moveHero(ctx, ghost, move);
    resolveObstacles(ghost.pos, ghost.radius, this.arena);
    return ghost.pos;
  }
}
