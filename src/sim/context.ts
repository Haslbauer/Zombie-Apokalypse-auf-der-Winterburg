import type { Grid } from './grid';
import type { ArenaDef, GameData, GameState, HeroDef, ZombieDef } from './types';

/** Alles, was die Teilsysteme eines Ticks brauchen. */
export interface SimContext {
  state: GameState;
  data: GameData;
  grid: Grid;
  /** Karte inklusive der Ziele als Hindernisse (für Kollision und Schüsse). */
  arena: ArenaDef;
  /** Distanzfelder zu jedem Ziel und jeder Zielgruppe (Id bzw. Art → Feld). */
  objectiveFields: Map<string, Float32Array>;
  /** Kleine Einheiten (Ratten): eigene Karte ohne Rattenloch, eigenes Raster und eigene Felder. */
  smallArena: ArenaDef;
  smallGrid: Grid;
  smallObjectiveFields: Map<string, Float32Array>;
  /** Felder einer Zielgruppe neu berechnen (z. B. wenn ein Hochbeet zerstört wird oder nachwächst). */
  refreshObjectiveFields(kind: string): void;
  /** Hindernisse neu berechnen (z. B. Barrikade gebaut oder zerstört). */
  rebuildCollision?(): void;
  heroDefs: Map<string, HeroDef>;
  zombieDefs: Map<string, ZombieDef>;
}

/** Nur Zustand und Daten: reicht für Abfragen, die auch der Mehrspieler-Client ohne eigene Simulation stellt. */
export type DataContext = Pick<SimContext, 'state' | 'data'>;
