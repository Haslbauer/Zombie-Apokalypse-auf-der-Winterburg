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
  progression: unknown;
  items: unknown;
  economy: unknown;
  bots: unknown;
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
    for (const k of ['color', 'role', 'description', 'figure']) str(h, k, p);
    for (const k of ['hp', 'hpRegen', 'speed', 'radius', 'hpPerLevel', 'regenPerLevel', 'damagePerLevel']) num(h, k, p);
    str(h?.passive, 'name', `${p}.passive`);
    str(h?.passive, 'description', `${p}.passive`);
    for (const [k, v] of Object.entries(h?.passive?.values ?? {})) {
      if (typeof v !== 'number') errors.push(`${p}.passive.values.${k}: Zahl erwartet`);
    }
    if (!Array.isArray(h?.abilities) || h.abilities.length !== 4) errors.push(`${p}.abilities: genau 4 Fähigkeiten erwartet`);
    (Array.isArray(h?.abilities) ? h.abilities : []).forEach((ab: any, j: number) => {
      const q = `${p}.abilities[${j}]`;
      for (const k of ['id', 'name', 'description']) str(ab, k, q);
      if (!['line', 'cone', 'circle', 'target', 'self', 'dash'].includes(ab?.shape)) errors.push(`${q}.shape: unbekannte Form`);
      num(ab, 'range', q);
      const ranks = j === 3 ? 3 : 5;
      for (const [k, v] of Object.entries({ cooldown: ab?.cooldown, ...(ab?.values ?? {}) })) {
        const ok = typeof v === 'number' || (Array.isArray(v) && v.length === ranks && v.every((x) => typeof x === 'number'));
        if (!ok) errors.push(`${q}.${k}: Zahl oder Liste mit ${ranks} Zahlen (eine je Rang) erwartet`);
      }
    });
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
    for (const k of ['hp', 'speed', 'radius', 'damage', 'attackRange', 'attackCooldown', 'aggroRange']) num(z, k, p);
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
  // Koordinaten dürfen bis minX/minY ins Gelände außerhalb des Gartens reichen
  for (const k of ['minX', 'minY']) if (a?.[k] !== undefined && typeof a[k] !== 'number') errors.push(`arena.${k}: Zahl erwartet`);
  const x0 = Math.min(0, a?.minX ?? 0);
  const y0 = Math.min(0, a?.minY ?? 0);
  const pos = (o: any, path: string): void => {
    num(o, 'x', path, x0);
    num(o, 'y', path, y0);
  };
  list(a?.spawnPoints, 'arena.spawnPoints').forEach((s, i) => {
    const p = `arena.spawnPoints[${i}]`;
    str(s, 'id', p);
    pos(s, p);
    num(s, 'weight', p);
  });
  if (!Array.isArray(a?.slowZones)) errors.push('arena.slowZones: Liste erwartet');
  (Array.isArray(a?.slowZones) ? a.slowZones : []).forEach((z: any, i: number) => {
    pos(z, `arena.slowZones[${i}]`);
    for (const k of ['w', 'h', 'factor']) num(z, k, `arena.slowZones[${i}]`);
  });
  num(a?.respawn, 'base', 'arena.respawn');
  num(a?.respawn, 'perWave', 'arena.respawn');
  if (!Array.isArray(a?.objectives)) errors.push('arena.objectives: Liste erwartet');
  const objectiveIds = new Set<string>();
  (Array.isArray(a?.objectives) ? a.objectives : []).forEach((o: any, i: number) => {
    const p = `arena.objectives[${i}]`;
    str(o, 'id', p);
    str(o, 'name', p);
    str(o, 'kind', p);
    pos(o, p);
    for (const k of ['radius', 'regen', 'pauseRegen']) num(o, k, p);
    num(o, 'hp', p, 1);
    if (typeof o?.loseOnDestroy !== 'boolean') errors.push(`${p}.loseOnDestroy: true oder false erwartet`);
    if (o?.bees !== undefined) {
      for (const k of ['damage', 'range', 'aggroDuration']) num(o.bees, k, `${p}.bees`);
      num(o.bees, 'interval', `${p}.bees`, 0.05);
    }
    objectiveIds.add(o?.id);
  });
  const objectiveKinds = new Set((Array.isArray(a?.objectives) ? a.objectives : []).map((o: any) => o?.kind));
  zombies.forEach((z, i) => {
    if (!z?.targets || typeof z.targets !== 'object') errors.push(`zombies[${i}].targets: Ziele mit Gewicht erwartet`);
    for (const key of Object.keys(z?.targets ?? {})) {
      if (objectiveIds.size > 0 && !objectiveIds.has(key) && !objectiveKinds.has(key)) errors.push(`zombies[${i}].targets.${key}: unbekanntes Ziel`);
    }
  });
  for (const [i, p] of (Array.isArray(w?.packs) ? w.packs : []).entries()) {
    if (!zombieIds.has(p?.type)) errors.push(`waves.packs[${i}].type: unbekannter Zombie-Typ`);
    for (const k of ['fromWave', 'packsPerWave', 'minSize', 'maxSize']) num(p, k, `waves.packs[${i}]`);
    if (p?.sizePerWave !== undefined) num(p, 'sizePerWave', `waves.packs[${i}]`);
  }
  const zombieList: any[] = Array.isArray(raw.zombies) ? raw.zombies : [];
  (Array.isArray(a?.camps) ? a.camps : []).forEach((c: any, i: number) => {
    const p = `arena.camps[${i}]`;
    str(c, 'id', p);
    pos(c, p);
    num(c, 'respawn', p);
    if (!Array.isArray(c?.units) || c.units.length === 0) errors.push(`${p}.units: Liste von Zombie-Typen erwartet`);
    for (const u of c?.units ?? []) {
      const def = zombieList.find((z) => z?.id === u);
      if (!def) errors.push(`${p}.units: unbekannter Typ ${u}`);
      else if (!def.neutral) errors.push(`${p}.units: ${u} braucht neutral-Werte`);
    }
  });
  if (w?.courier !== undefined) {
    for (const k of ['firstWave', 'every', 'delay']) num(w.courier, k, 'waves.courier', k === 'delay' ? 0 : 1);
    const def = (Array.isArray(raw.zombies) ? raw.zombies : []).find((z: any) => z?.id === w.courier.type);
    if (!def?.courier) errors.push('waves.courier.type: Zombie-Typ mit courier-Werten erwartet');
    else for (const k of ['gold', 'goldPerWave', 'stay']) num(def.courier, k, `zombies.${def.id}.courier`);
    if (!Array.isArray(a?.courierRoute) || a.courierRoute.length < 2) errors.push('arena.courierRoute: mindestens 2 Wegpunkte erwartet');
    else a.courierRoute.forEach((p: any, i: number) => pos(p, `arena.courierRoute[${i}]`));
  }
  pos(a?.heroStart, 'arena.heroStart');
  (Array.isArray(a?.obstacles) ? a.obstacles : []).forEach((o: any, i: number) => {
    const p = `arena.obstacles[${i}]`;
    pos(o, p);
    if (o?.kind === 'circle') num(o, 'r', p);
    else if (o?.kind === 'rect') {
      num(o, 'w', p);
      num(o, 'h', p);
    } else errors.push(`${p}.kind: "circle" oder "rect" erwartet`);
    if (o?.blocksShots !== undefined && typeof o.blocksShots !== 'boolean') errors.push(`${p}.blocksShots: true oder false erwartet`);
  });

  const pr: any = raw.progression;
  num(pr, 'maxLevel', 'progression', 1);
  for (const k of ['xpShareRange', 'xpWaveScale', 'basicMaxRank', 'ultMaxRank']) num(pr, k, 'progression');
  if (!Array.isArray(pr?.xpToNext) || pr.xpToNext.length !== pr?.maxLevel - 1) {
    errors.push('progression.xpToNext: eine Zahl pro Level-Aufstieg (maxLevel - 1) erwartet');
  }
  list(pr?.xpShare, 'progression.xpShare');
  if (!Array.isArray(pr?.ultLevels) || pr.ultLevels.length !== pr?.ultMaxRank) {
    errors.push('progression.ultLevels: ein Level pro Ultimate-Rang erwartet');
  }
  zombies.forEach((z, i) => {
    num(z, 'xp', `zombies[${i}]`);
    num(z, 'gold', `zombies[${i}]`);
    str(z, 'figure', `zombies[${i}]`);
  });

  const categories = ['meleeWeapon', 'rangedWeapon', 'armor', 'stat', 'consumable'];
  list(raw.items, 'items').forEach((it, i) => {
    const p = `items[${i}]`;
    for (const k of ['id', 'name', 'description']) str(it, k, p);
    if (!categories.includes(it?.category)) errors.push(`${p}.category: eine von ${categories.join(', ')} erwartet`);
    num(it, 'price', p);
    for (const [k, v] of Object.entries(it?.stats ?? {})) if (typeof v !== 'number') errors.push(`${p}.stats.${k}: Zahl erwartet`);
    if (it?.category === 'consumable') {
      num(it, 'maxStack', p, 1);
      num(it?.use, 'duration', `${p}.use`, 0.05);
    }
  });
  const eco: any = raw.economy;
  for (const k of ['startGold', 'waveBonusBase', 'waveBonusPerWave', 'goldShareRange', 'shopRange', 'sellFactor']) num(eco, k, 'economy');
  num(eco, 'inventorySlots', 'economy', 1);

  const bots: any = raw.bots;
  for (const d of ['leicht', 'mittel', 'schwer']) {
    for (const k of ['think', 'aimError', 'abilityChance', 'retreatHp']) num(bots?.difficulties?.[d], k, `bots.difficulties.${d}`);
  }
  const itemIds = new Set((Array.isArray(raw.items) ? raw.items : []).map((i: any) => i?.id));
  // Rezepte: Bauteile müssen existieren, keine Verbrauchsgüter sein, billiger als das Ergebnis und ohne Kreis
  const rawItems: any[] = Array.isArray(raw.items) ? raw.items : [];
  const byId = new Map(rawItems.map((i) => [i?.id, i]));
  const cyclic = (id: string, seen: string[]): boolean =>
    seen.includes(id) || (byId.get(id)?.from ?? []).some((c: string) => cyclic(c, [...seen, id]));
  for (const item of rawItems) {
    if (item?.from === undefined) continue;
    if (!Array.isArray(item.from) || item.from.length === 0) {
      errors.push(`items.${item.id}.from: Liste von Bauteilen erwartet`);
      continue;
    }
    let sum = 0;
    for (const c of item.from) {
      const part = byId.get(c);
      if (!part) errors.push(`items.${item.id}.from: unbekanntes Item ${c}`);
      else if (part.category === 'consumable') errors.push(`items.${item.id}.from: Verbrauchsgut ${c} kann kein Bauteil sein`);
      else sum += part.price;
    }
    if (item.price <= sum) errors.push(`items.${item.id}.price: muss über der Summe der Bauteile (${sum}) liegen`);
    if (cyclic(item.id, [])) errors.push(`items.${item.id}.from: Rezept enthält sich selbst`);
  }
  for (const h of heroes) {
    const b = bots?.heroes?.[h?.id];
    if (!b) {
      errors.push(`bots.heroes.${h?.id}: Bot-Einstellungen fehlen`);
      continue;
    }
    if (!['melee', 'ranged', 'control'].includes(b.role)) errors.push(`bots.heroes.${h.id}.role: melee, ranged oder control erwartet`);
    if (!Array.isArray(b.abilities) || b.abilities.length !== 4) errors.push(`bots.heroes.${h.id}.abilities: 4 Hinweise erwartet`);
    for (const id of b.buy ?? []) if (!itemIds.has(id)) errors.push(`bots.heroes.${h.id}.buy: unbekanntes Item ${id}`);
  }

  if (errors.length > 0) throw new Error(`Ungültige Spieldaten:\n- ${errors.join('\n- ')}`);
  return raw as GameData;
}
