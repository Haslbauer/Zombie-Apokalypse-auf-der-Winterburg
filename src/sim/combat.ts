import { cancelRecall } from './recall';
import type { SimContext } from './context';
import { shotBlocked } from './grid';
import { kitOf } from './heroes/index';
import { awardBoss, awardGold } from './economy';
import { itemStats } from './items';
import { awardXp, heroDamage } from './progression';
import { roleDamageFactor } from './roles';
import { applyTeamBuff } from './bossabilities';
import { avatarHero, pvpKill } from './pvp';
import { noteDeath, noteKill, statsOf } from './stats';
import { absorbWithShield, buffSum, hasBuff } from './status';
import { DT, type Hero, type Projectile, type Zombie } from './types';
import { dist, type Vec2 } from './vec';

/** Bonus auf den ersten Treffer gegen einen schlafenden Zombie. */
const SLEEP_BONUS = 1.5;
/** So lange verfolgt ein gereiztes Tier (Ratte, Hornisse) den Helden, der es getroffen hat. */
const PROVOKE_TIME = 4;

/** Abstand von Rand zu Rand zweier runder Einheiten. */
export function edgeDistance(a: { pos: { x: number; y: number }; radius: number }, b: typeof a): number {
  return dist(a.pos, b.pos) - a.radius - b.radius;
}

/**
 * Zieht Leben ab und gibt den tatsächlich verursachten Schaden zurück.
 * Zombies: Schlafende nehmen beim ersten Treffer mehr Schaden und wachen auf.
 * Helden: Schadensreduktion und Schild greifen zuerst.
 * source ist der Held, der den Schaden verursacht (für Kampfstatus).
 */
export function applyDamage(ctx: SimContext, target: Hero | Zombie, amount: number, source?: Hero): number {
  // Schaden bricht den Rückruf zur Basis ab
  if (amount > 0 && 'recall' in target && target.recall) cancelRecall(ctx, target as Hero);
  if (target.hp <= 0 || amount <= 0) return 0;
  const { state } = ctx;
  // PvP: Schaden am Stellvertreter geht an den Helden (nur Gegner)
  if (!('alive' in target) && target.avatarOf !== undefined) {
    const victim = avatarHero(ctx, target);
    if (!victim || !victim.alive || (source && source.team === victim.team)) return 0;
    return applyDamage(ctx, victim, amount, source);
  }
  if ('alive' in target && source && state.pvp) {
    if (source.team === target.team) return 0;
    amount *= (source.handicap ?? 1) / (target.handicap ?? 1);
  }
  if (source) source.lastCombatAt = state.time;
  // Rollen: Tank nimmt weniger Schaden, Schaden-Rolle trifft Bosse härter
  const roleF = roleDamageFactor(ctx, target, source);
  amount *= roleF;

  if ('alive' in target) {
    target.lastCombatAt = state.time;
    if (hasBuff(target, 'invulnerable')) return 0;
    const reduction = Math.min(
      0.8,
      buffSum(target, 'damageReduction') + itemStats(ctx, target).damageReduction + (kitOf(target.defId).damageReduction?.(ctx, target) ?? 0),
    );
    amount = absorbWithShield(target, amount * (1 - reduction));
    if (amount <= 0) return 0;
  } else {
    // Heimkehrende Neutrale (zurückgesetztes Lager) sind unverwundbar
    if (target.neutral?.returning) return 0;
    if (source) {
      // Gereizt: Ratten und Hornissen beißen zurück
      target.st.provokedBy = source.id;
      target.st.provokedUntil = state.time + PROVOKE_TIME;
      noteContribution(ctx, target, source);
    }
    if (state.time < target.st.sleepUntil) {
      amount *= SLEEP_BONUS;
      target.st.sleepUntil = 0;
      state.events.push({ type: 'status', zombieId: target.id, status: 'wake' });
    }
  }

  const dealt = Math.min(amount, target.hp);
  target.hp -= dealt;
  // Endstatistik: Schaden an Zombies bzw. erlittener Schaden
  if ('alive' in target) statsOf(target).damageTaken += dealt;
  else if (source) statsOf(source).damage += dealt;
  state.events.push(roleF > 1 ? { type: 'hit', targetId: target.id, amount: dealt, pos: { ...target.pos }, bonus: true } : { type: 'hit', targetId: target.id, amount: dealt, pos: { ...target.pos } });
  if (target.hp > 0) return dealt;

  target.hp = 0;
  state.events.push({ type: 'death', id: target.id, pos: { ...target.pos } });
  if ('alive' in target) {
    // Gefallene Helden kommen nach einem Timer im Innenhof zurück (kein Game Over).
    const { respawn } = ctx.data.arena;
    target.alive = false;
    noteDeath(target);
    // Am Boden: Mitspieler können ihn eine Weile wiederbeleben
    target.downUntil = state.time + (ctx.data.economy.revive?.window ?? 0);
    target.reviveProgress = 0;
    target.dash = null;
    target.channel = null;
    target.input = { move: { x: 0, y: 0 }, aim: target.input.aim, attack: false };
    target.respawnAt = state.time + respawn.base + respawn.perWave * (state.wave.number - 1);
    if (state.pvp) pvpKill(ctx, target, source);
  } else {
    state.kills++;
    // Wer hat ihn erlegt (letzter Treffer; ohne Quelle: wer zuletzt beteiligt war), wer hat mitgekämpft?
    const killer = source ?? lastContributor(ctx, target);
    const assists = assistsOf(ctx, target, killer);
    awardXp(ctx, target, killer, assists);
    awardGold(ctx, target, killer, assists);
    if (killer) {
      killer.score.kills++;
      noteKill(killer, state.wave.number);
    }
    if (isBoss(ctx, target) && target.contrib) awardBoss(ctx, target, killer);
    // Zwischenboss erlegt: Team-Buff für alle lebenden Helden
    const zdef = ctx.zombieDefs.get(target.defId);
    if (zdef?.teamBuff) applyTeamBuff(ctx, zdef);
  }
  return dealt;
}

