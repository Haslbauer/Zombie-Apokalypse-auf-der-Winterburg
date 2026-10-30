import type { GameData, GameState } from '../sim/types';

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

  constructor(root: HTMLElement, private readonly data: GameData) {
    this.top.append(this.waveLabel, this.waveInfo, this.kills);
    const hp = el('div', 'hud-hp');
    hp.append(this.hpFill, this.hpText);
    this.bottom.append(this.heroName, hp);
    this.help.innerHTML =
      '<b>Rechtsklick</b> laufen / angreifen · <b>A</b> + Linksklick Attack-Move · <b>S</b> Stopp';
    root.append(this.top, this.bottom, this.banner, this.help, this.overlay);
    this.showInGame(false);
  }

  private showInGame(visible: boolean): void {
    for (const e of [this.top, this.bottom, this.help]) e.style.display = visible ? '' : 'none';
  }

  /** Startbildschirm mit Heldenwahl. */
  showStart(onPick: (heroId: string) => void): void {
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
    box.append(row, el('p', 'hud-small', 'Rechtsklick laufen / angreifen · A + Linksklick Attack-Move · S Stopp'));
    this.overlay.append(box);
    this.overlay.style.display = '';
  }

  showGameOver(state: GameState, onRestart: () => void): void {
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
