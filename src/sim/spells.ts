import { applyDamage } from './combat';
import type { DataContext, SimContext } from './context';
import { resolveObstacles } from './grid';
import { healHero, statsOf } from './stats';
import { eventFactor } from './waveevents';
import { addBuff, hasBuff, slow } from './status';
import { DT, type Hero, type SpellDef, type Zombie } from './types';
import { dist, type Vec2 } from './vec';

/** Entzünden: Schaden alle so viele Sekunden. */
const BURN_TICK = 0.5;

/**
 * Beschwörerzauber wie in LoL (data/spells.json): zwei pro Held auf D und F,
 * unabhängig vom Helden, mit langer Abklingzeit.
 */
export function spellDef(ctx: DataContext, id: string): SpellDef | undefined {
  return ctx.data.spells.spells.find((s) => s.id === id);
}

/** Vorgabe für einen Helden: nach Helden-Id, sonst nach Rolle (data/bots.json). */
export function defaultSpells(ctx: DataContext, heroId: string): [string, string] {
  const d = ctx.data.spells.defaults;
  const role = ctx.data.bots.heroes[heroId]?.role ?? 'melee';
  return [...(d[heroId] ?? d[role] ?? d.melee)] as [string, string];
}

/** Zwei verschiedene, bekannte Zauber? */
export function validSpells(ctx: DataContext, spells: unknown): spells is [string, string] {
  return Array.isArray(spells) && spells.length === 2 && spells[0] !== spells[1] && spells.every((s) => typeof s === 'string' && !!spellDef(ctx, s));
}

/**
 * Zauber wählen: nur in der Pause. Ein Platz mit neuem Zauber startet mit der
 * Abklingzeit, die der alte noch hatte (kein Zurücksetzen durch Tauschen).
 */
export function chooseSpells(ctx: SimContext, h: Hero, spells: unknown): boolean {
  if (ctx.state.wave.phase !== 'pause' || !validSpells(ctx, spells)) return false;
  h.spells = [spells[0], spells[1]];
  return true;
}

/** Wert eines Zaubers mit Level-Anteil (z. B. damage + damagePerLevel × Level). */
function scaled(def: SpellDef, key: string, h: Hero): number {
  return (def.values[key] ?? 0) + (def.values[`${key}PerLevel`] ?? 0) * h.level;
}

