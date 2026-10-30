import { applyDamage } from './combat';
import type { SimContext } from './context';
import { kitOf } from './heroes/index';
import { blind, knockback, root, slow } from './status';
import { DT, type Zone } from './types';
import { dist } from './vec';

/** Abstand, in dem Schaden über Zeit ausgeteilt wird. */
const DOT_INTERVAL = 0.5;

export function addZone(ctx: SimContext, zone: Omit<Zone, 'id' | 'tickTimer'>): Zone {
  const z: Zone = { ...zone, id: ctx.state.nextId++, tickTimer: 0 };
  ctx.state.zones.push(z);
  return z;
}

/** Liegt ein Kreis (Zombie) in der Zone bzw. im Ring? */
export function inZone(zone: Zone, p: { x: number; y: number }, r: number): boolean {
  const d = dist(zone.pos, p);
  if (zone.ring !== undefined) return Math.abs(d - zone.radius) <= zone.ring + r;
  return d - r <= zone.radius;
}

/** Wirkungen aller aktiven Zonen auf die Zombies darin; abgelaufene Zonen verschwinden. */
export function updateZones(ctx: SimContext): void {
  const { state } = ctx;
  state.zones = state.zones.filter((z) => z.until > state.time);
  for (const zone of state.zones) {
    if (state.time < zone.activeAt) continue;
    zone.tickTimer -= DT;
    const dot = zone.dps !== undefined && zone.tickTimer <= 0;
    if (dot) zone.tickTimer += DOT_INTERVAL;
    const owner = state.heroes.find((h) => h.id === zone.ownerId);
    for (const z of state.zombies) {
      if (z.hp <= 0 || !inZone(zone, z.pos, z.radius)) continue;
      if (zone.slow !== undefined) slow(ctx, z, zone.slow, 0.25);
      if (zone.blind) blind(ctx, z, 0.5);
      if (zone.root) root(ctx, z, 0.15);
      if (zone.push) knockback(z, zone.pushFrom ?? zone.pos, 8 * DT);
      if (dot) applyDamage(ctx, z, zone.dps! * DOT_INTERVAL, owner);
    }
  }
}

/** Verzögerte Wirkungen auslösen, deren Zeit gekommen ist. */
export function updateDelayed(ctx: SimContext): void {
  const { state } = ctx;
  const due = state.delayed.filter((d) => d.at <= state.time);
  if (due.length === 0) return;
  state.delayed = state.delayed.filter((d) => d.at > state.time);
  for (const d of due) {
    const h = state.heroes.find((x) => x.id === d.ownerId);
    if (h) kitOf(h.defId).onDelayed?.(ctx, h, d);
  }
}
