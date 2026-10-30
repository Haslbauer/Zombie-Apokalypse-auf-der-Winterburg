import type { SimContext } from './context';
import type { Buff, BuffKind, Hero, Zombie, ZombieStatus } from './types';
import type { Vec2 } from './vec';

// ---------- Zombies ----------

export function emptyStatus(): ZombieStatus {
  return {
    slowUntil: 0,
    slowFactor: 1,
    stunUntil: 0,
    sleepUntil: 0,
    fearUntil: 0,
    fearFrom: { x: 0, y: 0 },
    blindUntil: 0,
    rootUntil: 0,
    markedUntil: 0,
    drowsy: 0,
    drowsyUntil: 0,
    heldBy: null,
  };
}

/** Schläft, ist betäubt oder fürchtet sich: Der Zombie greift nicht an. */
export function isDisabled(ctx: SimContext, z: Zombie): boolean {
  const t = ctx.state.time;
  return t < z.st.stunUntil || t < z.st.sleepUntil;
}

export const isSleeping = (ctx: SimContext, z: Zombie) => ctx.state.time < z.st.sleepUntil;
export const isFeared = (ctx: SimContext, z: Zombie) => ctx.state.time < z.st.fearUntil;
export const isBlind = (ctx: SimContext, z: Zombie) => ctx.state.time < z.st.blindUntil;
export const isRooted = (ctx: SimContext, z: Zombie) => ctx.state.time < z.st.rootUntil;
export const isMarked = (ctx: SimContext, z: Zombie) => ctx.state.time < z.st.markedUntil;

function rankOf(ctx: SimContext, z: Zombie): 'normal' | 'elite' | 'boss' {
  return ctx.zombieDefs.get(z.defId)?.rank ?? 'normal';
}

/** Tempo-Faktor durch Verlangsamung und Mondlicht-Stapel. */
export function statusSpeedFactor(ctx: SimContext, z: Zombie, drowsyPerStack = 0.15): number {
  const t = ctx.state.time;
  let f = t < z.st.slowUntil ? z.st.slowFactor : 1;
  if (t < z.st.drowsyUntil) f *= Math.max(0.2, 1 - drowsyPerStack * z.st.drowsy);
  return f;
}

/** Verlangsamen; der stärkere Effekt gewinnt, die Dauer verlängert sich. */
export function slow(ctx: SimContext, z: Zombie, factor: number, duration: number): void {
  const t = ctx.state.time;
  if (t >= z.st.slowUntil) z.st.slowFactor = factor;
  else z.st.slowFactor = Math.min(z.st.slowFactor, factor);
  z.st.slowUntil = Math.max(z.st.slowUntil, t + duration);
}

export function stun(ctx: SimContext, z: Zombie, duration: number): void {
  z.st.stunUntil = Math.max(z.st.stunUntil, ctx.state.time + duration);
  ctx.state.events.push({ type: 'status', zombieId: z.id, status: 'stun' });
}

/** Schlaf-Regel: Elite schlafen halb so lang, Bosse gar nicht. Schaden weckt. */
export function sleep(ctx: SimContext, z: Zombie, duration: number): void {
  const rank = rankOf(ctx, z);
  if (rank === 'boss') return;
  const d = rank === 'elite' ? duration / 2 : duration;
  z.st.sleepUntil = Math.max(z.st.sleepUntil, ctx.state.time + d);
  z.targetId = null;
  ctx.state.events.push({ type: 'status', zombieId: z.id, status: 'sleep' });
}

export function fear(ctx: SimContext, z: Zombie, from: Vec2, duration: number): void {
  z.st.fearUntil = Math.max(z.st.fearUntil, ctx.state.time + duration);
  z.st.fearFrom = { ...from };
  z.targetId = null;
  ctx.state.events.push({ type: 'status', zombieId: z.id, status: 'fear' });
}

/** Geblendet (Rauch): verliert sein Ziel, sieht kaum etwas, torkelt, verfehlt oft. */
export function blind(ctx: SimContext, z: Zombie, duration: number): void {
  const wasBlind = isBlind(ctx, z);
  z.st.blindUntil = Math.max(z.st.blindUntil, ctx.state.time + duration);
  z.targetId = null;
  if (!wasBlind) ctx.state.events.push({ type: 'status', zombieId: z.id, status: 'blind' });
}

export function root(ctx: SimContext, z: Zombie, duration: number, heldBy: number | null = null): void {
  z.st.rootUntil = Math.max(z.st.rootUntil, ctx.state.time + duration);
  z.st.heldBy = heldBy;
}

export function mark(ctx: SimContext, z: Zombie, duration: number): void {
  z.st.markedUntil = Math.max(z.st.markedUntil, ctx.state.time + duration);
  ctx.state.events.push({ type: 'status', zombieId: z.id, status: 'mark' });
}

/** Rückstoß: Zombie um distance weg von from schieben (Kollision folgt im selben Tick). */
export function knockback(z: Zombie, from: Vec2, distance: number): void {
  const dx = z.pos.x - from.x;
  const dy = z.pos.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  z.pos.x += (dx / d) * distance;
  z.pos.y += (dy / d) * distance;
}

// ---------- Helden ----------

/** Buff setzen; ein Buff gleicher Herkunft und Art wird ersetzt. */
export function addBuff(ctx: SimContext, h: Hero, kind: BuffKind, value: number, duration: number, source: string): void {
  h.buffs = h.buffs.filter((b) => !(b.kind === kind && b.source === source));
  h.buffs.push({ kind, value, until: ctx.state.time + duration, source });
}

export function hasBuff(h: Hero, kind: BuffKind): boolean {
  return h.buffs.some((b) => b.kind === kind);
}

/** Summe aller Buffs einer Art (z. B. +0.3 Tempo und +0.1 Tempo = 0.4). */
export function buffSum(h: Hero, kind: BuffKind): number {
  let s = 0;
  for (const b of h.buffs) if (b.kind === kind) s += b.value;
  return s;
}

/** Abgelaufene Buffs entfernen, Heilung über Zeit anwenden. */
export function updateBuffs(ctx: SimContext, h: Hero, dt: number): void {
  const t = ctx.state.time;
  h.buffs = h.buffs.filter((b: Buff) => b.until > t && !(b.kind === 'shield' && b.value <= 0));
  const heal = buffSum(h, 'heal');
  if (heal > 0) h.hp = Math.min(h.maxHp, h.hp + heal * dt);
}

/** Schild fängt Schaden ab; gibt den Rest zurück, der durchkommt. */
export function absorbWithShield(h: Hero, amount: number): number {
  let rest = amount;
  for (const b of h.buffs) {
    if (b.kind !== 'shield' || rest <= 0) continue;
    const used = Math.min(b.value, rest);
    b.value -= used;
    rest -= used;
  }
  return rest;
}

export function shieldAmount(h: Hero): number {
  return buffSum(h, 'shield');
}
