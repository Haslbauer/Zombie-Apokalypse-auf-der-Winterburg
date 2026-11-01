import { rankValue } from '../sim/abilities';
import { defaultTeam } from '../sim/bots/team';
import { type Quality, QUALITY_LABELS, type QualitySetting } from './quality';
import type { AudioSettings } from './audio';
import { formatClock, loadBestTime, recordVictory } from './besttime';
import type { DailyResult, DailySetup } from './daily';
import { type Achievement, ACHIEVEMENTS, chosenTitle, DEFAULT_LANTERN, loadUnlocks, saveUnlocks } from './unlocks';
import { BAR_OPACITY, BAR_SCALE, type BarLayout, clampOffset, DEFAULT_BAR, loadBar, saveBar } from './barlayout';
import type { BotDifficulty, FinalHeroStats, GameData, GameEvent, GameLevel, GameState, Hero, HeroDef } from '../sim/types';
import type { PvpOptions, RoomInfo } from '../net/protocol';
import { type Action, ACTIONS, type Keybindings, keyName } from './keybindings';

const SPELL_STORAGE = 'winterburg.spells';
function loadSpellPrefs(): [string, string] | null {
  try {
    const v = JSON.parse(localStorage.getItem(SPELL_STORAGE) ?? 'null');
    return Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string' ? [v[0], v[1]] : null;
  } catch {
    return null;
  }
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
};