/** Ist dieser Zombie ein Boss (Elite, Postbote, große Neutrale)? */
export function isBoss(ctx: SimContext, z: Zombie): boolean {
  const rank = ctx.zombieDefs.get(z.defId)?.rank;
  return rank === 'elite' || rank === 'boss';
}

/** Zombies merken sich, wer ihnen wann Schaden gemacht hat (Kill, Assist, Boss-Gold). */
function noteContribution(ctx: SimContext, z: Zombie, h: Hero): void {
  h.activeWave = ctx.state.wave.number;
  z.contrib ??= [];
  const entry = z.contrib.find((c) => c.id === h.id);
  if (entry) entry.t = ctx.state.time;
  else z.contrib.push({ id: h.id, t: ctx.state.time });
}

/** Mitkämpfer: wer in den letzten Sekunden Schaden gemacht hat, ohne den Killer. */
function assistsOf(ctx: SimContext, z: Zombie, killer: Hero | undefined): Hero[] {
  const window = Math.max(ctx.data.economy.rewards.assistWindow, isBoss(ctx, z) ? ctx.data.economy.boss.assistWindow : 0);
  return (z.contrib ?? [])
    .filter((c) => c.id !== killer?.id && ctx.state.time - c.t <= window)
    .map((c) => ctx.state.heroes.find((h) => h.id === c.id))
    .filter((h): h is Hero => !!h);
}

function lastContributor(ctx: SimContext, z: Zombie): Hero | undefined {
  const window = ctx.data.economy.boss.assistWindow;
  const last = (z.contrib ?? []).filter((c) => ctx.state.time - c.t <= window).sort((a, b) => b.t - a.t)[0];
  return last ? ctx.state.heroes.find((h) => h.id === last.id) : undefined;
}

/** Schaden eines Helden mit Level-Wachstum und Buffs. */
export function heroHit(ctx: SimContext, h: Hero, z: Zombie, base: number): number {
  return applyDamage(ctx, z, heroDamage(ctx, h, base), h);
}

