import { describe, it } from 'vitest';
import { gameData } from '../../src/gameData';
import { encodeSnapshot } from '../../src/net/protocol';
import { defaultTeam } from '../../src/sim/bots/team';
import { Simulation } from '../../src/sim/game';
import type { BotDifficulty } from '../../src/sim/types';

/**
 * Leistung des Servers messen: drei Bots spielen (Vorrat unzerstörbar), je Welle
 * Tick-Dauer (Schnitt, 99 %, max), Einheiten und Größe der Schnappschüsse.
 * Nur mit PERF=1 (PERF=1 npx vitest run tests/balance/perf --silent=false).
 */
const difficulty = (process.env.PERF_DIFF ?? 'schwer') as BotDifficulty;
const zombieTypes = gameData.zombies.map((z) => z.id);

describe.skipIf(!process.env.PERF)('Leistung', () => {
  it('Tick-Dauer und Schnappschussgröße je Welle', () => {
    const team = defaultTeam(gameData.bots, null);
    const sim = new Simulation(gameData, { seed: 4242, heroes: team, bots: team.map(() => difficulty) });
    let wave = sim.state.wave.number;
    let times: number[] = [];
    let bytes: number[] = [];
    let units = 0;
    let projectiles = 0;
    const rows: string[] = [];
    const flush = () => {
      if (times.length === 0) return;
      times.sort((a, b) => a - b);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const p99 = times[Math.floor(times.length * 0.99)];
      const kb = bytes.reduce((a, b) => a + b, 0) / bytes.length / 1024;
      rows.push(`W${wave}: Tick Ø ${avg.toFixed(2)} ms, 99 % ${p99.toFixed(2)} ms, max ${times.at(-1)!.toFixed(1)} ms | Zombies max ${units}, Geschosse max ${projectiles} | Schnappschuss Ø ${kb.toFixed(1)} KB (Level ${sim.state.heroes.map((h) => h.level).join('/')})`);
      times = [];
      bytes = [];
      units = 0;
      projectiles = 0;
    };
    while (!sim.state.gameOver && sim.state.wave.number <= 20 && sim.state.time < 40 * 60) {
      for (const o of sim.state.objectives) if (o.kind === 'food' || o.kind === 'hive') o.hp = o.maxHp;
      const t0 = performance.now();
      sim.step();
      times.push(performance.now() - t0);
      if (sim.state.tick % 10 === 0) bytes.push(encodeSnapshot(sim.state, sim.state.events, zombieTypes, sim.state.tick % 20 === 0).length);
      units = Math.max(units, sim.state.zombies.length);
      projectiles = Math.max(projectiles, sim.state.projectiles.length);
      if (sim.state.wave.number !== wave) {
        flush();
        wave = sim.state.wave.number;
      }
    }
    flush();
    console.log(rows.join('\n'));
  }, 1_800_000);
});
