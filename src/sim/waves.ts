import type { SimContext } from './context';
import { resolveObstacles } from './grid';
import { nextRandom, shuffle } from './rng';
import { emptyStatus } from './status';
import { awardWaveBonus } from './economy';
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

/** Zahl der Rattenrudel in Welle n. */
export function ratPackCount(n: number, cfg: WaveConfig): number {
  const r = cfg.ratPacks;
  return r && n >= r.fromWave ? Math.floor(1 + (n - r.fromWave) * r.packsPerWave) : 0;
}

/** Elite-Typen in Welle n (alle `every` Wellen ⌊n/every⌋ Stück, abwechselnd). */
export function waveElites(n: number, cfg: WaveConfig): string[] {
  const e = cfg.elites;
  if (!e || e.types.length === 0 || n % e.every !== 0) return [];
  const count = Math.floor(n / e.every);
  return Array.from({ length: count }, (_, i) => e.types[(n / e.every - 1 + i) % e.types.length]);
}

/**
 * Warteschlange einer Welle: einzelne Zombies, "pack:<typ>" für ein Rattenrudel
 * und "elite:<typ>" für Elites (die kommen in der Mitte der Welle).
 */
export function waveQueue(state: { rng: number }, n: number, cfg: WaveConfig): string[] {
  const comp = waveComposition(n, cfg);
  const queue = Object.entries(comp).flatMap(([id, count]) => Array<string>(count).fill(id));
  if (cfg.ratPacks) for (let i = 0; i < ratPackCount(n, cfg); i++) queue.push(`pack:${cfg.ratPacks.type}`);
  shuffle(state, queue);
  const elites = waveElites(n, cfg).map((t) => `elite:${t}`);
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
      state.events.push({ type: 'waveStart', number: w.number });
    }
    return;
  }

  w.spawnTimer -= DT;
  while (w.spawnTimer <= 0 && w.queue.length > 0) {
    spawnEntry(ctx, w.queue.shift()!);
    w.spawnTimer += cfg.spawnInterval;
  }
  if (w.queue.length === 0 && state.zombies.length === 0) {
    state.events.push({ type: 'waveCleared', number: w.number });
    awardWaveBonus(ctx, w.number);
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
  const base = pickWeighted(state, data.arena.spawnPoints, (p: SpawnPoint) => p.weight);
  const count =
    kind === 'pack' && data.waves.ratPacks
      ? data.waves.ratPacks.minSize + Math.floor(nextRandom(state) * (data.waves.ratPacks.maxSize - data.waves.ratPacks.minSize + 1))
      : 1;
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

/** Zombie an einer Stelle erscheinen lassen, Leben und Schaden nach der aktuellen Welle. */
export function spawnZombieAt(ctx: SimContext, def: ZombieDef, pos: Vec2, objectiveId?: string): Zombie {
  const { state, data } = ctx;
  if (!objectiveId) {
    // Ziel nach targetWeights wählen, nur unter noch stehenden Zielen.
    const alive = state.objectives.filter((o) => !o.destroyed && (data.waves.targetWeights[o.id] ?? 0) > 0);
    objectiveId = alive.length > 0 ? pickWeighted(state, alive, (o) => data.waves.targetWeights[o.id]).id : 'heart';
  }
  const scale = waveScaling(state.wave.number, data.waves);
  const hp = Math.round(def.hp * scale.hp);
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
  };
  state.zombies.push(z);
  return z;
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
