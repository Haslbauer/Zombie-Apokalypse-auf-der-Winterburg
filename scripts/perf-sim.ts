/** Profilieren: Simulation mit drei Bots bis Welle N (node --cpu-prof --import tsx scripts/perf-sim.ts 12). */
import { gameData } from '../src/gameData';
import { defaultTeam } from '../src/sim/bots/team';
import { Simulation } from '../src/sim/game';

const until = Number(process.argv[2] ?? 12);
const team = defaultTeam(gameData.bots, null);
const sim = new Simulation(gameData, { seed: 4242, heroes: team, bots: team.map(() => 'schwer') });
const slow: number[] = [];
const t = performance.now();
while (!sim.state.gameOver && sim.state.wave.number <= until) {
  for (const o of sim.state.objectives) if (o.kind === 'food' || o.kind === 'hive') o.hp = o.maxHp;
  const t0 = performance.now();
  sim.step();
  const d = performance.now() - t0;
  if (d > 8) slow.push(sim.state.tick);
}
console.log(`fertig in ${((performance.now() - t) / 1000).toFixed(1)} s, ${sim.state.tick} Ticks, ${slow.length} über 8 ms; Abstände:`, slow.slice(0, 40).map((x, i, a) => (i ? x - a[i - 1] : x)).join(','));
