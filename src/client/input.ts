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
        else this.onMenu();
        return;
      }
      if (this.capture) {
        e.preventDefault();
        this.finishCapture(e.code);
        return;
      }
      if (e.code === 'Tab') e.preventDefault();
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code));
    // Fenster verlassen: alles loslassen, sonst läuft der Held weiter.
    window.addEventListener('blur', () => this.pressed.clear());
  }

  /** code null: abgebrochen (Esc). */
  private finishCapture(code: string | null): void {
    const done = this.capture!;
    this.capture = null;
    done(code);
  }

  isDown(action: Action): boolean {
    return this.pressed.has(this.bindings.get(action));
  }

  releaseAll(): void {
    this.pressed.clear();
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