/**
 * Standardangriff in Blickrichtung. Nahkampf trifft alle Zombies im Bogen vor
 * dem Helden, Fernkampf feuert ein Projektil, das geradeaus fliegt.
 */
/**
 * Nahkampf im Laufen: Der Schlag trifft dort, wo der Held gleich ist (so viele
 * Sekunden Vorlauf), nicht hinter ihm. Online sieht man den eigenen Helden der
 * Server-Position voraus; ohne Vorlauf landete der Hieb sichtbar hinter ihm.
 */
export const MELEE_LEAD = 0.15;

/** So lange ist ein Held nach Angriff oder Fähigkeit auch im Versteck sichtbar (s). */
export const REVEAL_TIME = 1.5;

export function heroAttack(ctx: SimContext, h: Hero, cooldown: number): void {
  const attack = ctx.heroDefs.get(h.defId)!.attack;
  h.attackTimer = cooldown;
  h.revealedUntil = ctx.state.time + REVEAL_TIME;
  const dir = { x: Math.cos(h.facing), y: Math.sin(h.facing) };
  const range = attack.range * (1 + itemStats(ctx, h).range);

  if (attack.type === 'melee') {
    const arc = ((attack.arc ?? 90) * Math.PI) / 180;
    ctx.state.events.push({ type: 'swing', id: h.id, facing: h.facing, range, arc });
    const behind = attack.reachBehind ?? 0;
    const narrow = ((attack.reachArc ?? 60) * Math.PI) / 180;
    // Im Laufen: Trefferbogen ein Stück in Laufrichtung vorziehen
    const m = h.input?.move ?? { x: 0, y: 0 };
    const len = Math.min(1, Math.hypot(m.x, m.y));
    const lead = len > 0.1 && !h.dash ? (h.speed * MELEE_LEAD) / Math.max(1, Math.hypot(m.x, m.y)) : 0;
    const origin = lead > 0 ? { ...h, pos: { x: h.pos.x + m.x * lead, y: h.pos.y + m.y * lead } } : h;
    for (const z of ctx.state.zombies) {
      if (z.hp <= 0) continue;
      if (inArc(origin, z, h.facing, arc, range) || (lead > 0 && inArc(h, z, h.facing, arc, range))) {
        const dealt = heroHit(ctx, h, z, attack.damage);
        kitOf(h.defId).onBasicHit?.(ctx, h, z, dealt);
      } else if (behind > 0 && inArc(origin, z, h.facing, narrow, range + behind)) {
        // Wucht: auch knapp dahinter, mit weniger Schaden
        heroHit(ctx, h, z, attack.damage * (attack.reachFactor ?? 0.5));
      }
    }
    return;
  }

  ctx.state.events.push({ type: 'shot', id: h.id });
  fireProjectile(ctx, h, dir, {
    speed: attack.projectileSpeed!,
    damage: attack.damage,
    radius: attack.projectileRadius ?? 0.2,
    range,
    tag: 'basic',
    look: attack.look,
    pierceCount: attack.pierce,
    pierceFalloff: attack.pierceFalloff,
  });
}

/** Projektil vom Rand des Helden aus abfeuern. */
export function fireProjectile(
  ctx: SimContext,
  h: Hero,
  dir: Vec2,
  o: { speed: number; damage: number; radius: number; range: number; tag: string; look?: string; pierce?: boolean; pierceCount?: number; pierceFalloff?: number },
): Projectile {
  const p: Projectile = {
    id: ctx.state.nextId++,
    ownerId: h.id,
    pos: { x: h.pos.x + dir.x * h.radius, y: h.pos.y + dir.y * h.radius },
    dir,
    speed: o.speed,
    damage: o.damage,
    radius: o.radius,
    remaining: o.range,
    tag: o.tag,
    look: o.look,
    pierce: o.pierce || (o.pierceCount ?? 0) > 0,
    hitIds: o.pierce || (o.pierceCount ?? 0) > 0 ? [] : undefined,
    pierceLeft: o.pierce ? undefined : o.pierceCount || undefined,
    pierceFalloff: o.pierceFalloff,
  };
  ctx.state.projectiles.push(p);
  return p;
}

