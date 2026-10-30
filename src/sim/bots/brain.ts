import { edgeDistance } from '../combat';
import type { SimContext } from '../context';
import { shopClosedReason } from '../economy';
import { itemDef, itemStats } from '../items';
import { canRankUp } from '../progression';
import { nextRandom } from '../rng';
import { hasBuff } from '../status';
import type { BotDifficulty, BotState, Command, Hero, Zombie } from '../types';
import { dist, type Vec2 } from '../vec';
import { abilityAim } from './abilities';

/** Pfad wird spätestens nach so vielen Sekunden neu berechnet. */
const REPATH = 0.5;
/** Umkreis um den Posten, in dem der Bot Zombies angreift. */
const POST_LEASH = 14;
/** Nach einem Rückzug geht es ab diesem Lebensanteil zurück in den Kampf. */
const RETREAT_DONE = 0.8;

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

  // 2. Rückzug bei wenig Leben
  if (state.wave.phase === 'wave' && (bot.mode === 'retreat' ? hpShare < RETREAT_DONE : hpShare < diff.retreatHp)) {
    bot.mode = 'retreat';
    bot.targetId = null;
    if (potion >= 0 && !healing) cmds.push({ heroId: h.id, type: 'use', slot: potion });
    setDest(ctx, bot, h, ctx.data.arena.heroStart);
    return;
  }

  // 3. Pause: einkaufen, sonst zum Posten
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

  // 4. Ziel nach Bedrohung
  const target = pickTarget(ctx, h, bot);
  bot.targetId = target?.id ?? null;
  if (!target) {
    bot.mode = 'post';
    setDest(ctx, bot, h, bot.post);
  } else {
    bot.mode = 'fight';
    const ranged = ctx.heroDefs.get(h.defId)!.attack.type === 'ranged';
    const range = ctx.heroDefs.get(h.defId)!.attack.range * (1 + itemStats(ctx, h).range);
    const d = edgeDistance(h, target);
    if (!ranged || d > range * 0.85) setDest(ctx, bot, h, target.pos);
    else {
      bot.dest = null;
      bot.path = [];
    }
  }

  // 7. Fähigkeiten (eine pro Denkschritt)
  if (!hasBuff(h, 'stunned') && !h.dash && !h.channel) {
    for (let slot = 0; slot < 4; slot++) {
      const hint = cfg?.abilities[slot];
      if (!hint || h.ranks[slot] <= 0 || h.cooldowns[slot] > 0) continue;
      const aim = abilityAim(ctx, h, slot, hint, target);
      if (!aim) continue;
      if (nextRandom(state) < diff.abilityChance) {
        cmds.push({ heroId: h.id, type: 'cast', slot, aim });
        break;
      }
    }
  }

  // 8. Heiltrank im Kampf
  if (hpShare < 0.5 && potion >= 0 && !healing) cmds.push({ heroId: h.id, type: 'use', slot: potion });
}

/** Nächstes Item der Einkaufsliste, das sich der Bot leisten kann (Heiltrank: bis 2 Stück). */
function nextPurchase(ctx: SimContext, h: Hero): string | null {
  const list = ctx.data.bots.heroes[h.defId]?.buy ?? [];
  for (const id of list) {
    const item = itemDef(ctx, id);
    if (!item) continue;
    if (item.category === 'consumable') {
      const have = h.consumables.reduce((n, c) => n + (c?.itemId === id ? c.count : 0), 0);
      if (have >= 2) continue;
      const space = h.consumables.some((c) => c === null || (c.itemId === id && c.count < (item.maxStack ?? 1)));
      if (!space) continue;
    } else {
      if (h.inventory.includes(id)) continue;
      if (!h.inventory.includes(null)) continue;
    }
    return h.gold >= item.price ? id : null; // der Reihe nach sparen
  }
  return null;
}

/** Bedrohung bewerten: Zombies an Herz und Bienenstock, an Mitspielern, Elites, am Posten. */
function pickTarget(ctx: SimContext, h: Hero, bot: BotState): Zombie | null {
  const { state } = ctx;
  const heart = state.objectives.find((o) => o.id === 'heart' && !o.destroyed);
  const hive = state.objectives.find((o) => o.id === 'hive' && !o.destroyed);
  let best: Zombie | null = null;
  let bestScore = 0;
  for (const z of state.zombies) {
    if (z.hp <= 0) continue;
    let score = 0;
    if (heart && dist(z.pos, heart.pos) < 9) score += 100;
    if (hive && dist(z.pos, hive.pos) < 7) score += 80;
    const victim = z.targetId !== null ? state.heroes.find((x) => x.id === z.targetId) : undefined;
    if (victim && victim.alive && edgeDistance(z, victim) < 2) score += 50;
    if ((ctx.zombieDefs.get(z.defId)?.rank ?? 'normal') !== 'normal') score += 30;
    if (dist(z.pos, bot.post) < POST_LEASH) score += 20;
    if (dist(z.pos, h.pos) < 6) score += 25;
    if (score === 0) continue;
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
  return { heroId: h.id, type: 'input', move, aim, attack };
}
