import type { DataContext } from './context';
import { supportOnTankFactor } from './roles';
import type { FinalHeroStats, Hero, HeroScore, HeroStats, TeamStats } from './types';

/**
 * Statistik für den Bildschirm nach Spielende (Schaden, Heilung, Tode,
 * Serien, Kills pro Welle …). Sie zählt nur auf dem Server bzw. lokal mit und
 * wird nicht mit den Schnappschüssen geschickt (ändert sich bei jedem Treffer),
 * sondern einmal fertig im gameOver-Ereignis.
 */

export function emptyStats(): HeroStats {
  return { damage: 0, damageTaken: 0, healing: 0, deaths: 0, streak: 0, bestStreak: 0, killsPerWave: [], casts: 0, goldSpent: 0 };
}

/** Statistik eines Helden (legt sie bei Bedarf an). */
export function statsOf(h: Hero): HeroStats {
  return (h.stats ??= emptyStats());
}

/** Kill eines Helden in Welle wave: Kills pro Welle und Serie. */
export function noteKill(h: Hero, wave: number): void {
  const s = statsOf(h);
  const i = Math.max(0, wave - 1);
  while (s.killsPerWave.length <= i) s.killsPerWave.push(0);
  s.killsPerWave[i]++;
  s.streak++;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
}

/** Held gefallen: Tod zählen, Serie endet. */
export function noteDeath(h: Hero): void {
  const s = statsOf(h);
  s.deaths++;
  s.streak = 0;
}

/**
 * Held heilen (höchstens bis maxHp) und die tatsächlich geheilte Menge dem
 * Heiler gutschreiben (by: Held oder Helden-Id; ohne: normale Regeneration).
 */
export function healHero(ctx: DataContext, target: Hero, amount: number, by?: Hero | number): number {
  if (amount <= 0 || target.hp <= 0) return 0;
  const healerHero = typeof by === 'number' ? ctx.state.heroes.find((x) => x.id === by) : by;
  amount *= supportOnTankFactor(ctx, healerHero, target);
  const healed = Math.min(amount, target.maxHp - target.hp);
  if (healed <= 0) return 0;
  target.hp += healed;
  const healer = typeof by === 'number' ? ctx.state.heroes.find((x) => x.id === by) : by;
  if (healer) statsOf(healer).healing += healed;
  return healed;
}

export interface MvpWeights {
  kills: number;
  bosses: number;
  assists: number;
  damage: number;
  healing: number;
  damageTaken: number;
  deaths: number;
}

/** Vorgabe, falls data/economy.json keine Gewichte hat. */
export const DEFAULT_MVP: MvpWeights = { kills: 1, bosses: 5, assists: 0.6, damage: 1 / 400, healing: 1 / 300, damageTaken: 1 / 800, deaths: -1 };

/** Wertung wie in LoL: Kills, Bosse, Assists, Schaden, Heilung, Einstecken, Tode. */
export function mvpScore(score: HeroScore, stats: HeroStats, w: MvpWeights = DEFAULT_MVP): number {
  const v =
    score.kills * w.kills +
    score.bosses * w.bosses +
    score.assists * w.assists +
    stats.damage * w.damage +
    stats.healing * w.healing +
    stats.damageTaken * w.damageTaken +
    stats.deaths * w.deaths;
  return Math.max(0, Math.round(v * 10) / 10);
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Alle Helden, nach Wertung sortiert (bester zuerst). */
export function finalStats(ctx: DataContext): FinalHeroStats[] {
  const w = { ...DEFAULT_MVP, ...(ctx.data.economy.rewards.mvp ?? {}) };
  return ctx.state.heroes
    .filter((h) => !h.benched)
    .map((h) => {
      const s = statsOf(h);
      const stats: HeroStats = { ...s, damage: Math.round(s.damage), damageTaken: Math.round(s.damageTaken), healing: Math.round(s.healing), killsPerWave: [...s.killsPerWave] };
      return { heroId: h.id, defId: h.defId, bot: !!h.bot, level: h.level, score: { ...h.score }, stats, mvp: mvpScore(h.score, stats, w) };
    })
    .sort((a, b) => b.mvp - a.mvp || b.score.kills - a.score.kills || a.heroId - b.heroId);
}

export function teamStats(ctx: DataContext): TeamStats {
  const { state } = ctx;
  const pct = (o?: { hp: number; maxHp: number }) => (o && o.maxHp > 0 ? Math.round((Math.max(0, o.hp) / o.maxHp) * 100) : 0);
  const beds = state.objectives.filter((o) => o.kind === 'bed');
  const hive = state.objectives.find((o) => o.kind === 'hive');
  return {
    wave: state.wave.number,
    time: r1(state.time),
    kills: state.kills,
    bosses: state.heroes.reduce((n, h) => n + h.score.bosses, 0),
    couriers: state.couriersCaught ?? 0,
    food: pct(state.objectives.find((o) => o.kind === 'food')),
    bedsAlive: beds.filter((o) => !o.destroyed).length,
    beds: beds.length,
    hive: hive ? (hive.destroyed ? 0 : pct(hive)) : null,
  };
}

/** Spiel beenden (Sieg oder Niederlage) und die Endstatistik mitschicken. */
export function endGame(ctx: DataContext, reason: string, victory: boolean, winnerTeam?: number): void {
  const { state } = ctx;
  if (state.gameOver) return;
  state.gameOver = true;
  if (victory) state.victory = true;
  state.events.push({ type: 'gameOver', wave: state.wave.number, reason, victory: victory || undefined, stats: finalStats(ctx), team: teamStats(ctx), winnerTeam });
}
