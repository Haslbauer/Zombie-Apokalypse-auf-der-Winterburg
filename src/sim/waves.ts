import type { SimContext } from './context';
import { resolveObstacles } from './grid';
import { nextRandom, shuffle } from './rng';
import { emptyStatus } from './status';
import { awardWaveBonus, courierGold } from './economy';
import { harvest, objectivesFor } from './objectives';
import { endGame } from './stats';
import { DT, type SpawnPoint, type WaveConfig, type Zombie, type ZombieDef } from './types';
import type { Vec2 } from './vec';

/** Anzahl der Zombies in Welle n. */
export function waveSize(n: number, cfg: WaveConfig): number {
  return Math.round(cfg.baseCount + cfg.countPerWave * (n - 1));
}

/** Mischungsgewichte, die für Welle n gelten (letzter Eintrag mit fromWave <= n). */
export function waveWeights(n: number, cfg: WaveConfig): Record<string, number> {
  let best = cfg.mix[0];
  for (const m of cfg.mix) if (m.fromWave <= n && m.fromWave >= best.fromWave) best = m;
  return best.weights;
}

/**
 * Wie viele Zombies welchen Typs Welle n hat. Die Gesamtzahl wird nach den
 * Gewichten aufgeteilt (Verfahren der größten Reste), ganz ohne Zufall.
 */
export function waveComposition(n: number, cfg: WaveConfig): Record<string, number> {
  const total = waveSize(n, cfg);
  const entries = Object.entries(waveWeights(n, cfg)).filter(([, w]) => w > 0);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  const result: Record<string, number> = {};
  const rests: { id: string; rest: number }[] = [];
  let assigned = 0;
  for (const [id, w] of entries) {
    const exact = (total * w) / sum;
    result[id] = Math.floor(exact);
    assigned += result[id];
    rests.push({ id, rest: exact - result[id] });
  }
  rests.sort((a, b) => b.rest - a.rest || a.id.localeCompare(b.id));
  for (let i = 0; assigned < total; i++, assigned++) result[rests[i % rests.length].id]++;
  return result;
}

/** Faktoren für Leben und Schaden der Zombies in Welle n. */
export function waveScaling(n: number, cfg: WaveConfig): { hp: number; damage: number } {
  return {
    hp: 1 + cfg.hpScalePerWave * (n - 1),
    damage: 1 + cfg.damageScalePerWave * (n - 1),
  };
}

/** Zahl der Rudel bzw. Schwärme eines Typs in Welle n. */
export function packCount(n: number, cfg: WaveConfig, type: string): number {
  const p = cfg.packs?.find((x) => x.type === type);
  return p && n >= p.fromWave ? Math.floor(1 + (n - p.fromWave) * p.packsPerWave) : 0;
}

/** Größe eines Rudels in Welle n; r ist eine Zufallszahl in [0, 1). */
export function packSize(n: number, pack: NonNullable<WaveConfig['packs']>[number], r: number): number {
  const grow = Math.floor((pack.sizePerWave ?? 0) * Math.max(0, n - pack.fromWave));
  return pack.minSize + grow + Math.floor(r * (pack.maxSize - pack.minSize + 1));
}

/** Elite-Typen in Welle n (alle `every` Wellen, Anzahl siehe WaveConfig.elites, abwechselnd). */
export function waveElites(n: number, cfg: WaveConfig): string[] {
  const e = cfg.elites;
  if (!e || e.types.length === 0) return [];
  // Neu: ab fromWave alle every Wellen, ab everyFrom jede Welle, Anzahl wächst
  if (e.fromWave !== undefined) {
    if (n < e.fromWave) return [];
    const due = (n - e.fromWave) % e.every === 0 || (e.everyFrom !== undefined && n >= e.everyFrom);
    if (!due) return [];
    const count = 1 + Math.floor((n - e.fromWave) / (e.countPerWaves ?? Infinity));
    return Array.from({ length: count }, (_, i) => e.types[(n + i) % e.types.length]);
  }
  if (n % e.every !== 0) return [];
  const count = e.countEvery ? Math.ceil(n / e.countEvery) : Math.floor(n / e.every);
  return Array.from({ length: count }, (_, i) => e.types[(n / e.every - 1 + i) % e.types.length]);
}

