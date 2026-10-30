import { gameData } from '../gameData';
import { Simulation } from '../sim/game';
import { DT, type Command, type GameState } from '../sim/types';
import { Effects } from './effects';
import { Hud } from './hud';
import { Input } from './input';
import { GameRenderer, type Snapshot } from './renderer';

const renderer = new GameRenderer(document.getElementById('game')!, gameData);
const effects = new Effects(renderer.scene);
const hud = new Hud(document.getElementById('hud')!, gameData);

let sim: Simulation | null = null;
let heroId = 0;
let heroDefId = '';
let pending: Command[] = [];
let accumulator = 0;
let targetId: number | null = null;
const prev = new Map<number, Snapshot>();

new Input(
  renderer,
  () => (sim && !sim.state.gameOver ? { state: sim.state, heroId } : null),
  (cmd) => pending.push(cmd),
  (p, attack) => effects.clickMarker(p, attack),
);

function startGame(defId: string): void {
  heroDefId = defId;
  sim = new Simulation(gameData, { seed: (Math.random() * 2 ** 31) | 0, heroes: [defId] });
  heroId = sim.state.heroes[0].id;
  pending = [];
  accumulator = 0;
  prev.clear();
  renderer.reset();
  effects.clear();
  hud.startGame(defId);
  const start = sim.state.heroes[0].pos;
  renderer.cam.lookAt(start.x, start.y);
  hud.message('Mach dich bereit!');
}

/** Positionen vor dem Tick merken, damit zwischen zwei Ticks interpoliert werden kann. */
function snapshot(state: GameState): void {
  prev.clear();
  for (const u of [...state.heroes, ...state.zombies]) prev.set(u.id, { x: u.pos.x, y: u.pos.y, facing: u.facing });
  for (const p of state.projectiles) prev.set(p.id, { x: p.pos.x, y: p.pos.y, facing: 0 });
}

function handleEvents(state: GameState): void {
  for (const e of state.events) {
    switch (e.type) {
      case 'hit':
        renderer.flash(e.targetId);
        break;
      case 'death':
        if (e.id !== heroId) effects.deathPuff(e.pos);
        break;
      case 'waveStart':
        hud.message(`Welle ${e.number}!`);
        break;
      case 'waveCleared':
        hud.message(`Welle ${e.number} geschafft`);
        break;
      case 'gameOver':
        hud.showGameOver(state, () => startGame(heroDefId));
        break;
    }
  }
}

let last = performance.now();
renderer.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;

  if (sim) {
    accumulator += dt;
    while (accumulator >= DT) {
      snapshot(sim.state);
      sim.step(pending);
      pending = [];
      handleEvents(sim.state);
      accumulator -= DT;
    }
    const state = sim.state;
    const hero = sim.hero(heroId)!;
    targetId = hero.order.type === 'attack' ? hero.order.targetId : null;
    renderer.sync(state, prev, state.gameOver ? 1 : accumulator / DT, dt, targetId);
    const focus = renderer.unitPosition(heroId) ?? hero.pos;
    renderer.cam.follow(focus.x, focus.y, dt);
    hud.update(state, heroId, dt);
  }

  effects.update(dt);
  renderer.render();
});

hud.showStart(startGame);
