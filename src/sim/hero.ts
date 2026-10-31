import { tryCast, updateDash } from './abilities';
import { heroAttack } from './combat';
import { buy, sell, useConsumable } from './economy';
import { itemStats } from './items';
import type { SimContext } from './context';
import { kitOf } from './heroes/index';
import { face } from './movement';
import { levelStats, rankUp } from './progression';
import { buffSum, hasBuff, updateBuffs } from './status';
import { arenaBounds } from './grid';
import { orderBots } from './bots/brain';
import { castSpell, chooseSpells, finishTeleport } from './spells';
import { DT, PING_KINDS, type Command, type Hero, type PingKind } from './types';
import type { Vec2 } from './vec';

/** Übernimmt die Befehle eines Ticks. Eingaben gelten, bis eine neue kommt. */
export function applyInputs(ctx: SimContext, commands: readonly Command[]): void {
  for (const cmd of commands) {
    const h = ctx.state.heroes.find((x) => x.id === cmd.heroId);
    if (!h) continue;
    // Lebenszeichen: jede Aktion außer „nichts drücken“
    const idle = cmd.type === 'input' && cmd.move.x === 0 && cmd.move.y === 0 && !cmd.attack;
    if (!idle) h.lastActiveAt = ctx.state.time;
    if (cmd.type === 'levelUp') {
      rankUp(ctx, h, cmd.slot);
      continue;
    }
    if (cmd.type === 'ping') {
      ping(ctx, h, cmd.kind, cmd.pos);
      continue;
    }
    if (cmd.type === 'startWave') {
      if (ctx.state.wave.phase === 'pause') ctx.state.wave.timer = Math.min(ctx.state.wave.timer, DT / 2);
      continue;
    }
    if (cmd.type === 'buy') {
      buy(ctx, h, cmd.itemId);
      continue;
    }
    if (cmd.type === 'sell') {
      sell(ctx, h, cmd.slot, cmd.consumable);
      continue;
    }
    if (cmd.type === 'use') {
      useConsumable(ctx, h, cmd.slot);
      continue;
    }
    if (cmd.type === 'chooseSpells') {
      chooseSpells(ctx, h, cmd.spells);
      continue;
    }
    if (cmd.type === 'spell') {
      castSpell(ctx, h, cmd.slot, cmd.aim);
      continue;
    }
    if (!h.alive) continue;
    if (cmd.type === 'cast') {
      tryCast(ctx, h, cmd.slot, cmd.aim);
      continue;
    }
    // Laufrichtung auf Länge 1 begrenzen: schräg ist nicht schneller als gerade.
    const len = Math.hypot(cmd.move.x, cmd.move.y);
    const move = len > 1 ? { x: cmd.move.x / len, y: cmd.move.y / len } : { ...cmd.move };
    h.input = { move, aim: { ...cmd.aim }, attack: cmd.attack };
  }
}

/** Höchstens so viele Pings je Held in PING_WINDOW Sekunden. */
const PING_LIMIT = 3;
const PING_WINDOW = 5;

/** Ping an alle: nur gültige Arten, Position auf der Karte, mit Spam-Schutz. Auch gefallene Helden dürfen pingen. */
function ping(ctx: SimContext, h: Hero, kind: unknown, pos: unknown): void {
  if (!PING_KINDS.includes(kind as PingKind)) return;
  const p = pos as Vec2 | undefined;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
  const t = ctx.state.time;
  const recent = (h.pingTimes ?? []).filter((x) => t - x < PING_WINDOW);
  if (recent.length >= PING_LIMIT) return;
  h.pingTimes = [...recent, t];
  const b = arenaBounds(ctx.arena);
  const at = { x: Math.max(b.x0, Math.min(b.x1, p.x)), y: Math.max(b.y0, Math.min(b.y1, p.y)) };
  ctx.state.events.push({ type: 'ping', heroId: h.id, kind: kind as PingKind, pos: at });
  // Pings von Menschen sind Aufträge an die Bots
  if (!h.bot) orderBots(ctx, h, kind as PingKind, at);
}

/**
 * Einen Tick in Laufrichtung move (Länge ≤ 1) gehen: Tempo aus Held, Buffs,
 * Items und Helden-Fähigkeit. Hindernisse löst die Simulation danach auf.
 * Der Mehrspieler-Client nutzt dieselbe Formel für die Vorhersage.
 */
export function moveHero(ctx: SimContext, h: Hero, move: Vec2): void {
  const kit = kitOf(h.defId);
  const speed = h.speed * (1 + buffSum(h, 'haste') + itemStats(ctx, h).moveSpeed) * (kit.moveSpeedFactor?.(ctx, h) ?? 1);
  h.pos.x += move.x * speed * DT;
  h.pos.y += move.y * speed * DT;
}

/** So lange ohne Eingabe gilt ein Mensch als abwesend (s). */
export const AFK_TIME = 30;

/** Laufen mit WASD, Blick zur Maus, Angriff nur auf Tastendruck (kein Auto-Attack). */
export function updateHero(ctx: SimContext, h: Hero): void {
  // Abwesend: Mensch ohne Eingabe (Bots sind nie abwesend). Er lenkt keine Zombies ab und bekommt nichts.
  h.afk = !h.bot && ctx.state.time - (h.lastActiveAt ?? 0) > AFK_TIME;
  if (!h.alive) return;
  const def = ctx.heroDefs.get(h.defId)!;
  const kit = kitOf(h.defId);
  h.attackTimer = Math.max(0, h.attackTimer - DT);
  for (let i = 0; i < 4; i++) h.cooldowns[i] = Math.max(0, h.cooldowns[i] - DT);
  updateBuffs(ctx, h, DT);
  const items = itemStats(ctx, h);
  const regen = levelStats(def, h.level).regen + items.regen + (kit.regenBonus?.(ctx, h) ?? 0);
  h.hp = Math.min(h.maxHp, h.hp + regen * DT);
  kit.update?.(ctx, h);

  if (h.dash) {
    updateDash(ctx, h);
    return;
  }

  const { move, aim, attack } = h.input;
  const moving = move.x !== 0 || move.y !== 0;
  // Betäubt (Schlächter): nichts tun. Unaufhaltsam schützt davor (siehe status.ts).
  if (hasBuff(h, 'stunned')) return;
  if (h.channel) {
    const done = ctx.state.time >= h.channel.until;
    if (done || (moving && h.channel.cancelOnMove)) {
      const tag = h.channel.tag;
      h.channel = null;
      if (tag === 'teleport') finishTeleport(ctx, h, done);
      else kit.onChannelEnd?.(ctx, h, tag, done);
    }
    if (h.channel) return;
  }

  if (!hasBuff(h, 'rooted')) moveHero(ctx, h, move);
  face(h, aim);

  if (attack && h.attackTimer <= 0) {
    const bonus = buffSum(h, 'attackSpeed') + items.attackSpeed + (kit.attackSpeedBonus?.(ctx, h) ?? 0);
    heroAttack(ctx, h, def.attack.cooldown / (1 + bonus));
  }
}