/**
 * Warteschlange einer Welle: einzelne Zombies, "pack:<typ>" für ein Rattenrudel
 * und "elite:<typ>" für Elites (die kommen in der Mitte der Welle).
 */
export function waveQueue(state: { rng: number }, n: number, cfg: WaveConfig): string[] {
  const comp = waveComposition(n, cfg);
  const queue = Object.entries(comp).flatMap(([id, count]) => Array<string>(count).fill(id));
  for (const p of cfg.packs ?? []) for (let i = 0; i < packCount(n, cfg, p.type); i++) queue.push(`pack:${p.type}`);
  shuffle(state, queue);
  const elites = waveElites(n, cfg).map((t) => `elite:${t}`);
  // Endgegner (Bauamt): ab fromWave in jeder Welle, mit der Welle stärker; in der letzten Welle Endkampf
  if (cfg.finalBoss && n >= cfg.finalBoss.fromWave) elites.push(`elite:${cfg.finalBoss.type}`);
  queue.splice(Math.floor(queue.length / 2), 0, ...elites);
  return queue;
}

/** Ablauf Pause → Welle → Pause und das Spawnen der Zombies. */
export function updateWaves(ctx: SimContext): void {
  const { state, data } = ctx;
  const w = state.wave;
  const cfg = data.waves;

  if (w.phase === 'pause') {
    w.timer -= DT;
    if (w.timer <= 0) {
      w.phase = 'wave';
      w.timer = 0;
      w.spawnTimer = 0;
      w.breached = false;
      w.queue = waveQueue(state, w.number, cfg);
      // Postbote: ab firstWave; nach seinem Tod erst every Wellen später wieder. Lebt er noch, kommt keiner dazu.
      const c = cfg.courier;
      const alive = state.zombies.some((z) => z.courier && z.hp > 0);
      w.courierAt = c && !alive && w.number >= (w.courierWave ?? c.firstWave) ? state.time + c.delay : null;
      if (w.courierAt != null) w.courierWave = Infinity; // bis er stirbt
      state.events.push({ type: 'waveStart', number: w.number });
    }
    return;
  }

  if (w.courierAt != null && state.time >= w.courierAt) {
    w.courierAt = null;
    spawnCourier(ctx);
  }
  w.spawnTimer -= DT;
  while (w.spawnTimer <= 0 && w.queue.length > 0) {
    spawnEntry(ctx, w.queue.shift()!);
    w.spawnTimer += cfg.spawnInterval;
  }
  // Postbote und Lager zählen nicht zur Welle
  if (w.queue.length === 0 && state.zombies.every((z) => z.neutral)) {
    state.events.push({ type: 'waveCleared', number: w.number });
    awardWaveBonus(ctx, w.number);
    // Letzte Welle überstanden: Sieg
    if (cfg.victoryWave && w.number >= cfg.victoryWave) {
      const fb = cfg.finalBoss ? ctx.zombieDefs.get(cfg.finalBoss.type) : undefined;
      endGame(ctx, fb && w.number >= cfg.finalBoss!.fromWave ? `${fb.name} ist besiegt – die Winterburg ist gehalten!` : 'Die Winterburg ist gehalten!', true);
      return;
    }
    harvest(ctx);
    w.number++;
    w.phase = 'pause';
    w.timer = cfg.pauseDuration;
  }
}

/** Einen Eintrag der Warteschlange an einem zufälligen Spawnpunkt erscheinen lassen. */
function spawnEntry(ctx: SimContext, entry: string): void {
  const { state, data } = ctx;
  const [kind, id] = entry.includes(':') ? entry.split(':') : ['single', entry];
  const def = ctx.zombieDefs.get(id);
  if (!def) return;
  const base = pickSpawnPoint(ctx, def);
  const pack = kind === 'pack' ? data.waves.packs?.find((p) => p.type === id) : undefined;
  const count = pack ? packSize(state.wave.number, pack, nextRandom(state)) : 1;
  for (let i = 0; i < count; i++) {
    const spread = kind === 'pack' ? 3 : 2;
    const pos = {
      x: base.x + (nextRandom(state) - 0.5) * spread,
      y: base.y + (nextRandom(state) - 0.5) * spread,
    };
    resolveObstacles(pos, def.radius, ctx.arena);
    const z = spawnZombieAt(ctx, def, pos);
    if (kind === 'elite') state.events.push({ type: 'elite', zombieId: z.id, defId: def.id });
  }
}

