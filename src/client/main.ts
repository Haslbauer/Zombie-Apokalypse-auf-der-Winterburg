import { gameData } from '../gameData';
import type { ClientCommand, RoomInfo } from '../net/protocol';
import type { DataContext } from '../sim/context';
import { shopClosedReason } from '../sim/economy';
import { Simulation } from '../sim/game';
import { buildPlan } from '../sim/items';
import { spawnZombieAt } from '../sim/waves';
import { endGame } from '../sim/stats';
import { applyDamage } from '../sim/combat';
import { repairCost } from '../sim/defenses';
import { defaultTeam } from '../sim/bots/team';
import { canRankUp } from '../sim/progression';
import type { BotDifficulty, DefenseKind, GameEvent, GameState, WaveEventKind } from '../sim/types';
import { Effects } from './effects';
import { Hud } from './hud';
import { Quality, QUALITY_LABELS } from './quality';
import { Input } from './input';
import { Keybindings, keyName } from './keybindings';
import { loadRiggedModel } from './models';
import { GameRenderer } from './renderer';
import { Minimap } from './minimap';
import { PING_STYLE } from './pingwheel';
import { LocalSession, RemoteSession, type Session } from './session';
import { ShopView } from './shop';
import { HERO_ATTACK_SOUND, sound } from './audio';
import { chosenLantern, recordResult } from './unlocks';
import { TouchControls, wantsTouch } from './touch';
import { dailySetup, type DailySetup, loadDaily, recordDaily } from './daily';
import { coinCount } from './buffrings';
import { HitMerger } from './hpticks';

const renderer = new GameRenderer(document.getElementById('game')!, gameData);
const effects = new Effects(renderer.scene);
const bindings = new Keybindings();
const hudRoot = document.getElementById('hud')!;
const hud = new Hud(hudRoot, gameData, bindings);
const quality = new Quality();
hud.quality = quality;
const shop = new ShopView(hudRoot, gameData);
const input = new Input(renderer, bindings);
const minimap = new Minimap(hudRoot, gameData);
input.minimapPoint = (x, y) => minimap.worldAt(x, y);
const params = new URLSearchParams(location.search);
/** Entwicklermodus: ?overview zeigt die ganze Karte von oben, ?level=6 setzt das Startlevel. */
const overview = params.has('overview');
const startLevel = Math.max(1, Math.min(18, Number(params.get('level')) || 1));
/** Entwicklermodus: ?wave=5 beginnt mit Welle 5. */
const startWave = Math.max(1, Number(params.get('wave')) || 1);
/** Entwicklermodus: ?bots=4 – vier Bots spielen allein (Zuschauen, Kamera von oben). */
/** Zuschauermodus: kein eigener Held, heroId ist der beobachtete Held (lokal nur Bots oder online im Raum). */
let spectate = params.get('bots') === '4' || params.get('bots') === '3';
/** Zuschauen: Übersicht über die ganze Karte statt einem Helden folgen. */
let watchOverview = false;
const spectateDifficulty = (params.get('difficulty') ?? 'mittel') as BotDifficulty;
/** Entwicklermodus: ?zoom=12 holt die Kamera näher heran (Standard 34). */
const zoom = Number(params.get('zoom')) || 0;
if (zoom > 0) renderer.cam.setDistance(zoom);

/** Laufende Partie: lokal (Einzelspieler) oder auf dem Server (Mehrspieler). */
let session: Session | null = null;
/** Held des Spielers (beim Zuschauen der erste Bot). */
let heroId = 0;
let heroDefId = '';
let team: string[] = [];
let difficulty: BotDifficulty = 'mittel';

/** Befehl an die Partie (lokal sofort in den nächsten Tick, online an den Server). */
const cmd = (c: ClientCommand) => session?.send(c);
/** Zustand und Daten für Abfragen wie „Shop offen?“ (ohne eigene Simulation im Mehrspieler). */
const ctx = (): DataContext => ({ state: session!.state, data: gameData });

// ---------- Ton ----------
// Browser erlauben Ton erst nach einer Nutzeraktion
const unlockAudio = () => sound.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
sound.setWorld(
  (gameData.arena.props ?? []).filter((p) => p.look === 'firebarrel' || p.look === 'campfire').map((p) => ({ x: p.x, y: p.y })),
  ((o) => (o ? { x: o.x, y: o.y } : null))(gameData.arena.objectives.find((o) => o.kind === 'hive')),
);
hud.audio = { settings: sound.settings, apply: () => sound.applySettings(true) };
hud.onCountdownTick = (left) => {
  if (left === 0) sound.play('go');
  else if (left <= 5) sound.play('tick');
};
/** Bosse und Elites (für die Musik). */
const BOSS_DEFS = new Set(gameData.zombies.filter((z) => z.rank === 'elite' || z.rank === 'boss').map((z) => z.id));
/** Klang des Fernkampfgeschosses nach Aussehen. */
const SHOT_SOUND: Record<string, string> = { chime: 'bell', soot: 'throw', stone: 'bow', volley: 'throw', hook: 'hook', star: 'magic', swarm: 'sting', nugget: 'throw', pebble: 'throw', harpoon: 'hook' };
/** Klang der Beschwörerzauber. */
const SPELL_SOUND: Record<string, string> = {
  blitz: 'blitz',
  teleport: 'teleport',
  'teleport-land': 'teleport',
  heilen: 'heal',
  barriere: 'shield',
  geist: 'ghost',
  entzuenden: 'ignite',
  erschoepfen: 'exhaust',
  zerschmettern: 'smite',
  reinigen: 'cleanse',
};
const PING_SOUND: Record<string, string> = { here: 'pingHere', attack: 'pingAttack', danger: 'pingDanger', help: 'pingHelp', omw: 'pingOmw', heal: 'heal' };
/** Schadenszahlen: Treffer je Ziel zusammenfassen, höchstens MAX_DMG_TEXTS gleichzeitig. */
const hits = new HitMerger(0.15);
const MAX_DMG_TEXTS = 40;
let dmgTexts: number[] = [];
function flushDamageNumbers(): void {
  const now = performance.now() / 1000;
  dmgTexts = dmgTexts.filter((t) => now - t < 0.9);
  for (const p of hits.flush(now)) {
    if (dmgTexts.length >= MAX_DMG_TEXTS) break;
    dmgTexts.push(now);
    const n = Math.round(p.sum);
    const color = p.own ? '#ff5a4a' : p.bonus ? '#ff9f43' : p.boss ? '#ffd166' : '#f2f2f2';
    const size = p.own ? 0.75 : p.boss ? 0.95 : Math.min(0.85, 0.55 + n / 400);
    effects.floatingText(p.pos, p.bonus ? `${n}!` : `${n}`, color, p.own ? 2.3 : 2.0, size, (Math.random() - 0.5) * 0.8);
  }
}
/** Bienen wütend bis (Spielzeit). */
let beesAngryUntil = 0;
const myHero = () => session?.state.heroes.find((h) => h.id === heroId);

