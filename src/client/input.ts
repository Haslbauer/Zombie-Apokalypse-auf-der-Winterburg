import type { HeroInput } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { type Action, type Keybindings, MENU_KEY } from './keybindings';
import type { GameRenderer } from './renderer';

/**
 * Tastatur und Maus, Steuerung wie in Supervive: WASD laufen, Maus zielt,
 * Angriff in Richtung Mauszeiger. Alle Tasten kommen aus den Keybindings.
 */
export class Input {
  private readonly pressed = new Set<string>();
  private mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  private aim: Vec2 = { x: 0, y: 0 };
  /** Gesetzt, während im Menü auf eine neue Taste gewartet wird. */
  capture: ((code: string | null) => void) | null = null;
  /** Wird bei Esc aufgerufen. */
  onMenu: () => void = () => {};
  /** Fähigkeit, deren Taste gerade gehalten wird (Vorschau), sonst null. */
  previewSlot: number | null = null;
  /** Fähigkeit auslösen (Taste losgelassen) bzw. steigern (Shift + Taste). */
  onCast: (slot: number) => void = () => {};
  onLevelUp: (slot: number) => void = () => {};

  constructor(
    private readonly renderer: GameRenderer,
    private readonly bindings: Keybindings,
  ) {
    const canvas = renderer.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.capture) this.pressed.add(`Mouse${e.button}`);
    });
    window.addEventListener('pointerdown', (e) => {
      if (this.capture && (e.target as HTMLElement).dataset.rebind === undefined) this.finishCapture(`Mouse${e.button}`);
    });
    window.addEventListener('pointerup', (e) => this.pressed.delete(`Mouse${e.button}`));
    window.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === MENU_KEY) {
        if (this.capture) this.finishCapture(null);
        else if (this.previewSlot !== null) this.previewSlot = null;
        else this.onMenu();
        return;
      }
      if (this.capture) {
        e.preventDefault();
        this.finishCapture(e.code);
        return;
      }
      if (e.code === 'Tab') e.preventDefault();
      const slot = this.abilitySlot(e.code);
      if (slot !== null && !e.repeat) {
        e.preventDefault();
        // Shift + Taste: Skillpunkt setzen (Strg + Zahl wechselt im Browser den Tab).
        if (e.shiftKey) this.onLevelUp(slot);
        else this.previewSlot = slot;
      }
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.pressed.delete(e.code);
      const slot = this.abilitySlot(e.code);
      if (slot !== null && slot === this.previewSlot) {
        this.previewSlot = null;
        this.onCast(slot);
      }
    });
    // Fenster verlassen: alles loslassen, sonst läuft der Held weiter.
    window.addEventListener('blur', () => {
      this.pressed.clear();
      this.previewSlot = null;
    });
  }

  /** code null: abgebrochen (Esc). */
  private finishCapture(code: string | null): void {
    const done = this.capture!;
    this.capture = null;
    done(code);
  }

  /** Welche Fähigkeit (0–3) liegt auf dieser Taste? */
  private abilitySlot(code: string): number | null {
    const actions: Action[] = ['ability1', 'ability2', 'ability3', 'ability4'];
    const i = actions.findIndex((a) => this.bindings.get(a) === code);
    return i >= 0 ? i : null;
  }

  /** Aktueller Zielpunkt der Maus am Boden. */
  get aimPoint(): Vec2 {
    return { ...this.aim };
  }

  isDown(action: Action): boolean {
    return this.pressed.has(this.bindings.get(action));
  }

  releaseAll(): void {
    this.pressed.clear();
    this.previewSlot = null;
  }

  /** Aktueller Eingabezustand. W ist Norden (−y), passend zur festen Kamera. */
  read(): HeroInput {
    const move = {
      x: (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0),
      y: (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0),
    };
    const len = Math.hypot(move.x, move.y);
    if (len > 0) {
      move.x /= len;
      move.y /= len;
    }
    // Jedes Mal neu berechnen: Die Kamera läuft mit, auch wenn die Maus stillsteht.
    this.aim = this.renderer.pickGround(this.mouse.x, this.mouse.y) ?? this.aim;
    return { move, aim: { ...this.aim }, attack: this.isDown('attack') };
  }
}