/** Sidequest: Postbote an einem zufälligen Punkt seines Rundwegs. */
export function spawnCourier(ctx: SimContext): Zombie | null {
  const { state, data } = ctx;
  const route = data.arena.courierRoute ?? [];
  const def = data.waves.courier ? ctx.zombieDefs.get(data.waves.courier.type) : undefined;
  if (!def?.courier || route.length < 2) return null;
  const wp = Math.floor(nextRandom(state) * route.length);
  const z = spawnZombieAt(ctx, def, { ...route[wp] }, 'none');
  z.courier = { wp: (wp + 1) % route.length, dir: 1, leaveAt: Infinity };
  state.wave.courierWave = Infinity;
  z.neutral = { campId: null, home: { ...z.pos }, returning: false };
  state.events.push({ type: 'courier', zombieId: z.id, phase: 'arrive', gold: courierGold(ctx, def) });
  return z;
}

/** Zombie an einer Stelle erscheinen lassen, Leben und Schaden nach der aktuellen Welle. */
export function spawnZombieAt(ctx: SimContext, def: ZombieDef, pos: Vec2, objectiveId?: string): Zombie {
  const { state, data } = ctx;
  if (!objectiveId) {
    // Ziel nach den Gewichten des Typs, nur unter Zielen bzw. Gruppen, die noch stehen.
    const keys = Object.entries(def.targets).filter(([key, w]) => w > 0 && objectivesFor(ctx, key).length > 0);
    objectiveId = keys.length > 0 ? pickWeighted(state, keys, ([, w]) => w)[0] : 'heart';
  }
  const scale = waveScaling(state.wave.number, data.waves);
  // Zwischenbosse werden mit jeder Welle zusätzlich stärker
  const extra = def.rank === 'elite' && !def.courier && !def.neutral ? 1 + (data.waves.elites?.hpPerWave ?? 0) * (state.wave.number - 1) : 1;
  const hp = Math.round(def.hp * scale.hp * extra);
  const z: Zombie = {
    id: state.nextId++,
    defId: def.id,
    pos,
    radius: def.radius,
    hp,
    maxHp: hp,
    speed: def.speed,
    facing: 0,
    attackTimer: 0,
    damage: def.damage * scale.damage,
    targetId: null,
    objectiveId,
    st: emptyStatus(),
    wander: 0,
    bornAt: state.time,
  };
  state.zombies.push(z);
  return z;
}

/**
 * Spawnpunkt für einen Typ: spawnAt legt Anteile für bestimmte Punkte fest
 * (z. B. Hornissen meist im Nordwesten), "*" verteilt den Rest normal.
 */
function pickSpawnPoint(ctx: SimContext, def: ZombieDef): SpawnPoint {
  const points = ctx.data.arena.spawnPoints;
  const pref = def.spawnAt;
  if (pref) {
    let r = nextRandom(ctx.state);
    for (const [id, share] of Object.entries(pref)) {
      if (id === '*') continue;
      const p = points.find((x) => x.id === id);
      if (p && r < share) return p;
      r -= share;
    }
    const rest = points.filter((p) => !(p.id in pref));
    if (rest.length > 0) return pickWeighted(ctx.state, rest, (p) => p.weight);
  }
  return pickWeighted(ctx.state, points, (p) => p.weight);
}

/** Zufällige Auswahl nach Gewichten. */
export function pickWeighted<T>(state: { rng: number }, items: T[], weight: (item: T) => number): T {
  const total = items.reduce((s, i) => s + weight(i), 0);
  let r = nextRandom(state) * total;
  for (const item of items) {
    r -= weight(item);
    if (r < 0) return item;
  }
  return items[items.length - 1];
}
