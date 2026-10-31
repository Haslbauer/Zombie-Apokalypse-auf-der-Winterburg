import { describe, it } from 'vitest';
import { gameData } from '../../src/gameData';
import { defaultTeam } from '../../src/sim/bots/team';
import { Simulation } from '../../src/sim/game';
import type { BotDifficulty } from '../../src/sim/types';

/**
 * Balancing: vier Bots spielen allein. Nur mit BALANCE=1 (npm run balance).
 * Optional: BALANCE_SEEDS=5, BALANCE_DIFF=mittel, BALANCE_MAXWAVE=30,
 * BALANCE_AFK=1 (ein Held bleibt untätig im Innenhof stehen, die anderen drei spielen),
 * BALANCE_TEAM=held,held,… (feste Zusammenstellung, z. B. ohne Tank).
 */
const afk = process.env.BALANCE_AFK === '1';
const seeds = Number(process.env.BALANCE_SEEDS ?? 4);
const diffs = (process.env.BALANCE_DIFF?.split(',') ?? ['leicht', 'mittel', 'schwer']) as BotDifficulty[];
const maxWave = Number(process.env.BALANCE_MAXWAVE ?? 30);
/** Feste Teamzusammenstellung, z. B. BALANCE_TEAM=rotschopf,grimm,pirat,gaertnerin (sonst ausgewogen). */
const fixedTeam = process.env.BALANCE_TEAM?.split(',');

function play(difficulty: BotDifficulty, seed: number) {
  const team = fixedTeam ?? defaultTeam(gameData.bots, null);
  const sim = new Simulation(gameData, { seed, heroes: team, bots: team.map((_, i) => (afk && i === 0 ? null : difficulty)) });
  let deaths = 0;
  let breaches = 0;
  const t0 = performance.now();
  while (!sim.state.gameOver && sim.state.wave.number <= maxWave && sim.state.time < 60 * 60) {
    sim.step();
    for (const e of sim.state.events) {
      if (e.type === 'death' && sim.state.heroes.some((h) => h.id === e.id)) deaths++;
      if (e.type === 'breach') breaches++;
    }
  }
  return {
    wave: sim.state.wave.number,
    victory: !!sim.state.victory,
    minutes: sim.state.time / 60,
    deaths,
    breaches,
    levels: sim.state.heroes.map((h) => h.level),
    items: sim.state.heroes.map((h) => `${h.defId}: ${h.inventory.filter(Boolean).join(', ')} (${h.gold} Gold)`),
    hive: sim.state.objectives.find((o) => o.id === 'hive')!.destroyed,
    msPerTick: (performance.now() - t0) / sim.state.tick,
  };
}

describe.skipIf(!process.env.BALANCE)('Balancing mit Bot-Partien', () => {
  for (const d of diffs) {
    it(`${afk ? '3 Bots + 1 AFK' : '4 Bots'} auf ${d}`, () => {
      const runs = Array.from({ length: seeds }, (_, i) => play(d, 1000 + i * 77));
      for (const r of runs) {
        console.log(
          `${d}${afk ? ' (AFK)' : ''}: ${r.victory ? 'SIEG ' : ''}Welle ${r.wave} nach ${r.minutes.toFixed(1)} min | Tode ${r.deaths} | Durchbrüche ${r.breaches} | Level ${r.levels.join('/')} | Stock ${r.hive ? 'zerstört' : 'steht'} | ${r.msPerTick.toFixed(2)} ms/Tick`,
        );
        console.log(`   Items: ${r.items.join(' | ')}`);
      }
      const avg = runs.reduce((s, r) => s + r.wave, 0) / runs.length;
      const wins = runs.filter((r) => r.victory).length;
      console.log(`>>> ${d}${afk ? ' (AFK)' : ''}: Durchschnitt Welle ${avg.toFixed(1)}, Siege ${wins}/${runs.length}`);
    }, 1_800_000);
  }
});
