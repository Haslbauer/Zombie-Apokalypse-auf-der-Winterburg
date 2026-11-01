import type { Vec2 } from '../sim/vec';

/**
 * Touch-Steuerung für Handy und Tablet: links ein Stick zum Laufen, rechts
 * ein Stick zum Zielen (solange er gezogen wird, greift der Held in diese
 * Richtung an), darum die Fähigkeiten 1–4, die Beschwörerzauber und Knöpfe
 * für Shop und Wellenstart. Fähigkeiten zielen in die letzte Stick-Richtung
 * (bzw. die Blickrichtung des Helden).
 */

/** Auf Touch-Geräten automatisch an (oder mit ?touch erzwingen). */
export function wantsTouch(params: URLSearchParams = new URLSearchParams(location.search)): boolean {
  if (params.has('touch')) return params.get('touch') !== '0';
  try {
    return window.matchMedia?.('(pointer: coarse)').matches === true && navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

/** Stick-Auslenkung (Pixel) in Richtung mit Länge 0..1 umrechnen; innerhalb von dead zählt nicht. */
export function stickVector(dx: number, dy: number, radius: number, dead = 0.18): Vec2 {
  const len = Math.hypot(dx, dy);
  if (len <= 0 || len / radius < dead) return { x: 0, y: 0 };
  const k = Math.min(1, len / radius) / len;
  return { x: dx * k, y: dy * k };
}

interface Stick {
  base: HTMLElement;
  knob: HTMLElement;
  id: number | null;
  cx: number;
  cy: number;
  value: Vec2;
}

const RADIUS = 56;

export class TouchControls {
  readonly root: HTMLElement;
  private readonly left: Stick;
  private readonly right: Stick;
  /** Letzte Zielrichtung (für Fähigkeiten nach dem Loslassen). */
  private lastDir: Vec2 = { x: 0, y: -1 };
  /** Wo der Held steht und wie weit er angreift (für den Zielpunkt). */
  origin: () => { pos: Vec2; range: number } | null = () => null;
  onCast: (slot: number) => void = () => {};
  onSpell: (slot: number) => void = () => {};
  onShop: () => void = () => {};
  onStartWave: () => void = () => {};
  onPing: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.left = this.stick('touch-stick-left');
    this.right = this.stick('touch-stick-right');
    const buttons = document.createElement('div');
    buttons.className = 'touch-buttons';
    const button = (label: string, cls: string, on: () => void) => {
      const b = document.createElement('button');
      b.className = `touch-btn ${cls}`;
      b.textContent = label;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        on();
      });
      buttons.append(b);
      return b;
    };
    ['1', '2', '3', '4'].forEach((l, i) => button(l, `touch-ability touch-a${i + 1}`, () => this.onCast(i)));
    button('F', 'touch-spell touch-f', () => this.onSpell(0));
    button('G', 'touch-spell touch-g', () => this.onSpell(1));
    const top = document.createElement('div');
    top.className = 'touch-top';
    for (const [label, on] of [
      ['🛒', () => this.onShop()],
      ['▶', () => this.onStartWave()],
      ['📍', () => this.onPing()],
    ] as const) {
      const b = document.createElement('button');
      b.className = 'touch-btn touch-small';
      b.textContent = label;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        on();
      });
      top.append(b);
    }
    this.root.append(this.left.base, this.right.base, buttons, top);
    parent.append(this.root);
  }

  private stick(cls: string): Stick {
    const base = document.createElement('div');
    base.className = `touch-stick ${cls}`;
    const knob = document.createElement('div');
    knob.className = 'touch-knob';
    base.append(knob);
    const s: Stick = { base, knob, id: null, cx: 0, cy: 0, value: { x: 0, y: 0 } };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== s.id) return;
      e.preventDefault();
      const v = stickVector(e.clientX - s.cx, e.clientY - s.cy, RADIUS);
      s.value = v;
      knob.style.transform = `translate(${v.x * RADIUS}px, ${v.y * RADIUS}px)`;
      if (s === this.right && (v.x || v.y)) {
        const l = Math.hypot(v.x, v.y);
        this.lastDir = { x: v.x / l, y: v.y / l };
      }
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== s.id) return;
      s.id = null;
      s.value = { x: 0, y: 0 };
      knob.style.transform = '';
      base.classList.remove('active');
    };
    base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = base.getBoundingClientRect();
      s.id = e.pointerId;
      s.cx = r.left + r.width / 2;
      s.cy = r.top + r.height / 2;
      base.setPointerCapture?.(e.pointerId);
      base.classList.add('active');
      move(e);
    });
    base.addEventListener('pointermove', move);
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
    return s;
  }

  set visible(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  /** Laufrichtung (Länge 0..1, Bildschirm-oben = Norden). */
  get move(): Vec2 {
    return { ...this.left.value };
  }

  /** Wird gerade gezielt (rechter Stick ausgelenkt)? */
  get aiming(): boolean {
    return this.right.value.x !== 0 || this.right.value.y !== 0;
  }

  /** Zielpunkt am Boden: vom Helden in Stick-Richtung, so weit wie sein Angriff reicht. */
  aim(): Vec2 | null {
    const o = this.origin();
    if (!o) return null;
    const d = this.lastDir;
    const reach = Math.max(2, o.range);
    return { x: o.pos.x + d.x * reach, y: o.pos.y + d.y * reach };
  }
}
