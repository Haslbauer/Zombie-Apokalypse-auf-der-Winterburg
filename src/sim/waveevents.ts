import type { DataContext, SimContext } from './context';
import { nextRandom } from './rng';
import type { WaveEventKind } from './types';

/**
 * Zufällige Wellen-Ereignisse (ab fromWave, Wahrscheinlichkeit chance,
 * höchstens alle gap Wellen):
 *  - Nebelnacht: Zombies sehen Helden erst später (Aggro-Reichweite ×aggro), dichter Nebel im Client
 *  - Blutmond: Zwischenbosse ×elites, Kill-Gold ×gold, rotes Licht
 *  - Regen: alle langsamer (×speed), Brand schwächer (×burn), Regen im Client
 */
export function rollWaveEvent(ctx: SimContext): WaveEventKind | null {
  const cfg = ctx.data.waves.events;
  const w = ctx.state.wave;
  w.event = null;
  // Mutator: jede Welle dasselbe Ereignis (Ansage nur in der ersten)
  const forced = ctx.state.mutator?.event;
  if (forced && cfg?.list[forced] && !ctx.state.pvp) {
    w.event = forced;
    w.lastEventWave = w.number;
    const e = cfg.list[forced];
    if (w.number === 1) ctx.state.events.push({ type: 'waveEvent', kind: forced, name: e.name, text: e.text });
    return forced;
  }
  if (!cfg || ctx.state.pvp || w.number < cfg.fromWave) return null;
  if (w.lastEventWave !== undefined && w.number - w.lastEventWave < cfg.gap) return null;
  if (nextRandom(ctx.state) >= cfg.chance) return null;
  const kinds = Object.keys(cfg.list) as WaveEventKind[];
  const kind = kinds[Math.floor(nextRandom(ctx.state) * kinds.length) % kinds.length];
  w.event = kind;
  w.lastEventWave = w.number;
  const e = cfg.list[kind];
  ctx.state.events.push({ type: 'waveEvent', kind, name: e.name, text: e.text });
  return kind;
}

/** Wert des laufenden Ereignisses (1, wenn keins oder ohne diesen Wert). */
export function eventFactor(ctx: DataContext, key: 'aggro' | 'elites' | 'gold' | 'speed' | 'burn'): number {
  const kind = ctx.state.wave.event;
  if (!kind || ctx.state.wave.phase !== 'wave') return 1;
  return ctx.data.waves.events?.list[kind]?.[key] ?? 1;
}
