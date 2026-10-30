import { gameData } from '../gameData';
import { Simulation } from '../sim/game';
import { shopClosedReason } from '../sim/economy';
import { defaultTeam } from '../sim/bots/team';
import { canRankUp } from '../sim/progression';
import { type BotDifficulty, type Command, DT, type GameEvent, type GameState } from '../sim/types';
import { Effects } from './effects';
import { Hud } from './hud';
import { Input } from './input';
import { Keybindings } from './keybindings';
import { GameRenderer, type Snapshot } from './renderer';
import { ShopView } from './shop';

const renderer = new GameRenderer(document.getElementById('game')!, gameData);
const effects = new Effects(renderer.scene);
const bindings = new Keybindings();
const hudRoot = document.getElementById('hud')!;
const hud = new Hud(hudRoot, gameData, bindings);
const shop = new ShopView(hudRoot, gameData);
const input = new Input(renderer, bindings);
const params = new URLSearchParams(location.search);
/** Entwicklermodus: ?overview zeigt die ganze Karte von oben, ?level=6 setzt das Startlevel. */
const overview = params.has('overview');
const startLevel = Math.max(1, Math.min(18, Number(params.get('level')) || 1));
/** Entwicklermodus: ?wave=5 beginnt mit Welle 5. */
const startWave = Math.max(1, Number(params.get('wave')) || 1);
/** Entwicklermodus: ?bots=4 – vier Bots spielen allein (Zuschauen, Kamera von oben). */
const spectate = params.get('bots') === '4';
const spectateDifficulty = (params.get('difficulty') ?? 'mittel') as BotDifficulty;

let sim: Simulation | null = null;
let heroId = 0;
let heroDefId = '';
let team: string[] = [];
let difficulty: BotDifficulty = 'mittel';
let accumulator = 0;
let paused = false;
/** Einmalige Befehle (Fähigkeiten, Skillpunkte) bis zum nächsten Tick. */
let pending: Command[] = [];
const prev = new Map<number, Snapshot>();

input.onCast = (slot) => pending.push({ heroId, type: 'cast', slot, aim: input.aimPoint });
input.onLevelUp = (slot) => pending.push({ heroId, type: 'levelUp', slot });
hud.onLevelUp = input.onLevelUp;
input.onUse = (slot) => pending.push({ heroId, type: 'use', slot });
hud.onUse = input.onUse;
shop.onBuy = (itemId) => pending.push({ heroId, type: 'buy', itemId });
shop.onClose = () => shop.hide();
hud.onSell = (slot, consumable) => {
  if (shop.open) pending.push({ heroId, type: 'sell', slot, consumable });
  else hud.message('Verkaufen nur im offenen Shop');
};
/** Shop öffnen bzw. schließen; nur in der Pause im Innenhof. */
function toggleShop(): void {
  if (!sim) return;
  if (shop.open) {
    shop.hide();
    return;
  }
  const reason = shopClosedReason(sim, sim.hero(heroId)!);
  if (reason) hud.message(reason);
  else shop.show();
}
input.onShop = toggleShop;
hud.shopHint.addEventListener('click', toggleShop);
input.onEscape = () => {
  if (!shop.open) return false;
  shop.hide();
  return true;
};

/** Heldenwahl, dann Team-Ansicht, dann Spielstart. */
function pickHero(defId: string): void {
  hud.showTeam(defId, (bots, diff) => startGame(defId, bots, diff), () => hud.showStart(pickHero));
}

/**
 * Partie starten: Slot 0 ist der Spieler, die übrigen drei spielen Bots.
 * defId null: nur Bots (Zuschauen).
 */