input.onCast = (slot) => {
  // Zuschauen: 1–4 wechselt den beobachteten Helden
  if (spectate) {
    const h = session?.state.heroes[slot];
    if (h) watchHero(h.id);
    return;
  }
  cmd({ type: 'cast', slot, aim: input.aimPoint });
};
input.onPing = (kind, pos) => cmd({ type: 'ping', kind, pos });
input.onLevelUp = (slot) => cmd({ type: 'levelUp', slot });
hud.onLevelUp = input.onLevelUp;
input.onUse = (slot) => cmd({ type: 'use', slot });
hud.onUse = input.onUse;
// Beschwörerzauber: Richtung Mauszeiger
input.onSpell = (slot) => cmd({ type: 'spell', slot, aim: input.aimPoint });
hud.onSpell = input.onSpell;
hud.onChooseSpells = (spells) => cmd({ type: 'chooseSpells', spells });
shop.onBuy = (itemId) => cmd({ type: 'buy', itemId });
shop.onClose = () => shop.hide();
// Verteidigung im Shop gewählt: Shop zu, Baumodus mit dieser Art (Aufstellen per Linksklick)
shop.onDefense = (kind) => {
  shop.hide();
  buildOpen = true;
  buildKind = kind as DefenseKind;
  hud.message(`${gameData.economy.defenses?.[kind as DefenseKind]?.name ?? 'Verteidigung'}: Linksklick zum Aufstellen`);
};
shop.onRepair = () => cmd({ type: 'repair' });
hud.onSell = (slot, consumable) => {
  if (shop.open) cmd({ type: 'sell', slot, consumable });
  else hud.message('Verkaufen nur im offenen Shop');
};
/** Shop öffnen bzw. schließen; nur in der Pause im Innenhof. */
function toggleShop(): void {
  const hero = myHero();
  if (!session || !hero || spectate) return;
  if (shop.open) {
    shop.hide();
    return;
  }
  const reason = shopClosedReason(ctx(), hero);
  if (reason) hud.message(reason);
  else shop.show();
}
input.onShop = toggleShop;
hud.shopHint.addEventListener('click', toggleShop);
input.onEscape = () => {
  // Baumodus zuerst abbrechen, dann die Bauleiste schließen
  if (buildKind) {
    buildKind = null;
    return true;
  }
  if (buildOpen) {
    buildOpen = false;
    return true;
  }
  if (!shop.open) return false;
  shop.hide();
  return true;
};

// ---------- Bauen (jederzeit): Stacheldraht, Barrikade, Feuerfass ----------
let buildOpen = false;
let buildKind: DefenseKind | null = null;
let buildRot = 0;
input.onBuild = () => {
  if (spectate) return;
  buildOpen = !buildOpen;
  if (!buildOpen) buildKind = null;
};
input.onRotateBuild = () => {
  buildRot = 1 - buildRot;
};

/** Startbildschirm: Heldenwahl, Tägliche Herausforderung, Zuschauen. */
function showStartScreen(): void {
  hud.showStart(pickHero, showDaily, () => startGame(null, defaultTeam(gameData.bots, null), spectateDifficulty));
}

/** Zuschauen: einem Helden folgen (Index oder Id), HUD zeigt seine Leiste. */
function watchHero(id: number): void {
  const state = session?.state;
  const h = state?.heroes.find((x) => x.id === id);
  if (!state || !h) return;
  heroId = h.id;
  heroDefId = h.defId;
  freeCam = null;
  hud.startGame(heroDefId);
  hud.setWatched(heroId);
  if (watchOverview) setWatchOverview(false);
}

/** Zuschauen: Übersicht über die ganze Karte an/aus. */
function setWatchOverview(on: boolean): void {
  watchOverview = on;
  const cam = renderer.cam;
  if (on) {
    renderer.setFogEnabled(false);
    cam.firstPerson = false;
    cam.overview(gameData.arena.width / 2 + (gameData.arena.minX ?? 0) / 2, gameData.arena.height / 2 + (gameData.arena.minY ?? 0) / 2 + 8, 135);
  } else {
    renderer.setFogEnabled(true);
    cam.resume();
    const h = myHero();
    if (h) cam.lookAt(h.pos.x, h.pos.y);
  }
}

/** Zuschauer-Leiste und Klicks auf die Teamleiste je nach Modus. */
function updateSpectatorUi(): void {
  document.body.classList.toggle('watching', spectate && !!session);
  document.body.classList.toggle('watching-online', spectate && session instanceof RemoteSession);
  hud.onTeamClick = spectate ? watchHero : null;
  if (!spectate || !session) {
    hud.setSpectator(null, { pick: () => {}, overview: () => {} });
    return;
  }
  const names = playerNames();
  const remote = session instanceof RemoteSession ? session : null;
  hud.setSpectator(
    {
      heroes: session.state.heroes.map((h) => ({ id: h.id, name: gameData.heroes.find((d) => d.id === h.defId)?.name ?? h.defId, who: names?.get(h.id) ?? 'Bot' })),
      watched: heroId,
      overview: watchOverview,
      viewers: remote?.room?.spectators,
    },
    { pick: watchHero, overview: () => setWatchOverview(!watchOverview), leave: remote ? leaveOnline : undefined },
  );
}

// Freie Kamera: Klick bzw. Ziehen auf der Minimap, mittlere Maustaste auf der Karte; Leertaste zurück
/** Ort, den die Kamera statt des Helden zeigt (null = Kamera folgt dem Helden). */
let freeCam: { x: number; y: number } | null = null;
function clampToMap(p: { x: number; y: number }): { x: number; y: number } {
  const a = gameData.arena;
  return { x: Math.min(a.width, Math.max(a.minX ?? 0, p.x)), y: Math.min(a.height, Math.max(a.minY ?? 0, p.y)) };
}
input.onLook = (p) => {
  if (!session || !myHero()) return;
  if (spectate && watchOverview) setWatchOverview(false);
  renderer.cam.firstPerson = false;
  freeCam = clampToMap(p);
};
input.onPan = (d) => {
  const h = myHero();
  if (!session || !h || watchOverview || renderer.cam.firstPerson) return;
  const base = freeCam ?? renderer.unitPosition(heroId) ?? h.pos;
  freeCam = clampToMap({ x: base.x + d.x, y: base.y + d.y });
  renderer.cam.jump(freeCam.x, freeCam.y);
};
hud.onCameraHint = () => (freeCam = null);
input.onCamera = () => {
  if (!session) return;
  if (freeCam) freeCam = null;
  else if (spectate) setWatchOverview(!watchOverview);
};

/**
 * Spielzähler: Einzelspieler-Partien beim Server melden (nur Art und Ergebnis,
 * keine persönlichen Daten). Online-Partien zählt der Server selbst. Im
 * Entwicklungsmodus und bei Fehlern passiert nichts.
 */
type PlayKind = 'solo' | 'daily' | 'zuschauen';
let playKind: PlayKind | null = null;
function reportPlay(kind: PlayKind, event: 'start' | 'win' | 'loss'): void {
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV || params.has('debug')) return;
  try {
    void fetch('/api/played', { method: 'POST', body: JSON.stringify({ kind, event }), keepalive: true }).catch(() => {});
  } catch {
    // ohne Server (z. B. statisch gehostet) nicht zählen
  }
}

/** Heldenwahl, dann Team-Ansicht, dann Spielstart (allein oder online). */
function pickHero(defId: string): void {
  hud.showTeam(
    defId,
    (bots, diff) => startGame(defId, bots, diff),
    () => showStartScreen(),
    (bots, diff, name) => startOnline(defId, bots, diff, name),
  );
}

/**
 * Einzelspieler: Slot 0 ist der Spieler, die übrigen drei spielen Bots.
 * defId null: nur Bots (Zuschauen).
 */
function startGame(defId: string | null, bots: string[], diff: BotDifficulty): void {
  daily = null;
  session?.close();
  team = bots;
  difficulty = diff;
  const heroes = defId ? [defId, ...bots] : bots;
  const local = new LocalSession(
    { seed: (Math.random() * 2 ** 31) | 0, heroes, startLevel, bots: heroes.map((_, i) => (defId && i === 0 ? null : diff)), level: hud.level },
    startWave,
    !defId,
  );
  session = local;
  heroId = local.state.heroes[0].id;
  playKind = defId ? 'solo' : 'zuschauen';
  spectate = defId === null;
  watchOverview = false;
  reportPlay(playKind, 'start');
  begin(defId !== null);
  hud.setInvite(null);
}

/** Tägliche Herausforderung des laufenden Spiels (null = normales Spiel). */
let daily: DailySetup | null = null;

function showDaily(): void {
  const setup = dailySetup(gameData.bots, gameData.heroes.map((h) => h.id));
  hud.showDaily(setup, loadDaily(setup.key), () => startDaily(setup), () => showStartScreen());
}

