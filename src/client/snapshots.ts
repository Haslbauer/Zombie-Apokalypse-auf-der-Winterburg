import { DT, type GameState } from '../sim/types';

/** So viele Ticks hinter dem neuesten Zustand wird dargestellt (Puffer gegen Netz-Schwankungen). */
export const RENDER_DELAY = 2;

/**
 * Jitter-Puffer für die Zustände vom Server: Die Darstellungszeit läuft im
 * Server-Takt RENDER_DELAY Ticks hinter dem neuesten Zustand, holt sanft auf
 * bzw. bremst. Dargestellt wird zwischen den beiden Zuständen um diese Zeit.
 * Jeder Zustand gibt seine Ereignisse genau einmal ab, in Tick-Reihenfolge.
 */
export class SnapshotBuffer {
  private buffer: { state: GameState; played: boolean }[] = [];
  /** Aktuelle Darstellungszeit in Ticks (−1: noch keine). */
  renderTick = -1;

  push(state: GameState): void {
    const newest = this.buffer[this.buffer.length - 1];
    // Nach einem Neustart der Partie beginnen die Ticks wieder bei 1
    if (newest && state.tick < newest.state.tick - 20) {
      this.buffer = [];
      this.renderTick = -1;
    }
    // Doppelte oder verspätete Zustände (älter als der neueste) nicht einsortieren
    if (newest && state.tick <= newest.state.tick && state.tick >= newest.state.tick - 20) return;
    this.buffer.push({ state, played: false });
  }

  /** Neuester Zustand (für Abgleich und Tests). */
  get newest(): GameState | undefined {
    return this.buffer[this.buffer.length - 1]?.state;
  }

  get empty(): boolean {
    return this.buffer.length === 0;
  }

  /**
   * Zeit um dt weiterlaufen lassen; onStep bekommt jeden erreichten Zustand
   * (genau einmal). Ergebnis: Zustände vor und nach der Darstellungszeit und
   * der Anteil dazwischen (0–1).
   */
  advance(dt: number, onStep: (state: GameState) => void): { from: GameState; to: GameState; alpha: number } | null {
    const buf = this.buffer;
    if (buf.length === 0) return null;
    const newest = buf[buf.length - 1].state.tick;
    const target = newest - RENDER_DELAY;
    if (this.renderTick < 0 || Math.abs(target - this.renderTick) > 10) this.renderTick = target;
    else this.renderTick += (dt / DT) * (1 + Math.max(-0.2, Math.min(0.2, (target - this.renderTick) * 0.1)));
    this.renderTick = Math.min(this.renderTick, newest);

    for (const b of buf) {
      if (b.played || b.state.tick > this.renderTick) continue;
      b.played = true;
      onStep(b.state);
    }
    let i = buf.findIndex((b) => b.state.tick > this.renderTick);
    if (i < 0) i = buf.length - 1;
    const to = buf[i].state;
    const from = buf[Math.max(0, i - 1)].state;
    // Ältere Zustände werden nicht mehr gebraucht
    if (i > 1) buf.splice(0, i - 1);
    const span = to.tick - from.tick;
    const alpha = span > 0 ? Math.max(0, Math.min(1, (this.renderTick - from.tick) / span)) : 1;
    return { from, to, alpha };
  }
}
