import type { GameData, GameState } from '../sim/types';
import { ACTIONS, type Keybindings, keyName } from './keybindings';

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
  private readonly kills = el('div', 'hud-kills');
  private readonly bottom = el('div', 'hud-bottom');
  private readonly heroName = el('div', 'hud-hero-name');
  private readonly hpFill = el('div', 'hud-hp-fill');
  private readonly hpText = el('div', 'hud-hp-text');
  private readonly banner = el('div', 'hud-banner');
  private readonly help = el('div', 'hud-help');
  private readonly overlay = el('div', 'hud-overlay');
  private bannerTimer = 0;

  constructor(
    root: HTMLElement,
    private readonly data: GameData,
    private readonly bindings: Keybindings,
  ) {
    this.top.append(this.waveLabel, this.waveInfo, this.kills);
    const hp = el('div', 'hud-hp');
    hp.append(this.hpFill, this.hpText);
    this.bottom.append(this.heroName, hp);
    this.updateHelp();
    root.append(this.top, this.bottom, this.banner, this.help, this.overlay);
    this.showInGame(false);
  }

  private showInGame(visible: boolean): void {
    for (const e of [this.top, this.bottom, this.help]) e.style.display = visible ? '' : 'none';
  }

  /** Startbildschirm mit Heldenwahl. */
  showStart(onPick: (heroId: string) => void): void {
    delete this.overlay.dataset.menu;
    this.showInGame(false);
    this.overlay.replaceChildren();
    const box = el('div', 'hud-box');
    box.append(el('h1', '', 'Zombie-Apokalypse'), el('h2', '', 'auf der Winterburg'), el('p', '', 'Wähle deinen Helden:'));
    const row = el('div', 'hud-heroes');
    for (const h of this.data.heroes) {
      const btn = el('button', 'hud-hero-btn');
      const swatch = el('span', 'hud-swatch');
      swatch.style.background = h.color;
      btn.append(swatch, el('strong', '', h.name), el('small', '', h.attack.type === 'melee' ? 'Nahkampf' : 'Fernkampf'));
      btn.addEventListener('click', () => onPick(h.id));
      row.append(btn);
    }
    const help = el('p', 'hud-small');
    help.innerHTML = this.controlsText();
    box.append(row, help);
    this.overlay.append(box);
    this.overlay.style.display = '';
  }

  showGameOver(state: GameState, onRestart: () => void): void {
    delete this.overlay.dataset.menu;
    this.overlay.replaceChildren();
    const box = el('div', 'hud-box');
    const btn = el('button', 'hud-restart', 'Nochmal');
    btn.addEventListener('click', onRestart);
    box.append(
      el('h1', '', 'Game Over'),
      el('p', '', `Erreicht: Welle ${state.wave.number} · ${state.kills} Zombies erledigt · ${formatTime(state.time)}`),
      btn,
    );
    this.overlay.append(box);
    this.overlay.style.display = '';
  }

  /** Kurzbeschreibung der Steuerung mit der aktuellen Belegung. */
  private controlsText(): string {
    const k = (a: Parameters<Keybindings['get']>[0]) => `<b>${keyName(this.bindings.get(a))}</b>`;
    return `${k('up')}${k('left')}${k('down')}${k('right')} laufen · <b>Maus</b> zielen · ${k('attack')} angreifen · <b>Esc</b> Tastenbelegung`;
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
      box.append(table, el('p', 'hud-small', 'Fähigkeiten folgen mit Meilenstein 3, Items mit Meilenstein 4. Esc: weiter spielen.'), buttons);
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
    this.heroName.textContent = this.data.heroes.find((h) => h.id === heroDefId)?.name ?? '';
    this.showInGame(true);
  }

  message(text: string): void {
    this.banner.textContent = text;
    this.banner.classList.add('visible');
    this.bannerTimer = 2.2;
  }

  update(state: GameState, heroId: number, dt: number): void {
    const w = state.wave;
    this.waveLabel.textContent = `Welle ${w.number}`;
    this.waveInfo.textContent =
      w.phase === 'pause'
        ? `Nächste Welle in ${Math.ceil(w.timer)} s`
        : `Zombies übrig: ${w.queue.length + state.zombies.length}`;
    this.kills.textContent = `Kills: ${state.kills}`;

    const h = state.heroes.find((x) => x.id === heroId);
    if (h) {
      this.hpFill.style.width = `${(100 * h.hp) / h.maxHp}%`;
      this.hpText.textContent = `${Math.ceil(h.hp)} / ${h.maxHp}`;
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
