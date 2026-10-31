import { applyDamage, edgeDistance } from './combat';
import type { SimContext } from './context';
import { face, stepToward } from './movement';
import type { CampDef, Hero, Zombie, ZombieDef } from './types';
import { DT } from './types';
import { dist, type Vec2 } from './vec';
import { spawnZombieAt } from './waves';

/** Heimkehrende Neutrale laufen so viel schneller zurück. */
const RETURN_SPEED = 1.5;
/** Neues Ziel, wenn das bisherige weg ist: Held höchstens so weit entfernt. */
const RETARGET_RANGE = 6;
/**
 * Erreicht ein Neutraler im Kampf so lange niemanden (z. B. Fernkämpfer hinter
 * einem Zaun), setzt sich das ganze Lager zurück: Rückweg unverwundbar, am
 * Platz voll geheilt (wie das „Ausweichen“ in LoL).
 */
export const RESET_AFTER = 5;

/**
 * Neutrale Lager im Gelände (wie der LoL-Dschungel): zu Spielbeginn besetzt,
 * nach dem Leeren kommen die Bewohner respawn Sekunden später wieder.
 */
export function updateCamps(ctx: SimContext): void {
  const { state } = ctx;
  for (const camp of ctx.data.arena.camps ?? []) {
    let cs = state.camps.find((c) => c.id === camp.id);
    if (!cs) {
      cs = { id: camp.id, respawnAt: 0 };
      state.camps.push(cs);
    }
    if (cs.respawnAt === null) {
      if (!state.zombies.some((z) => z.hp > 0 && z.neutral?.campId === camp.id)) {
        cs.respawnAt = state.time + camp.respawn;
        state.events.push({ type: 'camp', campId: camp.id, phase: 'cleared' });
      }
    } else if (state.time >= cs.respawnAt) {
      spawnCamp(ctx, camp);
      cs.respawnAt = null;
      state.events.push({ type: 'camp', campId: camp.id, phase: 'spawn' });
    }
  }
}

function spawnCamp(ctx: SimContext, camp: CampDef): void {
  camp.units.forEach((id, i) => {
    const def = ctx.zombieDefs.get(id);
    if (!def) return;
    // Größter Bewohner in die Mitte, die anderen im Kreis darum
    const r = i === 0 ? 0 : 1.4;
    const a = (i / Math.max(1, camp.units.length - 1)) * Math.PI * 2;
    const pos = { x: camp.x + Math.cos(a) * r, y: camp.y + Math.sin(a) * r };
    const z = spawnZombieAt(ctx, def, pos, 'none');
    z.neutral = { campId: camp.id, home: { ...pos }, returning: false };
  });
}

/**
 * Neutrale Einheit (Lagerbewohner oder Postbote) für einen Tick steuern.
 * Gibt false zurück, wenn sie ruhig ist; dann darf der Postbote seine Runde laufen.
 * move läuft (mit Pfadsuche) auf einen Punkt zu.
 */
export function updateNeutral(ctx: SimContext, z: Zombie, def: ZombieDef, speed: number, move: (to: Vec2, step: number, chase?: boolean) => void): boolean {
  const { state } = ctx;
  const n = z.neutral!;
  const leash = def.neutral?.leash ?? 10;
  const heroes = state.heroes.filter((h) => h.alive && !h.afk);

  if (!n.returning) {
    let target = z.targetId !== null ? heroes.find((h) => h.id === z.targetId) : undefined;
    if (!target) target = provoker(ctx, z, heroes);
    // Ziel weggelaufen: anderen Helden in der Nähe nehmen, sonst heimkehren
    if (target && dist(target.pos, n.home) > leash + 2) target = undefined;
    if (!target && z.targetId !== null) target = heroes.find((h) => dist(h.pos, z.pos) <= RETARGET_RANGE && dist(h.pos, n.home) <= leash);
    if (target && dist(z.pos, n.home) <= leash) {
      z.targetId = target.id;
      n.engagedAt ??= state.time;
      // Niemanden erreicht (Angreifer unerreichbar): Lager zurücksetzen
      // (Treffer irgendeines Lagerbewohners zählen: Hauptsache, das Lager erreicht den Angreifer)
      if (state.time - Math.max(n.engagedAt, campLastHit(ctx, z)) > RESET_AFTER) {
        resetCamp(ctx, z);
        return true;
      }
      fight(ctx, z, def, target, speed, move);
      return true;
    }
    if (z.targetId !== null || dist(z.pos, n.home) > leash) n.returning = true;
    z.targetId = null;
    n.engagedAt = null;
  }

  if (n.returning) {
    if (dist(z.pos, n.home) > 0.4) {
      if (def.flying) stepToward(z, n.home, speed * RETURN_SPEED * DT);
      else move(n.home, speed * RETURN_SPEED * DT);
      return true;
    }
    // Zurück am Platz: Lagerbewohner voll geheilt, Reizung vergessen. Der
    // Postbote heilt nicht (sein Platz wandert mit, sonst wäre er im Team kaum zu schaffen).
    n.returning = false;
    if (n.campId !== null) z.hp = z.maxHp;
    z.st.provokedUntil = 0;
  }
  return false;
}

/** Letzter Treffer eines Bewohners dieses Lagers (bzw. des Postboten selbst). */
function campLastHit(ctx: SimContext, z: Zombie): number {
  const campId = z.neutral!.campId;
  if (campId === null) return z.neutral!.lastHitAt ?? 0;
  let t = 0;
  for (const m of ctx.state.zombies) if (m.neutral?.campId === campId) t = Math.max(t, m.neutral.lastHitAt ?? 0);
  return t;
}

/** Ganzes Lager (bzw. den Postboten allein) zurückschicken: Ziel und Reizung vergessen. */
function resetCamp(ctx: SimContext, z: Zombie): void {
  const campId = z.neutral!.campId;
  const mates = campId === null ? [z] : ctx.state.zombies.filter((m) => m.hp > 0 && m.neutral?.campId === campId);
  for (const m of mates) {
    m.neutral!.returning = true;
    m.neutral!.engagedAt = null;
    m.targetId = null;
    m.st.provokedUntil = 0;
  }
  ctx.state.events.push({ type: 'camp', campId: campId ?? 'courier', phase: 'reset' });
}

/** Held, der diese Einheit oder jemanden aus ihrem Lager gerade gereizt hat. */
function provoker(ctx: SimContext, z: Zombie, heroes: Hero[]): Hero | undefined {
  const { state } = ctx;
  const mates = z.neutral!.campId === null ? [z] : state.zombies.filter((m) => m.hp > 0 && m.neutral?.campId === z.neutral!.campId);
  for (const m of mates) {
    if (state.time >= m.st.provokedUntil) continue;
    const h = heroes.find((x) => x.id === m.st.provokedBy);
    if (h) return h;
  }
  return undefined;
}

function fight(ctx: SimContext, z: Zombie, def: ZombieDef, target: Hero, speed: number, move: (to: Vec2, step: number, chase?: boolean) => void): void {
  if (edgeDistance(z, target) <= def.attackRange) {
    face(z, target.pos);
    if (z.attackTimer <= 0) {
      z.attackTimer = def.attackCooldown;
      ctx.state.events.push({ type: 'attack', id: z.id, targetId: target.id });
      applyDamage(ctx, target, z.damage);
      z.neutral!.lastHitAt = ctx.state.time;
    }
  } else if (def.flying) stepToward(z, target.pos, speed * DT);
  else move(target.pos, speed * DT, true);
}
