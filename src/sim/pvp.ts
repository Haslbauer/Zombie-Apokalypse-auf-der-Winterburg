import type { SimContext } from './context';
import { giveGold } from './economy';
import { addXp } from './progression';
import { emptyStatus, heroCC, addBuff } from './status';
import { nextRandom } from './rng';
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
    // Zombies nebenbei sind Gegner für beide Teams
    if (z.avatarOf === undefined) return z.hp > 0;
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
  victim.respawnAt = ctx.state.time + cfg.respawn;
  // Von Zombies erwischt: kein Punkt für das andere Team
  if (!killer || killer.team === victim.team) {
    ctx.state.events.push({ type: 'pvpKill', killerId: null, victimId: victim.id, score: [pvp.score[0], pvp.score[1]] });
    return;
  }
  const team = killer.team!;
  pvp.score[team]++;
  if (killer && killer.team !== victim.team) {
    killer.score.kills++;
    noteKill(killer, 1);
    giveGold(ctx, killer, cfg.killGold, victim.pos);
    addXp(ctx, killer, cfg.killXp);
  }
  ctx.state.events.push({ type: 'pvpKill', killerId: killer?.id ?? null, victimId: victim.id, score: [pvp.score[0], pvp.score[1]] });
  if (pvp.goal !== 'kiste' && pvp.score[team] >= pvp.killsToWin && !ctx.state.gameOver) {
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

/** Kiste erobern: Ort aus den Daten, sonst die Mitte zwischen den beiden Basen. */
export function cratePos(ctx: SimContext): { x: number; y: number } {
  const cfg = ctx.data.economy.pvp;
  if (cfg?.crate?.pos) return { ...cfg.crate.pos };
  const [a, b] = cfg?.spawns ?? [ctx.data.arena.heroStart, ctx.data.arena.heroStart];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Kiste erobern: Stehen nur Helden eines Teams im Umkreis, sammelt dieses Team
 * Punkte (perSecond pro Sekunde). Stehen beide Teams dort, ist sie umkämpft.
 * Sieg bei toWin Punkten.
 */
export function updateCrate(ctx: SimContext): void {
  const pvp = ctx.state.pvp;
  const crate = pvp?.crate;
  const cfg = ctx.data.economy.pvp?.crate;
  if (!pvp || !crate || !cfg || ctx.state.gameOver) return;
  const near = ctx.state.heroes.filter((h) => h.alive && !h.benched && Math.hypot(h.pos.x - crate.pos.x, h.pos.y - crate.pos.y) <= cfg.radius);
  const teams = new Set(near.map((h) => h.team ?? 0));
  const holder = teams.size === 1 ? [...teams][0] : null;
  const contested = teams.size > 1;
  if (holder !== crate.holder || contested !== crate.contested) {
    crate.holder = holder;
    crate.contested = contested;
    ctx.state.events.push({ type: 'pvpCrate', holder, points: [Math.floor(crate.points[0]), Math.floor(crate.points[1])] });
  }
  if (holder === null) return;
  crate.points[holder] = Math.min(crate.toWin, crate.points[holder] + cfg.perSecond * DT);
  if (crate.points[holder] >= crate.toWin - 1e-6) {
    crate.points[holder] = crate.toWin;
    pvp.winner = holder;
    const other = Math.floor(crate.points[1 - holder]);
    endGame(ctx, `Team ${holder === 0 ? 'Nord' : 'Süd'} erobert die Kiste (${crate.toWin} : ${other})!`, true, holder);
  }
}

/**
 * Zombies nebenbei: ab und zu kommt eine kleine Gruppe von der Seite und zieht
 * über die Karte (zur Mitte, dann zur anderen Seite). Sie greift beide Teams an
 * und bringt beim Kill Gold und EP wie im Koop.
 */
export function updateRoamers(ctx: SimContext, spawn: (defId: string, pos: { x: number; y: number }) => Zombie | null): void {
  const pvp = ctx.state.pvp;
  const cfg = ctx.data.economy.pvp?.roamers;
  if (!pvp?.roamers || !cfg) return;
  const state = ctx.state;
  if (state.time < pvp.roamers.nextAt) return;
  pvp.roamers.nextAt = state.time + cfg.every;
  const alive = state.zombies.filter((z) => z.avatarOf === undefined && z.hp > 0).length;
  const points = ctx.data.arena.spawnPoints.filter((p) => cfg.from.includes(p.id));
  if (points.length === 0) return;
  const from = points[Math.floor(nextRandom(state) * points.length) % points.length];
  const count = Math.min(cfg.maxAlive - alive, cfg.min + Math.floor(nextRandom(state) * (cfg.max - cfg.min + 1)));
  const center = cratePos(ctx);
  for (let i = 0; i < count; i++) {
    const type = cfg.types[Math.floor(nextRandom(state) * cfg.types.length) % cfg.types.length];
    const z = spawn(type, { x: from.x + (nextRandom(state) - 0.5) * 2, y: from.y + (nextRandom(state) - 0.5) * 2 });
    if (z) z.roam = { ...center };
  }
}

/** Nächster Wegpunkt eines umherziehenden Zombies (Mitte ↔ eine der Seiten). */
export function nextRoam(ctx: SimContext, z: Zombie): { x: number; y: number } {
  const center = cratePos(ctx);
  const atCenter = Math.hypot(z.pos.x - center.x, z.pos.y - center.y) < 4;
  if (!atCenter) return center;
  const ids = ctx.data.economy.pvp?.roamers?.from ?? [];
  const points = ctx.data.arena.spawnPoints.filter((p) => ids.includes(p.id));
  if (points.length === 0) return center;
  const p = points[Math.floor(nextRandom(ctx.state) * points.length) % points.length];
  return { x: p.x, y: p.y };
}