/** Gegner am Mauszeiger in Reichweite des Helden (nächster zum Zeiger, höchstens 2,5 m daneben). */
function unitAt(ctx: SimContext, h: Hero, aim: Vec2, range: number): Zombie | null {
  let best: Zombie | null = null;
  let bestD = 2.5;
  for (const z of ctx.state.zombies) {
    if (z.hp <= 0 || dist(h.pos, z.pos) - z.radius > range) continue;
    const d = dist(z.pos, aim) - z.radius;
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

/** Zauber auslösen; false, wenn es nicht geht (Abklingzeit, kein Ziel, betäubt …). */
export function castSpell(ctx: SimContext, h: Hero, slot: number, aim: Vec2): boolean {
  if (!h.alive || slot < 0 || slot > 1 || h.spellCooldowns[slot] > 0) return false;
  const def = spellDef(ctx, h.spells[slot]);
  if (!def) return false;
  // Reinigen geht auch betäubt, alles andere nicht
  if (def.id !== 'reinigen' && (hasBuff(h, 'stunned') || h.dash)) return false;
  const { state } = ctx;
  const from = { ...h.pos };
  let to = { ...h.pos };
  let targetId: number | undefined;

  switch (def.id) {
    case 'blitz': {
      const range = def.values.range;
      const dx = aim.x - h.pos.x;
      const dy = aim.y - h.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const len = Math.min(range, d);
      // Vom weitesten Punkt zurück, bis die Stelle frei ist (über Hecken hinweg möglich)
      let landed: Vec2 | null = null;
      for (let s = len; s >= 0; s -= 0.25) {
        const p = { x: h.pos.x + (dx / d) * s, y: h.pos.y + (dy / d) * s };
        if (!ctx.grid.isBlocked(p)) {
          landed = p;
          break;
        }
      }
      if (!landed) return false;
      h.pos = landed;
      resolveObstacles(h.pos, h.radius, ctx.arena);
      h.channel = null;
      to = { ...h.pos };
      break;
    }
    case 'teleport': {
      const target = teleportTarget(ctx, h, aim, def.values.pick);
      if (!target) return false;
      h.teleportTo = target;
      h.channel = { until: state.time + def.values.channel, tag: 'teleport', cancelOnMove: true };
      to = { ...target };
      break;
    }
    case 'entzuenden': {
      const z = unitAt(ctx, h, aim, def.values.range);
      if (!z) return false;
      z.st.burnUntil = state.time + def.values.duration;
      z.st.burnDps = scaled(def, 'damage', h) / def.values.duration;
      z.st.burnBy = h.id;
      targetId = z.id;
      to = { ...z.pos };
      break;
    }
    case 'heilen': {
      const heal = scaled(def, 'heal', h);
      const friend = state.heroes
        .filter((x) => x !== h && x.alive && dist(x.pos, h.pos) <= def.values.range)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      for (const x of friend ? [h, friend] : [h]) {
        healHero(ctx, x, heal, h);
        addBuff(ctx, x, 'haste', def.values.haste, def.values.hasteTime, 'spell-heilen');
        state.events.push({ type: 'effect', kind: 'tea', pos: { ...x.pos }, radius: 1.2, heroId: x.id });
      }
      targetId = friend?.id;
      break;
    }
    case 'barriere':
      addBuff(ctx, h, 'shield', scaled(def, 'shield', h), def.values.duration, 'spell-barriere');
      break;
    case 'geist':
      addBuff(ctx, h, 'haste', def.values.haste, def.values.duration, 'spell-geist');
      break;
    case 'erschoepfen': {
      const z = unitAt(ctx, h, aim, def.values.range);
      if (!z) return false;
      slow(ctx, z, def.values.slow, def.values.duration);
      z.st.weakUntil = state.time + def.values.duration;
      z.st.weakFactor = def.values.weaken;
      targetId = z.id;
      to = { ...z.pos };
      break;
    }
    case 'zerschmettern': {
      const z = unitAt(ctx, h, aim, def.values.range);
      if (!z) return false;
      targetId = z.id;
      to = { ...z.pos };
      applyDamage(ctx, z, scaled(def, 'damage', h), h);
      break;
    }
    case 'reinigen':
      h.buffs = h.buffs.filter((b) => b.kind !== 'stunned' && b.kind !== 'rooted');
      h.plague = null;
      addBuff(ctx, h, 'cleansed', 1, def.values.immune, 'spell-reinigen');
      break;
    default:
      return false;
  }
  h.spellCooldowns[slot] = def.cooldown;
  statsOf(h).casts++;
  state.events.push({ type: 'spell', heroId: h.id, spellId: def.id, from, to, targetId });
  return true;
}

/** Teleport-Ziel: Mitspieler oder Ziel (Vorrat, Stock, Beet) nahe am Zeiger; daneben landen. */
function teleportTarget(ctx: SimContext, h: Hero, aim: Vec2, pick: number): Vec2 | null {
  const candidates: { pos: Vec2; r: number }[] = [
    ...ctx.state.heroes.filter((x) => x !== h && x.alive).map((x) => ({ pos: x.pos, r: x.radius })),
    ...ctx.state.objectives.filter((o) => !o.destroyed).map((o) => ({ pos: o.pos, r: o.radius || Math.max(o.w ?? 1, o.h ?? 1) / 2 })),
  ];
  let best: { pos: Vec2; r: number } | null = null;
  let bestD = pick;
  for (const c of candidates) {
    const d = dist(c.pos, aim);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) return null;
  // Auf der Seite zum Zeiger hin landen, frei von Hindernissen
  const dx = aim.x - best.pos.x;
  const dy = aim.y - best.pos.y;
  const d = Math.hypot(dx, dy) || 1;
  const off = best.r + h.radius + 0.6;
  const p = { x: best.pos.x + (dx / d) * off, y: best.pos.y + (dy / d) * off };
  resolveObstacles(p, h.radius, ctx.arena);
  return p;
}

/** Ende des Teleport-Kanalisierens: angekommen bzw. abgebrochen (Abklingzeit bleibt). */
export function finishTeleport(ctx: SimContext, h: Hero, completed: boolean): void {
  const to = h.teleportTo;
  h.teleportTo = null;
  if (!completed || !to || !h.alive) return;
  const from = { ...h.pos };
  h.pos = { ...to };
  resolveObstacles(h.pos, h.radius, ctx.arena);
  ctx.state.events.push({ type: 'spell', heroId: h.id, spellId: 'teleport-land', from, to: { ...h.pos } });
}

/** Pro Tick: Abklingzeiten der Zauber, Brand (Entzünden). */
export function updateSpells(ctx: SimContext): void {
  const { state } = ctx;
  for (const h of state.heroes) {
    if (!h.spellCooldowns) continue;
    for (let i = 0; i < 2; i++) h.spellCooldowns[i] = Math.max(0, h.spellCooldowns[i] - DT);
  }
  // Brand: alle BURN_TICK Sekunden Schaden (über die Tick-Nummer, damit es deterministisch bleibt)
  const every = Math.round(BURN_TICK / DT);
  if (state.tick % every !== 0) return;
  for (const z of state.zombies) {
    if (!z.st.burnUntil || state.time > z.st.burnUntil || z.hp <= 0) continue;
    const by = state.heroes.find((x) => x.id === z.st.burnBy);
    applyDamage(ctx, z, (z.st.burnDps ?? 0) * BURN_TICK * eventFactor(ctx, 'burn'), by);
  }
}
