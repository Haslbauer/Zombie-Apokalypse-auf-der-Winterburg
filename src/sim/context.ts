import type { Grid } from './grid';
import type { GameData, GameState, HeroDef, ZombieDef } from './types';

/** Alles, was die Teilsysteme eines Ticks brauchen. */
export interface SimContext {
  state: GameState;
  data: GameData;
  grid: Grid;
  heroDefs: Map<string, HeroDef>;
  zombieDefs: Map<string, ZombieDef>;
}