/**
 * Liegt der Zombie im Schlagbogen? Randabstand höchstens range und Richtung
 * innerhalb von ±arc/2 (plus die halbe Breite des Zombies aus Sicht des Helden).
 */
export function inArc(h: Hero, z: Zombie, facing: number, arc: number, range: number): boolean {
  if (edgeDistance(h, z) > range) return false;
  const dx = z.pos.x - h.pos.x;
  const dy = z.pos.y - h.pos.y;
  const d = Math.hypot(dx, dy);
  if (d <= h.radius + z.radius) return true; // berührt den Helden
  let diff = Math.atan2(dy, dx) - facing;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) <= arc / 2 + Math.asin(Math.min(1, z.radius / d));
}

/** Projektile fliegen geradeaus, treffen den ersten Zombie auf ihrer Bahn (bzw. alle beim Durchschlagen) oder enden an Hindernissen. */
export function updateProjectiles(ctx: SimContext): void {
  const { state } = ctx;
  state.projectiles = state.projectiles.filter((p) => {
    const step = Math.min(p.speed * DT, p.remaining);
    const from = p.pos;

    // Treffer entlang der Strecke from → from + dir * step, nach Entfernung sortiert
    const hits: { z: Zombie; t: number }[] = [];
    for (const z of state.zombies) {
      if (z.hp <= 0 || p.hitIds?.includes(z.id)) continue;
      const t = sweepCircle(from, p.dir, step, z.pos, z.radius + p.radius);
      if (t !== null) hits.push({ z, t });
    }
    hits.sort((a, b) => a.t - b.t || a.z.id - b.z.id);
    const firstT = !p.pierce && hits.length > 0 ? hits[0].t : Infinity;

    // Hindernisse in kleinen Schritten prüfen, damit dünne Hecken nicht übersprungen werden.
    let blockedAt = Infinity;
    const samples = Math.ceil(step / 0.25);
    for (let i = 1; i <= samples; i++) {
      const t = (step * i) / samples;
      if (t >= firstT) break;
      if (shotBlocked({ x: from.x + p.dir.x * t, y: from.y + p.dir.y * t }, ctx.arena)) {
        blockedAt = t;
        break;
      }
    }

    const owner = state.heroes.find((h) => h.id === p.ownerId);
    for (const { z, t } of hits) {
      if (t >= blockedAt) break;
      if (owner) projectileHit(ctx, owner, z, p);
      if (!p.pierce) return false;
      p.hitIds!.push(z.id);
      // Begrenzter Durchschlag: weniger Schaden für das nächste Ziel, irgendwann Schluss
      if (p.pierceLeft !== undefined) {
        if (p.pierceLeft <= 0) return false;
        p.pierceLeft--;
        p.damage *= p.pierceFalloff ?? 1;
      }
    }
    if (blockedAt < Infinity) return false;
    p.pos = { x: from.x + p.dir.x * step, y: from.y + p.dir.y * step };
    p.remaining -= step;
    return p.remaining > 1e-6;
  });
}

function projectileHit(ctx: SimContext, owner: Hero, z: Zombie, p: Projectile): void {
  const kit = kitOf(owner.defId);
  if (p.tag === 'basic') {
    const dealt = heroHit(ctx, owner, z, p.damage);
    kit.onBasicHit?.(ctx, owner, z, dealt);
  } else if (kit.onProjectileHit) {
    kit.onProjectileHit(ctx, owner, z, p);
  } else {
    heroHit(ctx, owner, z, p.damage);
  }
}

/**
 * Strahl from + dir * t (0 <= t <= maxT) gegen einen Kreis. Gibt das kleinste t
 * zurück, bei dem der Strahl den Kreis berührt, sonst null.
 */
function sweepCircle(from: Vec2, dir: Vec2, maxT: number, center: Vec2, r: number): number | null {
  const fx = from.x - center.x;
  const fy = from.y - center.y;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const b = fx * dir.x + fy * dir.y;
  if (b > 0) return null; // fliegt weg
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t <= maxT ? t : null;
}