function startGame(defId: string | null, bots: string[], diff: BotDifficulty): void {
  team = bots;
  difficulty = diff;
  const heroes = defId ? [defId, ...bots] : bots;
  sim = new Simulation(gameData, {
    seed: (Math.random() * 2 ** 31) | 0,
    heroes,
    startLevel,
    bots: heroes.map((_, i) => (defId && i === 0 ? null : diff)),
  });
  sim.state.wave.number = startWave;
  const hero = sim.state.heroes[0];
  heroDefId = hero.defId;
  heroId = hero.id;
  renderer.playerId = defId ? hero.id : null;
  shop.hide();
  accumulator = 0;
  paused = false;
  pending = [];
  prev.clear();
  renderer.reset();
  renderer.setAimIndicator(gameData.heroes.find((h) => h.id === heroDefId)!.attack, hero.radius);
  effects.clear();
  hud.startGame(heroDefId);
  hud.buildTeam(sim.state, defId ? heroId : -1, diff);
  renderer.cam.lookAt(hero.pos.x, hero.pos.y);
  if (overview || !defId) {
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

/** Farben der Fähigkeitseffekte. */
const EFFECT_COLORS: Record<string, number> = {
  'slam-stun': 0xffd23f,
  'slam-double': 0xff5a36,
  'slam-knockback': 0xffa94d,
  quake: 0x8a6a45,
  tea: 0x7bd36a,
  howl: 0xc77dff,
  yawn: 0x9fc9ff,
  goodnight: 0x6f86ff,
  nap: 0x9fc9ff,
  smokecone: 0xb8b8b8,
  puff: 0xb8b8b8,
  spike: 0xff8a3d,
  'rage-haste': 0xffd23f,
  'rage-shield': 0x7fd1ff,
  'rage-heal': 0x7bd36a,
};

function abilityEffect(e: Extract<GameEvent, { type: 'effect' }>): void {
  const color = EFFECT_COLORS[e.kind] ?? 0xffffff;
  if (e.facing !== undefined && e.arc !== undefined) {
    effects.cone(e.pos, e.facing, e.radius, e.arc, color);
    return;
  }
  switch (e.kind) {
    case 'spike-start':
      effects.warning(e.pos, e.radius, 0xff8a3d, 0.5);
      break;
    case 'goodnight':
    case 'tea':
      effects.disc(e.pos, e.radius, color, 0.8, 0.35);
      break;
    case 'spike':
    case 'quake':
    case 'howl':
      effects.disc(e.pos, e.radius, color, 0.35, 0.4);
      effects.ring(e.pos, e.radius, color, 0.45);
      break;
    default:
      effects.ring(e.pos, Math.max(1, e.radius), color, 0.4);
  }
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
      case 'swing': {
        const h = state.heroes.find((x) => x.id === e.id);
        if (h) effects.swing(h.pos, e.facing, h.radius + e.range, e.arc);
        break;
      }
      case 'effect':
        abilityEffect(e);
        break;
      case 'land':
        effects.ring(e.pos, 1.5, 0xd8c8a8, 0.35);
        break;
      case 'gold':
        if (e.heroId === heroId) {
          // Wellenbonus ohne Ort: über dem eigenen Helden anzeigen
          const at = e.pos ?? state.heroes.find((h) => h.id === heroId)?.pos;
          if (at) effects.floatingText(at, `+${e.amount}`, '#ffd166', e.pos ? 1.8 : 2.6);
        }
        break;
      case 'shopDenied':
        if (e.heroId === heroId) hud.message(e.reason);
        break;
      case 'elite':
        hud.message(`Elite: ${gameData.zombies.find((z) => z.id === e.defId)?.name}!`);
        break;
      case 'charge': {
        const def = gameData.zombies.find((z) => state.zombies.some((x) => x.id === e.zombieId && x.defId === z.id));
        effects.line(e.from, e.to, 1.6, 0xff3b30, Number(def?.special?.windup ?? 0.6));
        break;
      }
      case 'levelUp':
        if (e.heroId === heroId) {
          const h = state.heroes.find((x) => x.id === heroId);
          if (h) effects.ring(h.pos, 2.5, 0xffd166, 0.7);
          hud.message(`Level ${e.level}!`);
        }
        break;
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
        hud.showGameOver(state, e.reason, () => startGame(spectate ? null : heroDefId, team, difficulty));
        break;
    }
  }
}

let last = performance.now();
renderer.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  const time = now / 1000;

  if (sim) {
    if (!paused) {
      accumulator += dt;
      // Eine Eingabe pro Frame; sie gilt für alle Ticks dieses Frames.
      // Zuschauen: keine eigenen Befehle, alle Helden sind Bots.
      const own: Command[] = spectate ? [] : [{ heroId, type: 'input', ...input.read() }];
      while (accumulator >= DT) {
        snapshot(sim.state);
        sim.step(spectate ? pending.filter((c) => c.type === 'startWave') : [...own, ...pending]);
        pending = [];
        handleEvents(sim.state);
        accumulator -= DT;
      }
    } else {
      pending = [];
    }
    const state = sim.state;
    const hero = sim.hero(heroId)!;
    renderer.sync(state, prev, state.gameOver || paused ? 1 : accumulator / DT, dt, time);
    const focus = renderer.unitPosition(heroId) ?? hero.pos;
    renderer.updateAimIndicator(hero.alive && !spectate ? focus : null, hero.facing, hero.attackTimer <= 0);
    const slot = input.previewSlot;
    const def = gameData.heroes.find((h) => h.id === heroDefId)!;
    renderer.showPreview(slot !== null && hero.alive && hero.ranks[slot] > 0 ? def.abilities[slot] : null, hero, input.aimPoint);
    renderer.cam.follow(focus.x, focus.y, dt);
    hud.update(state, heroId, dt, (s) => canRankUp(sim!, hero, s));
    const shopReason = state.gameOver ? 'Spiel vorbei' : shopClosedReason(sim, hero);
    if (shop.open && shopReason) {
      shop.hide();
      hud.message(shopReason);
    }
    hud.setShopHint(!shopReason && !shop.open && !paused);
    shop.update(hero, def.attack.type);
  }

  effects.update(dt);
  renderer.render();
});

input.onStartWave = () => pending.push({ heroId, type: 'startWave' });
hud.startWaveBtn.addEventListener('click', input.onStartWave);

if (spectate) startGame(null, defaultTeam(gameData.bots, null), spectateDifficulty);
else hud.showStart(pickHero);
