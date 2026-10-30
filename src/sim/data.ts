import type { GameData } from './types';

/**
 * Prüft die rohen JSON-Daten und gibt sie typisiert zurück. Fehler nennen den
 * Pfad, damit Tippfehler beim Balancing sofort auffallen.
 */
export function parseGameData(raw: {
  heroes: unknown;
  zombies: unknown;
  waves: unknown;
  arena: unknown;
}): GameData {
  const errors: string[] = [];
  const num = (o: any, key: string, path: string, min = 0): void => {
    if (typeof o?.[key] !== 'number' || !Number.isFinite(o[key]) || o[key] < min) {
      errors.push(`${path}.${key}: Zahl >= ${min} erwartet, gefunden ${JSON.stringify(o?.[key])}`);
    }
  };
  const str = (o: any, key: string, path: string): void => {
    if (typeof o?.[key] !== 'string' || o[key] === '') errors.push(`${path}.${key}: Text erwartet`);
  };
  const list = (v: unknown, path: string): any[] => {
    if (!Array.isArray(v) || v.length === 0) {
      errors.push(`${path}: nicht-leere Liste erwartet`);
      return [];
    }
    return v;
  };

  const heroes = list(raw.heroes, 'heroes');
  heroes.forEach((h, i) => {
    const p = `heroes[${i}]`;
    str(h, 'id', p);
    str(h, 'name', p);
    str(h, 'color', p);
    for (const k of ['hp', 'hpRegen', 'speed', 'radius']) num(h, k, p);
    const a = h?.attack;
    if (a?.type !== 'melee' && a?.type !== 'ranged') errors.push(`${p}.attack.type: "melee" oder "ranged" erwartet`);
    for (const k of ['damage', 'range', 'cooldown']) num(a, k, `${p}.attack`);
    if (a?.type === 'melee') num(a, 'arc', `${p}.attack`, 1);
    if (a?.type === 'ranged') {
      num(a, 'projectileSpeed', `${p}.attack`, 1);
      num(a, 'projectileRadius', `${p}.attack`);
    }
  });

  const zombies = list(raw.zombies, 'zombies');
  const zombieIds = new Set<string>();
  zombies.forEach((z, i) => {
    const p = `zombies[${i}]`;
    str(z, 'id', p);
    str(z, 'name', p);
    str(z, 'color', p);
    for (const k of ['hp', 'speed', 'radius', 'damage', 'attackRange', 'attackCooldown']) num(z, k, p);
    zombieIds.add(z?.id);
  });

  const w: any = raw.waves;
  for (const k of ['baseCount', 'countPerWave', 'hpScalePerWave', 'damageScalePerWave', 'spawnInterval', 'firstPauseDuration', 'pauseDuration']) {
    num(w, k, 'waves');
  }
  list(w?.mix, 'waves.mix').forEach((m, i) => {
    const p = `waves.mix[${i}]`;
    num(m, 'fromWave', p, 1);
    for (const [id, weight] of Object.entries(m?.weights ?? {})) {
      if (!zombieIds.has(id)) errors.push(`${p}.weights.${id}: unbekannter Zombie-Typ`);
      if (typeof weight !== 'number' || weight < 0) errors.push(`${p}.weights.${id}: Zahl >= 0 erwartet`);
    }
  });
  if (Array.isArray(w?.mix) && !w.mix.some((m: any) => m?.fromWave === 1)) {
    errors.push('waves.mix: ein Eintrag mit fromWave 1 wird benötigt');
  }

  const a: any = raw.arena;
  for (const k of ['width', 'height']) num(a, k, 'arena', 1);
  num(a, 'cellSize', 'arena', 0.1);
  list(a?.spawnPoints, 'arena.spawnPoints').forEach((s, i) => {
    num(s, 'x', `arena.spawnPoints[${i}]`);
    num(s, 'y', `arena.spawnPoints[${i}]`);
  });
  num(a?.heroStart, 'x', 'arena.heroStart');
  num(a?.heroStart, 'y', 'arena.heroStart');
  (Array.isArray(a?.obstacles) ? a.obstacles : []).forEach((o: any, i: number) => {
    const p = `arena.obstacles[${i}]`;
    num(o, 'x', p);
    num(o, 'y', p);
    if (o?.kind === 'circle') num(o, 'r', p);
    else if (o?.kind === 'rect') {
      num(o, 'w', p);
      num(o, 'h', p);
    } else errors.push(`${p}.kind: "circle" oder "rect" erwartet`);
  });

  if (errors.length > 0) throw new Error(`Ungültige Spieldaten:\n- ${errors.join('\n- ')}`);
  return raw as GameData;
}