/** Tagesherausforderung: fester Seed, festes Team, Schwierigkeit und Mutator. */
function startDaily(setup: DailySetup): void {
  session?.close();
  daily = setup;
  team = setup.heroes.slice(1);
  difficulty = 'mittel';
  const local = new LocalSession(
    { seed: setup.seed, heroes: setup.heroes, bots: setup.heroes.map((_, i) => (i === 0 ? null : 'mittel')), level: setup.level, mutator: { event: setup.event } },
    1,
    false,
  );
  session = local;
  heroId = local.state.heroes[0].id;
  playKind = 'daily';
  spectate = false;
  watchOverview = false;
  reportPlay(playKind, 'start');
  begin(true);
  hud.setInvite(null);
}

/** Gemeinsamer Start: Darstellung, HUD und Kamera für den Helden heroId. */
function begin(isPlayer: boolean): void {
  const hero = myHero()!;
  freeCam = null;
  heroDefId = hero.defId;
  renderer.playerId = isPlayer ? hero.id : null;
  shop.hide();
  renderer.reset();
  renderer.setAimIndicator(gameData.heroes.find((h) => h.id === heroDefId)!.attack, hero.radius);
  effects.clear();
  hud.startGame(heroDefId);
  // Gewählte Beschwörerzauber übernehmen (Spielbeginn ist immer eine Pause)
  if (isPlayer && hud.spellPrefs) cmd({ type: 'chooseSpells', spells: hud.spellPrefs });
  hud.buildTeam(session!.state, isPlayer ? heroId : -1, difficulty, playerNames());
  renderer.cam.lookAt(hero.pos.x, hero.pos.y);
  renderer.setLanternColor(chosenLantern());
  // Entwicklermodus ?camera=x,y,abstand: feste Kamera auf einen Punkt (Nahaufnahmen der Karte)
  const camera = params.get('camera')?.split(',').map(Number);
  if (camera && camera.length === 3 && camera.every(Number.isFinite)) renderer.cam.overview(camera[0], camera[1], camera[2]);
  else if (overview) {
    renderer.setFogEnabled(false);
    renderer.cam.overview(gameData.arena.width / 2 + (gameData.arena.minX ?? 0) / 2, gameData.arena.height / 2 + (gameData.arena.minY ?? 0) / 2 + 8, 135);
  } else {
    // Zuschauen (und normales Spiel): dem Helden folgen; Übersicht schaltet die Leertaste
    renderer.setFogEnabled(true);
    renderer.cam.resume();
    watchOverview = false;
  }
  renderer.cam.allowFirstPerson = !spectate;
  if (spectate) {
    renderer.cam.firstPerson = false;
    hud.setWatched(heroId);
  }
  minimap.visible = true;
  hud.message('Mach dich bereit!');
}

/** Sichtbarer Boden (Ecken des Bildschirms) für den Rahmen auf der Minimap. */
function viewCorners() {
  const r = renderer.canvas.getBoundingClientRect();
  const corners = [
    [r.left, r.top],
    [r.right, r.top],
    [r.right, r.bottom],
    [r.left, r.bottom],
  ].map(([x, y]) => renderer.pickGround(x, y));
  return corners.every((c) => c) ? (corners as { x: number; y: number }[]) : [];
}

/** Mitspieler-Namen nach Helden-Id (Mehrspieler). */
function playerNames(): Map<number, string> | undefined {
  const room = session instanceof RemoteSession ? session.room : null;
  return room ? new Map(room.slots.filter((s) => s.human && s.name).map((s) => [s.heroId, s.name!])) : undefined;
}

/** Platzhalter-Zustand, bis der erste Zustand vom Server da ist (leere Lobby-Plätze mit irgendeinem Helden). */
function placeholder(heroes: string[]): GameState {
  const all = gameData.heroes.map((h) => h.id);
  const list = heroes.map((h, i) => (all.includes(h) ? h : all[i % all.length]));
  return new Simulation(gameData, { seed: 1, heroes: list }).state;
}

/** Mehrspieler: Raum auf dem Server erstellen; Freunde treten per Link bei. */
function startOnline(defId: string, bots: string[], diff: BotDifficulty, name: string): void {
  team = bots;
  difficulty = diff;
  connect({ t: 'create', heroes: [defId, ...bots], difficulty: diff, name }, [defId, ...bots]);
}

/** Einladungslink geöffnet (?room=CODE): Plätze zeigen, einen Bot übernehmen. */
async function joinRoom(code: string, error?: string): Promise<void> {
  hud.showNotice('Verbinde …', `Raum ${code}`, leaveOnline);
  try {
    const room = await RemoteSession.info(code);
    difficulty = room.difficulty;
    hud.showJoin(
      room,
      (slot, name) => connect({ t: 'join', room: room.code, slot, name }, room.slots.map((s) => s.defId)),
      leaveOnline,
      error,
      () => connect({ t: 'watch', room: room.code }, room.slots.map((s) => s.defId)),
    );
  } catch (err) {
    hud.showNotice('Raum nicht gefunden', (err as Error).message, leaveOnline);
  }
}

/** Zuletzt eingegebener Spielername (im Browser gemerkt). */
function savedName(): string {
  try {
    return localStorage.getItem('playerName') ?? '';
  } catch {
    return '';
  }
}

/** Token zum Wiederverbinden je Raum, nur für diesen Tab (nach Neuladen derselbe Held). */
const tokenKey = (code: string) => `winterburg.token.${code}`;
function storedToken(code: string): string | null {
  try {
    return sessionStorage.getItem(tokenKey(code));
  } catch {
    return null;
  }
}
function storeToken(code: string, token: string | null): void {
  try {
    if (token) sessionStorage.setItem(tokenKey(code), token);
    else sessionStorage.removeItem(tokenKey(code));
  } catch {
    // ohne Speicher: Wiederverbinden klappt nur ohne Neuladen
  }
}

