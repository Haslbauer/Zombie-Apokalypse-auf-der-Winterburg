import { applyDamage, edgeDistance } from './combat';
import type { SimContext } from './context';
import { resolveObstacles } from './grid';
import { face } from './movement';
import { heroCC, isBlind } from './status';
import { DT, type Hero, type Zombie, type ZombieDef } from './types';
import { spawnZombieAt } from './waves';

/**
 * Spezialfähigkeiten der Elites. Gibt true zurück, solange die Fähigkeit den
 * Zombie beschäftigt (dann entfällt die normale KI in diesem Tick).
 */
export function updateElite(ctx: SimContext, z: Zombie, def: ZombieDef, heroes: Hero[]): boolean {
  const sp = def.special;
  if (!sp) return false;
  z.specialTimer = (z.specialTimer ?? sp.interval / 2) - DT;

  if (sp.kind === 'summon') {
    if (z.specialTimer > 0) return false;
    z.specialTimer = sp.interval;
    const count = sp.count as number;
    const type = ctx.zombieDefs.get(sp.summon as string);
    if (!type) return false;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const pos = { x: z.pos.x + Math.cos(a) * (z.radius + 0.6), y: z.pos.y + Math.sin(a) * (z.radius + 0.6) };
      resolveObstacles(pos, type.radius, ctx.arena);
      spawnZombieAt(ctx, type, pos);
    }
    ctx.state.events.push({ type: 'effect', kind: 'summon', pos: { ...z.pos }, radius: 2, heroId: undefined });
    return false;
  }

  if (sp.kind === 'leap') return updateLeap(ctx, z, sp, heroes);
  if (sp.kind === 'parcel') {
    updateParcel(ctx, z, sp, heroes);
    return false; // er läuft und schlägt normal weiter
  }

  // Anlauf (Schlächter): kurz ausholen, dann geradeaus stürmen.
  if (z.charge) {
    const c = z.charge;
    if (c.windup > 0) {
      c.windup -= DT;
      return true;
    }
    const step = Math.min((sp.speed as number) * DT, c.remaining);
    const next = { x: z.pos.x + c.dir.x * step, y: z.pos.y + c.dir.y * step };
    if (ctx.grid.isBlocked(next)) {
      z.charge = null;
      return true;
    }
    z.pos = next;
    c.remaining -= step;
    for (const h of heroes) {
      if (c.hitIds.includes(h.id) || edgeDistance(z, h) > 0.2) continue;
      c.hitIds.push(h.id);
      applyDamage(ctx, h, sp.damage as number);
      heroCC(ctx, h, 'stunned', sp.stun as number, { from: z.pos, distance: sp.knockback as number });
    }
    if (c.remaining <= 0) z.charge = null;
    return true;
  }

  if (z.specialTimer > 0 || isBlind(ctx, z)) return false;
  const range = sp.range as number;
  const target = heroes.find((h) => edgeDistance(z, h) <= range && edgeDistance(z, h) > 1 && ctx.grid.lineOfSight(z.pos, h.pos));
  if (!target) return false;
  z.specialTimer = sp.interval;
  const dx = target.pos.x - z.pos.x;
  const dy = target.pos.y - z.pos.y;
  const d = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / d, y: dy / d };
  const distance = sp.distance as number;
  face(z, target.pos);
  z.charge = { dir, remaining: distance, hitIds: [], windup: sp.windup as number };
  ctx.state.events.push({
    type: 'charge',
    zombieId: z.id,
    from: { ...z.pos },
    to: { x: z.pos.x + dir.x * distance, y: z.pos.y + dir.y * distance },
  });
  return true;
}

/**
 * Höllensprung (Dämon): Alle interval Sekunden springt er auf einen Helden in
 * Reichweite. Vorher markiert eine Warnung windup Sekunden lang den
 * Landeplatz (Ausweichen möglich), bei der Landung trifft er alle Helden im
 * Umkreis radius.
 */
function updateLeap(ctx: SimContext, z: Zombie, sp: NonNullable<ZombieDef['special']>, heroes: Hero[]): boolean {
  const l = z.leap;
  if (l) {
    if (l.windup > 0) {
      l.windup -= DT;
      return true;
    }
    l.flight -= DT;
    const k = Math.min(1, 1 - l.flight / l.total);
    z.pos = { x: l.from.x + (l.to.x - l.from.x) * k, y: l.from.y + (l.to.y - l.from.y) * k };
    if (l.flight > 0) return true;
    // Landung
    z.leap = null;
    resolveObstacles(z.pos, z.radius, ctx.arena);
    const radius = sp.radius as number;
    for (const h of heroes) {
      if (Math.hypot(h.pos.x - z.pos.x, h.pos.y - z.pos.y) - h.radius > radius) continue;
      applyDamage(ctx, h, sp.damage as number);
      if (sp.stun) heroCC(ctx, h, 'stunned', sp.stun as number);
    }
    ctx.state.events.push({ type: 'effect', kind: 'leapLand', pos: { ...z.pos }, radius });
    return true;
  }
  if ((z.specialTimer ?? 0) > 0 || isBlind(ctx, z)) return false;
  const range = sp.range as number;
  const target = heroes.find((h) => edgeDistance(z, h) <= range && edgeDistance(z, h) > 2);
  if (!target) return false;
  z.specialTimer = sp.interval;
  const to = { ...target.pos };
  resolveObstacles(to, z.radius, ctx.arena);
  face(z, to);
  const flight = sp.flight as number;
  z.leap = { from: { ...z.pos }, to, windup: sp.windup as number, flight, total: flight };
  ctx.state.events.push({ type: 'leap', zombieId: z.id, from: { ...z.pos }, to: { ...to }, radius: sp.radius as number, windup: sp.windup as number });
  return true;
}

/**
 * Paketwurf (Postbote): Im Kampf wirft er alle interval Sekunden ein schweres
 * Paket auf einen Helden in Reichweite. Der Landeplatz ist windup Sekunden
 * vorher markiert; wer dann noch im Umkreis radius steht, nimmt Schaden.
 */
function updateParcel(ctx: SimContext, z: Zombie, sp: NonNullable<ZombieDef['special']>, heroes: Hero[]): void {
  const { state } = ctx;
  if (z.parcel && state.time >= z.parcel.at) {
    const radius = sp.radius as number;
    const scale = z.damage / Math.max(1, ctx.zombieDefs.get(z.defId)!.damage);
    for (const h of heroes) {
      if (Math.hypot(h.pos.x - z.parcel.to.x, h.pos.y - z.parcel.to.y) - h.radius <= radius) applyDamage(ctx, h, (sp.damage as number) * scale);
    }
    state.events.push({ type: 'effect', kind: 'parcelLand', pos: { ...z.parcel.to }, radius });
    z.parcel = null;
  }
  // Nur im Kampf (ein Held hat ihn angegriffen)
  if (z.targetId === null || z.parcel || (z.specialTimer ?? 0) > 0) return;
  const range = sp.range as number;
  const target = heroes.find((h) => h.id === z.targetId && edgeDistance(z, h) <= range) ?? heroes.find((h) => edgeDistance(z, h) <= range && edgeDistance(z, h) > 1.5);
  if (!target) return;
  z.specialTimer = sp.interval;
  const windup = sp.windup as number;
  z.parcel = { to: { ...target.pos }, at: state.time + windup };
  face(z, target.pos);
  state.events.push({ type: 'parcel', zombieId: z.id, from: { ...z.pos }, to: { ...target.pos }, radius: sp.radius as number, windup });
}
