import { applyDamage, edgeDistance } from './combat';
import type { SimContext } from './context';
import { resolveObstacles } from './grid';
import { face, stepToward } from './movement';
import { DT, type Hero, type Minion, type Zombie } from './types';
import { dist, type Vec2 } from './vec';

/** Werte der Trollarten (Grundwerte; Leben und Schaden kommen aus der Fähigkeit). */
const KIND = {
  troll: { radius: 0.55, speed: 3.6, range: 0.6, cooldown: 1.1, sight: 9 },
  bridge: { radius: 1.1, speed: 0, range: 0.9, cooldown: 1.4, sight: 3 },
  giant: { radius: 1.2, speed: 3.0, range: 0.9, cooldown: 1.5, sight: 10 },
} as const;

/** Troll beschwören. */
export function summonMinion(
  ctx: SimContext,
  owner: Hero,
  kind: Minion['kind'],
  pos: Vec2,
  o: { hp: number; damage: number; duration: number; taunt?: number },
): Minion {
  const k = KIND[kind];
  const p = { ...pos };
  resolveObstacles(p, k.radius, ctx.arena);
  const m: Minion = {
    id: ctx.state.nextId++,
    defId: `troll-${kind}`,
    ownerId: owner.id,
    kind,
    pos: p,
    radius: k.radius,
    speed: k.speed,
    facing: owner.facing,
    hp: o.hp,
    maxHp: o.hp,
    damage: o.damage,
    until: ctx.state.time + o.duration,
    attackTimer: 0.3,
    targetId: null,
    taunt: o.taunt,
  };
  (ctx.state.minions ??= []).push(m);
  ctx.state.events.push({ type: 'effect', kind: kind === 'bridge' ? 'bridgetroll' : 'trollcall', pos: { ...p }, radius: k.radius * 2, heroId: owner.id });
  return m;
}

/** Trolle eines Helden (lebend). */
export function minionsOf(ctx: SimContext, heroId: number): Minion[] {
  return (ctx.state.minions ?? []).filter((m) => m.ownerId === heroId && m.hp > 0);
}

/** Pro Tick: Trolle suchen Zombies, laufen hin und schlagen zu; abgelaufene verschwinden. */
export function updateMinions(ctx: SimContext): void {
  const { state } = ctx;
  if (!state.minions?.length) return;
  state.minions = state.minions.filter((m) => {
    if (m.hp <= 0 || m.until <= state.time) {
      state.events.push({ type: 'effect', kind: 'trollgone', pos: { ...m.pos }, radius: m.radius * 2, heroId: m.ownerId });
      return false;
    }
    const owner = state.heroes.find((h) => h.id === m.ownerId);
    const k = KIND[m.kind];
    const rage = state.time < (m.rageUntil ?? 0) ? 1.5 : 1;
    m.attackTimer = Math.max(0, m.attackTimer - DT * rage);
    // Ziel: nächster Zombie in Sichtweite (Brückentroll nur in Schlagweite)
    let target = m.targetId !== null ? state.zombies.find((z) => z.id === m.targetId && z.hp > 0) : undefined;
    if (!target || dist(target.pos, m.pos) > k.sight + 2) {
      target = undefined;
      let best: number = k.sight;
      for (const z of state.zombies) {
        if (z.hp <= 0 || z.avatarOf !== undefined && avatarTeam(ctx, z) === owner?.team) continue;
        const d = edgeDistance(m, z);
        if (d < best) {
          best = d;
          target = z;
        }
      }
      m.targetId = target?.id ?? null;
    }
    if (target) {
      if (edgeDistance(m, target) <= k.range) {
        face(m, target.pos);
        if (m.attackTimer <= 0) {
          m.attackTimer = k.cooldown;
          applyDamage(ctx, target, m.damage * rage, owner);
          state.events.push({ type: 'attack', id: m.id, targetId: target.id });
        }
      } else if (k.speed > 0) {
        stepToward(m, target.pos, k.speed * rage * DT);
        resolveObstacles(m.pos, m.radius, ctx.arena);
      }
    } else if (owner && k.speed > 0 && dist(m.pos, owner.pos) > 3) {
      // ohne Ziel: bei Lotte bleiben
      stepToward(m, owner.pos, k.speed * DT);
      resolveObstacles(m.pos, m.radius, ctx.arena);
    }
    return true;
  });
}

function avatarTeam(ctx: SimContext, z: Zombie): number | undefined {
  return ctx.state.heroes.find((h) => h.id === z.avatarOf)?.team;
}

/**
 * Für Zombies: Troll, den dieser Zombie angreifen soll (Brückentroll in
 * seinem Umkreis, sonst ein Troll direkt daneben). null = keiner.
 */
export function minionTarget(ctx: SimContext, z: Zombie): Minion | null {
  const list = ctx.state.minions;
  if (!list?.length) return null;
  let best: Minion | null = null;
  let bestD = Infinity;
  for (const m of list) {
    if (m.hp <= 0) continue;
    const d = edgeDistance(z, m);
    const reach = m.taunt ?? 0.8;
    if (d <= reach && d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}