function connect(first: Parameters<typeof RemoteSession.connect>[0], heroes: string[]): void {
  session?.close();
  session = null;
  hud.showNotice('Verbinde …', 'Verbindung zum Spielserver wird aufgebaut.', leaveOnline);
  const remote = RemoteSession.connect(first, placeholder(heroes));
  let started = false;
  remote.onRoom = (room: RoomInfo) => {
    if (remote.watching) {
      // Zuschauen: kein Platz; in der Lobby warten, im Spiel dem ersten Helden folgen
      const query = new URLSearchParams(location.search);
      query.set('room', room.code);
      query.set('watch', '1');
      history.replaceState(null, '', `?${query}`);
      difficulty = room.difficulty;
      if (room.phase === 'lobby') {
        started = false;
        session = remote;
        spectate = true;
        heroId = -1;
        minimap.visible = false;
        hud.setInvite(null);
        const players = room.slots.filter((sl) => sl.human).map((sl) => sl.name ?? 'Spieler');
        hud.showNotice(`👁 Zuschauen – Raum ${room.code}`, `Die Gruppe sammelt sich noch in der Lobby (${players.join(', ') || 'noch niemand'}). Das Spiel erscheint hier, sobald es startet.`, leaveOnline);
        return;
      }
      if (!started) {
        started = true;
        remote.state = placeholder(room.slots.map((sl) => sl.defId));
        session = remote;
        spectate = true;
        heroId = room.slots[0]?.heroId ?? remote.state.heroes[0].id;
        begin(false);
        hud.setInvite(null);
      } else {
        hud.buildTeam(remote.state, -1, difficulty, playerNames());
        hud.setWatched(heroId);
      }
      return;
    }
    if (!remote.token) return; // erst nach der Beitrittsbestätigung
    spectate = false;
    difficulty = room.difficulty;
    storeToken(room.code, remote.token);
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    if (room.phase === 'lobby') {
      // Lobby: sammeln, Helden wählen, bereit melden; das Spiel startet der Server
      started = false;
      session = remote;
      heroId = -1;
      minimap.visible = false;
      hud.setInvite(null);
      const query = new URLSearchParams(location.search);
      query.set('room', room.code);
      query.delete('watch');
      history.replaceState(null, '', `?${query}`);
      hud.showLobby(room, remote.slot, link, {
        pick: (id) => remote.lobby({ t: 'pick', heroId: id }),
        spells: (spells) => remote.lobby({ t: 'spells', spells }),
        ready: (ready) => {
          // Beim Bereitmelden auch die aktuellen Zauber schicken
          if (ready && hud.spellPrefs) remote.lobby({ t: 'spells', spells: hud.spellPrefs });
          remote.lobby({ t: 'ready', ready });
        },
        difficulty: (d) => remote.lobby({ t: 'difficulty', difficulty: d }),
        mode: (mode) => remote.lobby({ t: 'mode', mode }),
        team: (team) => remote.lobby({ t: 'team', team }),
        level: (level) => remote.lobby({ t: 'level', level }),
        pvpOptions: (opt) => remote.lobby({ t: 'pvpOptions', ...opt }),
        leave: leaveOnline,
      });
      return;
    }
    if (!started || heroId !== remote.heroId) {
      started = true;
      // Platzhalter mit den Helden des Raums, bis der erste Zustand da ist (wichtig nach dem Neuladen)
      remote.state = placeholder(room.slots.map((sl) => sl.defId));
      session = remote;
      heroId = remote.heroId;
      const query = new URLSearchParams(location.search);
      query.set('room', room.code);
      query.delete('watch');
      history.replaceState(null, '', `?${query}`);
      begin(true);
      hud.setInvite(room.code, link);
    } else hud.buildTeam(remote.state, heroId, difficulty, playerNames());
  };
  remote.onError = (msg) => {
    if (started) {
      hud.message(msg);
      return;
    }
    remote.close();
    const code = new URLSearchParams(location.search).get('room');
    if (first.t === 'resume' && code) {
      // Alter Platz nicht mehr frei: normal beitreten
      storeToken(code, null);
      void joinRoom(code);
    } else if (code) void joinRoom(code, msg);
    else hud.showNotice('Fehler', msg, leaveOnline);
  };
  remote.onStatus = (status, msg) => {
    if (status === 'online') hud.setConnection(null);
    else if (status === 'waking') hud.showNotice('Verbinde …', 'Der Spielserver antwortet noch nicht. Kostenlose Server schlafen manchmal und brauchen beim ersten Aufruf etwa eine Minute – es wird weiter versucht.', leaveOnline);
    else if (status === 'reconnecting') hud.setConnection(`Verbindung wird wiederhergestellt …${msg ? ` (${msg})` : ''}`);
    else {
      hud.setConnection(null);
      if (session === remote || !started) {
        session = null;
        minimap.visible = false;
        hud.setInvite(null);
        hud.showNotice(
          started ? 'Verbindung getrennt' : 'Server nicht erreichbar',
          started ? `${msg ?? ''} Über den Einladungslink kommst du zurück.` : 'Der Spielserver antwortet nicht. Läuft er (npm run server bzw. npm run share)?',
          leaveOnline,
        );
      }
    }
  };
  remote.onVersionMismatch = () => {
    remote.close();
    hud.showNotice('Neue Version', 'Das Spiel wurde aktualisiert. Bitte die Seite neu laden.', () => location.reload());
  };
}

/** Mehrspieler verlassen: zurück zur Heldenwahl. */
function leaveOnline(): void {
  session?.close();
  session = null;
  spectate = false;
  updateSpectatorUi();
  minimap.visible = false;
  hud.setInvite(null);
  history.replaceState(null, '', location.pathname);
  showStartScreen();
}

/** Esc: Pause mit Tastenbelegung öffnen bzw. schließen (online läuft das Spiel weiter). */
input.onMenu = () => {
  if (!session || session.state.gameOver) return;
  if (hud.menuOpen) {
    hud.hideSettings();
    session.paused = false;
  } else {
    session.paused = !session.online;
    input.releaseAll();
    hud.showSettings(
      (done) => (input.capture = done),
      () => input.onMenu(),
    );
  }
};

/** Farben der Bossfähigkeiten (Warnung und Einschlag). */
const BOSS_COLORS: Record<string, number> = { slam: 0xff3b30, nova: 0x8bdc4a, bolt: 0xff8a3d };

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
  leapLand: 0xb04dff,
  parcelLand: 0xc8a060,
  'rage-haste': 0xffd23f,
  'rage-shield': 0x7fd1ff,
  'rage-heal': 0x7bd36a,
  honey: 0xf2b230,
  bubble: 0x9fd8ff,
  dive: 0x3b8fbf,
  surface: 0x7fd1ff,
  tidalwave: 0x3b9fdf,
  trollcall: 0x9be38a,
  bridgetroll: 0x7fbf6a,
  trollrage: 0xff6a3d,
  trollgone: 0x9be38a,
  flame: 0xff7a1e,
  bellcone: 0xc7b8ff,
  pretzel: 0xc8884a,
  flour: 0xf4f0e6,
  oven: 0xff8a3d,
  'tray-warn': 0xff5a36,
  tray: 0xb0b0b8,
  fresh: 0xffd166,
  soot: 0x3a3a3a,
  chimney: 0x6a6a6a,
  broom: 0xb8b8b8,
  sparks: 0xff8a2a,
  lucky: 0xffd166,
  log: 0x8a6a45,
  lure: 0xff8a3d,
  roots: 0x6a8a3a,
  'timber-warn': 0xff5a36,
  timber: 0x6b4a2b,
  bellheal: 0x7bd36a,
  bellshield: 0x9fd8ff,
  bellstorm: 0xb39dff,
  bellchime: 0x7bd36a,
  goldleaf: 0xffd166,
  goldrush: 0xffc83d,
  swarm: 0xffc83d,
  guardbees: 0xffd166,
};

/** Sichtbare Wirkung der Beschwörerzauber. */
function spellEffect(e: Extract<GameEvent, { type: 'spell' }>): void {
  const def = gameData.spells.spells.find((s) => s.id === e.spellId);
  const color = def ? parseInt(def.color.slice(1), 16) : 0xb48cff;
  switch (e.spellId) {
    case 'blitz':
      effects.flash(e.from, 1, 0xffe066, 2.2, 0.25);
      effects.flash(e.to, 1, 0xffffff, 2.6, 0.3);
      effects.line(e.from, e.to, 0.35, 0xffe066, 0.25);
      break;
    case 'teleport':
      effects.warning(e.to, 1.4, 0xb48cff, 3);
      effects.ring(e.from, 1.6, 0xb48cff, 3, 0.1);
      break;
    case 'teleport-land':
      effects.flash(e.to, 1.2, 0xb48cff, 3, 0.4);
      effects.ring(e.to, 2.5, 0xb48cff, 0.5);
      break;
    case 'zerschmettern':
      effects.flash(e.to, 2.5, 0xffb347, 3.5, 0.35);
      effects.sparks(e.to, 0xffb347, 10);
      effects.ring(e.to, 1.8, 0xffb347, 0.4);
      break;
    case 'entzuenden':
      effects.sparks(e.to, 0xff7a3d, 8);
      effects.flash(e.to, 1.2, 0xff7a3d, 1.6, 0.3);
      break;
    case 'erschoepfen':
      effects.disc(e.to, 1.3, 0x9fa8c8, 0.6, 0.4);
      break;
    case 'reinigen':
    case 'barriere':
    case 'geist':
      effects.ring(e.from, 1.6, color, 0.5);
      effects.flash(e.from, 1.2, color, 2, 0.3);
      break;
    default:
      effects.ring(e.from, 1.2, color, 0.4);
  }
}

