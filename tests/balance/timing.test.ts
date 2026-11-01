import { describe, it } from 'vitest';
import { gameData } from '../../src/gameData';
import { defaultTeam } from '../../src/sim/bots/team';
import { Simulation } from '../../src/sim/game';
import type { BotDifficulty } from '../../src/sim/types';

/**
 * Spieldauer messen: drei Bots spielen, Vorrat und Bienenstock sind
 * unzerstörbar (TIMING_GOD=1), damit alle Wellen gespielt werden. Ausgabe:
 * Dauer jeder Kampfphase und Pause, Zombies je Welle, Gesamtzeit bis Welle 20.
 * Nur mit TIMING=1 (z. B. TIMING=1 TIMING_GOD=1 npx vitest run tests/balance/timing --silent=false).
 * Die Pause wird wie von Spielern genutzt: Bots starten die Welle nicht vorzeitig.
 */
const seeds = Number(process.env.TIMING_SEEDS ?? 2);
const difficulty = (process.env.TIMING_DIFF ?? 'schwer') as BotDifficulty;
const god = process.env.TIMING_GOD === '1';

describe.skipIf(!process.env.TIMING)('Spieldauer', () => {
  it('Dauer je Welle', () => {
    const totals: number[] = [];
    for (let s = 0; s < seeds; s++) {
      const team = defaultTeam(gameData.bots, null);
      const sim = new Simulation(gameData, { seed: 2000 + s * 31, heroes: team, bots: team.map(() => difficulty) });
      let phase = sim.state.wave.phase;
      let since = 0;
      const rows: string[] = [];
      let spawned = 0;
      let queueEmptyAt = 0;
      let last = '';
      while (!sim.state.gameOver && sim.state.time < 60 * 60) {
        if (god) for (const o of sim.state.objectives) if (o.kind === 'food' || o.kind === 'hive') o.hp = o.maxHp;
        const before = sim.state.zombies.length;
        const hadQueue = sim.state.wave.queue.length > 0;
        sim.step();
        if (hadQueue && sim.state.wave.queue.length === 0) queueEmptyAt = sim.state.time;
        const alive = sim.state.zombies.filter((z) => !z.neutral);
        if (alive.length > 0 && alive.length <= 2) last = alive.map((z) => z.defId).join('+');
        if (sim.state.zombies.length > before) spawned += sim.state.zombies.length - before;
        if (sim.state.wave.phase !== phase || (sim.state.gameOver && phase === 'wave')) {
          const dur = sim.state.time - since;
          if (phase === 'wave') {
            const tail = sim.state.time - queueEmptyAt;
            rows.push(`W${sim.state.wave.number - (sim.state.wave.phase === 'pause' ? 1 : 0)}: Kampf ${dur.toFixed(0)} s, ${spawned} Zombies, nach letztem Spawn ${tail.toFixed(0)} s, zuletzt ${last}`);
            spawned = 0;
          } else rows.push(`   Pause ${dur.toFixed(0)} s`);
          phase = sim.state.wave.phase;
          since = sim.state.time;
        }
      }
      const minutes = sim.state.time / 60;
      totals.push(minutes);
      console.log(`Seed ${s}: ${sim.state.victory ? 'SIEG' : `Ende Welle ${sim.state.wave.number}`} nach ${minutes.toFixed(1)} min`);
      console.log(rows.join('\n'));
    }
    console.log(`>>> Dauer im Schnitt ${(totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1)} min`);
  }, 1_800_000);
});
