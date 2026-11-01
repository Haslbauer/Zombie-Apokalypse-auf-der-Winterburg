import { edgeDistance } from '../combat';
import type { SimContext } from '../context';
import { shopClosedReason } from '../economy';
import { buildPlan, componentsOf, itemDef, itemStats } from '../items';
import { objDistance } from '../objectives';
import { canRankUp } from '../progression';
import { nextRandom } from '../rng';
import { hasBuff } from '../status';
import type { BotDifficulty, BotState, Command, Hero, PingKind, Zombie } from '../types';
import { dist, type Vec2 } from '../vec';
import { abilityAim } from './abilities';
import { downedAllies } from '../revive';

/** Pfad wird spätestens nach so vielen Sekunden neu berechnet. */
const REPATH = 0.5;
/** Umkreis um den Posten, in dem der Bot Zombies angreift. */
const POST_LEASH = 14;
/** Nach einem Rückzug geht es ab diesem Lebensanteil zurück in den Kampf. */
const RETREAT_DONE = 0.8;
/** Mit Auftrag zieht sich ein Bot erst bei so wenig Leben zurück. */
const ORDER_RETREAT = 0.18;
/** Angriffs-Ping: Ziel im Umkreis des Pings, Auftrag gilt höchstens so lange (s). */
const ATTACK_PICK = 6;
const ATTACK_TIME = 25;
/** Im Kampf am Angriffsziel (näher als ENGAGED m) verlängert sich der Auftrag laufend. */
const ENGAGED = 12;
const ENGAGED_TIME = 6;
/** Hilfe- und Hier-Ping: Dauer (s) und Kampfumkreis um den Ort bzw. Helden. */
const HOLD_TIME = 12;
const HOLD_FIGHT = 8;
/** Gefahr-Ping: Umkreis und Dauer. */
const DANGER_RADIUS = 10;
const DANGER_TIME = 10;
/** Bots helfen Menschen gegen Postbote und Lager in diesem Umkreis. */
const ASSIST_RANGE = 25;

/**
 * Ping eines Menschen als Auftrag an die Bots (wie Kommandos in LoL):
 * - attack: nächstes Ziel um den Ping (auch Lager und Postbote), alle Bots, bis es tot ist
 * - help: alle Bots laufen zum pingenden Helden und beschützen ihn
 * - here / omw: die zwei nächsten Bots halten den Ort
 * - danger: alle Bots meiden den Bereich
 * Wer den Auftrag annimmt, antwortet mit „Bin unterwegs“ (ohne Spam-Schutz).
 */
export function orderBots(ctx: SimContext, from: Hero, kind: PingKind, pos: Vec2): void {
  const { state } = ctx;
  const t = state.time;
  const bots = state.heroes.filter((x) => x.bot && x.alive && x !== from);
  if (bots.length === 0) return;
  if (kind === 'danger') {
    for (const b of bots) b.bot!.avoid = { pos: { ...pos }, radius: DANGER_RADIUS, until: t + DANGER_TIME };
    return;
  }
  let takers = bots;
  let order: Omit<NonNullable<BotState['order']>, 'until'> & { until: number };
  if (kind === 'attack') {
    let target: Zombie | null = null;
    let best = ATTACK_PICK;
    for (const z of state.zombies) {
      const d = dist(z.pos, pos) - z.radius;
      if (z.hp > 0 && d < best) {
        best = d;
        target = z;
      }
    }
    order = { kind: 'attack', pos: { ...(target?.pos ?? pos) }, targetId: target?.id ?? null, heroId: from.id, until: t + ATTACK_TIME };
  } else if (kind === 'help') {
    order = { kind: 'help', pos: { ...from.pos }, targetId: null, heroId: from.id, until: t + HOLD_TIME };
  } else {
    takers = [...bots].sort((a, b) => dist(a.pos, pos) - dist(b.pos, pos)).slice(0, 2);
    order = { kind: 'here', pos: { ...pos }, targetId: null, heroId: from.id, until: t + HOLD_TIME };
  }
  for (const b of takers) {
    b.bot!.order = { ...order, pos: { ...order.pos } };
    b.bot!.thinkAt = t; // sofort reagieren
    state.events.push({ type: 'ping', heroId: b.id, kind: 'omw', pos: { ...order.pos } });
  }
}