function abilityEffect(e: Extract<GameEvent, { type: 'effect' }>): void {
  const color = EFFECT_COLORS[e.kind] ?? 0xffffff;
  // Linien (Baumstamm, fallender Baum): Streifen von pos nach to; Warnung länger sichtbar
  if (e.to) {
    if (e.kind.endsWith('-warn')) effects.warning(e.pos, 0.6, color, 1);
    effects.line(e.pos, e.to, e.radius * 2, color, e.kind.endsWith('-warn') ? 1 : 0.45);
    return;
  }
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
    case 'leapLand':
    case 'parcelLand':
    case 'quake':
    case 'howl':
      effects.disc(e.pos, e.radius, color, 0.35, 0.4);
      effects.ring(e.pos, e.radius, color, 0.45);
      break;
    default:
      effects.ring(e.pos, Math.max(1, e.radius), color, 0.4);
  }
}

/** Angriffstakt eines Helden in Sekunden (Länge der Angriffsanimation). */
function attackTime(state: GameState, id: number): number {
  const h = state.heroes.find((x) => x.id === id);
  return h && h.attackTimer > 0 ? h.attackTimer : 0.9;
}

/** Einmal pro Welle melden, wenn Hornissen auftauchen. */
let hornetsAnnounced = false;

function handleEvents(state: GameState): void {
  if (!hornetsAnnounced && state.zombies.some((z) => gameData.zombies.find((d) => d.id === z.defId)?.flying)) {
    hornetsAnnounced = true;
    hud.message('Hornissen greifen den Bienenstock an!');
  }
  for (const e of state.events) {
    switch (e.type) {
      case 'hit':
        renderer.flash(e.targetId);
        // Schadenszahlen: je Ziel kurz sammeln (Brand, Stiche, Durchschlag)
        if (hud.damageNumbers && e.amount > 0) {
          const z = state.zombies.find((x) => x.id === e.targetId);
          const isHero = !z && state.heroes.some((x) => x.id === e.targetId);
          if (z || e.targetId === heroId) {
            hits.add(e.targetId, e.amount, e.pos, performance.now() / 1000, { bonus: e.bonus, boss: !!z && BOSS_DEFS.has(z.defId), own: isHero });
          }
        }
        // Treffer an Zombies: kleine Funken
        if (e.amount > 0 && state.zombies.some((z) => z.id === e.targetId)) {
          effects.sparks(e.pos, 0xffc070, 4);
          sound.play('hit', e.pos, 0.8);
        } else if (e.amount > 0 && state.heroes.some((h) => h.id === e.targetId)) sound.play('heroHit', e.pos, e.targetId === heroId ? 1 : 0.6);
        break;
      case 'attack':
        {
          // Angriffsanimation im Takt des Zombie-Typs
          const zt = state.zombies.find((z) => z.id === e.id);
          const zd = zt ? gameData.zombies.find((d) => d.id === zt.defId) : undefined;
          renderer.zombieAttack(e.id, zd?.attackCooldown);
          if (zt) sound.play('zombieAttack', zt.pos, 0.7);
        }
        break;
      case 'objectiveHit':
        renderer.flashObjective(e.objectiveId);
        break;
      case 'sting': {
        const obj = state.objectives.find((o) => o.id === e.objectiveId);
        const to = renderer.unitPosition(e.targetId);
        if (obj && to) {
          effects.sting(obj.pos, to, state.time < obj.aggroUntil);
          sound.play('sting', to, 0.6);
        }
        break;
      }
      case 'swing': {
        const h = state.heroes.find((x) => x.id === e.id);
        if (h) {
          effects.swing(h.pos, e.facing, h.radius + e.range, e.arc);
          sound.play(HERO_ATTACK_SOUND[h.defId] ?? 'swing', h.pos, e.id === heroId ? 1 : 0.7);
        }
        renderer.heroAction(e.id, 'attack', attackTime(state, e.id));
        break;
      }
      case 'shot': {
        renderer.heroAction(e.id, 'attack', attackTime(state, e.id));
        // Abschussblitz vor dem Helden, in der Farbe seines Geschosses
        const h = state.heroes.find((x) => x.id === e.id);
        if (h) {
          const look = gameData.heroes.find((d) => d.id === h.defId)?.attack.look ?? '';
          const color = ({ stone: 0xc8f0a0, hook: 0xd8c8a8, star: 0x9fe3ff, volley: 0xff9a4a, swarm: 0xffc83d, nugget: 0xffd166 } as Record<string, number>)[look] ?? 0xffe066;
          effects.flash({ x: h.pos.x + Math.cos(h.facing) * 0.7, y: h.pos.y + Math.sin(h.facing) * 0.7 }, 1.3, color);
          sound.play(HERO_ATTACK_SOUND[h.defId] ?? SHOT_SOUND[look] ?? 'bow', h.pos, e.id === heroId ? 1 : 0.7);
        }
        break;
      }
      case 'cast':
        renderer.heroAction(e.heroId, 'ability', e.slot);
        break;
      case 'shop':
        if (e.action === 'use') renderer.heroAction(e.heroId, 'use');
        else if (e.heroId === heroId) sound.play(e.action === 'buy' ? 'buy' : 'gold');
        break;
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
          // Münzen springen hoch und fliegen zum Helden; Klang beim Ankommen
          const me = () => renderer.unitPosition(heroId) ?? myHero()?.pos ?? null;
          effects.coins(e.pos ?? null, coinCount(e.amount), me, () => sound.play('gold', undefined, 0.6));
        }
        break;
      case 'waveEvent':
        hud.message(`${gameData.waves.events?.list[e.kind]?.icon ?? ''} ${e.text}`);
        sound.play(e.kind === 'blutmond' ? 'roar' : 'whoosh');
        break;
      case 'shopDenied':
        if (e.heroId === heroId) hud.message(e.reason);
        break;
      case 'elite':
        if (e.defId === gameData.waves.finalBoss?.type) {
          const last = state.wave.number >= (gameData.waves.victoryWave ?? Infinity);
          hud.message(last ? 'Endkampf: Das Bauamt rückt mit allen Formularen an!' : 'Das Bauamt ist da – Baustopp für die Winterburg!');
        } else hud.message(`Zwischenboss: ${gameData.zombies.find((z) => z.id === e.defId)?.name}!`);
        renderer.zombieScream(e.zombieId);
        sound.play('roar', state.zombies.find((z) => z.id === e.zombieId)?.pos);
        break;
      case 'charge': {
        renderer.zombieScream(e.zombieId);
        const def = gameData.zombies.find((z) => state.zombies.some((x) => x.id === e.zombieId && x.defId === z.id));
        effects.line(e.from, e.to, 1.6, 0xff3b30, Number(def?.special?.windup ?? 0.6));
        sound.play('roar', e.from);
        break;
      }
      case 'bossKill': {
        sound.play('bossKill');
        const boss = gameData.zombies.find((z) => z.id === e.defId)?.name ?? 'Boss';
        const killer = state.heroes.find((h) => h.id === e.killerId);
        const who = !killer ? 'Das Team' : killer.id === heroId ? 'Du' : (playerNames()?.get(killer.id) ?? gameData.heroes.find((d) => d.id === killer.defId)?.name ?? '?');
        const verb = killer?.id === heroId ? 'hast' : 'hat';
        const extra = e.firstBlood ? ' · Erstes Blut!' : '';
        if (killer) hud.message(`${who} ${verb} ${boss} erlegt! +${e.gold} Gold${extra}`);
        hud.addPing(`☠ ${who}: ${boss}${e.assists.length ? ` (+${e.assists.length} Assist${e.assists.length > 1 ? 's' : ''})` : ''}`, '#ff8a7a');
        if (e.assists.includes(heroId)) hud.addPing(`Assist: +${e.assistGold} Gold`, '#ffd166');
        break;
      }
      case 'parcel':
        // Paketwurf des Postboten: Landeplatz warnen, Paket fliegt im Bogen
        effects.warning(e.to, e.radius, 0xc8a060, e.windup + 0.2);
        effects.lob(e.from, e.to, e.windup);
        sound.play('whoosh', e.from);
        break;
      case 'leap':
        // Höllensprung: Landeplatz warnen, Dämon schreit
        effects.warning(e.to, e.radius, 0xb04dff, e.windup + 0.45);
        renderer.zombieScream(e.zombieId);
        sound.play('roar', e.from);
        break;
      case 'bossCast': {
        // Bossfähigkeit: Warnung am Boden (ausweichen!), Name über dem Boss
        const color = BOSS_COLORS[e.kind];
        for (const p of e.points) effects.warning(p, e.radius, color, e.windup);
        const at = renderer.unitPosition(e.zombieId);
        if (at) effects.floatingText(at, e.name, '#ffb3a7', 3.2);
        sound.play('whoosh', at ?? e.points[0], 0.7);
        break;
      }
      case 'bossHit':
        for (const p of e.points) {
          effects.disc(p, e.radius, BOSS_COLORS[e.kind], 0.35, 0.4);
          effects.ring(p, e.radius, BOSS_COLORS[e.kind], 0.45);
        }
        sound.play('slam', e.points[0], 0.8);
        break;
      case 'defense':
        if (e.action === 'built') {
          if (e.heroId === heroId) sound.play('buy');
          if (e.pos) effects.ring(e.pos, 1.2, 0xffd166, 0.4);
        } else if (e.action === 'destroyed') {
          hud.message(`${gameData.economy.defenses?.[e.kind!]?.name ?? 'Verteidigung'} zerstört`);
          if (e.pos) effects.deathPuff(e.pos);
        } else if (e.action === 'repaired') {
          hud.message(`Verteidigungen repariert (−${e.gold} Gold)`);
          sound.play('buy');
        } else if (e.action === 'denied' && e.heroId === heroId) hud.message(e.reason ?? 'Geht hier nicht');
        break;
      case 'revive': {
        const name = (id: number) => (id === heroId ? 'Du' : (playerNames()?.get(id) ?? gameData.heroes.find((d) => d.id === state.heroes.find((x) => x.id === id)?.defId)?.name ?? '?'));
        hud.message(e.id === heroId ? `${name(e.by)} hat dich wiederbelebt!` : `${name(e.id)} ist wieder auf den Beinen`);
        sound.play('heal', state.heroes.find((x) => x.id === e.id)?.pos);
        break;
      }
      case 'teamBuff':
        hud.message(`${e.icon} Team-Buff: ${e.name} (${e.duration} s)`);
        hud.addPing(`${e.icon} ${e.name} für alle (${e.duration} s)`, '#ffd166');
        sound.play('levelUp');
        break;
      case 'spell':
        spellEffect(e);
        if (SPELL_SOUND[e.spellId]) sound.play(SPELL_SOUND[e.spellId], e.spellId === 'teleport-land' ? e.to : e.from, e.heroId === heroId ? 1 : 0.7);
        break;
      case 'courier':
        if (e.phase !== 'escaped') sound.play(e.phase === 'arrive' ? 'courier' : 'bossKill');
        if (e.phase === 'arrive') hud.message(`Zombie-Postbote im Gelände! Er bleibt, bis ihr ihn besiegt: ${e.gold} Gold für jeden, der mitkämpft`);
        else if (e.phase === 'caught') hud.message(`Paket erbeutet: +${e.gold} Gold für alle Beteiligten!`);
        else hud.message('Der Postbote ist entkommen');
        break;
      case 'camp':
        if (e.phase === 'cleared') {
          const camp = gameData.arena.camps?.find((c) => c.id === e.campId);
          if (camp && state.heroes.some((h) => h.alive && Math.hypot(h.pos.x - camp.x, h.pos.y - camp.y) < 15)) hud.message(`${camp.name} besiegt`);
        } else if (e.phase === 'reset') {
          // Angreifer war unerreichbar: Lager kehrt unverwundbar heim und heilt sich
          const camp = gameData.arena.camps?.find((c) => c.id === e.campId);
          const name = camp?.name ?? (e.campId === 'courier' ? 'Postbote' : 'Lager');
          const me = state.heroes.find((h) => h.id === heroId);
          if (me && (!camp || Math.hypot(me.pos.x - camp.x, me.pos.y - camp.y) < 20)) hud.message(`${name} weicht aus und setzt sich zurück`);
        }
        break;
      case 'ping': {
        const style = PING_STYLE[e.kind];
        effects.ping(e.pos, style.color, style.icon);
        minimap.ping(e.pos, style.color);
        const h = state.heroes.find((x) => x.id === e.heroId);
        const heroName = gameData.heroes.find((d) => d.id === h?.defId)?.name ?? '?';
        const who = e.heroId === heroId ? 'Du' : (playerNames()?.get(e.heroId) ?? heroName);
        hud.addPing(`${who}: ${style.label}`, style.color);
        sound.play(PING_SOUND[e.kind] ?? 'pingHere');
        break;
      }
      case 'levelUp':
        if (e.heroId === heroId) {
          const h = state.heroes.find((x) => x.id === heroId);
          if (h) effects.ring(h.pos, 2.5, 0xffd166, 0.7);
          hud.message(`Level ${e.level}!`);
          sound.play('levelUp');
        }
        break;
      case 'breach':
        hud.message('Durchbruch!');
        sound.play('breach');
        break;
      case 'beesAngry':
        hud.message('Die Bienen sind wütend!');
        beesAngryUntil = state.time + 8;
        break;
      case 'objectiveDestroyed':
        if (state.gameOver) break;
        if (state.objectives.find((o) => o.id === e.objectiveId)?.kind === 'hive') hud.message('Bienenstock zerstört – die Beete wachsen nicht mehr nach!');
        else hud.message(`${gameData.arena.objectives.find((o) => o.id === e.objectiveId)?.name} zerstört`);
        break;
      case 'harvest':
        hud.message(`Ernte: +${e.amount} Vorrat`);
        break;
      case 'regrow':
        hud.message('Hochbeet nachgewachsen');
        break;
      case 'respawn':
        if (e.id === heroId) hud.message('Zurück im Kampf!');
        break;
      case 'death':
        if (e.id === heroId && (gameData.economy.revive?.window ?? 0) > 0 && !state.pvp) hud.message('Gefallen! Ein Mitspieler kann dich wiederbeleben');
        renderer.zombieDie(e.id);
        if (state.heroes.some((h) => h.id === e.id)) sound.play('heroHit', e.pos);
        else sound.play('zombieDeath', e.pos, 0.8);
        if (e.id !== heroId) effects.deathPuff(e.pos);
        else hud.message('Gefallen!');
        break;
      case 'waveStart':
        hud.message(`Welle ${e.number}!`);
        sound.play('waveStart');
        hornetsAnnounced = false;
        break;
      case 'waveCleared':
        hud.message(`Welle ${e.number} geschafft`);
        sound.play('waveCleared');
        break;
      case 'pvpCrate': {
        const mine = myHero()?.team ?? 0;
        if (e.holder === null) break;
        hud.message(e.holder === mine ? 'Dein Team hält die Kiste!' : 'Die Gegner erobern die Kiste!');
        sound.play(e.holder === mine ? 'buy' : 'whoosh');
        break;
      }
      case 'pvpKill': {
        const name = (id: number | null) => {
          if (id === null) return 'Die Zombies';
          if (id === heroId) return 'Du';
          const h = state.heroes.find((x) => x.id === id);
          return playerNames()?.get(id) ?? gameData.heroes.find((d) => d.id === h?.defId)?.name ?? '?';
        };
        const victim = name(e.victimId);
        hud.addPing(`⚔ ${name(e.killerId)} → ${victim === 'Du' ? 'dich' : victim} · Nord ${e.score[0]} : ${e.score[1]} Süd`, e.killerId === heroId ? '#4cd964' : e.victimId === heroId ? '#ff6b5a' : '#ffd166');
        if (e.killerId === heroId) sound.play('bossKill');
        break;
      }
      case 'gameOver': {
        if (session instanceof LocalSession && playKind) reportPlay(playKind, e.victory ? 'win' : 'loss');
        // PvP: Sieg, wenn das eigene Team gewonnen hat
        const base = state.pvp && e.winnerTeam !== undefined ? { ...e, victory: myHero()?.team === e.winnerTeam } : e;
        // Erfolge (Titel, Laternenfarben) eintragen; neue zeigt der Endbildschirm
        const unlocked = recordResult({ victory: !!base.victory, pvp: !!state.pvp, level: state.level ?? 'normal', wave: e.wave, stats: e.stats ?? [], heroId: spectate ? -1 : heroId });
        // Tägliche Herausforderung: Ergebnis in die Tagesliste
        const dailyRank = daily && !spectate ? recordDaily(daily.key, { wave: e.wave, time: e.team?.time ?? state.time, victory: !!base.victory, hero: heroDefId, date: new Date().toISOString() }) : undefined;
        const end = { ...base, unlocked, dailyRank };
        sound.play(end.victory ? 'victory' : 'defeat');
        // Endstatistik: Podest, Auszeichnungen, Rangliste; kurzer Klang für den MVP
        hud.showGameOver(state, end, spectate ? -1 : heroId, playerNames(), () => {
          if (session instanceof RemoteSession) {
            // Online: zurück in die Lobby (der Server schickt die Raum-Info)
            session.restart();
          } else if (daily) startDaily(daily);
          else startGame(spectate ? null : heroDefId, team, difficulty);
        });
        setTimeout(() => sound.play('levelUp'), 900);
        break;
      }
    }
  }
}

