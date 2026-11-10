import { applyDamage, isBoss } from './combat';
import type { DataContext, SimContext } from './context';
import { healHero } from './stats';
import { DT, type Hero, type TeamRole, type Zombie } from './types';
import { dist } from './vec';

/**
 * Rollen: Tank (zieht Bosse auf sich, hält mehr aus), Schaden
 * (mehr Schaden an Bossen) und Support (heilt und reinigt Seuche in der Nähe).
 * Die Bossfähigkeiten sind so gebaut, dass jede Rolle gebraucht wird.
 */
export function teamRoleOf(ctx: DataContext, defId: string): TeamRole | undefined {
  return ctx.data.bots.heroes[defId]?.teamRole;
}

/** Fehlende Rollen eines Teams (Helden-Ids). */
export function missingRoles(ctx: DataContext, heroIds: readonly string[]): TeamRole[] {
  const have = new Set(heroIds.map((id) => teamRoleOf(ctx, id)));
  return (['tank', 'dmg', 'support'] as TeamRole[]).filter((r) => !have.has(r));
}

/** Schadensfaktor durch Rollen: Tank nimmt weniger, Schaden macht mehr an Bossen. */
export function roleDamageFactor(ctx: SimContext, target: Hero | Zombie, source?: Hero): number {
  const roles = ctx.data.economy.roles;
  if (!roles) return 1;
  if ('alive' in target) return teamRoleOf(ctx, target.defId) === 'tank' ? 1 - roles.tank.damageReduction : 1;
  if (!source || teamRoleOf(ctx, source.defId) !== 'dmg') return 1;
  let f = isBoss(ctx, target) ? 1 + roles.dmg.bossDamage : 1;
  // Kombo: Ziel ist betäubt, festgehalten oder schläft (meist vom Tank)
  const t = ctx.state.time;
  if (roles.combos && (t < target.st.stunUntil || t < target.st.rootUntil || t < target.st.sleepUntil)) f *= 1 + roles.combos.controlledBonus;
  return f;
}

/** Kombo: Heilung und Schilde eines Supports wirken auf einem Tank stärker. */
export function supportOnTankFactor(ctx: DataContext, healer: Hero | undefined, target: Hero): number {
  const c = ctx.data.economy.roles?.combos;
  if (!c || !healer || teamRoleOf(ctx, healer.defId) !== 'support' || teamRoleOf(ctx, target.defId) !== 'tank') return 1;
  return 1 + c.supportOnTank;
}

/** Bosse und Elites gehen auf einen Tank in der Nähe (Bedrohung), sonst null. */
export function threatTarget(ctx: SimContext, z: Zombie, heroes: Hero[]): Hero | null {
  const roles = ctx.data.economy.roles;
  if (!roles || !isBoss(ctx, z) || z.neutral) return null;
  let best: Hero | null = null;
  let bestD = roles.tank.threatRange;
  for (const h of heroes) {
    if (!h.alive || teamRoleOf(ctx, h.defId) !== 'tank') continue;
    const d = dist(z.pos, h.pos) - h.radius - z.radius;
    if (d <= bestD && ctx.grid.lineOfSight(z.pos, h.pos)) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

/** Seuche auftragen (Bossfähigkeiten): stapelt bis maxStacks, frischt die Dauer auf. */
export function addPlague(ctx: SimContext, h: Hero, stacks = 1): void {
  const p = ctx.data.economy.plague;
  if (!p || !h.alive) return;
  const cur = h.plague && h.plague.until > ctx.state.time ? h.plague.stacks : 0;
  h.plague = { stacks: Math.min(p.maxStacks, cur + stacks), until: ctx.state.time + p.duration };
}

/** Pro Tick: Seuche schadet, Supports heilen und reinigen Verbündete in ihrer Nähe. */
export function updateRoles(ctx: SimContext): void {
  const { state } = ctx;
  const plague = ctx.data.economy.plague;
  const roles = ctx.data.economy.roles;
  // Seuche: alle 0,5 s Schaden je Stapel
  const every = Math.round(0.5 / DT);
  for (const h of state.heroes) {
    if (!h.plague) continue;
    if (!h.alive || h.plague.until <= state.time) {
      h.plague = null;
      continue;
    }
    if (plague && state.tick % every === 0) applyDamage(ctx, h, plague.dpsPerStack * h.plague.stacks * 0.5);
  }
  if (!roles) return;
  const s = roles.support;
  const cleanseTicks = Math.max(1, Math.round(s.cleanseEvery / DT));
  for (const sup of state.heroes) {
    if (!sup.alive || teamRoleOf(ctx, sup.defId) !== 'support') continue;
    for (const ally of state.heroes) {
      if (!ally.alive || dist(ally.pos, sup.pos) > s.auraRadius) continue;
      if (ally.hp < ally.maxHp) healHero(ctx, ally, ally.maxHp * s.auraHeal * DT, sup);
      if (ally.plague && (state.tick + sup.id) % cleanseTicks === 0) {
        ally.plague = null;
        state.events.push({ type: 'effect', kind: 'cleanse', pos: { ...ally.pos }, radius: 1.2, heroId: sup.id });
      }
    }
  }
}