/** Gültiger Auftrag oder null (abgelaufen, Ziel tot, Held gefallen). */
function activeOrder(ctx: SimContext, h: Hero, bot: BotState): NonNullable<BotState['order']> | null {
  const o = bot.order;
  if (!o) return null;
  const { state } = ctx;
  let valid = state.time < o.until;
  if (valid && o.kind === 'attack' && o.targetId !== null) {
    const z = state.zombies.find((x) => x.id === o.targetId);
    if (z && z.hp > 0) o.pos = { ...z.pos };
    else valid = false;
  }
  if (valid && o.kind === 'attack' && o.targetId !== null && dist(h.pos, o.pos) < ENGAGED) {
    // Wer schon am Ziel kämpft, bleibt dran, bis es fällt
    o.until = Math.max(o.until, state.time + ENGAGED_TIME);
  }
  if (valid && o.kind === 'help') {
    const friend = state.heroes.find((x) => x.id === o.heroId);
    if (friend?.alive) o.pos = { ...friend.pos };
    else valid = false;
  }
  if (!valid) bot.order = null;
  return bot.order ?? null;
}

/** Bester Zombie im Umkreis eines Orts (für Aufträge; Neutrale eingeschlossen). */
function nearestThreat(ctx: SimContext, h: Hero, center: Vec2, radius: number): Zombie | null {
  let best: Zombie | null = null;
  let bestScore = -Infinity;
  for (const z of ctx.state.zombies) {
    if (z.hp <= 0 || dist(z.pos, center) > radius) continue;
    // Neutrale nur, wenn sie schon kämpfen (sonst weckt der Bot ein Lager)
    if (z.neutral && z.targetId === null) continue;
    const score = -dist(z.pos, center) + (z.targetId !== null ? 4 : 0) + focusBonus(ctx, h, z);
    if (score > bestScore) {
      bestScore = score;
      best = z;
    }
  }
  return best;
}

/** Fokus: Ziele, die Mitspieler gerade angreifen, sind attraktiver. */
function focusBonus(ctx: SimContext, h: Hero, z: Zombie): number {
  let bonus = 0;
  for (const o of ctx.state.heroes) {
    if (o === h || !o.alive) continue;
    if (o.bot ? o.bot.targetId === z.id : o.input.attack && dist(o.input.aim, z.pos) < z.radius + 1.5) bonus += 8;
  }
  return bonus;
}