let last = performance.now();
renderer.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  const time = now / 1000;

  const hero = myHero();
  if (session && hero) {
    // Eingabe jedes Bild aktualisieren; zuschauen: keine eigenen Befehle
    if (!spectate) session.setInput(input.read());
    const alpha = session.frame(dt, handleEvents);
    const state = session.state;
    const me = myHero() ?? hero;
    renderer.sync(state, session.prev, alpha, dt, time);
    const heroFocus = renderer.unitPosition(heroId) ?? me.pos;
    // Freie Kamera (Minimap, mittlere Maustaste) zeigt einen anderen Ort; Ego-Sicht immer am Helden
    if (renderer.cam.firstPerson) freeCam = null;
    const focus = freeCam ?? heroFocus;
    hud.setCameraHint(freeCam ? `Freie Kamera · ${keyName(bindings.get('camera'))}: zurück zum Helden` : null);
    // Ego-Sicht: Augenhöhe, eigener Held ausgeblendet, kein Zielbogen; Maus frei bei Shop, Menü, Spielende
    const cam = renderer.cam;
    cam.eyeHeight = heroDefId === 'grimm' ? 0.7 : 1.6;
    renderer.hideOwn = cam.inFirstPerson;
    renderer.headBob = hud.headBob;
    input.firstPerson = cam.firstPerson ? firstPersonControls : null;
    const mouseNeeded = shop.open || hud.menuOpen || state.gameOver;
    if ((!cam.firstPerson || mouseNeeded) && input.mouseLocked) document.exitPointerLock?.();
    hud.setFirstPerson(cam.firstPerson && !mouseNeeded, input.mouseLocked);
    renderer.updateAimIndicator(me.alive && !spectate && !cam.inFirstPerson ? heroFocus : null, me.facing, me.attackTimer <= 0);
    const slot = input.previewSlot;
    const def = gameData.heroes.find((h) => h.id === heroDefId)!;
    renderer.showPreview(slot !== null && me.alive && me.ranks[slot] > 0 ? def.abilities[slot] : null, me, input.aimPoint);
    renderer.cam.follow(focus.x, focus.y, dt);
    hud.update(state, heroId, dt, (s) => canRankUp(ctx(), me, s));
    hud.showScoreboard(input.isDown('scoreboard'), state, heroId, playerNames());
    const shopReason = state.gameOver ? 'Spiel vorbei' : shopClosedReason(ctx(), me);
    if (shop.open && shopReason) {
      shop.hide();
      hud.message(shopReason);
    }
    hud.setShopHint(!shopReason && !shop.open && !session.paused && !spectate);
    updateSpectatorUi();
    shop.update(me, def.attack.type, (id) => buildPlan(ctx(), me, id));
    minimap.update(dt, state, heroId, viewCorners());
    if (session instanceof RemoteSession) hud.setPing(session.rtt);
    // Bauleiste und Vorschau (Pause und Welle, nicht im PvP)
    const defs = gameData.economy.defenses;
    const canBuild = !!defs && !state.pvp && me.alive && !state.gameOver && !spectate;
    if (!canBuild) {
      buildOpen = false;
      buildKind = null;
    }
    const counts: Record<string, number> = {};
    for (const d of state.defenses ?? []) counts[d.kind] = (counts[d.kind] ?? 0) + 1;
    shop.updateDefenses(
      defs && !state.pvp
        ? {
            gold: me.gold,
            counts,
            costs: { stacheldraht: defs.stacheldraht, barrikade: defs.barrikade, feuerfass: defs.feuerfass },
            repair: repairCost(ctx()),
            canBuild,
            reason: me.alive ? 'geht gerade nicht' : 'erst nach dem Wiederbeleben',
          }
        : null,
    );
    hud.setBuildBar(
      buildOpen && defs
        ? {
            defs: { stacheldraht: defs.stacheldraht, barrikade: defs.barrikade, feuerfass: defs.feuerfass },
            counts,
            active: buildKind,
            gold: me.gold,
            repair: repairCost(ctx()),
          }
        : null,
      { select: (k) => (buildKind = buildKind === k ? null : (k as DefenseKind)), repair: () => cmd({ type: 'repair' }) },
    );
    const place = buildKind;
    input.onPlace = place ? () => cmd({ type: 'build', kind: place, pos: input.aimPoint, rot: buildRot }) : null;
    renderer.buildGhost(buildKind, buildKind ? input.aimPoint : null, buildRot);
    // Ton: Zuhörer am eigenen Helden bzw. am Kamerafokus
    const near: { x: number; y: number }[] = [];
    let boss = false;
    for (const z of state.zombies) {
      if (z.hp <= 0) continue;
      if (BOSS_DEFS.has(z.defId)) boss = true;
      if (near.length < 24 && Math.hypot(z.pos.x - focus.x, z.pos.y - focus.y) < 18) near.push(z.pos);
    }
    sound.update(dt, { listener: focus, zombies: near, wave: state.wave.phase === 'wave', boss, beesAngry: state.time < beesAngryUntil });
  }

  flushDamageNumbers();
  effects.update(dt);
  // Touch-Sticks nur im laufenden Spiel (nicht in Menüs, Shop oder nach Spielende)
  if (input.touch) input.touch.visible = !!session && !!myHero() && !spectate && !session.state.gameOver && !shop.open && !hud.menuOpen;
  hud.updateLobbyCountdown();
  quality.frame(dt);
  hud.setPerf(quality.showPerf, quality.fps, QUALITY_LABELS[quality.level], session instanceof RemoteSession ? session.rtt : null);
  renderer.render();
});
quality.onChange((level) => renderer.applyQuality(level));

