import type { Grid } from './grid';
import type { ArenaDef, GameData, GameState, HeroDef, ZombieDef } from './types';

/** Alles, was die Teilsysteme eines Ticks brauchen. */
export interface SimContext {
  state: GameState;
  data: GameData;
  grid: Grid;
  /** Karte inklusive der Ziele als Hindernisse (für Kollision und Schüsse). */
  arena: ArenaDef;
  /** Statische Distanzfelder zu jedem Ziel (Objective-Id → Feld). */
  objectiveFields: Map<string, Float32Array>;
  heroDefs: Map<string, HeroDef>;
  zombieDefs: Map<string, ZombieDef>;
}
