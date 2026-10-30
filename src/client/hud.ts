import { rankValue } from '../sim/abilities';
import { defaultTeam } from '../sim/bots/team';
import type { BotDifficulty, GameData, GameState, Hero, HeroDef } from '../sim/types';
import { type Action, ACTIONS, type Keybindings, keyName } from './keybindings';

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
  readonly startWaveBtn = el('button', 'hud-start-wave');
  private readonly team = el('div', 'hud-team');
  private readonly beds = el('div', 'hud-objective');
  private teamRows = new Map<number, { row: HTMLElement; hp: HTMLElement; level: HTMLElement; status: HTMLElement }>();
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
  private readonly tooltip = el('div', 'hud-tooltip');
  private slots: { box: HTMLElement; key: HTMLElement; cd: HTMLElement; pips: HTMLElement; plus: HTMLElement }[] = [];
  private heroDef: HeroDef | null = null;
  /** Skillpunkt per Klick auf „+“ setzen. */
  onLevelUp: (slot: number) => void = () => {};
  private readonly banner = el('div', 'hud-banner');
  private readonly help = el('div', 'hud-help');
  private readonly overlay = el('div', 'hud-overlay');
  private bannerTimer = 0;

  constructor(
    root: HTMLElement,
    private readonly data: GameData,
    private readonly bindings: Keybindings,
  ) {
    this.top.append(this.waveLabel, this.waveInfo, this.startWaveBtn, this.kills);
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
    this.bottom.append(head, this.abilityRow, this.inventoryRow, this.skillHint);
    this.shopHint.style.display = 'none';
    root.append(this.shopHint, this.team);
    this.updateHelp();
    root.append(this.top, this.bottom, this.banner, this.respawn, this.help, this.overlay, this.tooltip);
    this.showInGame(false);
  }

  private showInGame(visible: boolean): void {
    for (const e of [this.top, this.bottom, this.help, this.team]) e.style.display = visible ? '' : 'none';
    if (!visible) this.respawn.style.display = 'none';
  }

  /**
   * Zweiter Schritt: Team mit drei Bots (Klick tauscht reihum durch die freien
   * Helden) und Bot-Stärke wählen, dann „Los!“.
   */
  showTeam(playerId: string, onStart: (bots: string[], difficulty: BotDifficulty) => void, onBack: () => void): void {
    this.overlay.replaceChildren();
    const team = defaultTeam(this.data.bots, playerId);
    let difficulty: BotDifficulty = 'mittel';
    const box = el('div', 'hud-box hud-start');
    box.append(el('h1', '', 'Dein Team'), el('p', '', 'Drei Bots spielen mit. Klick auf eine Bot-Karte tauscht den Helden.'));
    const row = el('div', 'hud-heroes');
    const card = (id: string, label: string) => {
      const def = this.data.heroes.find((h) => h.id === id)!;
      const btn = el('button', 'hud-hero-btn');
      const img = el('img', 'hud-hero-portrait');
      img.src = `portraits/${def.id}.jpg`;
      btn.append(img, el('strong', '', def.name), el('small', 'hud-role', def.role), el('span', 'hud-hero-desc', label));
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
    };
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
    const go = el('button', 'hud-restart hud-go', 'Los!');
    go.addEventListener('click', () => onStart([...team], difficulty));
    buttons.append(back, go);
    box.append(row, diffRow, buttons);
    this.overlay.append(box);
    this.overlay.style.display = '';
  }

  /** Teamleiste links: Porträt, Name, Mensch/Bot, Level, Leben, Respawn. */
  buildTeam(state: GameState, playerId: number, difficulty: BotDifficulty): void {
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
      const status = el('div', 'hud-team-status', h.bot ? `Bot (${difficulty})` : 'Du');
      const bar = el('div', 'hud-team-bar');
      const hp = el('div', 'hud-team-hp');
      bar.append(hp);
      info.append(name, status, bar);
      row.append(img, info);
      this.team.append(row);
      this.teamRows.set(h.id, { row, hp, level, status });
    }
  }

  /** Startbildschirm mit Heldenwahl. */
  showStart(onPick: (heroId: string) => void): void {
    delete this.overlay.dataset.menu;
    this.showInGame(false);
    this.overlay.replaceChildren();
    const box = el('div', 'hud-box hud-start');
    box.append(el('h1', '', 'Zombie-Apokalypse'), el('h2', '', 'auf der Winterburg'), el('p', '', 'Wähle deinen Helden:'));
    const row = el('div', 'hud-heroes');
    for (const h of this.data.heroes) {
      const btn = el('button', 'hud-hero-btn');
      btn.dataset.hero = h.id;
      const img = el('img', 'hud-hero-portrait');
      img.src = `portraits/${h.id}.jpg`;
      img.alt = h.name;
      btn.append(img, el('strong', '', h.name), el('small', 'hud-role', h.role), el('span', 'hud-hero-desc', h.description));
      btn.addEventListener('click', () => onPick(h.id));
      row.append(btn);
    }
    const help = el('p', 'hud-small');
    help.innerHTML = this.controlsText();
    box.append(row, help);
    this.overlay.append(box);
    this.overlay.style.display = '';
  }

  showGameOver(state: GameState, reason: string, onRestart: () => void): void {
    delete this.overlay.dataset.menu;
    this.overlay.replaceChildren();
    const box = el('div', 'hud-box');
    const btn = el('button', 'hud-restart', 'Nochmal');
    btn.addEventListener('click', onRestart);
    box.append(
      el('h1', '', 'Game Over'),
      el('h2', '', reason),
      el('p', '', `Erreicht: Welle ${state.wave.number} · ${state.kills} Zombies erledigt · ${formatTime(state.time)}`),
      btn,
    );
    this.overlay.append(box);
    this.overlay.style.display = '';
  }

  /** Kurzbeschreibung der Steuerung mit der aktuellen Belegung. */
  private controlsText(): string {
    const k = (a: Parameters<Keybindings['get']>[0]) => `<b>${keyName(this.bindings.get(a))}</b>`;
    return `${k('up')}${k('left')}${k('down')}${k('right')} laufen · <b>Maus</b> zielen · ${k('attack')} angreifen · ${k('ability1')}–${k('ability4')} Fähigkeiten (halten = Vorschau) · <b>Shift</b>+Taste steigern · <b>Esc</b> Menü`;
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
  showSettings(startCapture: (done: (code: string | null) => void) => void, onClose: () => void): void {
    this.overlay.dataset.menu = 'settings';
    const render = () => {
      this.overlay.replaceChildren();
      const box = el('div', 'hud-box');
      box.append(el('h1', '', 'Pause'), el('h2', '', 'Tastenbelegung'));
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
      const reset = el('button', 'hud-restart', 'Standard wiederherstellen');
      reset.addEventListener('click', () => {
        this.bindings.reset();
        render();
      });
      const resume = el('button', 'hud-restart', 'Weiter');
      resume.addEventListener('click', onClose);
      const buttons = el('div', 'hud-buttons');
      buttons.append(reset, resume);
      box.append(table, el('p', 'hud-small', 'Fähigkeiten 1–4: halten zeigt die Vorschau, loslassen löst aus. Shift + Taste setzt einen Skillpunkt. Items (R/T) folgen mit Meilenstein 4. Esc: weiter spielen.'), buttons);
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
    this.waveLabel.textContent = `Welle ${w.number}`;
    this.waveInfo.textContent =
      w.phase === 'pause'
        ? `Nächste Welle in ${Math.ceil(w.timer)} s`
        : `Zombies übrig: ${w.queue.length + state.zombies.length}`;
    this.startWaveBtn.textContent = `Jetzt starten (${keyName(this.bindings.get('startWave'))})`;
    this.startWaveBtn.style.display = w.phase === 'pause' && !state.gameOver ? '' : 'none';
    for (const t of state.heroes) {
      const r = this.teamRows.get(t.id);
      if (!r) continue;
      r.hp.style.width = `${(100 * t.hp) / t.maxHp}%`;
      r.level.textContent = `Lv ${t.level}`;
      r.row.classList.toggle('dead', !t.alive);
      if (!t.alive && !state.gameOver) r.status.dataset.respawn = `† ${Math.ceil(t.respawnAt - state.time)} s`;
      else delete r.status.dataset.respawn;
    }
    this.kills.textContent = `Kills: ${state.kills}`;

    const h = state.heroes.find((x) => x.id === heroId);
    if (h) this.updateHero(h, canRankUp);
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
      this.beds.textContent = `Beete ${intact}/${beds.length}`;
      this.beds.classList.toggle('angry', beds.some((b) => !b.destroyed && b.hp < b.maxHp));
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('visible');
    }
  }
}

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
}
