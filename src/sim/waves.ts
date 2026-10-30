import type { SimContext } from './context';
import { resolveObstacles } from './grid';
import { nextRandom, shuffle } from './rng';
import { emptyStatus } from './status';
import { DT, type SpawnPoint, type WaveConfig, type ZombieDef } from './types';

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
      const comp = waveComposition(w.number, cfg);
      w.queue = shuffle(state, Object.entries(comp).flatMap(([id, count]) => Array<string>(count).fill(id)));
      state.events.push({ type: 'waveStart', number: w.number });
    }
    return;
  }

  w.spawnTimer -= DT;
  while (w.spawnTimer <= 0 && w.queue.length > 0) {
    spawnZombie(ctx, ctx.zombieDefs.get(w.queue.shift()!)!);
    w.spawnTimer += cfg.spawnInterval;
  }
  if (w.queue.length === 0 && state.zombies.length === 0) {
    state.events.push({ type: 'waveCleared', number: w.number });
    w.number++;
    w.phase = 'pause';
    w.timer = cfg.pauseDuration;
  }
}

function spawnZombie(ctx: SimContext, def: ZombieDef): void {
  const { state, data } = ctx;
  const base = pickWeighted(state, data.arena.spawnPoints, (p: SpawnPoint) => p.weight);
  const pos = {
    x: base.x + (nextRandom(state) - 0.5) * 2,
    y: base.y + (nextRandom(state) - 0.5) * 2,
  };
  resolveObstacles(pos, def.radius, ctx.arena);
  // Ziel nach targetWeights wählen, nur unter noch stehenden Zielen.
  const alive = state.objectives.filter((o) => !o.destroyed && (data.waves.targetWeights[o.id] ?? 0) > 0);
  const objectiveId =
    alive.length > 0 ? pickWeighted(state, alive, (o) => data.waves.targetWeights[o.id]).id : 'heart';
  const scale = waveScaling(state.wave.number, data.waves);
  const hp = Math.round(def.hp * scale.hp);
  state.zombies.push({
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
  });
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