/** HTML-Overlay: Wellenanzeige, Lebensbalken, Meldungen, Start- und Game-Over-Bildschirm. */
export class Hud {
  private readonly top = el('div', 'hud-top');
  private readonly waveLabel = el('div', 'hud-wave');
  private readonly waveInfo = el('div', 'hud-wave-info');
  /** Team-Buffs und Seuche des eigenen Helden (unter der Kopfleiste). */
  private readonly buffBar = el('div', 'hud-buffbar');
  private buffKey = '';
  /** Speedrun-Uhr: Spielzeit seit Spielbeginn (bleibt beim Spielende stehen). */
  private readonly clock = el('div', 'hud-clock');
  /** Gespeicherte Bestzeit (für den Tooltip der Uhr). */
  private bestTime = loadBestTime();
  readonly startWaveBtn = el('button', 'hud-start-wave');
  private readonly team = el('div', 'hud-team');
  private readonly beds = el('div', 'hud-objective');
  private teamRows = new Map<number, { row: HTMLElement; hp: HTMLElement; level: HTMLElement; status: HTMLElement; bosses: HTMLElement }>();
  private readonly kills = el('div', 'hud-kills');
  private readonly objectiveBars = new Map<string, { fill: HTMLElement; box: HTMLElement }>();
  private readonly respawn = el('div', 'hud-respawn');
  private readonly bottom = el('div', 'hud-bottom');
  private readonly heroName = el('div', 'hud-hero-name');
  private readonly portrait = el('img', 'hud-portrait');
  private readonly levelBadge = el('div', 'hud-level');
  private readonly xpFill = el('div', 'hud-xp-fill');
  private readonly hpFill = el('div', 'hud-hp-fill');
  private readonly hpText = el('div', 'hud-hp-text');
  private readonly abilityRow = el('div', 'hud-abilities');
  private readonly skillHint = el('div', 'hud-skill-hint');
  private readonly goldLabel = el('span', 'hud-gold');
  private readonly inventoryRow = el('div', 'hud-inventory');
  private invSlots: HTMLElement[] = [];
  private consumableSlots: { box: HTMLElement; key: HTMLElement; count: HTMLElement }[] = [];
  readonly shopHint = el('button', 'hud-shop-hint');
  /** Rechtsklick auf ein Inventarfeld (Verkaufen). */
  onSell: (slot: number, consumable: boolean) => void = () => {};
  onUse: (slot: number) => void = () => {};
  /** Beschwörerzauber auslösen (Klick auf das Feld) bzw. neu wählen. */
  onSpell: (slot: number) => void = () => {};
  onChooseSpells: (spells: [string, string]) => void = () => {};
  private spellSlots: { box: HTMLElement; icon: HTMLElement; key: HTMLElement; cd: HTMLElement }[] = [];
  /** Gewählte Beschwörerzauber (im Browser gemerkt); null = Vorgabe der Rolle. */
  spellPrefs: [string, string] | null = loadSpellPrefs();
  private readonly tooltip = el('div', 'hud-tooltip');
  private slots: { box: HTMLElement; key: HTMLElement; cd: HTMLElement; pips: HTMLElement; plus: HTMLElement }[] = [];
  private heroDef: HeroDef | null = null;
  /** Skillpunkt per Klick auf „+“ setzen. */
  onLevelUp: (slot: number) => void = () => {};
  private readonly banner = el('div', 'hud-banner');
  private readonly help = el('div', 'hud-help');
  private readonly overlay = el('div', 'hud-overlay');
  private readonly invite = el('div', 'hud-invite');
  private readonly pingLog = el('div', 'hud-ping-log');
  private readonly scoreboard = el('div', 'hud-scoreboard');
  private readonly perf = el('div', 'hud-perf');
  /** Grafik-Einstellung (setzt main.ts). */
  quality: Quality | null = null;
  private scoreKey = '';
  private readonly connection = el('div', 'hud-connection');
  private readonly latency = el('span', 'hud-latency');
  private bannerTimer = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly data: GameData,
    private readonly bindings: Keybindings,
  ) {
    this.top.append(this.waveLabel, this.clock, this.waveInfo, this.startWaveBtn, this.kills);
    this.beds.className = 'hud-objective';
    for (const o of data.arena.objectives.filter((x) => x.kind !== 'bed')) {
      const box = el('div', 'hud-objective');
      const bar = el('div', 'hud-objective-bar');
      const fill = el('div', `hud-objective-fill ${o.kind === 'hive' ? 'hive' : 'heart'}`);
      bar.append(fill);
      box.append(el('span', '', o.kind === 'food' ? 'Vorrat' : o.name), bar);
      this.top.append(box);
      this.objectiveBars.set(o.id, { fill, box });
    }
    if (data.arena.objectives.some((o) => o.kind === 'bed')) this.top.append(this.beds);
    const hp = el('div', 'hud-hp');
    hp.append(this.hpFill, this.hpText);
    const xp = el('div', 'hud-xp');
    xp.append(this.xpFill);
    const info = el('div', 'hud-hero-info');
    const nameRow = el('div', 'hud-name-row');
    nameRow.append(this.heroName, this.goldLabel);
    info.append(nameRow, hp, xp);
    const portraitBox = el('div', 'hud-portrait-box');
    portraitBox.append(this.portrait, this.levelBadge);
    const head = el('div', 'hud-hero-head');
    head.append(portraitBox, info);
    this.buildInventory();
    this.bottom.append(head, this.abilityRow, this.inventoryRow, this.skillHint, this.barControls());
    this.applyBar();
    window.addEventListener('resize', () => this.moveBar(this.bar.dx, this.bar.dy, true));
    this.shopHint.style.display = 'none';
    root.append(this.shopHint, this.team);
    this.updateHelp();
    root.append(this.buffBar);
    root.append(this.top, this.bottom, this.banner, this.respawn, this.help, this.invite, this.pingLog, this.scoreboard, this.perf, this.connection, this.overlay, this.tooltip);
    this.connection.style.display = 'none';
    this.invite.style.display = 'none';
    this.showInGame(false);
  }

  private showInGame(visible: boolean): void {
    for (const e of [this.top, this.bottom, this.help, this.team]) e.style.display = visible ? '' : 'none';
    if (!visible) this.scoreboard.style.display = 'none';
    if (!visible) this.respawn.style.display = 'none';
  }

  /**
   * Zweiter Schritt: Team mit drei Bots (Klick tauscht reihum durch die freien
   * Helden) und Bot-Stärke wählen, dann „Los!“.
   */
  showTeam(
    playerId: string,
    onStart: (bots: string[], difficulty: BotDifficulty) => void,
    onBack: () => void,
    onOnline?: (bots: string[], difficulty: BotDifficulty, name: string) => void,
  ): void {
    this.overlay.replaceChildren();
    const team = defaultTeam(this.data.bots, playerId);
    let difficulty: BotDifficulty = 'mittel';
    const box = el('div', 'hud-box hud-start');
    box.append(el('h1', '', 'Dein Team'), el('p', '', 'Zwei Bots spielen mit – zusammen mit dir Tank, Schaden und Support. Klick auf eine Bot-Karte tauscht den Helden.'));
    const row = el('div', 'hud-heroes');
    const card = (id: string, label: string) => {
      const def = this.data.heroes.find((h) => h.id === id)!;
      const btn = el('button', 'hud-hero-btn');
      const img = el('img', 'hud-hero-portrait');
      img.src = `portraits/${def.id}.jpg`;
      btn.append(img, el('strong', '', def.name), this.roleTag(def.id), el('small', 'hud-role', def.role), el('span', 'hud-hero-desc', label));
      return btn;
    };
    const render = () => {
      row.replaceChildren();
      const me = card(playerId, 'Du');
      me.classList.add('me');
      row.append(me);
      team.forEach((id, i) => {
        const btn = card(id, 'Bot – klicken zum Tauschen');
        btn.dataset.bot = String(i);
        btn.addEventListener('click', () => {
          // nächster Held, der weder Spieler noch anderer Bot ist
          const all = this.data.heroes.map((h) => h.id);
          let k = all.indexOf(id);
          do k = (k + 1) % all.length;
          while (all[k] === playerId || (team.includes(all[k]) && all[k] !== id));
          team[i] = all[k];
          render();
        });
        row.append(btn);
      });
      check.replaceWith((check = this.roleCheck([playerId], team)));
    };
    let check: HTMLElement = el('div', '');
    render();
    const diffRow = el('div', 'hud-difficulty');
    diffRow.append(el('span', '', 'Bot-Stärke:'));
    for (const d of ['leicht', 'mittel', 'schwer'] as BotDifficulty[]) {
      const b = el('button', 'hud-diff', d);
      b.dataset.difficulty = d;
      b.classList.toggle('active', d === difficulty);
      b.addEventListener('click', () => {
        difficulty = d;
        diffRow.querySelectorAll('.hud-diff').forEach((x) => x.classList.toggle('active', (x as HTMLElement).dataset.difficulty === d));
      });
      diffRow.append(b);
    }
    const buttons = el('div', 'hud-buttons');
    const back = el('button', 'hud-restart', 'Zurück');
    back.addEventListener('click', onBack);
    const go = el('button', 'hud-restart hud-go', 'Allein spielen');
    go.addEventListener('click', () => onStart([...team], difficulty));
    buttons.append(back, go);
    const levelHolder = el('div', '');
    const renderLevel = () =>
      levelHolder.replaceChildren(
        this.levelRow(this.level, true, (l) => {
          this.level = l;
          try {
            localStorage.setItem('winterburg.level', l);
          } catch {
            // ohne Speicher
          }
          renderLevel();
        }),
      );
    renderLevel();
    box.append(row, check, levelHolder, diffRow, this.spellPicker(playerId));
    if (onOnline) {
      // Mehrspieler: Raum auf dem Server, Freunde übernehmen per Link die Bot-Plätze
      const name = this.nameInput();
      const online = el('button', 'hud-restart hud-go hud-online', 'Online mit Freunden');
      online.addEventListener('click', () => onOnline([...team], difficulty, name.value));
      buttons.append(online);
      box.append(name);
    }
    box.append(buttons);
    this.overlay.append(box);
    this.overlay.style.display = '';
  }

  /** Namensfeld für den Mehrspieler (im Browser gemerkt). */
  private nameInput(): HTMLInputElement {
    const input = el('input', 'hud-name-input');
    input.placeholder = 'Dein Name';
    input.maxLength = 16;
    try {
      input.value = localStorage.getItem('playerName') ?? '';
    } catch {
      // ohne Speicher: leer lassen
    }
    input.addEventListener('change', () => {
      try {
        localStorage.setItem('playerName', input.value);
      } catch {
        // egal
      }
    });
    return input;
  }

  /**
   * Beitreten per Einladungslink: Die Plätze des Raums; ein Bot-Platz lässt sich
   * übernehmen (samt Level, Gold und Items).
   */
  showJoin(room: RoomInfo, onPick: (slot: number, name: string) => void, onCancel: () => void, error?: string): void {
    delete this.overlay.dataset.menu;
    this.showInGame(false);
    this.overlay.replaceChildren();
    const box = el('div', 'hud-box hud-start');
    if (room.phase === 'lobby') {
      // Lobby: nur Namen eingeben und beitreten, Held und Zauber wählt man in der Lobby
      box.append(el('h1', '', `Raum ${room.code}`), el('p', '', 'Die Gruppe sammelt sich gerade in der Lobby.'));
      if (error) box.append(el('p', 'hud-error', error));
      const name = this.nameInput();
      const go = el('button', 'hud-restart hud-go', 'Lobby betreten');
      go.addEventListener('click', () => onPick(-1, name.value));
      const back = el('button', 'hud-restart', 'Allein spielen');
      back.addEventListener('click', onCancel);
      const buttons = el('div', 'hud-buttons');
      buttons.append(back, go);
      box.append(name, buttons);
      this.overlay.append(box);
      this.overlay.style.display = '';
      return;
    }
    box.append(el('h1', '', `Raum ${room.code}`), el('p', '', 'Wähle einen Helden, den gerade ein Bot spielt. Du übernimmst ihn mit Level, Gold und Items.'));
    if (error) box.append(el('p', 'hud-error', error));
    const name = this.nameInput();
    const row = el('div', 'hud-heroes');
    room.slots.forEach((slot, i) => {
      const def = this.data.heroes.find((h) => h.id === slot.defId)!;
      const btn = el('button', 'hud-hero-btn');
      btn.dataset.slot = String(i);
      const img = el('img', 'hud-hero-portrait');
      img.src = `portraits/${def.id}.jpg`;
      const label = slot.human ? `Spielt: ${slot.name}` : slot.reserved ? `Reserviert für ${slot.name ?? 'einen Spieler'}` : 'Bot – übernehmen';
      btn.append(img, el('strong', '', def.name), el('small', 'hud-role', def.role), el('span', 'hud-hero-desc', label));
      if (slot.human || slot.reserved) btn.disabled = true;
      else btn.addEventListener('click', () => onPick(i, name.value));
      row.append(btn);
    });
    const buttons = el('div', 'hud-buttons');
    const back = el('button', 'hud-restart', 'Allein spielen');
    back.addEventListener('click', onCancel);
    buttons.append(back);
    // Beschwörerzauber gelten für jeden Helden; Vorgabe nach dem ersten freien Platz
    const firstFree = room.slots.find((s) => !s.human && !s.reserved)?.defId ?? room.slots[0]?.defId ?? 'rotschopf';
    box.append(row, this.spellPicker(firstFree), name, buttons);
    this.overlay.append(box);
    this.overlay.style.display = '';
  }

  /**
   * Lobby vor dem Spiel: vier Plätze (Held, Spieler, Zauber, Bereit), freie
   * Heldenwahl (vergebene ausgegraut), Zauberauswahl, Bereit-Knopf und
   * Countdown, sobald alle bereit sind. Freie Plätze spielen beim Start Bots.
   */
  showLobby(
    room: RoomInfo,
    mySlot: number,
    link: string,
    on: {
      pick: (heroId: string) => void;
      spells: (spells: [string, string]) => void;
      ready: (ready: boolean) => void;
      difficulty: (d: BotDifficulty) => void;
      mode: (mode: 'koop' | 'pvp') => void;
      level: (level: GameLevel) => void;
      team: (team: number) => void;
      pvpOptions: (opt: PvpOptions) => void;
      leave: () => void;
    },
  ): void {
    delete this.overlay.dataset.menu;
    this.showInGame(false);
    this.lobbyCountdown = room.startsIn !== null ? performance.now() + room.startsIn * 1000 : null;
    this.overlay.replaceChildren();
    const box = el('div', 'hud-box hud-start hud-lobby');
    const me = room.slots[mySlot];
    const head = el('div', 'hud-lobby-head');
    const copy = el('button', 'hud-invite-copy', 'Link kopieren');
    copy.addEventListener('click', () => {
      navigator.clipboard?.writeText(link).then(
        () => (copy.textContent = 'Kopiert!'),
        () => window.prompt('Einladungslink:', link),
      );
      setTimeout(() => (copy.textContent = 'Link kopieren'), 2000);
    });
    head.append(el('h1', '', `Lobby ${room.code}`), copy);
    const pvp = room.mode === 'pvp';
    const opts: PvpOptions = room.pvp ?? { goal: 'kills', zombies: false, bots: true };
    // Spielmodus (Gastgeber): Koop gegen Zombies oder PvP
    const modeRow = el('div', 'hud-difficulty hud-mode');
    modeRow.append(el('span', '', 'Modus:'));
    for (const [m, label] of [['koop', 'Koop gegen Zombies'], ['pvp', 'PvP: Helden gegeneinander']] as const) {
      const b = el('button', 'hud-diff', label);
      b.dataset.mode = m;
      b.classList.toggle('active', room.mode === m);
      b.disabled = mySlot !== 0;
      b.addEventListener('click', () => on.mode(m));
      modeRow.append(b);
    }
    // PvP-Einstellungen (Gastgeber): Ziel, Zombies nebenbei, Bots
    const pvpRow = el('div', 'hud-difficulty hud-pvp-options');
    if (pvp) {
      pvpRow.append(el('span', '', 'Ziel:'));
      for (const [g, label] of [['kills', '⚔ Kills'], ['kiste', '📦 Kiste erobern']] as const) {
        const b = el('button', 'hud-diff', label);
        b.dataset.goal = g;
        b.classList.toggle('active', opts.goal === g);
        b.disabled = mySlot !== 0;
        b.addEventListener('click', () => on.pvpOptions({ ...opts, goal: g }));
        pvpRow.append(b);
      }
      for (const [key, label] of [['zombies', '🧟 Zombies nebenbei'], ['bots', '🤖 Leere Plätze mit Bots']] as const) {
        const b = el('button', 'hud-diff', `${opts[key] ? '☑' : '☐'} ${label}`);
        b.dataset.option = key;
        b.classList.toggle('active', opts[key]);
        b.disabled = mySlot !== 0;
        b.addEventListener('click', () => on.pvpOptions({ ...opts, [key]: !opts[key] }));
        pvpRow.append(b);
      }
    }
    box.append(
      head,
      modeRow,
      ...(pvp ? [pvpRow] : []),
      el(
        'p',
        'hud-small',
        pvp
          ? `PvP: Jeder wählt Held und Team (Nord oder Süd). ${opts.goal === 'kiste' ? 'Wer allein an der Postboten-Kiste in der Mitte steht, sammelt Punkte – 100 Punkte gewinnen.' : 'Das Team mit zuerst 10 Kills gewinnt.'} Das kleinere Team bekommt einen Ausgleich. ${opts.bots ? 'Leere Plätze spielen Bots.' : 'Leere Plätze bleiben leer.'}`
          : 'Schick den Link an deine Freunde. Jeder wählt einen Helden und klickt „Bereit“. Freie Plätze spielen Bots.',
      ),
    );

    // Vier Plätze
    const slots = el('div', 'hud-heroes hud-lobby-slots');
    room.slots.forEach((s, i) => {
      const def = this.data.heroes.find((d) => d.id === s.defId);
      const card = el('div', 'hud-hero-btn hud-lobby-slot');
      if (i === mySlot) card.classList.add('me');
      if (s.ready) card.classList.add('ready');
      const img = el('img', 'hud-hero-portrait');
      if (def) img.src = `portraits/${def.id}.jpg`;
      else img.classList.add('empty');
      const pvpBot = pvp && opts.bots && !s.human && !s.reserved;
      const who = s.human || s.reserved ? (s.name ?? 'Spieler') : pvp && !opts.bots ? 'Frei' : 'Frei – spielt ein Bot';
      if (pvp && (s.human || s.reserved || pvpBot)) card.classList.add(s.team === 0 ? 'team-nord' : 'team-sued');
      const status = !s.human && !s.reserved ? '' : s.ready ? '✔ Bereit' : def ? 'Wählt noch …' : 'Wählt einen Helden …';
      const spells = (s.spells ?? []).map((id) => this.data.spells.spells.find((x) => x.id === id)?.icon ?? '').join(' ');
      card.append(img, el('strong', '', def?.name ?? '—'), def ? this.roleTag(def.id) : el('span', ''), el('small', 'hud-role', pvp && (s.human || s.reserved || pvpBot) ? `${who} · ${s.team === 0 ? 'Nord' : 'Süd'}` : who), el('span', 'hud-hero-desc', `${status}${spells ? ` · ${spells}` : ''}`));
      slots.append(card);
    });
    const humanPicks = room.slots.filter((s) => (s.human || s.reserved) && s.defId).map((s) => s.defId);
    const botSlots = room.slots.filter((s) => !s.human && !s.reserved).length;
    box.append(slots);
    if (pvp) {
      // Team wählen
      const teamRow = el('div', 'hud-difficulty hud-team-pick');
      teamRow.append(el('span', '', 'Dein Team:'));
      for (const [t, label] of [[0, 'Nord'], [1, 'Süd']] as const) {
        const b = el('button', `hud-diff team-${t === 0 ? 'nord' : 'sued'}`, label);
        b.dataset.team = String(t);
        b.classList.toggle('active', me?.team === t);
        b.addEventListener('click', () => on.team(t));
        teamRow.append(b);
      }
      const playing = room.slots.filter((s) => s.human || s.reserved || opts.bots);
      const n = playing.filter((s) => s.team === 0).length;
      const sd = playing.filter((s) => s.team === 1).length;
      teamRow.append(el('span', 'hud-small', `Aufstellung ${n} : ${sd}${n === 0 || sd === 0 ? ' – beide Teams brauchen mindestens einen Spieler' : ''}`));
      box.append(teamRow);
    } else box.append(this.roleCheck(humanPicks, botSlots));

    // Heldenwahl
    const taken = new Map(room.slots.filter((s, i) => i !== mySlot && (s.human || s.reserved) && s.defId).map((s) => [s.defId, s.name ?? 'Spieler']));
    const pickRow = el('div', 'hud-lobby-pick');
    for (const h of this.data.heroes) {
      const b = el('button', 'hud-lobby-hero');
      b.dataset.hero = h.id;
      const img = el('img', '');
      img.src = `portraits/${h.id}.jpg`;
      b.append(img, el('span', '', h.name), this.roleTag(h.id));
      const by = taken.get(h.id);
      if (by) {
        b.disabled = true;
        b.title = `Gewählt von ${by}`;
        b.append(el('small', '', by));
      } else b.title = `${h.name} – ${h.role}`;
      if (me?.defId === h.id) b.classList.add('active');
      b.addEventListener('click', () => on.pick(h.id));
      pickRow.append(b);
    }
    box.append(el('h2', '', 'Dein Held'), pickRow);
    // Zauber (Vorgabe nach dem gewählten Helden; jede Änderung geht an den Server)
    box.append(this.spellPicker(me?.defId || 'rotschopf', on.spells));

    // Bot-Stärke (nur Gastgeber), Bereit, Countdown
    const foot = el('div', 'hud-buttons hud-lobby-foot');
    const diffRow = el('div', 'hud-difficulty');
    diffRow.append(el('span', '', 'Bot-Stärke:'));
    if (pvp) diffRow.style.display = 'none';
    if (!pvp) box.append(this.levelRow(room.level ?? 'normal', mySlot === 0, (l) => on.level(l)));
    for (const d of ['leicht', 'mittel', 'schwer'] as BotDifficulty[]) {
      const b = el('button', 'hud-diff', d);
      b.classList.toggle('active', d === room.difficulty);
      b.disabled = mySlot !== 0;
      b.addEventListener('click', () => on.difficulty(d));
      diffRow.append(b);
    }
    const leave = el('button', 'hud-restart', 'Verlassen');
    leave.addEventListener('click', on.leave);
    const ready = el('button', `hud-restart hud-go hud-ready${me?.ready ? ' active' : ''}`, me?.ready ? 'Nicht bereit' : 'Bereit');
    ready.disabled = !me?.defId;
    ready.addEventListener('click', () => on.ready(!me?.ready));
    this.lobbyCountdownEl = el('div', 'hud-lobby-countdown');
    const humans = room.slots.filter((s) => s.human);
    const waiting = humans.filter((s) => !s.ready).length;
    this.lobbyWaitText = waiting > 0 ? `Warte auf ${waiting} Spieler …` : '';
    foot.append(leave, ready);
    box.append(diffRow, this.lobbyCountdownEl, foot);
    this.overlay.append(box);
    this.overlay.style.display = '';
    this.updateLobbyCountdown();
  }

  private lobbyCountdown: number | null = null;
  private lobbyCountdownEl: HTMLElement | null = null;
  private lobbyWaitText = '';
  /** Wird jede Sekunde des Countdowns aufgerufen (für den Ton). */
  onCountdownTick: (secondsLeft: number) => void = () => {};
  private lastCountdownSecond = -1;

  /** Countdown-Anzeige in der Lobby (jedes Bild aufrufen). */
  updateLobbyCountdown(): void {
    const e = this.lobbyCountdownEl;
    if (!e || !e.isConnected) return;
    if (this.lobbyCountdown === null) {
      e.textContent = this.lobbyWaitText;
      e.classList.remove('running');
      return;
    }
    const left = Math.max(0, Math.ceil((this.lobbyCountdown - performance.now()) / 1000));
    e.textContent = left > 0 ? `Alle bereit – Start in ${left} s` : 'Los geht’s!';
    e.classList.add('running');
    if (left !== this.lastCountdownSecond) {
      this.lastCountdownSecond = left;
      this.onCountdownTick(left);
    }
  }

  /** Hinweis während der Verbindung bzw. bei Fehlern (Mehrspieler). */
  showNotice(title: string, text: string, onBack: () => void): void {
    this.showInGame(false);
    this.overlay.replaceChildren();
    const box = el('div', 'hud-box');
    const back = el('button', 'hud-restart', 'Zurück');
    back.addEventListener('click', onBack);
    box.append(el('h1', '', title), el('p', '', text), back);
    this.overlay.append(box);
    this.overlay.style.display = '';
  }

  /** Ping-Meldung („Ben: Gefahr!“); die letzten drei bleiben 4 s stehen. */
  addPing(text: string, color: string): void {
    const line = el('div', '', text);
    line.style.setProperty('--ping', color);
    this.pingLog.append(line);
    while (this.pingLog.children.length > 3) this.pingLog.firstElementChild!.remove();
    setTimeout(() => line.remove(), 4000);
  }

  /**
   * Anzeigetafel (Taste halten): pro Held Kills, Bosse, Assists, verdientes
   * Gold und Level. names: Menschen im Raum (Mehrspieler).
   */
  showScoreboard(visible: boolean, state?: GameState, playerId = -1, names?: Map<number, string>): void {
    this.scoreboard.style.display = visible ? '' : 'none';
    if (!visible || !state) return;
    const rows = state.heroes.map((h) => {
      const def = this.data.heroes.find((d) => d.id === h.defId)!;
      const who = h.id === playerId ? 'Du' : (names?.get(h.id) ?? (h.bot || names ? 'Bot' : 'Mitspieler'));
      const s = h.score ?? { kills: 0, bosses: 0, assists: 0, gold: 0 };
      return { id: h.id, def, who, s, level: h.level };
    });
    const key = JSON.stringify(rows.map((r) => [r.id, r.who, r.s, r.level]));
    if (key === this.scoreKey) return;
    this.scoreKey = key;
    const table = el('table', '');
    const head = el('tr', '');
    // Kills = erlegte Bosse und Zwischenbosse; die Masse der Zombies hat ihren eigenen Zähler
    for (const t of ['Held', '', 'Kills', 'Zombies', 'Assists', 'Gold', 'Lv']) head.append(el('th', '', t));
    table.append(head);
    for (const r of rows) {
      const tr = el('tr', '');
      if (r.id === playerId) tr.classList.add('me');
      const img = el('img', 'hud-score-portrait');
      img.src = `portraits/${r.def.id}.jpg`;
      const name = el('td', 'hud-score-name');
      name.append(img, el('span', '', r.def.name));
      tr.append(name, el('td', 'hud-score-who', r.who));
      for (const v of [r.s.bosses, Math.max(0, r.s.kills - r.s.bosses), r.s.assists, r.s.gold, r.level]) tr.append(el('td', '', String(v)));
      table.append(tr);
    }
    const bosses = state.heroes.reduce((n, h) => n + (h.score?.bosses ?? 0), 0);
    this.scoreboard.replaceChildren(el('h3', '', `Welle ${state.wave.number} · ${bosses} Bosse · ${state.kills} Zombies`), table);
  }

  /** Rollen-Abzeichen eines Helden (🛡 Tank, ⚔ Schaden, ✚ Support). */
  private roleTag(defId: string): HTMLElement {
    const role = this.data.bots.heroes[defId]?.teamRole;
    const def = role ? this.data.economy.roles?.[role] : undefined;
    const tag = el('span', `hud-role-tag role-${role ?? 'none'}`, def ? `${def.icon} ${def.name}` : '');
    if (def) tag.title = def.description;
    return tag;
  }

  /** Hinweis zur Teamzusammenstellung: welche Rollen fehlen (bzw. von Bots übernommen werden). */
  private roleCheck(picked: string[], botSlots: string[] | number): HTMLElement {
    const roles = this.data.economy.roles;
    const box = el('div', 'hud-role-check');
    if (!roles) return box;
    const roleOf = (id: string) => this.data.bots.heroes[id]?.teamRole;
    const all = ['tank', 'dmg', 'support'] as const;
    const name = (r: (typeof all)[number]) => `${roles[r].icon} ${roles[r].name}`;
    const have = new Set(picked.map(roleOf));
    const missing = all.filter((r) => !have.has(r));
    // Feste Bots (Solo) zählen mit; online füllen freie Plätze die fehlenden Rollen auf
    if (typeof botSlots !== 'number') {
      const withBots = new Set([...picked, ...botSlots].map(roleOf));
      const still = all.filter((r) => !withBots.has(r));
      if (still.length) {
        box.classList.add('warn');
        box.textContent = `⚠ Es fehlt: ${still.map(name).join(', ')}. Ohne Tank, Schaden und Support ist das Spiel kaum zu schaffen.`;
      } else box.textContent = `✔ Team komplett: ${all.map(name).join(' · ')}`;
      return box;
    }
    if (missing.length === 0) box.textContent = `✔ Team komplett: ${all.map(name).join(' · ')}`;
    else if (missing.length <= botSlots) box.textContent = `Bots übernehmen: ${missing.map(name).join(', ')}`;
    else {
      box.classList.add('warn');
      box.textContent = `⚠ Es fehlt: ${missing.slice(botSlots).map(name).join(', ')}. Ohne Tank, Schaden und Support ist das Spiel kaum zu schaffen.`;
    }
    return box;
  }

  /** Skillleiste: Lage, Größe, Deckkraft (verschiebbar über den Griff, gespeichert). */
  private bar: BarLayout = loadBar();

  /** Griff (ziehen = verschieben, Doppelklick = zurücksetzen) und Größenknöpfe der Skillleiste. */
  private barControls(): HTMLElement {
    const box = el('div', 'hud-bar-controls');
    const grip = el('span', 'hud-bar-grip', '⠿');
    grip.title = 'Ziehen: Leiste verschieben · Doppelklick: zurücksetzen';
    const minus = el('button', 'hud-bar-size', '−');
    const plus = el('button', 'hud-bar-size', '+');
    minus.title = 'Leiste verkleinern';
    plus.title = 'Leiste vergrößern';
    minus.addEventListener('click', () => this.setBar({ scale: this.bar.scale - 0.1 }));
    plus.addEventListener('click', () => this.setBar({ scale: this.bar.scale + 0.1 }));
    grip.addEventListener('dblclick', () => this.setBar({ dx: 0, dy: 0 }));
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      grip.setPointerCapture(e.pointerId);
      const start = { x: e.clientX, y: e.clientY, dx: this.bar.dx, dy: this.bar.dy };
      const move = (m: PointerEvent) => this.moveBar(start.dx + m.clientX - start.x, start.dy + m.clientY - start.y, false);
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        saveBar(this.bar);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
    box.append(minus, plus, grip);
    return box;
  }

  /** Leiste verschieben, im Fenster gehalten. */
  private moveBar(dx: number, dy: number, save: boolean): void {
    const rect = this.bottom.getBoundingClientRect();
    if (rect.width > 0) {
      const base = { left: rect.left - this.bar.dx, top: rect.top - this.bar.dy, width: rect.width, height: rect.height };
      ({ dx, dy } = clampOffset(dx, dy, base, { width: window.innerWidth, height: window.innerHeight }));
    }
    this.bar = { ...this.bar, dx, dy };
    this.applyBar();
    if (save) saveBar(this.bar);
  }

  /** Größe, Deckkraft oder Lage ändern und speichern. */
  setBar(change: Partial<BarLayout>): void {
    const b = { ...this.bar, ...change };
    this.bar = {
      ...b,
      scale: Math.round(Math.min(BAR_SCALE.max, Math.max(BAR_SCALE.min, b.scale)) * 100) / 100,
      opacity: Math.min(BAR_OPACITY.max, Math.max(BAR_OPACITY.min, b.opacity)),
    };
    this.applyBar();
    // Nach dem Skalieren wieder ins Fenster holen
    this.moveBar(this.bar.dx, this.bar.dy, true);
  }

  get barLayout(): BarLayout {
    return { ...this.bar };
  }

  private applyBar(): void {
    const { dx, dy, scale, opacity } = this.bar;
    this.bottom.style.transform = `translate(calc(-50% + ${dx}px), ${dy}px) scale(${scale})`;
    this.bottom.style.setProperty('--bar-opacity', String(opacity));
  }

  private crosshair: HTMLElement | null = null;
  private fpState = '';
  /** Ego-Sicht: Fadenkreuz in der Bildmitte, ohne gefangene Maus mit Hinweis. */
  setFirstPerson(active: boolean, locked: boolean): void {
    const key = active ? (locked ? 'locked' : 'free') : '';
    if (key === this.fpState) return;
    this.fpState = key;
    if (!this.crosshair) {
      this.crosshair = el('div', 'hud-crosshair');
      this.crosshair.append(el('i', ''), el('span', 'hud-crosshair-hint', 'Klicken zum Umsehen'));
      this.root.append(this.crosshair);
    }
    this.crosshair.style.display = active ? '' : 'none';
    this.crosshair.classList.toggle('locked', locked);
  }

  private buildBar: HTMLElement | null = null;
  private buildKey = '';
  /**
   * Bauleiste (Pause): Stacheldraht, Barrikade, Feuerfass mit Kosten und
   * Anzahl, Reparieren. null = ausblenden.
   */
  setBuildBar(
    info: { defs: Record<string, { name: string; icon: string; cost: number; max: number; description: string }>; counts: Record<string, number>; active: string | null; gold: number; repair: number } | null,
    on: { select: (kind: string) => void; repair: () => void },
  ): void {
    if (!this.buildBar) {
      this.buildBar = el('div', 'hud-buildbar');
      this.root.append(this.buildBar);
    }
    const key = info ? JSON.stringify(info) : '';
    if (key === this.buildKey) return;
    this.buildKey = key;
    this.buildBar.style.display = info ? '' : 'none';
    if (!info) return;
    const rows: HTMLElement[] = [el('span', 'hud-buildbar-title', `Bauen (${keyName(this.bindings.get('build'))})`)];
    for (const [kind, d] of Object.entries(info.defs)) {
      const n = info.counts[kind] ?? 0;
      const b = el('button', `hud-build-btn${info.active === kind ? ' active' : ''}`);
      b.dataset.build = kind;
      b.title = `${d.description}\nKosten ${d.cost} Gold · höchstens ${d.max}`;
      b.disabled = n >= d.max || info.gold < d.cost;
      b.append(el('span', 'icon', d.icon), el('span', '', d.name), el('small', '', `${d.cost} G · ${n}/${d.max}`));
      b.addEventListener('click', () => on.select(kind));
      rows.push(b);
    }
    const rep = el('button', 'hud-build-btn repair', `🔧 Reparieren${info.repair > 0 ? ` (${info.repair} G)` : ''}`);
    rep.disabled = info.repair <= 0 || info.gold < info.repair;
    rep.addEventListener('click', on.repair);
    rows.push(rep);
    rows.push(el('small', 'hud-buildbar-hint', info.active ? `Linksklick: platzieren · ${keyName(this.bindings.get('rotateBuild'))}: drehen · Esc: abbrechen` : 'Wähle, was du aufstellen willst'));
    this.buildBar.replaceChildren(...rows);
  }

  /** Team-Buffs (von Zwischenbossen) mit Restzeit und Seuche-Stapel des eigenen Helden. */
  private updateBuffBar(h: Hero, time: number): void {
    const chips: [string, string, string][] = [];
    const seen = new Set<string>();
    for (const b of h.buffs) {
      if (!b.source.startsWith('team-') || seen.has(b.source)) continue;
      seen.add(b.source);
      const tb = this.data.zombies.find((z) => z.id === b.source.slice(5))?.teamBuff;
      if (tb) chips.push(['buff', `${tb.icon} ${tb.name} ${Math.ceil(b.until - time)} s`, Object.entries(tb.effects).map(([k, v]) => `${k} ${v}`).join(', ')]);
    }
    if (h.plague && h.plague.until > time) chips.push(['plague', `☣ Seuche ×${h.plague.stacks}`, 'Schaden über Zeit – ein Support in der Nähe oder Reinigen entfernt sie']);
    const key = chips.map((c) => c[1]).join('|');
    if (key === this.buffKey) return;
    this.buffKey = key;
    this.buffBar.replaceChildren(
      ...chips.map(([cls, text, title]) => {
        const c = el('span', `hud-buff ${cls}`, text);
        c.title = title;
        return c;
      }),
    );
  }

  /** Leistungsanzeige oben rechts: Bildrate, Qualitätsstufe, Ping. */
  setPerf(visible: boolean, fps: number, level: string, ping: number | null): void {
    this.perf.style.display = visible ? '' : 'none';
    if (!visible) return;
    const text = `${Math.round(fps)} fps · ${level}${ping !== null ? ` · ${Math.round(ping)} ms` : ''}`;
    if (this.perf.textContent !== text) this.perf.textContent = text;
  }

  /** Laufzeit zum Server (ms) neben dem Raum-Code; grün, gelb, rot je nach Wert. */
  setPing(ms: number | null): void {
    const text = ms === null ? '' : `${Math.round(ms)} ms`;
    if (this.latency.textContent === text) return;
    this.latency.textContent = text;
    this.latency.dataset.quality = ms === null ? '' : ms < 80 ? 'good' : ms < 160 ? 'ok' : 'bad';
  }

  /** Hinweis während eines Verbindungsabbruchs (null blendet aus). */
  setConnection(text: string | null): void {
    this.connection.textContent = text ?? '';
    this.connection.style.display = text ? '' : 'none';
  }

  /** Einladung im Spiel: Raum-Code und Link zum Kopieren (null blendet aus). */
  setInvite(code: string | null, link = ''): void {
    this.invite.replaceChildren();
    this.invite.style.display = code ? '' : 'none';
    if (!code) return;
    const copy = el('button', 'hud-invite-copy', 'Link kopieren');
    copy.addEventListener('click', () => {
      navigator.clipboard?.writeText(link).then(
        () => (copy.textContent = 'Kopiert!'),
        () => window.prompt('Einladungslink:', link),
      );
      setTimeout(() => (copy.textContent = 'Link kopieren'), 2000);
    });
    this.invite.append(el('span', '', `Raum ${code}`), this.latency, copy);
  }

  /** Teamleiste links: Porträt, Name, Mensch/Bot, Level, Leben, Respawn. names: Menschen im Raum nach Helden-Id (Mehrspieler). */
  buildTeam(state: GameState, playerId: number, difficulty: BotDifficulty, names?: Map<number, string>): void {
    this.team.replaceChildren();
    this.teamRows.clear();
    for (const h of state.heroes) {
      const def = this.data.heroes.find((d) => d.id === h.defId)!;
      const row = el('div', 'hud-team-row');
      if (h.id === playerId) row.classList.add('me');
      const img = el('img', 'hud-team-portrait');
      img.src = `portraits/${def.id}.jpg`;
      const level = el('span', 'hud-team-level');
      const info = el('div', 'hud-team-info');
      const name = el('div', 'hud-team-name');
      name.append(el('span', '', def.name), level);
      // Mehrspieler (names gesetzt): Wer nicht in der Raumliste steht, ist ein Bot
      const bot = names ? !names.has(h.id) : !!h.bot;
      const status = el('div', 'hud-team-status', h.id === playerId ? `Du${chosenTitle() ? ` · ${chosenTitle()}` : ''}` : bot ? `Bot (${difficulty})` : (names?.get(h.id) ?? 'Mitspieler'));
      const bar = el('div', 'hud-team-bar');
      const hp = el('div', 'hud-team-hp');
      bar.append(hp);
      info.append(name, status, bar);
      row.append(img, info);
      this.team.append(row);
      const bosses = el('span', 'hud-team-bosses');
      level.before(bosses);
      this.teamRows.set(h.id, { row, hp, level, status, bosses });
    }
  }

  /** Startbildschirm mit Heldenwahl. */
  showStart(onPick: (heroId: string) => void, onDaily?: () => void): void {
    delete this.overlay.dataset.menu;
    this.showInGame(false);
    this.overlay.replaceChildren();
    const box = el('div', 'hud-box hud-start');
    box.append(el('h1', '', 'Zombie-Apokalypse'), el('h2', '', 'auf der Winterburg'));
    if (onDaily) {
      const daily = el('button', 'hud-diff hud-daily-btn', '📅 Tägliche Herausforderung');
      daily.addEventListener('click', onDaily);
      box.append(daily);
    }
    box.append(el('p', '', 'Wähle deinen Helden:'));
    const row = el('div', 'hud-heroes');
    for (const h of this.data.heroes) {
      const btn = el('button', 'hud-hero-btn');
      btn.dataset.hero = h.id;
      const img = el('img', 'hud-hero-portrait');
      img.src = `portraits/${h.id}.jpg`;
      img.alt = h.name;
      btn.append(img, el('strong', '', h.name), this.roleTag(h.id), el('small', 'hud-role', h.role), el('span', 'hud-hero-desc', h.description));
      btn.addEventListener('click', () => onPick(h.id));
      row.append(btn);
    }
    const help = el('p', 'hud-small');
    help.innerHTML = this.controlsText();
    box.append(row, this.unlockPanel(), help);
    this.overlay.append(box);
    this.overlay.style.display = '';
  }

  /**
   * Tägliche Herausforderung: heutiges Team (man spielt den ersten Helden),
   * Schwierigkeit, Mutator und die eigene Bestenliste des Tages.
   */
  showDaily(setup: DailySetup, best: DailyResult[], onStart: () => void, onBack: () => void): void {
    this.overlay.replaceChildren();
    const box = el('div', 'hud-box hud-start hud-daily');
    const ev = this.data.waves.events?.list[setup.event];
    const lv = { entspannt: 'Entspannt', normal: 'Normal', albtraum: 'Albtraum' }[setup.level];
    box.append(el('h1', '', '📅 Tägliche Herausforderung'), el('h2', '', setup.key.split('-').reverse().join('.')));
    const row = el('div', 'hud-heroes');
    setup.heroes.forEach((id, i) => {
      const def = this.data.heroes.find((h) => h.id === id);
      if (!def) return;
      const card = el('div', 'hud-hero-btn');
      const img = el('img', 'hud-hero-portrait');
      img.src = `portraits/${id}.jpg`;
      card.append(img, el('strong', '', def.name), this.roleTag(id), el('small', 'hud-role', i === 0 ? 'Du spielst' : 'Bot'));
      if (i === 0) card.classList.add('active');
      row.append(card);
    });
    box.append(
      row,
      el('p', '', `Schwierigkeit: ${lv} · Mutator: ${ev ? `${ev.icon} ${ev.name} in jeder Welle` : '—'}`),
      el('p', 'hud-small', 'Alle spielen heute dieselbe Partie (gleicher Zufall). Gewertet wird die höchste Welle, bei Gleichstand die kürzere Zeit.'),
    );
    const table = el('table', 'hud-daily-best');
    table.append(el('caption', '', 'Deine Bestenliste heute'));
    if (best.length === 0) {
      const tr = el('tr', '');
      tr.append(el('td', 'hud-small', 'Noch kein Versuch.'));
      table.append(tr);
    }
    best.forEach((r, i) => {
      const tr = el('tr', '');
      tr.append(el('td', '', `${i + 1}.`), el('td', '', r.victory ? '🏆 Sieg' : `Welle ${r.wave}`), el('td', '', formatClock(r.time)), el('td', 'hud-small', r.date.slice(11, 16)));
      table.append(tr);
    });
    const buttons = el('div', 'hud-buttons');
    const back = el('button', 'hud-restart', 'Zurück');
    back.addEventListener('click', onBack);
    const go = el('button', 'hud-restart hud-go', 'Herausforderung starten');
    go.addEventListener('click', onStart);
    buttons.append(back, go);
    box.append(table, buttons);
    this.overlay.append(box);
    this.overlay.style.display = '';
  }

  /**
   * Erfolge und Freischaltbares (Startbildschirm): Liste mit Häkchen bzw.
   * Schloss, Auswahl des Titels und der Laternenfarbe (nur freigeschaltete).
   */
  private unlockPanel(): HTMLElement {
    const box = el('details', 'hud-unlocks');
    const s = loadUnlocks();
    const count = Object.keys(s.done).length;
    box.append(el('summary', '', `🏆 Erfolge ${count}/${ACHIEVEMENTS.length} – Titel und Laternenfarbe`));
    const list = el('div', 'hud-unlock-list');
    for (const a of ACHIEVEMENTS) {
      const got = !!s.done[a.id];
      const item = el('div', `hud-unlock${got ? ' got' : ''}`);
      item.dataset.achievement = a.id;
      const reward = [a.title ? `Titel „${a.title}“` : '', a.lantern ? `Laterne ${a.lantern.name}` : ''].filter(Boolean).join(' · ');
      item.append(el('strong', '', `${got ? '✔' : '🔒'} ${a.name}`), el('small', '', a.how), el('small', 'hud-unlock-reward', reward));
      list.append(item);
    }
    const pick = el('div', 'hud-difficulty hud-unlock-pick');
    const render = () => {
      const cur = loadUnlocks();
      pick.replaceChildren(el('span', '', 'Titel:'));
      for (const a of [null, ...ACHIEVEMENTS.filter((x) => x.title)]) {
        const b = el('button', 'hud-diff', a ? a.title! : 'keiner');
        b.dataset.title = a?.id ?? '';
        b.disabled = !!a && !cur.done[a.id];
        b.classList.toggle('active', cur.title === (a?.id ?? null));
        b.addEventListener('click', () => {
          saveUnlocks({ ...loadUnlocks(), title: a?.id ?? null });
          render();
        });
        pick.append(b);
      }
      pick.append(el('span', '', 'Laterne:'));
      for (const a of [null, ...ACHIEVEMENTS.filter((x) => x.lantern)]) {
        const color = a?.lantern?.color ?? DEFAULT_LANTERN;
        const b = el('button', 'hud-diff hud-swatch', '●');
        b.style.color = `#${color.toString(16).padStart(6, '0')}`;
        b.title = a ? `${a.lantern!.name}${cur.done[a.id] ? '' : ` (🔒 ${a.how})`}` : 'Warm (Standard)';
        b.dataset.lantern = a?.id ?? '';
        b.disabled = !!a && !cur.done[a.id];
        b.classList.toggle('active', cur.lantern === (a?.id ?? null));
        b.addEventListener('click', () => {
          saveUnlocks({ ...loadUnlocks(), lantern: a?.id ?? null });
          render();
        });
        pick.append(b);
      }
    };
    render();
    box.append(list, pick, el('p', 'hud-small', 'Titel und Laterne sind nur auf deinem Bildschirm zu sehen und bleiben im Browser gespeichert.'));
    return box;
  }

  /**
   * Bildschirm nach Spielende: Kopf mit Teamwerten, Podest der besten drei
   * (MVP), Auszeichnungen, sortierbare Rangliste und Kills pro Welle.
   * Die Statistik kommt fertig im gameOver-Ereignis (online für alle gleich).
   */
  showGameOver(state: GameState, end: GameOverInfo, playerId: number, names: Map<number, string> | undefined, onRestart: () => void): void {
    delete this.overlay.dataset.menu;
    this.overlay.replaceChildren();
    const victory = !!end.victory;
    const stats = end.stats ?? fallbackStats(state);
    const team = end.team ?? { wave: state.wave.number, time: state.time, kills: state.kills, bosses: stats.reduce((n, r) => n + r.score.bosses, 0), couriers: 0, food: 0, bedsAlive: 0, beds: 0, hive: null };
    const defOf = (r: FinalHeroStats) => this.data.heroes.find((d) => d.id === r.defId);
    const heroName = (r: FinalHeroStats) => defOf(r)?.name ?? r.defId;
    // Hauptname: „Du“, Spielername oder (bei Bots) der Heldenname; darunter Held bzw. „Bot“
    const who = (r: FinalHeroStats) => (r.heroId === playerId ? 'Du' : (names?.get(r.heroId) ?? heroName(r)));
    const sub = (r: FinalHeroStats) => (who(r) === heroName(r) ? (r.bot ? 'Bot' : 'Mitspieler') : heroName(r));
    const color = (r: FinalHeroStats) => STAT_COLORS[state.heroes.findIndex((h) => h.id === r.heroId) % STAT_COLORS.length] ?? STAT_COLORS[0];
    const portrait = (r: FinalHeroStats, cls: string) => {
      const img = el('img', cls);
      img.src = `portraits/${r.defId}.jpg`;
      img.alt = heroName(r);
      img.style.borderColor = color(r);
      return img;
    };
    const num = (v: number, cls = '') => {
      const e = el('span', `hud-count ${cls}`, '0');
      e.dataset.count = String(Math.round(v));
      return e;
    };

    const box = el('div', `hud-box hud-stats${victory ? ' hud-victory' : ''}`);
    // 1. Kopf
    box.append(el('h1', '', victory ? 'Sieg!' : 'Niederlage'), el('h2', '', end.reason));
    const teamRow = el('div', 'hud-stats-team');
    const pvpScore = state.pvp?.score;
    const teamItems: [string, HTMLElement | string][] = pvpScore
      ? [['Spielzeit', formatClock(team.time)], ['Nord', `${pvpScore[0]}`], ['Süd', `${pvpScore[1]}`]]
      : [
      ['Welle', `${team.wave}${victory ? ' ✔' : ''}`],
      ['Spielzeit', formatClock(team.time)],
      ['Zombies', num(team.kills)],
      ['Bosse', num(team.bosses)],
      ['Postboten', num(team.couriers)],
    ];
    if (!pvpScore) {
      if (team.beds > 0) teamItems.push(['Beete', `${team.bedsAlive}/${team.beds}`]);
      teamItems.push(['Vorrat', `${team.food} %`]);
      if (team.hive !== null) teamItems.push(['Bienenstock', `${team.hive} %`]);
    }
    for (const [label, value] of teamItems) {
      const item = el('div', 'hud-stats-team-item');
      const v = el('b', '');
      v.append(value);
      item.append(v, el('span', '', label));
      teamRow.append(item);
    }
    box.append(teamRow);
    // Speedrun: Bestzeit nur bei Sieg (im Browser gespeichert)
    if (victory && !state.pvp) {
      const { previous, isNew } = recordVictory(team.time, stats.map((r) => r.defId));
      this.bestTime = loadBestTime();
      const line = el('div', `hud-besttime${isNew ? ' new' : ''}`);
      line.textContent = isNew
        ? `⏱ Neue Bestzeit: ${formatClock(team.time)}${previous ? ` (vorher ${formatClock(previous.time)})` : ''}`
        : `⏱ Zeit ${formatClock(team.time)} · Bestzeit ${formatClock(previous!.time)} (+${formatClock(team.time - previous!.time)})`;
      box.append(line);
    }
    // Tägliche Herausforderung: Platz in der Tagesliste
    if (end.dailyRank !== undefined) box.append(el('div', `hud-besttime${end.dailyRank === 1 ? ' new' : ''}`, end.dailyRank ? `📅 Tägliche Herausforderung: Platz ${end.dailyRank} deiner Tagesliste${end.dailyRank === 1 ? ' – neue Bestleistung!' : ''}` : '📅 Tägliche Herausforderung: nicht unter deinen besten 5 heute'));
    // Neue Erfolge (Titel, Laternenfarben)
    for (const a of end.unlocked ?? []) {
      const reward = [a.title ? `Titel „${a.title}“` : '', a.lantern ? `Laterne ${a.lantern.name}` : ''].filter(Boolean).join(' · ');
      box.append(el('div', 'hud-besttime new hud-unlocked', `🏆 Erfolg: ${a.name}${reward ? ` – ${reward}` : ''} (im Startbildschirm wählbar)`));
    }

    // 2. Podest: Platz 2 – 1 – 3
    const podium = el('div', 'hud-podium');
    const medals = ['🥇', '🥈', '🥉'];
    for (const place of [1, 0, 2]) {
      const r = stats[place];
      if (!r) continue;
      const card = el('div', `hud-podium-card place-${place + 1}${r.heroId === playerId ? ' me' : ''}`);
      card.style.setProperty('--hero', color(r));
      if (place === 0) card.append(el('div', 'hud-mvp', 'MVP'));
      card.append(el('div', 'hud-medal', medals[place]), portrait(r, 'hud-podium-portrait'), el('div', 'hud-podium-name', who(r)), el('div', 'hud-podium-hero', `${sub(r)} · Lv ${r.level}`));
      const kda = el('div', 'hud-podium-kda');
      kda.append(num(r.score.bosses), ' / ', num(r.stats.deaths), ' / ', num(r.score.assists));
      const score = el('div', 'hud-podium-score');
      score.append(el('span', '', 'Wertung '), el('b', '', r.mvp.toFixed(1)));
      card.append(kda, el('div', 'hud-small', `Kills / Tode / Assists · ${Math.max(0, r.score.kills - r.score.bosses)} Zombies`), score);
      podium.append(card);
    }
    box.append(podium);

    // 3. Auszeichnungen
    const awards: [string, string, (r: FinalHeroStats) => number, string][] = [
      ['🗡', 'Meiste Kills', (r) => r.score.bosses, ' Bosse'],
      ['🧟', 'Zombiejäger', (r) => Math.max(0, r.score.kills - r.score.bosses), ' Zombies'],
      ['🤝', 'Meiste Assists', (r) => r.score.assists, ''],
      ['💰', 'Meistes Gold', (r) => r.score.gold, ' Gold'],
      ['💥', 'Meister Schaden', (r) => r.stats.damage, ''],
      ['🛡', 'Bollwerk', (r) => r.stats.damageTaken, ' eingesteckt'],
      ['🌿', 'Heiler', (r) => r.stats.healing, ' geheilt'],
      ['🔥', 'Längste Serie', (r) => r.stats.bestStreak, ' Kills'],
    ];
    const awardRow = el('div', 'hud-awards');
    for (const [icon, title, value, unit] of awards) {
      const best = [...stats].sort((a, b) => value(b) - value(a))[0];
      if (!best || value(best) <= 0) continue;
      const tile = el('div', `hud-award${best.heroId === playerId ? ' me' : ''}`);
      tile.style.setProperty('--hero', color(best));
      const text = el('div', 'hud-award-text');
      const v = el('div', 'hud-award-value');
      v.append(num(value(best)), unit);
      text.append(el('div', 'hud-award-title', `${icon} ${title}`), el('div', 'hud-award-who', who(best)), v);
      tile.append(portrait(best, 'hud-award-portrait'), text);
      awardRow.append(tile);
    }
    if (awardRow.childElementCount) box.append(el('h3', 'hud-stats-h', 'Auszeichnungen'), awardRow);

    // 4. Rangliste (Klick auf Spaltenkopf sortiert)
    const columns: { label: string; title: string; value: (r: FinalHeroStats) => number; bar?: boolean; text?: (r: FinalHeroStats) => string }[] = [
      { label: 'K', title: 'Kills (Bosse und Zwischenbosse)', value: (r) => r.score.bosses },
      { label: 'T', title: 'Tode', value: (r) => r.stats.deaths },
      { label: 'A', title: 'Assists', value: (r) => r.score.assists },
      { label: 'Zombies', title: 'Erlegte Zombies (ohne Bosse)', value: (r) => Math.max(0, r.score.kills - r.score.bosses) },
      { label: 'Schaden', title: 'Schaden an Zombies', value: (r) => r.stats.damage, bar: true },
      { label: 'Erlitten', title: 'Erlittener Schaden', value: (r) => r.stats.damageTaken },
      { label: 'Heilung', title: 'Heilung an sich und anderen', value: (r) => r.stats.healing },
      { label: 'Gold', title: 'Verdient / ausgegeben', value: (r) => r.score.gold, text: (r) => `${r.score.gold} / ${r.stats.goldSpent}` },
      { label: 'Lv', title: 'Level', value: (r) => r.level },
      { label: 'Wertung', title: 'Wertung (MVP)', value: (r) => r.mvp, text: (r) => r.mvp.toFixed(1) },
    ];
    const tableWrap = el('div', 'hud-stats-table-wrap');
    let sortBy = columns.length - 1;
    const renderTable = () => {
      const rows = [...stats].sort((a, b) => columns[sortBy].value(b) - columns[sortBy].value(a) || b.mvp - a.mvp);
      const table = el('table', 'hud-stats-table');
      const head = el('tr', '');
      head.append(el('th', '', '#'), el('th', 'left', 'Held'));
      columns.forEach((c, i) => {
        const th = el('th', i === sortBy ? 'sorted' : '', c.label);
        th.title = `${c.title} – klicken zum Sortieren`;
        th.addEventListener('click', () => {
          sortBy = i;
          renderTable();
        });
        head.append(th);
      });
      table.append(head);
      const maxOf = columns.map((c) => Math.max(1, ...stats.map(c.value)));
      rows.forEach((r, rank) => {
        const tr = el('tr', r.heroId === playerId ? 'me' : '');
        const name = el('td', 'left hud-stats-name');
        const label = el('div', '');
        label.append(el('b', '', who(r)), el('span', '', sub(r)));
        name.append(portrait(r, 'hud-score-portrait'), label);
        tr.append(el('td', 'hud-stats-rank', String(rank + 1)), name);
        columns.forEach((c, i) => {
          const td = el('td', i === sortBy ? 'sorted' : '', c.text ? c.text(r) : String(Math.round(c.value(r))));
          if (c.bar) {
            const bar = el('div', 'hud-stats-bar');
            bar.style.width = `${(c.value(r) / maxOf[i]) * 100}%`;
            bar.style.background = color(r);
            td.append(bar);
          }
          tr.append(td);
        });
        table.append(tr);
      });
      tableWrap.replaceChildren(table);
    };
    renderTable();
    box.append(el('h3', 'hud-stats-h', 'Rangliste'), tableWrap);

    // 5. Kills pro Welle
    const chart = killsChart(stats, team.wave, color, (r) => (who(r) === heroName(r) ? who(r) : `${who(r)} (${heroName(r)})`));
    if (chart) box.append(el('h3', 'hud-stats-h', 'Kills pro Welle'), chart);

    const btn = el('button', 'hud-restart', 'Nochmal');
    btn.addEventListener('click', onRestart);
    const buttons = el('div', 'hud-buttons');
    buttons.append(btn);
    box.append(buttons);
    this.overlay.append(box);
    this.overlay.style.display = '';
    countUp(box);
  }

  /** Kurzbeschreibung der Steuerung mit der aktuellen Belegung. */
  private controlsText(): string {
    const k = (a: Parameters<Keybindings['get']>[0]) => `<b>${keyName(this.bindings.get(a))}</b>`;
    return `${k('up')}${k('left')}${k('down')}${k('right')} laufen · <b>Maus</b> zielen · ${k('attack')} angreifen · ${k('ability1')}–${k('ability4')} Fähigkeiten (halten = Vorschau) · ${k('spell1')} ${k('spell2')} Beschwörerzauber · <b>Shift</b>+Taste steigern · <b>Mausrad</b> zoomen · <b>Esc</b> Menü`;
  }

  private updateHelp(): void {
    this.help.innerHTML = this.controlsText();
  }

  get menuOpen(): boolean {
    return this.overlay.dataset.menu === 'settings' && this.overlay.style.display !== 'none';
  }

  /**
   * Menü „Tastenbelegung“: Klick auf eine Taste, dann die neue Taste oder
   * Maustaste drücken. startCapture wartet auf diese Eingabe.
   */
  /** Schadenszahlen über Gegnern anzeigen (Esc-Menü, gespeichert). */
  damageNumbers: boolean = (() => {
    try {
      return localStorage.getItem('winterburg.dmgnums') !== '0';
    } catch {
      return true;
    }
  })();

  /** Ego-Sicht: Kopfwippen beim Laufen (Esc-Menü, gespeichert). */
  headBob: boolean = (() => {
    try {
      return localStorage.getItem('winterburg.headbob') !== '0';
    } catch {
      return true;
    }
  })();

  /** Schwierigkeit für Menschen (Solo; online legt sie der Gastgeber fest). */
  level: GameLevel = (() => {
    try {
      const v = localStorage.getItem('winterburg.level');
      return v === 'entspannt' || v === 'albtraum' ? v : 'normal';
    } catch {
      return 'normal';
    }
  })();

  /** Knopfreihe Entspannt / Normal / Albtraum. */
  private levelRow(current: GameLevel, enabled: boolean, onPick: (l: GameLevel) => void): HTMLElement {
    const row = el('div', 'hud-difficulty hud-gamelevel');
    row.append(el('span', '', 'Schwierigkeit:'));
    const levels = this.data.waves.levels;
    for (const l of ['entspannt', 'normal', 'albtraum'] as GameLevel[]) {
      const lv = levels?.[l];
      const b = el('button', 'hud-diff', lv?.name ?? l);
      b.dataset.level = l;
      b.title = lv ? `Zombies ×${lv.count}, Boss-Leben ×${lv.bossHp}, Schaden ×${lv.damage}` : '';
      b.classList.toggle('active', l === current);
      b.disabled = !enabled;
      b.addEventListener('click', () => onPick(l));
      row.append(b);
    }
    return row;
  }

  /** Ton-Einstellungen fürs Esc-Menü (gesetzt in main.ts). */
  audio: { settings: AudioSettings; apply: () => void } | null = null;

  showSettings(startCapture: (done: (code: string | null) => void) => void, onClose: () => void): void {
    this.overlay.dataset.menu = 'settings';
    const render = () => {
      this.overlay.replaceChildren();
      const box = el('div', 'hud-box');
      box.append(el('h1', '', 'Pause'));
      const table = el('div', 'hud-binds');
      for (const { id, label } of ACTIONS) {
        const btn = el('button', 'hud-key', keyName(this.bindings.get(id)));
        btn.dataset.rebind = id;
        btn.addEventListener('click', () => {
          btn.textContent = 'Taste drücken …';
          btn.classList.add('waiting');
          startCapture((code) => {
            if (code) this.bindings.set(id, code);
            render();
          });
        });
        table.append(el('span', '', label), btn);
      }
      // Grafik: Qualität und Leistungsanzeige
      const q = this.quality;
      if (q) {
        box.append(el('h2', '', 'Grafik'));
        const row = el('div', 'hud-graphics');
        const select = el('select', 'hud-select');
        for (const [value, label] of Object.entries(QUALITY_LABELS)) {
          const opt = el('option', '', label);
          opt.value = value;
          opt.selected = q.setting === value;
          select.append(opt);
        }
        select.addEventListener('change', () => q.set(select.value as QualitySetting));
        const perfLabel = el('label', 'hud-check');
        const perf = el('input', '');
        perf.type = 'checkbox';
        perf.checked = q.showPerf;
        perf.addEventListener('change', () => q.setShowPerf(perf.checked));
        perfLabel.append(perf, el('span', '', ' Leistung anzeigen (fps, Ping)'));
        const dmgLabel = el('label', 'hud-check');
        const dmg = el('input', '');
        dmg.type = 'checkbox';
        dmg.checked = this.damageNumbers;
        dmg.dataset.setting = 'damageNumbers';
        dmg.addEventListener('change', () => {
          this.damageNumbers = dmg.checked;
          try {
            localStorage.setItem('winterburg.dmgnums', dmg.checked ? '1' : '0');
          } catch {
            // ohne Speicher
          }
        });
        dmgLabel.append(dmg, el('span', '', ' Schadenszahlen'));
        const bobLabel = el('label', 'hud-check');
        const bob = el('input', '');
        bob.type = 'checkbox';
        bob.checked = this.headBob;
        bob.dataset.setting = 'headBob';
        bob.addEventListener('change', () => {
          this.headBob = bob.checked;
          try {
            localStorage.setItem('winterburg.headbob', bob.checked ? '1' : '0');
          } catch {
            // ohne Speicher
          }
        });
        bobLabel.append(bob, el('span', '', ' Kopfwippen (Ego-Sicht)'));
        row.append(el('span', '', 'Qualität'), select, perfLabel, dmgLabel, bobLabel);
        box.append(row);
      }
      // Skillleiste: Größe und Deckkraft
      {
        box.append(el('h2', '', 'Skillleiste'));
        const grid = el('div', 'hud-audio');
        const rows: [string, 'scale' | 'opacity', number, number][] = [
          ['Größe', 'scale', BAR_SCALE.min, BAR_SCALE.max],
          ['Deckkraft', 'opacity', BAR_OPACITY.min, BAR_OPACITY.max],
        ];
        for (const [label, key, min, max] of rows) {
          const range = el('input', 'hud-range');
          range.type = 'range';
          range.min = String(Math.round(min * 100));
          range.max = String(Math.round(max * 100));
          range.value = String(Math.round(this.bar[key] * 100));
          range.dataset.bar = key;
          const value = el('span', 'hud-range-value', `${range.value} %`);
          range.addEventListener('input', () => {
            this.setBar({ [key]: Number(range.value) / 100 });
            value.textContent = `${range.value} %`;
          });
          grid.append(el('span', '', label), range, value);
        }
        const reset = el('button', 'hud-key', 'Lage und Größe zurücksetzen');
        reset.addEventListener('click', () => {
          this.setBar({ ...DEFAULT_BAR });
          render();
        });
        box.append(grid, el('p', 'hud-small', 'Verschieben: am Griff ⠿ oben rechts an der Leiste ziehen.'), reset);
      }
      // Ton: Regler je Kanal und Stumm (gespeichert im Browser)
      const a = this.audio;
      if (a) {
        box.append(el('h2', '', 'Ton'));
        const grid = el('div', 'hud-audio');
        const labels: [keyof Omit<AudioSettings, 'muted'>, string][] = [
          ['master', 'Gesamt'],
          ['effects', 'Effekte'],
          ['ambience', 'Umgebung'],
          ['music', 'Musik'],
          ['ui', 'Oberfläche'],
        ];
        for (const [key, label] of labels) {
          const range = el('input', 'hud-range');
          range.type = 'range';
          range.min = '0';
          range.max = '100';
          range.value = String(Math.round(a.settings[key] * 100));
          range.dataset.audio = key;
          const value = el('span', 'hud-range-value', range.value);
          range.addEventListener('input', () => {
            a.settings[key] = Number(range.value) / 100;
            value.textContent = range.value;
            a.apply();
          });
          grid.append(el('span', '', label), range, value);
        }
        const muteLabel = el('label', 'hud-check');
        const mute = el('input', '');
        mute.type = 'checkbox';
        mute.checked = a.settings.muted;
        mute.dataset.audio = 'muted';
        mute.addEventListener('change', () => {
          a.settings.muted = mute.checked;
          a.apply();
        });
        muteLabel.append(mute, el('span', '', ` Stumm (Taste ${keyName(this.bindings.get('mute'))})`));
        box.append(grid, muteLabel);
      }
      const reset = el('button', 'hud-restart', 'Standard wiederherstellen');
      reset.addEventListener('click', () => {
        this.bindings.reset();
        render();
      });
      const resume = el('button', 'hud-restart', 'Weiter');
      resume.addEventListener('click', onClose);
      const buttons = el('div', 'hud-buttons');
      buttons.append(reset, resume);
      box.append(el('h2', '', 'Tastenbelegung'), table, el('p', 'hud-small', 'Fähigkeiten 1–4: halten zeigt die Vorschau, loslassen löst aus. Shift + Taste setzt einen Skillpunkt. R/T: Verbrauchsgüter, F/G: Beschwörerzauber (Rechtsklick auf das Feld in der Pause: tauschen). Esc: weiter spielen.'), buttons);
      this.overlay.append(box);
    };
    render();
    this.overlay.style.display = '';
  }

  hideSettings(): void {
    delete this.overlay.dataset.menu;
    this.overlay.style.display = 'none';
    this.updateHelp();
  }

  startGame(heroDefId: string): void {
    this.overlay.style.display = 'none';
    const def = this.data.heroes.find((h) => h.id === heroDefId)!;
    this.heroDef = def;
    this.heroName.textContent = def.name;
    this.portrait.src = `portraits/${def.id}.jpg`;
    this.buildAbilities(def);
    this.showInGame(true);
  }

  /** 6 Inventarplätze plus R/T für Verbrauchsgüter. */
  private buildInventory(): void {
    this.invSlots = [];
    for (let i = 0; i < this.data.economy.inventorySlots; i++) {
      const slot = el('div', 'hud-inv');
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.onSell(i, false);
      });
      this.tip(slot, () => {
        const id = this.currentHero?.inventory[i];
        const item = id ? this.data.items.find((x) => x.id === id) : undefined;
        return item ? `<b>${item.name}</b><br>${item.description}<br><small>Verkauf (im Shop): Rechtsklick</small>` : 'Freier Platz';
      });
      this.invSlots.push(slot);
      this.inventoryRow.append(slot);
    }
    const actions: Action[] = ['item1', 'item2'];
    this.consumableSlots = actions.map((action, i) => {
      const box = el('div', 'hud-inv consumable');
      const key = el('span', 'hud-inv-key');
      const count = el('span', 'hud-inv-count');
      box.append(key, count);
      box.addEventListener('click', () => this.onUse(i));
      box.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.onSell(i, true);
      });
      this.tip(box, () => {
        const c = this.currentHero?.consumables[i];
        const item = c ? this.data.items.find((x) => x.id === c.itemId) : undefined;
        return item
          ? `<b>${item.name}</b> ×${c!.count}<br>${item.description}<br><small>Benutzen: ${keyName(this.bindings.get(action))} oder Klick</small>`
          : `Item-Taste ${keyName(this.bindings.get(action))}: leer`;
      });
      this.inventoryRow.append(box);
      return { box, key, count };
    });
    // Beschwörerzauber (wie D/F in LoL)
    const spellActions: Action[] = ['spell1', 'spell2'];
    this.spellSlots = spellActions.map((action, i) => {
      const box = el('div', 'hud-inv hud-spell');
      const icon = el('span', 'hud-spell-icon');
      const key = el('span', 'hud-inv-key');
      const cd = el('span', 'hud-spell-cd');
      box.append(icon, key, cd);
      box.addEventListener('click', () => this.onSpell(i));
      // Rechtsklick in der Pause: Zauber tauschen
      box.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.openSpellChooser(i);
      });
      this.tip(box, () => {
        const def = this.data.spells.spells.find((s) => s.id === this.currentHero?.spells?.[i]);
        if (!def) return 'Beschwörerzauber';
        return `<b>${def.icon} ${def.name}</b> (${keyName(this.bindings.get(action))})<br>${def.description}<br><small>Abklingzeit ${def.cooldown} s · Rechtsklick in der Pause: tauschen</small>`;
      });
      this.inventoryRow.append(box);
      return { box, icon, key, cd };
    });
  }

  /**
   * Auswahl der zwei Beschwörerzauber (Startbildschirm und Beitritt): zwei
   * Plätze, darunter alle Zauber; Klick setzt den Zauber auf den gewählten Platz.
   */
  spellPicker(heroId: string, onChange?: (spells: [string, string]) => void): HTMLElement {
    const wrap = el('div', 'hud-spellpick');
    const d = this.data.spells.defaults;
    const role = this.data.bots.heroes[heroId]?.role ?? 'melee';
    const known = (p: [string, string] | null) => p && p[0] !== p[1] && p.every((id) => this.data.spells.spells.some((s) => s.id === id));
    const chosen: [string, string] = [...(known(this.spellPrefs) ? this.spellPrefs! : (d[heroId] ?? d[role]))] as [string, string];
    let active = 0;
    const render = () => {
      this.tooltip.style.display = 'none'; // Tooltip des ersetzten Knopfs nicht stehen lassen
      wrap.replaceChildren(el('span', 'hud-spellpick-title', 'Beschwörerzauber:'));
      const slots = el('div', 'hud-spellpick-slots');
      chosen.forEach((id, i) => {
        const def = this.data.spells.spells.find((s) => s.id === id)!;
        const b = el('button', 'hud-spellpick-slot', `${def.icon} ${def.name}`);
        b.dataset.spellSlot = String(i);
        b.classList.toggle('active', i === active);
        b.title = `${i === 0 ? keyName(this.bindings.get('spell1')) : keyName(this.bindings.get('spell2'))}: ${def.description}`;
        b.addEventListener('click', () => {
          active = i;
          render();
        });
        slots.append(b);
      });
      const grid = el('div', 'hud-spellpick-grid');
      for (const def of this.data.spells.spells) {
        const b = el('button', 'hud-spellpick-btn', def.icon);
        b.dataset.spell = def.id;
        b.style.setProperty('--spell', def.color);
        b.classList.toggle('chosen', chosen.includes(def.id));
        this.tip(b, () => `<b>${def.icon} ${def.name}</b><br>${def.description}<br><small>Abklingzeit ${def.cooldown} s</small>`);
        b.addEventListener('click', () => {
          const other = chosen[1 - active];
          // Schon auf dem anderen Platz: tauschen
          if (other === def.id) chosen[1 - active] = chosen[active];
          chosen[active] = def.id;
          active = 1 - active;
          this.setSpellPrefs([chosen[0], chosen[1]]);
          onChange?.([chosen[0], chosen[1]]);
          render();
        });
        grid.append(b);
      }
      wrap.append(slots, grid);
    };
    this.setSpellPrefs(chosen);
    render();
    return wrap;
  }

  private setSpellPrefs(spells: [string, string]): void {
    this.spellPrefs = [spells[0], spells[1]];
    try {
      localStorage.setItem(SPELL_STORAGE, JSON.stringify(this.spellPrefs));
    } catch {
      // ohne Speicher: nur für diese Sitzung
    }
  }

  /** Im Spiel (Pause): kleines Fenster zum Tauschen der Zauber. */
  private openSpellChooser(slot: number): void {
    const h = this.currentHero;
    if (!h?.spells) return;
    this.spellPrefs = [...h.spells] as [string, string];
    const box = el('div', 'hud-box hud-spellchooser');
    box.append(el('h2', '', 'Beschwörerzauber tauschen'), el('p', 'hud-small', 'Nur in der Pause. Die Abklingzeit des Platzes bleibt erhalten.'));
    const picker = this.spellPicker(h.defId);
    (picker.querySelector(`[data-spell-slot="${slot}"]`) as HTMLButtonElement | null)?.click();
    const ok = el('button', 'hud-restart', 'Übernehmen');
    ok.addEventListener('click', () => {
      if (this.spellPrefs) this.onChooseSpells(this.spellPrefs);
      this.overlay.style.display = 'none';
      this.overlay.replaceChildren();
    });
    box.append(picker, ok);
    this.overlay.replaceChildren(box);
    this.overlay.style.display = '';
  }

  /** Fähigkeitenleiste: Passiv plus vier Felder mit Taste, Abklingzeit, Rang und „+“. */
  private buildAbilities(def: HeroDef): void {
    this.abilityRow.replaceChildren();
    const passive = el('div', 'hud-ability passive');
    passive.append(el('span', 'hud-ability-name', def.passive.name), el('span', 'hud-ability-key', 'Passiv'));
    this.tip(passive, () => `<b>${def.passive.name}</b> (Passiv)<br>${def.passive.description}`);
    this.abilityRow.append(passive);
    this.slots = def.abilities.map((ab, i) => {
      const box = el('div', 'hud-ability');
      const key = el('span', 'hud-ability-key');
      const cd = el('span', 'hud-ability-cd');
      const pips = el('span', 'hud-ability-pips');
      const plus = el('button', 'hud-ability-plus', '+');
      plus.addEventListener('click', () => this.onLevelUp(i));
      box.append(el('span', 'hud-ability-name', ab.name), key, pips, cd, plus);
      this.tip(box, () => this.abilityTip(i));
      this.abilityRow.append(box);
      return { box, key, cd, pips, plus };
    });
  }

  private currentHero: Hero | null = null;

  private abilityTip(slot: number): string {
    const ab = this.heroDef!.abilities[slot];
    const rank = this.currentHero?.ranks[slot] ?? 0;
    const cd = rankValue(ab.cooldown, Math.max(1, rank));
    const head = slot === 3 ? 'Ultimate' : `Fähigkeit ${slot + 1}`;
    return `<b>${ab.name}</b> · ${head} · Rang ${rank}/${slot === 3 ? 3 : 5}<br>${ab.description}<br><small>Abklingzeit ${cd} s${ab.range ? ` · Reichweite ${ab.range} m` : ''}</small>`;
  }

  private tip(target: HTMLElement, html: () => string): void {
    target.addEventListener('mouseenter', () => {
      this.tooltip.innerHTML = html();
      this.tooltip.style.display = 'block';
      const r = target.getBoundingClientRect();
      this.tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - 300, r.left + r.width / 2 - 140))}px`;
      this.tooltip.style.bottom = `${window.innerHeight - r.top + 8}px`;
    });
    target.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
  }

  message(text: string): void {
    this.banner.textContent = text;
    this.banner.classList.add('visible');
    this.bannerTimer = 2.2;
  }

  /** Level, XP und Fähigkeitenleiste des eigenen Helden. */
  private updateHero(h: Hero, canRankUp: (slot: number) => boolean): void {
    this.currentHero = h;
    const prog = this.data.progression;
    this.levelBadge.textContent = String(h.level);
    this.xpFill.style.width = h.level >= prog.maxLevel ? '100%' : `${(100 * h.xp) / prog.xpToNext[h.level - 1]}%`;
    const actions: Action[] = ['ability1', 'ability2', 'ability3', 'ability4'];
    this.slots.forEach((s, i) => {
      s.key.textContent = keyName(this.bindings.get(actions[i]));
      const rank = h.ranks[i];
      const max = i === 3 ? prog.ultMaxRank : prog.basicMaxRank;
      s.pips.textContent = '●'.repeat(rank) + '○'.repeat(max - rank);
      const cd = h.cooldowns[i];
      s.cd.textContent = cd > 0 ? (cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1)) : '';
      s.box.classList.toggle('locked', rank === 0);
      s.box.classList.toggle('cooling', cd > 0);
      s.plus.style.visibility = canRankUp(i) ? 'visible' : 'hidden';
    });
    this.goldLabel.textContent = `${h.gold} Gold`;
    this.invSlots.forEach((slot, i) => {
      const id = h.inventory[i];
      const item = id ? this.data.items.find((x) => x.id === id) : undefined;
      slot.textContent = item?.name ?? '';
      slot.classList.toggle('filled', !!item);
    });
    const itemKeys: Action[] = ['item1', 'item2'];
    this.consumableSlots.forEach((s, i) => {
      const c = h.consumables[i];
      const item = c ? this.data.items.find((x) => x.id === c.itemId) : undefined;
      s.key.textContent = `${keyName(this.bindings.get(itemKeys[i]))}${item ? ` ${item.name}` : ''}`;
      s.count.textContent = c ? `×${c.count}` : '';
      s.box.classList.toggle('filled', !!c);
    });
    this.spellSlots.forEach((s, i) => {
      const def = this.data.spells.spells.find((x) => x.id === h.spells?.[i]);
      const actions: Action[] = ['spell1', 'spell2'];
      if (def && s.icon.textContent !== def.icon) {
        s.icon.textContent = def.icon;
        s.box.style.setProperty('--spell', def.color);
      }
      s.key.textContent = keyName(this.bindings.get(actions[i]));
      const cd = h.spellCooldowns?.[i] ?? 0;
      s.cd.textContent = cd > 0 ? String(Math.ceil(cd)) : '';
      s.box.classList.toggle('cooling', cd > 0);
    });
    this.skillHint.textContent =
      h.skillPoints > 0 ? `${h.skillPoints} Skillpunkt${h.skillPoints > 1 ? 'e' : ''} frei – Shift + Taste oder „+“` : '';
  }

  /** Hinweis „Shop öffnen“, wenn im Innenhof Pause ist. */
  setShopHint(visible: boolean): void {
    this.shopHint.textContent = `${keyName(this.bindings.get('shop'))}: Shop öffnen`;
    this.shopHint.style.display = visible ? '' : 'none';
  }

  update(state: GameState, heroId: number, dt: number, canRankUp: (slot: number) => boolean = () => false): void {
    const w = state.wave;
    const pvp = state.pvp;
    this.waveLabel.textContent = pvp ? 'PvP' : `Welle ${w.number}`;
    this.waveInfo.textContent = pvp
      ? pvp.crate
        ? `📦 Nord ${Math.floor(pvp.crate.points[0])} : ${Math.floor(pvp.crate.points[1])} Süd · Ziel ${pvp.crate.toWin}${pvp.crate.contested ? ' · umkämpft!' : pvp.crate.holder !== null ? ` · ${pvp.crate.holder === 0 ? 'Nord' : 'Süd'} hält die Kiste` : ''} · Kills ${pvp.score[0]} : ${pvp.score[1]}`
        : `Nord ${pvp.score[0]} : ${pvp.score[1]} Süd · Sieg bei ${pvp.killsToWin}`
      : w.phase === 'pause'
        ? `Nächste Welle in ${Math.ceil(w.timer)} s`
        : `Zombies übrig: ${w.queue.length + state.zombies.filter((z) => !z.neutral).length}`;
    // Wellen-Ereignis (Nebelnacht, Blutmond, Regen) neben der Wellennummer
    const ev = !pvp && w.phase === 'wave' && w.event ? this.data.waves.events?.list[w.event] : undefined;
    if (ev) this.waveLabel.textContent = `Welle ${w.number} · ${ev.icon} ${ev.name}`;
    this.waveLabel.dataset.event = ev ? w.event! : '';
    this.startWaveBtn.textContent = `Jetzt starten (${keyName(this.bindings.get('startWave'))})`;
    this.startWaveBtn.style.display = w.phase === 'pause' && !state.gameOver && !pvp ? '' : 'none';
    // PvP: keine Ziele (Vorrat, Stock, Beete) in der Kopfleiste
    for (const { box } of this.objectiveBars.values()) box.style.display = pvp ? 'none' : '';
    this.beds.style.display = pvp ? 'none' : '';
    for (const t of state.heroes) {
      const r = this.teamRows.get(t.id);
      if (!r) continue;
      r.row.style.display = t.benched ? 'none' : '';
      if (pvp) r.row.dataset.team = t.team === 0 ? 'nord' : 'sued';
      r.hp.style.width = `${(100 * t.hp) / t.maxHp}%`;
      r.level.textContent = `Lv ${t.level}`;
      const b = t.score?.bosses ?? 0;
      r.bosses.textContent = b ? `☠ ${b}` : '';
      r.row.classList.toggle('dead', !t.alive);
      if (!t.alive && !state.gameOver) r.status.dataset.respawn = `† ${Math.ceil(t.respawnAt - state.time)} s`;
      else delete r.status.dataset.respawn;
    }
    const bossKills = state.heroes.reduce((n, h) => n + (h.score?.bosses ?? 0), 0);
    const killText = `☠ ${bossKills} · 🧟 ${Math.max(0, state.kills - bossKills)}`;
    if (this.kills.textContent !== killText) {
      this.kills.textContent = killText;
      this.kills.title = 'Kills: erlegte Bosse und Zwischenbosse · Zombies';
    }
    const clock = `⏱ ${formatClock(state.time)}`;
    if (this.clock.textContent !== clock) this.clock.textContent = clock;
    const best = this.bestTime;
    this.clock.title = best ? `Spielzeit · Bestzeit ${formatClock(best.time)}` : 'Spielzeit (Bestzeit nach dem ersten Sieg)';

    const h = state.heroes.find((x) => x.id === heroId);
    if (h) this.updateHero(h, canRankUp);
    if (h) this.updateBuffBar(h, state.time);
    if (h) {
      this.hpFill.style.width = `${(100 * h.hp) / h.maxHp}%`;
      this.hpText.textContent = `${Math.ceil(h.hp)} / ${h.maxHp}`;
      const dead = !h.alive && !state.gameOver;
      this.respawn.style.display = dead ? '' : 'none';
      if (dead) this.respawn.textContent = `Wiederbelebung in ${Math.ceil(h.respawnAt - state.time)} s`;
    }
    for (const o of state.objectives) {
      const bar = this.objectiveBars.get(o.id);
      if (!bar) continue;
      bar.fill.style.width = `${(100 * o.hp) / o.maxHp}%`;
      bar.box.classList.toggle('destroyed', o.destroyed);
      bar.box.classList.toggle('angry', state.time < o.aggroUntil);
    }
    const beds = state.objectives.filter((o) => o.kind === 'bed');
    if (beds.length > 0) {
      const intact = beds.filter((b) => !b.destroyed).length;
      // Ohne Bienenstock wachsen zerstörte Beete nicht mehr nach
      const hiveLost = state.objectives.some((o) => o.kind === 'hive' && o.destroyed);
      // Ohne Beete kein Pollen: Die Bienen hungern und der Stock verliert Leben
      const starving = !hiveLost && intact === 0;
      this.beds.textContent = `Beete ${intact}/${beds.length}${hiveLost ? ' · wachsen nicht nach' : starving ? ' · Bienen hungern' : ''}`;
      this.beds.classList.toggle('withered', hiveLost || starving);
      this.beds.classList.toggle('angry', beds.some((b) => !b.destroyed && b.hp < b.maxHp));
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('visible');
    }
  }
}

/** Spielende, wie es das gameOver-Ereignis liefert. */
export type GameOverInfo = Pick<Extract<GameEvent, { type: 'gameOver' }>, 'reason' | 'victory' | 'stats' | 'team'> & { unlocked?: Achievement[]; dailyRank?: number | null };

/** Linienfarben der Helden (nach Platz im Team, gut lesbar auf dunklem Grund). */
const STAT_COLORS = ['#ffd166', '#7fd1ff', '#ff8a7a', '#9be38a'];

/** Ohne Statistik im Ereignis (älterer Server): aus dem Punktestand. */
function fallbackStats(state: GameState): FinalHeroStats[] {
  return state.heroes
    .map((h) => ({
      heroId: h.id,
      defId: h.defId,
      bot: !!h.bot,
      level: h.level,
      score: { ...h.score },
      stats: { damage: 0, damageTaken: 0, healing: 0, deaths: 0, streak: 0, bestStreak: 0, killsPerWave: [], casts: 0, goldSpent: 0 },
      mvp: h.score.kills + h.score.bosses * 5 + h.score.assists * 0.6,
    }))
    .sort((a, b) => b.mvp - a.mvp);
}

/** Zahlen (data-count) in etwa 0,8 s hochzählen lassen. */
function countUp(root: HTMLElement): void {
  const els = [...root.querySelectorAll<HTMLElement>('[data-count]')];
  const start = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / 800);
    const ease = 1 - (1 - k) ** 3;
    for (const e of els) e.textContent = String(Math.round(Number(e.dataset.count) * ease));
    if (k < 1 && root.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Liniendiagramm „Kills pro Welle“ als SVG (null, wenn es nichts zu zeigen gibt). */
function killsChart(stats: FinalHeroStats[], waves: number, color: (r: FinalHeroStats) => string, label: (r: FinalHeroStats) => string): HTMLElement | null {
  const n = Math.max(waves, ...stats.map((r) => r.stats.killsPerWave.length));
  const max = Math.max(0, ...stats.flatMap((r) => r.stats.killsPerWave));
  if (n < 2 || max <= 0) return null;
  const W = 520;
  const H = 150;
  const pad = { l: 28, r: 8, t: 8, b: 20 };
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'hud-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Kills pro Welle je Held');
  const add = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    svg.append(e);
    return e;
  };
  // Raster: Grundlinie und Höchstwert, Wellen-Nummern unten
  for (const v of [0, Math.ceil(max / 2), max]) {
    add('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' });
    add('text', { x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }, String(v));
  }
  const every = n > 12 ? 2 : 1;
  for (let i = 0; i < n; i += every) add('text', { x: x(i), y: H - 5, 'text-anchor': 'middle', class: 'axis' }, String(i + 1));
  for (const r of stats) {
    const pts = Array.from({ length: n }, (_, i) => `${x(i).toFixed(1)},${y(r.stats.killsPerWave[i] ?? 0).toFixed(1)}`);
    const line = add('polyline', { points: pts.join(' '), fill: 'none', stroke: color(r), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    const title = document.createElementNS(NS, 'title');
    title.textContent = label(r);
    line.append(title);
  }
  const wrap = el('div', 'hud-chart-wrap');
  const legend = el('div', 'hud-chart-legend');
  for (const r of stats) {
    const item = el('span', '');
    const dot = el('i', '');
    dot.style.background = color(r);
    item.append(dot, label(r));
    legend.append(item);
  }
  wrap.append(svg, legend);
  return wrap;
}

