import type { SimContext } from './context';
import { teamRoleOf } from './roles';
import { DT, type Hero } from './types';
import { dist } from './vec';

/**
 * Wiederbeleben: Gefallene liegen window Sekunden am Boden. Steht ein
 * Mitspieler daneben (range), füllt sich der Fortschritt (time Sekunden,
 * Supports schneller); ohne Helfer sinkt er langsam. Voll: steht mit hp
 * Anteil Leben an Ort und Stelle auf. Sonst greift der normale Respawn.
 */
export function updateRevive(ctx: SimContext): void {
  const cfg = ctx.data.economy.revive;
  if (!cfg) return;
  const { state } = ctx;
  for (const h of state.heroes) {
    if (h.alive || h.benched || (h.downUntil ?? 0) <= state.time) continue;
    const helpers = state.heroes.filter((a) => a.alive && a !== h && (a.team ?? 0) === (h.team ?? 0) && dist(a.pos, h.pos) <= cfg.range + a.radius + h.radius);
    if (helpers.length === 0) {
      h.reviveProgress = Math.max(0, (h.reviveProgress ?? 0) - (DT / cfg.time) * cfg.decay);
      continue;
    }
    const fastest = Math.min(...helpers.map((a) => (teamRoleOf(ctx, a.defId) === 'support' ? cfg.supportTime : cfg.time)));
    h.reviveProgress = Math.min(1, (h.reviveProgress ?? 0) + DT / fastest);
    if (h.reviveProgress >= 1) revive(ctx, h, helpers[0]);
  }
}

function revive(ctx: SimContext, h: Hero, by: Hero): void {
  const cfg = ctx.data.economy.revive!;
  h.alive = true;
  h.hp = Math.round(h.maxHp * cfg.hp);
  h.buffs = [];
  h.dash = null;
  h.channel = null;
  h.downUntil = 0;
  h.reviveProgress = 0;
  h.respawnAt = 0;
  ctx.state.events.push({ type: 'revive', id: h.id, by: by.id });
}

/** Gefallene Mitspieler, die man noch wiederbeleben kann (für Bots). */
export function downedAllies(ctx: SimContext, h: Hero): Hero[] {
  return ctx.state.heroes.filter((a) => a !== h && !a.alive && !a.benched && (a.team ?? 0) === (h.team ?? 0) && (a.downUntil ?? 0) > ctx.state.time + 1);
}
