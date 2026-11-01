import type { SimContext } from './context';
import { giveGold } from './economy';
import { addXp } from './progression';
import { emptyStatus, heroCC, addBuff } from './status';
import { endGame, noteKill } from './stats';
import { DT, type Hero, type Zombie } from './types';

/**
 * PvP-Modus: Helden kämpfen in zwei Teams gegeneinander (1:1, 1:2, 2:2, 1:3).
 *
 * Damit alle Fähigkeiten ohne Umbau auch Helden treffen, hat jeder Held einen
 * unsichtbaren Stellvertreter (Zombie mit avatarOf). Während ein Held handelt
 * (Eingaben, Angriffe, Geschosse, Zonen, verzögerte Wirkungen), sieht die
 * Simulation nur die Stellvertreter des anderen Teams. Schaden am
 * Stellvertreter geht an den Helden, Betäubung, Schlaf, Furcht, Festhalten und
 * Verlangsamung werden zu den entsprechenden Zuständen des Helden.
 */
export function isPvp(ctx: SimContext): boolean {
  return !!ctx.state.pvp;
}

/** Stellvertreter anlegen (beim Start) – einer pro teilnehmendem Helden. */
export function createAvatars(ctx: SimContext): void {
  for (const h of ctx.state.heroes) {
    if (h.benched) continue;
    const z: Zombie = {
      id: ctx.state.nextId++,
      defId: 'avatar',
      pos: { ...h.pos },
      radius: h.radius,
      hp: h.hp,
      maxHp: h.maxHp,
      speed: 0,
      facing: 0,
      attackTimer: 0,
      damage: 0,
      targetId: null,
      objectiveId: 'heart',
      st: emptyStatus(),
      wander: 0,
      avatarOf: h.id,
    };
    ctx.state.zombies.push(z);
  }
}

/** Held hinter einem Stellvertreter. */
export function avatarHero(ctx: SimContext, z: Zombie): Hero | undefined {
  return z.avatarOf === undefined ? undefined : ctx.state.heroes.find((h) => h.id === z.avatarOf);
}

/** Stellvertreter an die Helden angleichen (Ort, Größe, Leben). */
export function syncAvatars(ctx: SimContext): void {
  for (const z of ctx.state.zombies) {
    const h = avatarHero(ctx, z);
    if (!h) continue;
    z.pos = { ...h.pos };
    z.radius = h.radius;
    z.maxHp = h.maxHp;
    z.hp = h.alive ? Math.max(1, h.hp) : 0;
    z.facing = h.facing;
  }
}

/** Stellvertreter, die für einen Helden von Team team Gegner sind (lebend). */
export function enemyAvatars(ctx: SimContext, all: Zombie[], team: number): Zombie[] {
  return all.filter((z) => {
    const h = avatarHero(ctx, z);
    return !!h && h.alive && h.team !== team;
  });
}

/**
 * Wirkung für jedes Team einzeln ausführen: state.zombies zeigt dabei nur die
 * gegnerischen Stellvertreter. list (z. B. Geschosse) wird nach Besitzer-Team
 * aufgeteilt und danach wieder zusammengeführt.
 */
export function perTeam<T extends { ownerId: number }>(ctx: SimContext, key: 'projectiles' | 'zones' | 'delayed', run: () => void): void {
  const state = ctx.state;
  const all = state.zombies;
  const items = state[key] as unknown as T[];
  const teamOf = (id: number) => state.heroes.find((h) => h.id === id)?.team ?? 0;
  const out: T[] = [];
  for (const team of [0, 1]) {
    (state[key] as unknown as T[]) = items.filter((x) => teamOf(x.ownerId) === team);
    state.zombies = enemyAvatars(ctx, all, team);
    run();
    out.push(...(state[key] as unknown as T[]));
  }
  (state[key] as unknown as T[]) = out;
  state.zombies = all;
}

/** Etwas im Namen eines Helden tun (nur gegnerische Stellvertreter sichtbar). */
export function asTeam<R>(ctx: SimContext, h: Hero, run: () => R): R {
  const all = ctx.state.zombies;
  ctx.state.zombies = enemyAvatars(ctx, all, h.team ?? 0);
  try {
    return run();
  } finally {
    ctx.state.zombies = all;
  }
}

/** Zustände der Stellvertreter auf die Helden übertragen und zurücksetzen. */
export function applyAvatarStatus(ctx: SimContext): void {
  const t = ctx.state.time;
  for (const z of ctx.state.zombies) {
    const h = avatarHero(ctx, z);
    if (!h) continue;
    const st = z.st;
    if (h.alive) {
      const stun = Math.max(st.stunUntil, st.sleepUntil, st.fearUntil) - t;
      if (stun > 0) heroCC(ctx, h, 'stunned', Math.min(stun, 2));
      if (st.rootUntil - t > 0) heroCC(ctx, h, 'rooted', Math.min(st.rootUntil - t, 2.5));
      if (st.slowUntil - t > 0) addBuff(ctx, h, 'haste', -(1 - st.slowFactor), st.slowUntil - t, 'pvp-slow');
    }
    // Brand bleibt am Stellvertreter (Schaden über Zeit geht an den Helden)
    const burn = { burnUntil: st.burnUntil, burnDps: st.burnDps, burnBy: st.burnBy, stings: st.stings };
    z.st = { ...emptyStatus(), ...burn };
  }
}

/** Kill im PvP: Punkt fürs Team, Gold und EP für den Killer, Sieg bei killsToWin. */
export function pvpKill(ctx: SimContext, victim: Hero, killer?: Hero): void {
  const pvp = ctx.state.pvp;
  const cfg = ctx.data.economy.pvp;
  if (!pvp || !cfg) return;
  const team = killer && killer.team !== victim.team ? killer.team! : 1 - (victim.team ?? 0);
  pvp.score[team]++;
  if (killer && killer.team !== victim.team) {
    killer.score.kills++;
    noteKill(killer, 1);
    giveGold(ctx, killer, cfg.killGold, victim.pos);
    addXp(ctx, killer, cfg.killXp);
  }
  victim.respawnAt = ctx.state.time + cfg.respawn;
  ctx.state.events.push({ type: 'pvpKill', killerId: killer?.id ?? null, victimId: victim.id, score: [pvp.score[0], pvp.score[1]] });
  if (pvp.score[team] >= pvp.killsToWin && !ctx.state.gameOver) {
    pvp.winner = team;
    endGame(ctx, `Team ${team === 0 ? 'Nord' : 'Süd'} gewinnt ${pvp.score[team]} : ${pvp.score[1 - team]}!`, true, team);
  }
}

/** Pro Tick im PvP: Gold und EP mit der Zeit. */
export function updatePvp(ctx: SimContext): void {
  const cfg = ctx.data.economy.pvp;
  if (!cfg) return;
  const every = Math.round(1 / DT);
  if (ctx.state.tick % every !== 0) return;
  for (const h of ctx.state.heroes) {
    if (h.benched) continue;
    h.gold += cfg.goldPerSecond;
    h.score.gold += cfg.goldPerSecond;
    addXp(ctx, h, cfg.xpPerSecond);
  }
}

/** Ausgleich: das kleinere Team macht mehr Schaden und nimmt weniger (Wurzel des Größenverhältnisses). */
export function handicapFor(teams: number[], team: number): number {
  const own = teams.filter((t) => t === team).length;
  const other = teams.filter((t) => t === 1 - team).length;
  return own > 0 && other > own ? Math.sqrt(other / own) : 1;
}
