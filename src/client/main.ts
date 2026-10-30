import { gameData } from '../gameData';
import { Simulation } from '../sim/game';
import { DT, type GameState } from '../sim/types';
import { Effects } from './effects';
import { Hud } from './hud';
import { Input } from './input';
import { Keybindings } from './keybindings';
import { GameRenderer, type Snapshot } from './renderer';

const renderer = new GameRenderer(document.getElementById('game')!, gameData);
const effects = new Effects(renderer.scene);
const bindings = new Keybindings();
const hud = new Hud(document.getElementById('hud')!, gameData, bindings);
const input = new Input(renderer, bindings);
/** Entwicklermodus: ?overview zeigt die ganze Karte von oben. */
const overview = new URLSearchParams(location.search).has('overview');

let sim: Simulation | null = null;
let heroId = 0;
let heroDefId = '';
let accumulator = 0;
let paused = false;
const prev = new Map<number, Snapshot>();

function startGame(defId: string): void {
  heroDefId = defId;
  sim = new Simulation(gameData, { seed: (Math.random() * 2 ** 31) | 0, heroes: [defId] });
  const hero = sim.state.heroes[0];
  heroId = hero.id;
  accumulator = 0;
  paused = false;
  prev.clear();
  renderer.reset();
  renderer.setAimIndicator(gameData.heroes.find((h) => h.id === defId)!.attack, hero.radius);
  effects.clear();
  hud.startGame(defId);
  renderer.cam.lookAt(hero.pos.x, hero.pos.y);
  if (overview) {
    renderer.scene.fog = null;
    renderer.cam.overview(gameData.arena.width / 2, gameData.arena.height / 2 + 6, 95);
  }
  hud.message('Mach dich bereit!');
}

/** Esc: Pause mit Tastenbelegung öffnen bzw. schließen (nur während einer Partie). */
input.onMenu = () => {
  if (!sim || sim.state.gameOver) return;
  if (hud.menuOpen) {
    hud.hideSettings();
    paused = false;
  } else {
    paused = true;
    input.releaseAll();
    hud.showSettings(
      (done) => (input.capture = done),
      () => input.onMenu(),
    );
  }
};

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
      case 'objectiveHit':
        renderer.flashObjective(e.objectiveId);
        break;
      case 'sting': {
        const obj = state.objectives.find((o) => o.id === e.objectiveId);
        const to = renderer.unitPosition(e.targetId);
        if (obj && to) effects.sting(obj.pos, to, state.time < obj.aggroUntil);
        break;
      }
      case 'breach':
        hud.message('Durchbruch!');
        break;
      case 'beesAngry':
        hud.message('Die Bienen sind wütend!');
        break;
      case 'objectiveDestroyed':
        if (!state.gameOver) hud.message(`${gameData.arena.objectives.find((o) => o.id === e.objectiveId)?.name} zerstört`);
        break;
      case 'respawn':
        if (e.id === heroId) hud.message('Zurück im Kampf!');
        break;
      case 'swing': {
        const h = state.heroes.find((x) => x.id === e.id);
        if (h) effects.swing(h.pos, e.facing, h.radius + e.range, e.arc);
        break;
      }
      case 'death':
        if (e.id !== heroId) effects.deathPuff(e.pos);
        else hud.message('Gefallen!');
        break;
      case 'waveStart':
        hud.message(`Welle ${e.number}!`);
        break;
      case 'waveCleared':
        hud.message(`Welle ${e.number} geschafft`);
        break;
      case 'gameOver':
        hud.showGameOver(state, e.reason, () => startGame(heroDefId));
        break;
    }
  }
}

let last = performance.now();
renderer.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;

  if (sim) {
    if (!paused) {
      accumulator += dt;
      // Eine Eingabe pro Frame; sie gilt für alle Ticks dieses Frames.
      const cmd = { heroId, type: 'input' as const, ...input.read() };
      while (accumulator >= DT) {
        snapshot(sim.state);
        sim.step([cmd]);
        handleEvents(sim.state);
        accumulator -= DT;
      }
    }
    const state = sim.state;
    const hero = sim.hero(heroId)!;
    renderer.sync(state, prev, state.gameOver || paused ? 1 : accumulator / DT, dt);
    const focus = renderer.unitPosition(heroId) ?? hero.pos;
    renderer.updateAimIndicator(hero.alive ? focus : null, hero.facing, hero.attackTimer <= 0);
    renderer.cam.follow(focus.x, focus.y, dt);
    hud.update(state, heroId, dt);
  }

  effects.update(dt);
  renderer.render();
});

hud.showStart(startGame);
