import type { SimContext } from './context';
import { resolveObstacles } from './grid';
import type { Hero } from './types';

/**
 * Rückruf zur Basis: RECALL_TIME Sekunden stillhalten, dann steht
 * der Held im Innenhof (im PvP an der eigenen Basis). Laufen, Angreifen, eine
 * Fähigkeit, ein Zauber oder Schaden brechen ab.
 */
export const RECALL_TIME = 4;

export function startRecall(ctx: SimContext, h: Hero): void {
  if (!h.alive || h.recall || h.dash || h.benched) return;
  h.recall = { start: ctx.state.time, until: ctx.state.time + RECALL_TIME };
  h.input = { move: { x: 0, y: 0 }, aim: h.input.aim, attack: false };
  ctx.state.events.push({ type: 'recall', heroId: h.id, phase: 'start' });
}

export function cancelRecall(ctx: SimContext, h: Hero): void {
  if (!h.recall) return;
  h.recall = null;
  ctx.state.events.push({ type: 'recall', heroId: h.id, phase: 'cancel' });
}

/** Ort der Basis für diesen Helden. */
function basePos(ctx: SimContext, h: Hero): { x: number; y: number } {
  const pvp = ctx.data.economy.pvp;
  if (ctx.state.pvp && pvp) return { ...pvp.spawns[h.team ?? 0] };
  const start = ctx.data.arena.heroStart;
  return { x: start.x + h.slot * 1.5, y: start.y };
}

/** Pro Tick: abbrechen bei Bewegung, Angriff, Tod oder Sprung; nach Ablauf zur Basis. */
export function updateRecall(ctx: SimContext, h: Hero): void {
  const r = h.recall;
  if (!r) return;
  const moving = Math.hypot(h.input.move.x, h.input.move.y) > 0.05;
  if (!h.alive || h.dash || moving || h.input.attack) {
    cancelRecall(ctx, h);
    return;
  }
  if (ctx.state.time < r.until) return;
  h.recall = null;
  const from = { ...h.pos };
  h.pos = basePos(ctx, h);
  resolveObstacles(h.pos, h.radius, ctx.arena);
  ctx.state.events.push({ type: 'recall', heroId: h.id, phase: 'done', from });
}