// Animierte Modelle laden (Name → Höhe in Metern); bis dahin (oder bei einem Fehler) bleiben die einfachen Figuren.
const MODELS: Record<string, number> = {
  'zombie-cop': 1.8,
  'zombie-girl': 1.7,
  'zombie-parasite': 1.75,
  'zombie-skeleton': 1.8,
  'zombie-war': 1.8,
  'zombie-pumpkin': 1.75,
  'zombie-warrok': 1.75,
  'zombie-demon': 1.8,
  rotschopf: 1.8,
  schlaeferin: 1.8,
  libero: 1.8,
  pirat: 1.8,
  gaertnerin: 1.8,
  foerster: 1.8,
  baeckerin: 1.8,
  schornsteinfeger: 1.8,
  taucher: 1.8,
  grimm: 0.95,
  rat: 0.3,
  spider: 0.35,
  frog: 0.35,
  wasp: 0.35,
};
for (const [name, height] of Object.entries(MODELS)) {
  loadRiggedModel(`models/${name}.glb`, height)
    .then((m) => renderer.models.set(name, m))
    .catch((err) => console.warn(`Modell ${name} nicht geladen:`, err));
}

input.onStartWave = () => cmd({ type: 'startWave' });

// Touch-Steuerung (Handy, Tablet; ?touch erzwingt sie): Sticks und Knöpfe
if (wantsTouch(params)) {
  const touch = new TouchControls(document.body);
  input.touch = touch;
  touch.origin = () => {
    const h = myHero();
    const def = h && gameData.heroes.find((d) => d.id === h.defId);
    return h && def ? { pos: renderer.unitPosition(heroId) ?? h.pos, range: def.attack.range } : null;
  };
  touch.onCast = (slot) => input.onCast(slot);
  touch.onSpell = (slot) => input.onSpell(slot);
  touch.onShop = () => input.onShop();
  touch.onStartWave = () => input.onStartWave();
  touch.onPing = () => {
    const at = touch.aim();
    if (at) input.onPing('here', at);
  };
  touch.visible = false;
  document.body.classList.add('touch');
}
input.onMute = () => {
  sound.toggleMute();
  hud.message(sound.settings.muted ? 'Ton aus' : 'Ton an');
};
input.onZoom = (d) => {
  const cam = renderer.cam;
  const was = cam.firstPerson;
  cam.zoom(d);
  // Ego-Sicht beginnt in Blickrichtung des Helden
  if (cam.firstPerson && !was) {
    cam.yaw = myHero()?.facing ?? cam.yaw;
    cam.pitch = -0.12;
    hud.message('Ego-Sicht: Klicken zum Umsehen, Mausrad zurück');
  }
};

