import type { PingKind } from '../sim/types';
import type { Vec2 } from '../sim/vec';

/** Aussehen der Pings: Text, Farbe, Symbol. */
export const PING_STYLE: Record<PingKind, { label: string; color: string; icon: string }> = {
  here: { label: 'Hier!', color: '#ffd166', icon: '!' },
  attack: { label: 'Angriff!', color: '#ff5a4f', icon: '⚔' },
  omw: { label: 'Bin unterwegs', color: '#5ad16a', icon: '➜' },
  help: { label: 'Hilfe!', color: '#5aa9ff', icon: '✋' },
  danger: { label: 'Gefahr!', color: '#ffb020', icon: '⚠' },
  heal: { label: 'Brauche Heilung!', color: '#7bd36a', icon: '✚' },
};

/** Fünf Felder im Kreis (oben beginnend, im Uhrzeigersinn). */
const SECTORS: { kind: PingKind; dx: number; dy: number }[] = (['attack', 'omw', 'heal', 'help', 'danger'] as PingKind[]).map((kind, i) => {
  const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
  return { kind, dx: Math.cos(a), dy: Math.sin(a) };
});
/** Ab so langem Halten (ms) bzw. so viel Mausweg (px) erscheint das Rad. */
const HOLD_MS = 200;
const DRAG_PX = 14;
/** Näher an der Mitte: Abbruch. */
const DEAD_PX = 28;

/**
 * Ping-Geste wie in LoL: kurz klicken = „Hier!“, halten oder ziehen öffnet ein
 * Rad mit vier Pings; die Richtung beim Loslassen wählt, die Mitte bricht ab.
 */
export class PingWheel {
  private readonly root = document.createElement('div');
  private readonly items = new Map<PingKind, HTMLElement>();
  private start: { x: number; y: number; world: Vec2 } | null = null;
  private open = false;
  private choice: PingKind | null = null;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.root.className = 'ping-wheel';
    this.root.style.display = 'none';
    for (const s of SECTORS) {
      const style = PING_STYLE[s.kind];
      const item = document.createElement('div');
      item.className = 'ping-wheel-item';
      item.style.left = `${50 + s.dx * 34}%`;
      item.style.top = `${50 + s.dy * 34}%`;
      item.style.setProperty('--ping', style.color);
      item.innerHTML = `<span>${style.icon}</span><small>${style.label}</small>`;
      this.root.append(item);
      this.items.set(s.kind, item);
    }
    parent.append(this.root);
  }

  get active(): boolean {
    return this.start !== null;
  }

  /** Taste gedrückt: Bildschirmpunkt und Ort am Boden merken. */
  begin(x: number, y: number, world: Vec2): void {
    this.start = { x, y, world };
    this.choice = null;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.show(), HOLD_MS);
  }

  move(x: number, y: number): void {
    if (!this.start) return;
    const dx = x - this.start.x;
    const dy = y - this.start.y;
    if (!this.open && Math.hypot(dx, dy) > DRAG_PX) this.show();
    if (!this.open) return;
    this.choice = null;
    if (Math.hypot(dx, dy) >= DEAD_PX) {
      let best = -Infinity;
      for (const s of SECTORS) {
        const dot = (dx * s.dx + dy * s.dy) / Math.hypot(dx, dy);
        if (dot > best) {
          best = dot;
          this.choice = s.kind;
        }
      }
    }
    for (const [kind, el] of this.items) el.classList.toggle('active', kind === this.choice);
  }

  /** Taste losgelassen: gewählter Ping (oder null bei Abbruch) und sein Ort. */
  end(): { kind: PingKind; pos: Vec2 } | null {
    const start = this.start;
    const result = !start ? null : !this.open ? 'here' : this.choice;
    this.cancel();
    return start && result ? { kind: result, pos: start.world } : null;
  }

  cancel(): void {
    window.clearTimeout(this.timer);
    this.start = null;
    this.open = false;
    this.root.style.display = 'none';
  }

  private show(): void {
    if (!this.start || this.open) return;
    this.open = true;
    this.root.style.left = `${this.start.x}px`;
    this.root.style.top = `${this.start.y}px`;
    this.root.style.display = '';
  }
}