/** Neutraler Gegner (Postbote, Lager), der gerade mit einem Menschen kämpft, in Reichweite zum Helfen. */
function assistTarget(ctx: SimContext, h: Hero, bot: BotState): Zombie | null {
  let best: Zombie | null = null;
  let bestD = ASSIST_RANGE;
  for (const z of ctx.state.zombies) {
    if (!z.neutral || z.hp <= 0 || z.targetId === null || avoided(bot, z.pos, ctx.state.time)) continue;
    const victim = ctx.state.heroes.find((x) => x.id === z.targetId);
    if (!victim?.alive || victim.bot) continue;
    const d = dist(h.pos, z.pos);
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

function avoided(bot: BotState, p: Vec2, t: number): boolean {
  const a = bot.avoid;
  return !!a && t < a.until && dist(p, a.pos) < a.radius;
}

export function createBot(ctx: SimContext, difficulty: BotDifficulty, index: number): BotState {
  const posts = ctx.data.arena.botPosts ?? [ctx.data.arena.heroStart];
  return {
    difficulty,
    post: { ...posts[index % posts.length] },
    mode: 'post',
    thinkAt: 0,
    targetId: null,
    path: [],
    dest: null,
    pathAt: 0,
    aimOffset: { x: 0, y: 0 },
  };
}

/** Befehle eines Bot-Helden für diesen Tick. */
export function botCommands(ctx: SimContext, h: Hero): Command[] {
  const bot = h.bot!;
  const cmds: Command[] = [];
  if (!h.alive) {
    bot.path = [];
    bot.mode = 'post';
    return cmds;
  }
  const t = ctx.state.time;
  if (t >= bot.thinkAt) {
    bot.thinkAt = t + ctx.data.bots.difficulties[bot.difficulty].think;
    think(ctx, h, bot, cmds);
  }
  cmds.push(steer(ctx, h, bot));
  return cmds;
}

/** Entscheidungen: Skillpunkte, Einkauf, Rückzug, Ziel, Fähigkeiten, Tränke. */
function think(ctx: SimContext, h: Hero, bot: BotState, cmds: Command[]): void {
  const cfg = ctx.data.bots.heroes[h.defId];
  const diff = ctx.data.bots.difficulties[bot.difficulty];
  const { state } = ctx;

  // 1. Skillpunkte: Ultimate zuerst, sonst nach Reihenfolge
  if (h.skillPoints > 0) {
    const slot = [3, ...(cfg?.skillOrder ?? [0, 1, 2])].find((s) => canRankUp(ctx, h, s));
    if (slot !== undefined) cmds.push({ heroId: h.id, type: 'levelUp', slot });
  }

  // Zielfehler neu würfeln
  const a = nextRandom(state) * Math.PI * 2;
  const r = nextRandom(state) * diff.aimError;
  bot.aimOffset = { x: Math.cos(a) * r, y: Math.sin(a) * r };

  const hpShare = h.hp / h.maxHp;
  const potion = h.consumables.findIndex((c) => c?.itemId === 'heiltrank');
  const healing = h.buffs.some((b) => b.kind === 'heal');

  const order = activeOrder(ctx, h, bot);
  if (bot.avoid && state.time >= bot.avoid.until) bot.avoid = null;

  // 2. Rückzug bei wenig Leben (mit Auftrag erst sehr spät)
  const retreatAt = order ? ORDER_RETREAT : diff.retreatHp;
  if ((state.wave.phase === 'wave' || order) && (bot.mode === 'retreat' ? hpShare < RETREAT_DONE : hpShare < retreatAt)) {
    bot.mode = 'retreat';
    bot.targetId = null;
    if (potion >= 0 && !healing) cmds.push({ heroId: h.id, type: 'use', slot: potion });
    setDest(ctx, bot, h, ctx.data.arena.heroStart);
    useSpells(ctx, h, bot, null, cmds);
    return;
  }

  // 2b. Gefallenen Mitspieler in der Nähe wiederbeleben (danebenstellen)
  const downed = downedAllies(ctx, h).filter((a) => dist(a.pos, h.pos) < 16).sort((p, q) => dist(p.pos, h.pos) - dist(q.pos, h.pos))[0];
  if (downed) {
    bot.targetId = null;
    bot.mode = 'post';
    setDest(ctx, bot, h, downed.pos);
    useSpells(ctx, h, bot, null, cmds);
    return;
  }

  // 3. Gefahr-Ping: aus dem Bereich heraus
  if (bot.avoid && avoided(bot, h.pos, state.time) && !order) {
    const a = bot.avoid;
    const d = dist(h.pos, a.pos) || 1;
    bot.targetId = null;
    bot.mode = 'post';
    setDest(ctx, bot, h, { x: a.pos.x + ((h.pos.x - a.pos.x) / d) * (a.radius + 1.5), y: a.pos.y + ((h.pos.y - a.pos.y) / d) * (a.radius + 1.5) });
    return;
  }

  // 4. Auftrag aus einem Ping bzw. Hilfe gegen Postbote und Lager
  const helping = order ? null : assistTarget(ctx, h, bot);
  if (order || helping) {
    let target: Zombie | null = helping;
    if (order?.kind === 'attack') {
      target = order.targetId !== null ? (state.zombies.find((z) => z.id === order.targetId) ?? null) : null;
      // Ohne festes Ziel: am Ort kämpfen
      if (!target && dist(h.pos, order.pos) < HOLD_FIGHT) target = nearestThreat(ctx, h, order.pos, HOLD_FIGHT);
    } else if (order) target = nearestThreat(ctx, h, order.pos, HOLD_FIGHT);
    engage(ctx, h, bot, target, order?.pos ?? h.pos);
    useAbilities(ctx, h, bot, target, cmds);
    useSpells(ctx, h, bot, target, cmds);
    if (hpShare < 0.5 && potion >= 0 && !healing) cmds.push({ heroId: h.id, type: 'use', slot: potion });
    return;
  }

  // 5. Pause: einkaufen, sonst zum Posten
  if (state.wave.phase === 'pause') {
    bot.targetId = null;
    const want = nextPurchase(ctx, h);
    if (want) {
      bot.mode = 'shop';
      if (!shopClosedReason(ctx, h)) cmds.push({ heroId: h.id, type: 'buy', itemId: want });
      else setDest(ctx, bot, h, ctx.data.arena.heroStart);
      return;
    }
    bot.mode = 'post';
    setDest(ctx, bot, h, bot.post);
    return;
  }

  // 6. Ziel nach Bedrohung
  const target = pickTarget(ctx, h, bot);
  engage(ctx, h, bot, target, bot.post);
  useAbilities(ctx, h, bot, target, cmds);
  useSpells(ctx, h, bot, target, cmds);

  // 8. Heiltrank im Kampf
  if (hpShare < 0.5 && potion >= 0 && !healing) cmds.push({ heroId: h.id, type: 'use', slot: potion });
}

/**
 * Beschwörerzauber der Bots (einfache Regeln): Heilen/Barriere bei wenig
 * Leben, Reinigen bei Kontrolle, Blitz zur Flucht, Entzünden/Erschöpfen auf
 * große Gegner, Zerschmettern zum Erlegen von Bossen und Lagern, Geist für
 * weite Wege.
 */
function useSpells(ctx: SimContext, h: Hero, bot: BotState, target: Zombie | null, cmds: Command[]): void {
  const diff = ctx.data.bots.difficulties[bot.difficulty];
  const { state } = ctx;
  const hpShare = h.hp / h.maxHp;
  const big = target && (ctx.zombieDefs.get(target.defId)?.rank ?? 'normal') !== 'normal';
  const near = state.zombies.some((z) => z.hp > 0 && !z.neutral && dist(z.pos, h.pos) < 3);
  for (let slot = 0; slot < 2; slot++) {
    if (!h.spells || h.spellCooldowns[slot] > 0) continue;
    const id = h.spells[slot];
    let aim: Vec2 | null = null;
    if ((id === 'heilen' || id === 'barriere') && hpShare < 0.35 && h.lastCombatAt > state.time - 2) aim = h.pos;
    else if (id === 'reinigen' && (hasBuff(h, 'stunned') || hasBuff(h, 'rooted'))) aim = h.pos;
    else if (id === 'blitz' && hpShare < 0.22 && near) aim = ctx.data.arena.heroStart;
    else if (id === 'geist' && bot.dest && dist(bot.dest, h.pos) > 25) aim = h.pos;
    else if ((id === 'entzuenden' || id === 'erschoepfen') && target && big && dist(target.pos, h.pos) < 5.5) aim = target.pos;
    else if (id === 'zerschmettern' && target && dist(target.pos, h.pos) < 4.5) {
      const dmg = 380 + 40 * h.level;
      if ((big || target.neutral) && target.hp <= dmg) aim = target.pos;
    } else if (id === 'teleport' && bot.order && dist(bot.order.pos, h.pos) > 30) aim = bot.order.pos;
    if (aim && nextRandom(state) < Math.max(0.5, diff.abilityChance)) {
      cmds.push({ heroId: h.id, type: 'spell', slot, aim: { ...aim } });
      return;
    }
  }
}

/** Ziel angreifen (Nahkampf hinlaufen, Fernkampf auf Abstand) oder ohne Ziel zum Ort fallback gehen. */
function engage(ctx: SimContext, h: Hero, bot: BotState, target: Zombie | null, fallback: Vec2): void {
  bot.targetId = target?.id ?? null;
  if (!target) {
    bot.mode = 'post';
    setDest(ctx, bot, h, fallback);
    return;
  }
  bot.mode = 'fight';
  const def = ctx.heroDefs.get(h.defId)!;
  const range = def.attack.range * (1 + itemStats(ctx, h).range);
  if (def.attack.type !== 'ranged' || edgeDistance(h, target) > range * 0.85) setDest(ctx, bot, h, target.pos);
  else {
    bot.dest = null;
    bot.path = [];
  }
}

/** Eine Fähigkeit pro Denkschritt, laut Hinweisen in data/bots.json. */
function useAbilities(ctx: SimContext, h: Hero, bot: BotState, target: Zombie | null, cmds: Command[]): void {
  if (hasBuff(h, 'stunned') || h.dash || h.channel) return;
  const cfg = ctx.data.bots.heroes[h.defId];
  const diff = ctx.data.bots.difficulties[bot.difficulty];
  for (let slot = 0; slot < 4; slot++) {
    const hint = cfg?.abilities[slot];
    if (!hint || h.ranks[slot] <= 0 || h.cooldowns[slot] > 0) continue;
    const aim = abilityAim(ctx, h, slot, hint, target);
    if (!aim) continue;
    if (nextRandom(ctx.state) < diff.abilityChance) {
      cmds.push({ heroId: h.id, type: 'cast', slot, aim });
      break;
    }
  }
}

/**
 * Nächster Kauf laut Einkaufsliste (Heiltrank: bis 2 Stück). Ein Listeneintrag
 * gilt als erledigt, wenn der Bot das Item besitzt oder es in einem eigenen
 * Item verbaut ist. Fehlt Gold für das ganze Rezept, kauft er erst Bauteile.
 */
function nextPurchase(ctx: SimContext, h: Hero): string | null {
  const list = ctx.data.bots.heroes[h.defId]?.buy ?? [];
  // Besitz samt verbauter Bauteile; jeder Eintrag wird nur einmal angerechnet
  const have: string[] = [];
  for (const id of h.inventory) if (id) have.push(id, ...componentsOf(ctx, id));
  for (const id of list) {
    const item = itemDef(ctx, id);
    if (!item) continue;
    if (item.category === 'consumable') {
      const count = h.consumables.reduce((n, c) => n + (c?.itemId === id ? c.count : 0), 0);
      if (count >= 2) continue;
      const space = h.consumables.some((c) => c === null || (c.itemId === id && c.count < (item.maxStack ?? 1)));
      if (!space) continue;
      return h.gold >= item.price ? id : null;
    }
    const i = have.indexOf(id);
    if (i >= 0) {
      have.splice(i, 1);
      continue;
    }
    return affordableStep(ctx, h, id); // der Reihe nach sparen
  }
  return null;
}

/** Das Item selbst, wenn bezahlbar und Platz da ist, sonst das erste bezahlbare fehlende Bauteil. */
function affordableStep(ctx: SimContext, h: Hero, id: string): string | null {
  const plan = buildPlan(ctx, h, id);
  const space = plan.consumed.length > 0 || h.inventory.includes(null);
  if (space && h.gold >= plan.cost) return id;
  for (const c of itemDef(ctx, id)?.from ?? []) {
    if (h.inventory.includes(c)) continue;
    const step = affordableStep(ctx, h, c);
    if (step) return step;
  }
  return null;
}

/** Bedrohung bewerten: Zombies an Herz und Bienenstock, an Mitspielern, Elites, am Posten. */
function pickTarget(ctx: SimContext, h: Hero, bot: BotState): Zombie | null {
  const { state } = ctx;
  // Bedrohte Ziele: Vorrat vor Bienenstock vor Hochbeeten
  const guarded = state.objectives
    .filter((o) => !o.destroyed)
    .map((o) => ({ o, value: o.kind === 'food' ? 100 : o.kind === 'hive' ? 80 : 40, range: o.kind === 'food' ? 9 : 4 }));
  let best: Zombie | null = null;
  let bestScore = 0;
  for (const z of state.zombies) {
    if (z.hp <= 0) continue;
    // Lager und Postbote nur, wenn sie schon kämpfen (Bots locken sie nicht an)
    if (z.neutral && z.targetId === null) continue;
    if (avoided(bot, z.pos, state.time)) continue;
    let score = 0;
    for (const g of guarded) if (objDistance(z, g.o) < g.range) score = Math.max(score, g.value);
    const victim = z.targetId !== null ? state.heroes.find((x) => x.id === z.targetId) : undefined;
    if (victim && victim.alive && edgeDistance(z, victim) < 2) score += 50;
    if ((ctx.zombieDefs.get(z.defId)?.rank ?? 'normal') !== 'normal') score += 30;
    if (dist(z.pos, bot.post) < POST_LEASH) score += 20;
    if (dist(z.pos, h.pos) < 6) score += 25;
    if (score === 0) continue;
    score += focusBonus(ctx, h, z);
    score -= dist(h.pos, z.pos) * 2;
    if (z.id === bot.targetId) score += 15; // Ziel nicht ständig wechseln
    if (score > bestScore) {
      bestScore = score;
      best = z;
    }
  }
  return best;
}

function setDest(ctx: SimContext, bot: BotState, h: Hero, dest: Vec2): void {
  const moved = !bot.dest || dist(bot.dest, dest) > 1.5;
  if (moved || ctx.state.time >= bot.pathAt) {
    bot.dest = { ...dest };
    bot.path = dist(h.pos, dest) < 0.6 ? [] : ctx.grid.findPath(h.pos, dest);
    bot.pathAt = ctx.state.time + REPATH;
  }
}

/** Pro Tick: dem Pfad folgen, zum Ziel schauen, angreifen, Fernkämpfer weichen aus. */
function steer(ctx: SimContext, h: Hero, bot: BotState): Command {
  while (bot.path.length > 0 && dist(h.pos, bot.path[0]) < 0.4) bot.path.shift();
  let move = { x: 0, y: 0 };
  if (bot.path.length > 0) {
    const p = bot.path[0];
    const d = dist(h.pos, p) || 1;
    move = { x: (p.x - h.pos.x) / d, y: (p.y - h.pos.y) / d };
  }
  const target = bot.targetId !== null ? ctx.state.zombies.find((z) => z.id === bot.targetId && z.hp > 0) : undefined;
  let aim = bot.dest ?? { x: h.pos.x + Math.cos(h.facing), y: h.pos.y + Math.sin(h.facing) };
  let attack = false;
  if (target) {
    const def = ctx.heroDefs.get(h.defId)!;
    const range = def.attack.range * (1 + itemStats(ctx, h).range);
    const d = edgeDistance(h, target);
    aim = { x: target.pos.x + bot.aimOffset.x, y: target.pos.y + bot.aimOffset.y };
    attack = d <= range;
    if (def.attack.type === 'ranged' && d < 3) {
      // zu nah: rückwärts ausweichen und weiter schießen
      const away = dist(h.pos, target.pos) || 1;
      move = { x: (h.pos.x - target.pos.x) / away, y: (h.pos.y - target.pos.y) / away };
    }
  }
  // Bossfähigkeiten ausweichen: aus der Warnung herauslaufen (leichte Bots reagieren spät)
  const late = bot.difficulty === 'leicht';
  for (const z of ctx.state.zombies) {
    const c = z.abil?.cast;
    if (!c || (late && c.left > 0.35)) continue;
    const r = ctx.zombieDefs.get(z.defId)?.abilities?.[c.i]?.radius ?? 0;
    for (const p of c.points) {
      const d = dist(h.pos, p);
      if (d > r + h.radius + 0.4) continue;
      const k = d > 1e-3 ? 1 / d : 1;
      move = d > 1e-3 ? { x: (h.pos.x - p.x) * k, y: (h.pos.y - p.y) * k } : { x: Math.cos(h.facing + Math.PI / 2), y: Math.sin(h.facing + Math.PI / 2) };
    }
  }
  return { heroId: h.id, type: 'input', move, aim, attack };
}
