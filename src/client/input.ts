import type { Command, GameState } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import type { GameRenderer } from './renderer';

/** Bei gehaltener rechter Maustaste wird das Laufziel so oft nachgeführt (ms). */
const DRAG_INTERVAL = 120;

/**
 * Maus und Tastatur → Befehle, Steuerung wie in LoL:
 * Rechtsklick laufen/angreifen, A + Linksklick Attack-Move, S Stopp.
 */
export class Input {
  /** A gedrückt: Der nächste Linksklick ist ein Attack-Move. */
  attackMoveArmed = false;
  private rightDown = false;
  private lastDrag = 0;

  constructor(
    private readonly renderer: GameRenderer,
    private readonly getContext: () => { state: GameState; heroId: number } | null,
    private readonly send: (cmd: Command) => void,
    private readonly onMarker: (p: Vec2, attack: boolean) => void,
  ) {
    const canvas = renderer.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.rightDown = false;
    });
    window.addEventListener('keydown', (e) => this.keyDown(e));
  }

  private pointerDown(e: PointerEvent): void {
    const ctx = this.getContext();
    if (!ctx) return;
    if (e.button === 2) {
      this.rightDown = true;
      this.lastDrag = performance.now();
      this.attackMoveArmed = false;
      const zombieIds = new Set(ctx.state.zombies.map((z) => z.id));
      const target = this.renderer.pickUnit(e.clientX, e.clientY, zombieIds);
      if (target !== null) {
        this.send({ heroId: ctx.heroId, type: 'attack', targetId: target });
        return;
      }
      const p = this.renderer.pickGround(e.clientX, e.clientY);
      if (p) {
        this.send({ heroId: ctx.heroId, type: 'moveTo', target: p });
        this.onMarker(p, false);
      }
    } else if (e.button === 0 && this.attackMoveArmed) {
      this.attackMoveArmed = false;
      const p = this.renderer.pickGround(e.clientX, e.clientY);
      if (p) {
        this.send({ heroId: ctx.heroId, type: 'attackMove', target: p });
        this.onMarker(p, true);
      }
    }
    this.updateCursor();
  }

  private pointerMove(e: PointerEvent): void {
    if (!this.rightDown) return;
    const now = performance.now();
    if (now - this.lastDrag < DRAG_INTERVAL) return;
    this.lastDrag = now;
    const ctx = this.getContext();
    const p = this.renderer.pickGround(e.clientX, e.clientY);
    if (ctx && p) this.send({ heroId: ctx.heroId, type: 'moveTo', target: p });
  }

  private keyDown(e: KeyboardEvent): void {
    const ctx = this.getContext();
    if (!ctx || e.repeat) return;
    switch (e.key.toLowerCase()) {
      case 'a':
        this.attackMoveArmed = true;
        break;
      case 's':
        this.attackMoveArmed = false;
        this.send({ heroId: ctx.heroId, type: 'stop' });
        break;
      case 'escape':
        this.attackMoveArmed = false;
        break;
      default:
        return;
    }
    this.updateCursor();
  }

  private updateCursor(): void {
    this.renderer.canvas.style.cursor = this.attackMoveArmed ? 'crosshair' : 'default';
  }
}
