import type { HeroInput, PingKind } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { type Action, type Keybindings, MENU_KEY } from './keybindings';
import { PingWheel } from './pingwheel';
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
  /** Item-Taste R (0) bzw. T (1) gedrückt. */
  onUse: (slot: number) => void = () => {};
  onShop: () => void = () => {};
  onStartWave: () => void = () => {};
  /** Mausrad (deltaY > 0: herauszoomen). */
  onZoom: (deltaY: number) => void = () => {};
  /** Esc zuerst hier anbieten (z. B. Shop schließen); true = erledigt. */
  onEscape: () => boolean = () => false;
  /** Ping an alle (Ping-Taste bzw. rechte Maustaste, auch auf der Minimap). */
  onPing: (kind: PingKind, pos: Vec2) => void = () => {};
  /** Ping-Geste: kurz = „Hier!“, halten = Ping-Rad. */
  readonly pingWheel = new PingWheel(document.body);
  /** Die Minimap rechnet Bildschirmpunkte über ihr in Orte um (null: Maus nicht über der Minimap). */
  minimapPoint: (x: number, y: number) => Vec2 | null = () => null;

  constructor(
    private readonly renderer: GameRenderer,
    private readonly bindings: Keybindings,
  ) {
    const canvas = renderer.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Am ganzen Fenster, damit es auch über Helden-, Team- und Kopfleiste zoomt;
    // nur Menüs, die selbst scrollen (Shop, Start, Pause), behalten das Mausrad.
    window.addEventListener(
      'wheel',
      (e) => {
        if ((e.target as HTMLElement).closest?.('.shop, .hud-overlay')) return;
        e.preventDefault();
        this.onZoom(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY);
      },
      { passive: false },
    );
    canvas.addEventListener('pointerdown', (e) => {
      if (this.capture) return;
      const code = `Mouse${e.button}`;
      if (code === this.bindings.get('ping')) this.beginPing(e.clientX, e.clientY);
      else this.pressed.add(code);
    });
    // Ping-Geste auch über der Minimap (die liegt im HUD, nicht auf dem Canvas)
    window.addEventListener('pointerdown', (e) => {
      if (this.capture || `Mouse${e.button}` !== this.bindings.get('ping') || e.target === canvas) return;
      if (this.minimapPoint(e.clientX, e.clientY)) this.beginPing(e.clientX, e.clientY);
    });
    window.addEventListener('contextmenu', (e) => {
      if (this.minimapPoint(e.clientX, e.clientY)) e.preventDefault();
    });
    window.addEventListener('pointerdown', (e) => {
      if (this.capture && (e.target as HTMLElement).dataset.rebind === undefined) this.finishCapture(`Mouse${e.button}`);
    });
    window.addEventListener('pointerup', (e) => {
      if (`Mouse${e.button}` === this.bindings.get('ping')) this.endPing();
      this.pressed.delete(`Mouse${e.button}`);
    });
    window.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      this.pingWheel.move(e.clientX, e.clientY);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === MENU_KEY) {
        if (this.capture) this.finishCapture(null);
        else if (this.previewSlot !== null) this.previewSlot = null;
        else if (!this.onEscape()) this.onMenu();
        return;
      }
      if (this.capture) {
        e.preventDefault();
        this.finishCapture(e.code);
        return;
      }
      if (e.code === 'Tab') e.preventDefault();
      if (!e.repeat) {
        if (e.code === this.bindings.get('ping')) this.beginPing(this.mouse.x, this.mouse.y);
        if (e.code === this.bindings.get('item1')) this.onUse(0);
        if (e.code === this.bindings.get('item2')) this.onUse(1);
        if (e.code === this.bindings.get('shop')) this.onShop();
        if (e.code === this.bindings.get('startWave')) this.onStartWave();
      }
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
      if (e.code === this.bindings.get('ping')) this.endPing();
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
      this.pingWheel.cancel();
    });
  }

  /** Ping-Geste beginnen: Ort auf der Minimap oder am Boden unter der Maus. */
  private beginPing(x: number, y: number): void {
    const world = this.minimapPoint(x, y) ?? this.renderer.pickGround(x, y);
    if (world) this.pingWheel.begin(x, y, world);
  }

  private endPing(): void {
    const ping = this.pingWheel.end();
    if (ping) this.onPing(ping.kind, ping.pos);
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
    this.pingWheel.cancel();
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