/** Ego-Sicht: Steuerung relativ zur Blickrichtung, Ziel unter dem Fadenkreuz. */
const firstPersonControls = {
  yaw: () => renderer.cam.yaw,
  look: (dx: number, dy: number) => renderer.cam.look(dx, dy),
  aim: () => {
    const cam = renderer.cam;
    const from = renderer.unitPosition(heroId) ?? myHero()?.pos ?? { x: 0, y: 0 };
    const rect = renderer.canvas.getBoundingClientRect();
    const hit = cam.pitch < -0.02 ? renderer.pickGround(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
    // Über den Horizont oder sehr weit: 12 m voraus in Blickrichtung
    if (hit && Math.hypot(hit.x - from.x, hit.y - from.y) <= 20) return hit;
    return { x: from.x + Math.cos(cam.yaw) * 12, y: from.y + Math.sin(cam.yaw) * 12 };
  },
};
hud.startWaveBtn.addEventListener('click', input.onStartWave);

// Entwicklermodus ?debug: Zugriff für Tests (z. B. Messung der Vorhersage im Browser)
if (params.has('debug')) {
  Object.assign(window, {
    winterburg: {
      heroPosition: () => renderer.unitPosition(heroId),
      serverPosition: () => (session instanceof RemoteSession ? session.serverHero()?.pos : myHero()?.pos) ?? null,
      rtt: () => (session instanceof RemoteSession ? session.rtt : null),
      heroId: () => heroId,
      renderInfo: () => ({ ...renderer.renderer.info.render }),
      drop: () => (session instanceof RemoteSession ? session.dropConnection() : undefined),
      // Einzelspieler: Held an einen Ort setzen bzw. einen Zombie dort erscheinen lassen
      teleport: (x: number, y: number) => {
        const h = session instanceof LocalSession ? session.sim.hero(heroId) : undefined;
        if (h) h.pos = { x, y };
      },
      spawnZombie: (defId: string, x: number, y: number) => {
        if (!(session instanceof LocalSession)) return;
        const def = session.sim.zombieDefs.get(defId);
        if (def) spawnZombieAt(session.sim, def, { x, y });
      },
      // Einzelspieler: eigenen Helden fallen lassen (Wiederbeleben prüfen)
      down: () => {
        if (!(session instanceof LocalSession)) return;
        const sim = session.sim;
        const h = sim.hero(heroId);
        if (h) applyDamage(sim, h, 1e9);
      },
      // Einzelspieler: dem eigenen Helden Wirkungen geben (Buff-Ringe prüfen), z. B. buff('haste', 0.3, 20, 'team-daemon')
      buff: (kind: string, value: number, seconds: number, source = 'debug') => {
        const h = session instanceof LocalSession ? session.sim.hero(heroId) : undefined;
        if (h) h.buffs.push({ kind: kind as never, value, until: session!.state.time + seconds, source });
      },
      // Ego-Sicht: Zustand lesen bzw. Blickrichtung setzen (Tests)
      // Einzelspieler: Leben des eigenen Helden auf einen Anteil setzen (z. B. 0.3)
      hurt: (share: number) => {
        const h = session instanceof LocalSession ? session.sim.hero(heroId) : undefined;
        if (h) h.hp = Math.max(1, h.maxHp * share);
      },
      // Einzelspieler: dem eigenen Helden Seuche geben (Zustands-Effekte prüfen)
      plague: (stacks: number, seconds = 10) => {
        const h = session instanceof LocalSession ? session.sim.hero(heroId) : undefined;
        if (h) h.plague = { stacks, until: session!.state.time + seconds };
      },
      // Laufende Animation des eigenen Helden (z. B. runBack beim Rückwärtslaufen)
      heroLoop: () => renderer.unitLoop(heroId),
      view: (yaw?: number, pitch?: number) => {
        const cam = renderer.cam;
        if (yaw !== undefined) cam.yaw = yaw;
        if (pitch !== undefined) cam.pitch = pitch;
        return { firstPerson: cam.firstPerson, yaw: cam.yaw, pitch: cam.pitch, locked: input.mouseLocked };
      },
      // Einzelspieler: Wellen-Ereignis erzwingen (nebel, blutmond, regen; null = keins) und Welle starten
      waveEvent: (kind: string | null) => {
        if (!(session instanceof LocalSession)) return;
        const sim = session.sim;
        const w = sim.state.wave;
        if (w.phase === 'pause') w.timer = Math.min(w.timer, 0.05);
        // Nach dem Tick, in dem die Welle beginnt, das Ereignis setzen
        const step = sim.step;
        sim.step = (commands) => {
          step.call(sim, commands);
          if (w.phase !== 'wave') return;
          sim.step = step;
          w.event = kind as WaveEventKind | null;
          const e = kind ? gameData.waves.events?.list[kind as WaveEventKind] : undefined;
          if (e) sim.state.events.push({ type: 'waveEvent', kind: kind as WaveEventKind, name: e.name, text: e.text });
        };
      },
      // Einzelspieler: Spiel sofort beenden (Sieg bzw. Niederlage), z. B. um die Endstatistik zu prüfen
      finish: (victory: boolean) => {
        if (!(session instanceof LocalSession)) return;
        // Am Ende des nächsten Ticks, damit das Ereignis nicht gleich wieder gelöscht wird
        const sim = session.sim;
        const step = sim.step;
        sim.step = (commands) => {
          step.call(sim, commands);
          sim.step = step;
          endGame(sim, victory ? 'Die Winterburg ist gehalten!' : 'Testende', victory);
        };
      },
    },
  });
}

const roomCode = params.get('room');
if (spectate) startGame(null, defaultTeam(gameData.bots, null), spectateDifficulty);
else if (roomCode) {
  // Neu geladen: mit dem gespeicherten Token denselben Helden zurückholen, sonst Platz wählen
  const code = roomCode.toUpperCase();
  const token = storedToken(code);
  if (params.has('watch')) connect({ t: 'watch', room: code }, gameData.heroes.slice(0, 4).map((h) => h.id));
  else if (token) connect({ t: 'resume', room: code, token, name: savedName() }, gameData.heroes.slice(0, 4).map((h) => h.id));
  else void joinRoom(code);
}
else showStartScreen();
