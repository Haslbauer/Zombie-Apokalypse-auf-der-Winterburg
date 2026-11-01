import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { noWaves, placeZombie, run, testData } from './helpers';

describe('Bots verteidigen Vorrat und Bienenstock', () => {
  it('ein Zombie am Vorrat geht vor einen Zombie in der Nähe des Bots', () => {
    const sim = new Simulation(testData(noWaves), { seed: 1, heroes: ['grimm'], bots: ['schwer'] });
    const bot = sim.state.heroes[0];
    sim.state.wave.phase = 'wave';
    const food = sim.state.objectives.find((o) => o.kind === 'food')!;
    bot.pos = { x: food.pos.x + 22, y: food.pos.y + 14 };
    const atFood = placeZombie(sim, 'walker', food.pos.x + 1.6, food.pos.y, 5000);
    atFood.speed = 0;
    const nearBot = placeZombie(sim, 'walker', bot.pos.x + 4, bot.pos.y, 5000);
    nearBot.speed = 0;
    run(sim, 30);
    expect(bot.bot!.targetId).toBe(atFood.id);
  });

  it('jagt keine Zombies weit weg von den Zielen, die niemanden angreifen', () => {
    const sim = new Simulation(testData(noWaves), { seed: 1, heroes: ['grimm'], bots: ['schwer'] });
    const bot = sim.state.heroes[0];
    sim.state.wave.phase = 'wave';
    const food = sim.state.objectives.find((o) => o.kind === 'food')!;
    bot.pos = { x: food.pos.x + 3, y: food.pos.y + 3 };
    // weit draußen, nicht in Bot-Nähe
    const far = placeZombie(sim, 'walker', food.pos.x + 30, food.pos.y + 40, 5000);
    far.speed = 0;
    run(sim, 30);
    expect(bot.bot!.targetId).not.toBe(far.id);
  });
});
