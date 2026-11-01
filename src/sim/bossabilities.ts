import { applyDamage, edgeDistance, isBoss } from './combat';
import type { SimContext } from './context';
import { face } from './movement';
import { addPlague } from './roles';
import { addBuff, heroCC } from './status';
import { DT, type Hero, type Zombie, type ZombieDef } from './types';
import { dist, type Vec2 } from './vec';
import { resolveObstacles } from './grid';
import { spawnZombieAt } from './waves';

/**
 * Fähigkeiten der Zwischenbosse wie bei den Helden: Abklingzeiten, erst eine
 * Warnung am Boden (windup), dann Schaden im Radius – wer rausläuft, weicht aus.
 *  - slam (schwerer Schlag aufs Ziel): trifft den Tank, sonst einen Weichen hart
 *  - nova (Fläche um den Boss): Seuche für alle in der Nähe → Support nötig
 *  - bolt (Einschläge bei mehreren Helden, bevorzugt hinten): Seuche, Druck auf Fernkämpfer
 * Dazu Wut: Wer zu lange lebt, wird immer stärker → Schaden nötig.
 * Gibt true zurück, solange der Boss ausholt (dann steht er).
 */
export function updateBossAbilities(ctx: SimContext, z: Zombie, def: ZombieDef, heroes: Hero[]): boolean {
  const abilities = def.abilities;
  if (!abilities?.length || z.neutral || z.courier) return false;
  const wave = ctx.state.wave.number;
  const a = (z.abil ??= { timers: abilities.map((ab, i) => ab.interval * (0.4 + 0.25 * i)), cast: null });
  const scale = (def.damage > 0 ? z.damage / def.damage : 1) * enrageFactor(ctx, z);

  if (a.cast) {
    const c = a.cast;
    c.left -= DT;
    if (c.left > 0) return true;
    const ab = abilities[c.i];
    for (const h of ctx.state.heroes) {
      if (!h.alive || !c.points.some((p) => dist(p, h.pos) <= ab.radius + h.radius)) continue;
      applyDamage(ctx, h, ab.damage * scale);
      if (ab.plague) addPlague(ctx, h, ab.plague);
      if (ab.stun) heroCC(ctx, h, 'stunned', ab.stun);
      if (ab.slow) addBuff(ctx, h, 'haste', -ab.slow.factor, ab.slow.duration, `frost-${z.id}`);
    }
    // Beschwören: Zombies an den Einschlagpunkten (gezählt für die Welle)
    const sdef = ab.summon ? ctx.zombieDefs.get(ab.summon.type) : undefined;
    if (ab.summon && sdef) {
      for (const p of c.points) {
        for (let k = 0; k < ab.summon.count; k++) {
          const a = (k / ab.summon.count) * Math.PI * 2;
          const at = { x: p.x + Math.cos(a) * 1.2, y: p.y + Math.sin(a) * 1.2 };
          resolveObstacles(at, sdef.radius, ctx.arena);
          spawnZombieAt(ctx, sdef, at);
        }
      }
    }
    ctx.state.events.push({ type: 'bossHit', zombieId: z.id, kind: ab.kind, points: c.points.map((p) => ({ ...p })), radius: ab.radius });
    a.cast = null;
    return true;
  }

  for (let i = 0; i < a.timers.length; i++) a.timers[i] = Math.max(0, a.timers[i] - DT);
  for (let i = 0; i < abilities.length; i++) {
    const ab = abilities[i];
    if (a.timers[i] > 0 || wave < (ab.fromWave ?? 0)) continue;
    const points = castPoints(ctx, z, ab, heroes);
    if (!points.length) continue;
    a.timers[i] = ab.interval;
    a.cast = { i, left: ab.windup, points };
    if (ab.kind !== 'nova') face(z, points[0]);
    ctx.state.events.push({ type: 'bossCast', zombieId: z.id, kind: ab.kind, name: ab.name, points: points.map((p) => ({ ...p })), radius: ab.radius, windup: ab.windup });
    return true;
  }
  return false;
}

/** Wohin die Fähigkeit zielt (leer: gerade niemand in Reichweite). */
function castPoints(ctx: SimContext, z: Zombie, ab: NonNullable<ZombieDef['abilities']>[number], heroes: Hero[]): Vec2[] {
  const inRange = heroes.filter((h) => h.alive && edgeDistance(z, h) <= ab.range && ctx.grid.lineOfSight(z.pos, h.pos));
  if (!inRange.length) return [];
  if (ab.kind === 'nova') return inRange.some((h) => dist(h.pos, z.pos) <= ab.radius + h.radius) ? [{ ...z.pos }] : [];
  if (ab.kind === 'slam') {
    const target = inRange.find((h) => h.id === z.targetId) ?? inRange.sort((p, q) => dist(p.pos, z.pos) - dist(q.pos, z.pos))[0];
    return [{ ...target.pos }];
  }
  // bolt: die weitesten zuerst (Fernkämpfer und Supports hinten)
  return inRange
    .sort((p, q) => dist(q.pos, z.pos) - dist(p.pos, z.pos))
    .slice(0, ab.count ?? 1)
    .map((h) => ({ ...h.pos }));
}

/** Wut-Faktor eines Bosses (1 = normal); setzt die Anzeige enrageUntil. */
export function enrageFactor(ctx: SimContext, z: Zombie): number {
  const cfg = ctx.data.waves.bossEnrage;
  if (!cfg || z.bornAt === undefined || z.neutral || z.courier || !isBoss(ctx, z)) return 1;
  const over = ctx.state.time - z.bornAt - cfg.after;
  if (over <= 0) return 1;
  z.st.enrageUntil = ctx.state.time + 0.5;
  return Math.min(cfg.max, 1 + over * cfg.perSecond);
}

/**
 * Team-Buff (wie Baron/Drachen in LoL): Fällt ein Zwischenboss, bekommen alle
 * lebenden Helden seine Wirkung für duration Sekunden. Gleicher Boss erneuert
 * nur die Dauer (kein Stapeln).
 */
export function applyTeamBuff(ctx: SimContext, def: ZombieDef): void {
  const b = def.teamBuff;
  if (!b) return;
  const source = `team-${def.id}`;
  for (const h of ctx.state.heroes) {
    if (!h.alive) continue;
    for (const [kind, value] of Object.entries(b.effects) as [keyof typeof b.effects, number][]) {
      addBuff(ctx, h, kind, kind === 'heal' ? value * h.maxHp : value, b.duration, source);
    }
  }
  ctx.state.events.push({ type: 'teamBuff', defId: def.id, name: b.name, icon: b.icon, duration: b.duration });
}
