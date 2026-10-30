import { val, zombiesInCircle, zombiesOnLine } from '../abilities';
import { heroHit } from '../combat';
import type { SimContext } from '../context';
import { addBuff, knockback, stun } from '../status';
import { DT, type Ball, type Hero } from '../types';
import { dist, type Vec2 } from '../vec';
import { addZone } from '../zones';
import { type HeroKit, passive } from './kit';

/** Ballgeschwindigkeit beim Zuspiel und beim Zurückkehren. */
const PASS_SPEED = 20;
/** In diesem Abstand hebt Libero einen liegenden Ball auf. */
const PICKUP = 1.2;

function ballPos(ctx: SimContext, ball: Ball): Vec2 {
  const holder = ball.heldBy !== null ? ctx.state.heroes.find((x) => x.id === ball.heldBy) : undefined;
  return holder ? { ...holder.pos } : { ...ball.pos };
}

function throwBall(ctx: SimContext, h: Hero, to: Vec2, speed: number, tag: string): void {
  const ball = h.ball!;
  const from = ballPos(ctx, ball);
  ball.heldBy = null;
  ball.pos = from;
  ball.flight = { from, to: { ...to }, elapsed: 0, duration: Math.max(DT, dist(from, to) / speed), tag, hitIds: [] };
}

/** Libero – Volleyballer, Ball als Objekt auf der Karte (wie Orianna). */
export const libero: HeroKit = {
  init(_ctx, h) {
    h.ball = { pos: { ...h.pos }, heldBy: h.id, flight: null };
  },

  onRespawn(_ctx, h) {
    h.ball = { pos: { ...h.pos }, heldBy: h.id, flight: null };
  },

  cast(ctx, h, slot, target, aim) {
    const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
    const t = ctx.state.time;
    const ball = h.ball!;
    switch (slot) {
      case 0:
        // Aufschlag: Ball fliegt als Linie durch die Zombies und bleibt liegen
        throwBall(ctx, h, target, val(ctx, h, slot, 'speed'), 'serve');
        return true;
      case 1: {
        // Block: Sperre vor Libero, Zombies werden zurückgedrängt und kurz betäubt
        const radius = ability.radius ?? 2;
        const center = { x: h.pos.x + Math.cos(h.facing) * (radius + 0.5), y: h.pos.y + Math.sin(h.facing) * (radius + 0.5) };
        for (const z of zombiesInCircle(ctx, center, radius)) {
          knockback(z, h.pos, val(ctx, h, slot, 'push'));
          stun(ctx, z, val(ctx, h, slot, 'stun'));
        }
        addZone(ctx, { kind: 'block', ownerId: h.id, pos: center, radius, activeAt: t, until: t + val(ctx, h, slot, 'duration'), push: true, pushFrom: { ...h.pos } });
        return true;
      }
      case 2: {
        // Zuspiel: Ball zum Verbündeten am Mauszeiger, ohne Mitspieler an sich selbst
        const allies = ctx.state.heroes.filter((a) => a.alive && a.id !== h.id && dist(a.pos, h.pos) <= ability.range);
        const mate = allies.sort((a, b) => dist(a.pos, aim) - dist(b.pos, aim))[0] ?? h;
        throwBall(ctx, h, mate.pos, PASS_SPEED, 'pass');
        ball.flight!.hitIds = [mate.id];
        return true;
      }
      case 3: {
        // Schmetterball: dort, wo der Ball gerade ist
        const at = ballPos(ctx, ball);
        ctx.state.events.push({ type: 'effect', kind: 'spike-start', pos: at, radius: ability.radius ?? 4, heroId: h.id });
        ctx.state.delayed.push({ at: t + val(ctx, h, slot, 'delay'), ownerId: h.id, tag: 'spike', pos: at, targetIds: [], value: 0 });
        return true;
      }
    }
    return false;
  },

  onDelayed(ctx, h, d) {
    if (d.tag !== 'spike') return;
    const radius = ctx.heroDefs.get(h.defId)!.abilities[3].radius ?? 4;
    ctx.state.events.push({ type: 'effect', kind: 'spike', pos: d.pos, radius, heroId: h.id });
    for (const z of zombiesInCircle(ctx, d.pos, radius)) {
      heroHit(ctx, h, z, val(ctx, h, 3, 'damage'));
      stun(ctx, z, val(ctx, h, 3, 'stun'));
    }
  },

  /** Ballflug, Aufheben und Ballgefühl (Rückkehr bei zu großem Abstand). */
  update(ctx, h) {
    const ball = h.ball;
    if (!ball) return;
    if (ball.flight) {
      const f = ball.flight;
      const prev = { ...ball.pos };
      f.elapsed = Math.min(f.duration, f.elapsed + DT);
      const k = f.elapsed / f.duration;
      ball.pos = { x: f.from.x + (f.to.x - f.from.x) * k, y: f.from.y + (f.to.y - f.from.y) * k };
      if (f.tag === 'serve') {
        for (const z of zombiesOnLine(ctx, prev, ball.pos, 0.6)) {
          if (f.hitIds.includes(z.id)) continue;
          f.hitIds.push(z.id);
          heroHit(ctx, h, z, val(ctx, h, 0, 'damage'));
        }
      }
      if (k >= 1) {
        ball.flight = null;
        if (f.tag === 'pass' || f.tag === 'return') {
          const mate = ctx.state.heroes.find((a) => a.id === (f.tag === 'return' ? h.id : f.hitIds[0]));
          ball.heldBy = mate?.id ?? null;
          if (mate && f.tag === 'pass') addBuff(ctx, mate, 'shield', val(ctx, h, 2, 'shield'), val(ctx, h, 2, 'duration'), 'zuspiel');
        }
      } else if (f.tag === 'pass' || f.tag === 'return') {
        // Empfänger bewegt sich: Ziel nachführen
        const mate = ctx.state.heroes.find((a) => a.id === (f.tag === 'return' ? h.id : f.hitIds[0]));
        if (mate) f.to = { ...mate.pos };
      }
      return;
    }
    if (ball.heldBy !== null) {
      const holder = ctx.state.heroes.find((a) => a.id === ball.heldBy);
      if (holder?.alive) ball.pos = { ...holder.pos };
      else ball.heldBy = null;
      return;
    }
    const d = dist(h.pos, ball.pos);
    if (d <= PICKUP) ball.heldBy = h.id;
    else if (d > passive(ctx, h, 'returnRange')) {
      ball.flight = { from: { ...ball.pos }, to: { ...h.pos }, elapsed: 0, duration: Math.max(DT, d / PASS_SPEED), tag: 'return', hitIds: [] };
    }
  },

  /** Ballgefühl: mit Ball in der Hand schneller. */
  moveSpeedFactor(ctx, h) {
    return h.ball?.heldBy === h.id ? 1 + passive(ctx, h, 'holdHaste') : 1;
  },
};
