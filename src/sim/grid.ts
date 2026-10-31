import type { ArenaDef, Obstacle, Shape } from './types';
import { clamp, type Vec2 } from './vec';

/** Abstand, den Wege zu Hindernissen halten (etwa ein Einheitenradius). */
const CLEARANCE = 0.5;
const SQRT2 = Math.SQRT2;
const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];
const NB_DC = NEIGHBORS.map((n) => n[0]);
const NB_DR = NEIGHBORS.map((n) => n[1]);
const NB_COST = NEIGHBORS.map((n) => n[2]);

/**
 * Raster über der Arena: welche Zellen begehbar sind, Pfadsuche (A*),
 * Sichtlinie und Distanzfeld (Flow Field) für viele Zombies.
 */
/** Ränder der begehbaren Fläche. */
export function arenaBounds(arena: ArenaDef): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: arena.minX ?? 0, y0: arena.minY ?? 0, x1: arena.width, y1: arena.height };
}

export class Grid {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  /** Linke obere Ecke des Rasters (Karten mit negativen Koordinaten). */
  readonly x0: number;
  readonly y0: number;
  readonly blocked: Uint8Array;
  private readonly fieldHeap: MinHeap;

  /** clearance: Mindestabstand freier Zellen zu Hindernissen (kleine Einheiten: weniger). */
  constructor(
    readonly arena: ArenaDef,
    readonly clearance = CLEARANCE,
  ) {
    this.cell = arena.cellSize;
    const b = arenaBounds(arena);
    this.x0 = b.x0;
    this.y0 = b.y0;
    this.cols = Math.ceil((b.x1 - b.x0) / this.cell);
    this.rows = Math.ceil((b.y1 - b.y0) / this.cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.fieldHeap = new MinHeap(this.cols * this.rows * 4);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.center(c, r);
        const nearEdge =
          p.x < b.x0 + clearance || p.y < b.y0 + clearance || p.x > b.x1 - clearance || p.y > b.y1 - clearance;
        if (nearEdge || arena.obstacles.some((o) => distanceToObstacle(p, o) < clearance)) {
          this.blocked[r * this.cols + c] = 1;
        }
      }
    }
  }

  center(c: number, r: number): Vec2 {
    return { x: this.x0 + (c + 0.5) * this.cell, y: this.y0 + (r + 0.5) * this.cell };
  }

  cellOf(p: Vec2): number {
    const c = clamp(Math.floor((p.x - this.x0) / this.cell), 0, this.cols - 1);
    const r = clamp(Math.floor((p.y - this.y0) / this.cell), 0, this.rows - 1);
    return r * this.cols + c;
  }

  isBlocked(p: Vec2): boolean {
    return this.blocked[this.cellOf(p)] === 1;
  }

  /** Nächste begehbare Zelle per Breitensuche (für Klicks in Hindernisse). */
  nearestFree(p: Vec2): number {
    const start = this.cellOf(p);
    if (!this.blocked[start]) return start;
    const seen = new Uint8Array(this.blocked.length);
    const queue = [start];
    seen[start] = 1;
    for (let i = 0; i < queue.length; i++) {
      const idx = queue[i];
      if (!this.blocked[idx]) return idx;
      const c = idx % this.cols;
      const r = (idx / this.cols) | 0;
      for (const [dc, dr] of NEIGHBORS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const n = nr * this.cols + nc;
        if (!seen[n]) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    return start;
  }

  /** Freie Sicht zwischen zwei Punkten (keine blockierte Zelle dazwischen). */
  lineOfSight(a: Vec2, b: Vec2): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const steps = Math.ceil(Math.hypot(dx, dy) / (this.cell * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.blocked[this.cellOf({ x: a.x + dx * t, y: a.y + dy * t })]) return false;
    }
    return true;
  }

  /**
   * A* auf dem Raster (8 Richtungen, keine Ecken schneiden), danach geglättet.
   * Liefert Wegpunkte ohne den Startpunkt. Ziel in einem Hindernis wird auf die
   * nächste freie Zelle verschoben. Leere Liste, wenn kein Weg existiert.
   */
  findPath(from: Vec2, to: Vec2): Vec2[] {
    const goal = this.nearestFree(to);
    const goalPoint = this.blocked[this.cellOf(to)] ? this.center(goal % this.cols, (goal / this.cols) | 0) : to;
    if (this.lineOfSight(from, goalPoint)) return [goalPoint];

    const start = this.nearestFree(from);
    const n = this.blocked.length;
    const g = new Float64Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const gc = goal % this.cols;
    const gr = (goal / this.cols) | 0;
    const h = (idx: number): number => {
      const dx = Math.abs((idx % this.cols) - gc);
      const dy = Math.abs(((idx / this.cols) | 0) - gr);
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    };
    const open = new MinHeap();
    g[start] = 0;
    open.push(start, h(start));

    while (open.size > 0) {
      const cur = open.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const c = cur % this.cols;
      const r = (cur / this.cols) | 0;
      for (const [dc, dr, cost] of NEIGHBORS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const nb = nr * this.cols + nc;
        if (this.blocked[nb] || closed[nb]) continue;
        if (dc !== 0 && dr !== 0 && (this.blocked[r * this.cols + nc] || this.blocked[nr * this.cols + c])) continue;
        const ng = g[cur] + cost;
        if (ng < g[nb]) {
          g[nb] = ng;
          parent[nb] = cur;
          open.push(nb, ng + h(nb));
        }
      }
    }
    if (g[goal] === Infinity) return [];

    const cells: Vec2[] = [];
    for (let idx = goal; idx !== start && idx !== -1; idx = parent[idx]) {
      cells.push(this.center(idx % this.cols, (idx / this.cols) | 0));
    }
    cells.reverse();
    cells[cells.length - 1] = goalPoint;
    return this.smooth(from, cells);
  }

  /** Überspringt Wegpunkte, solange freie Sicht besteht (String Pulling). */
  private smooth(from: Vec2, cells: Vec2[]): Vec2[] {
    const out: Vec2[] = [];
    let anchor = from;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.lineOfSight(anchor, cells[j])) j--;
      out.push(cells[j]);
      anchor = cells[j];
      i = j + 1;
    }
    return out;
  }

  /**
   * Distanzfeld (Dijkstra) von einem oder mehreren Zielpunkten aus. Einheiten laufen zur
   * Nachbarzelle mit kleinstem Wert, so kommen viele Zombies mit einer
   * einzigen Berechnung ans Ziel. Mit seedRadius gelten alle freien Zellen in
   * diesem Umkreis als Ziel (z. B. rund um ein Objekt, das selbst blockiert).
   */
  distanceField(targets: Vec2[], seedRadius = 0): Float32Array {
    const { cols, rows, blocked } = this;
    const n = blocked.length;
    const dist = new Float32Array(n).fill(Infinity);
    const open = this.fieldHeap;
    open.clear();
    for (const t of targets) {
      let seeded = false;
      if (seedRadius > 0) {
        const c0 = Math.max(0, Math.floor((t.x - seedRadius - this.x0) / this.cell));
        const c1 = Math.min(cols - 1, Math.floor((t.x + seedRadius - this.x0) / this.cell));
        const r0 = Math.max(0, Math.floor((t.y - seedRadius - this.y0) / this.cell));
        const r1 = Math.min(rows - 1, Math.floor((t.y + seedRadius - this.y0) / this.cell));
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const idx = r * cols + c;
            const p = this.center(c, r);
            if (!blocked[idx] && Math.hypot(p.x - t.x, p.y - t.y) <= seedRadius) {
              dist[idx] = 0;
              open.push(idx, 0);
              seeded = true;
            }
          }
        }
      }
      if (!seeded) {
        const start = this.nearestFree(t);
        dist[start] = 0;
        open.push(start, 0);
      }
    }
    while (open.size > 0) {
      const d = open.peekPrio();
      const cur = open.pop();
      if (d > dist[cur]) continue; // veralteter Eintrag
      const c = cur % cols;
      const r = (cur - c) / cols;
      for (let k = 0; k < 8; k++) {
        const nc = c + NB_DC[k];
        const nr = r + NB_DR[k];
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const nb = nr * cols + nc;
        if (blocked[nb]) continue;
        if (k >= 4 && (blocked[r * cols + nc] || blocked[nr * cols + c])) continue;
        const nd = d + NB_COST[k];
        if (nd < dist[nb]) {
          dist[nb] = nd;
          open.push(nb, nd);
        }
      }
    }
    return dist;
  }

  /** Distanzfeld zu Flächen (Kreise oder Rechtecke): Start sind alle freien Zellen höchstens seed vom Rand entfernt. */
  distanceFieldToShapes(shapes: Obstacle[], seed: number): Float32Array {
    const { cols, rows, blocked } = this;
    const dist = new Float32Array(blocked.length).fill(Infinity);
    const open = this.fieldHeap;
    open.clear();
    for (const s of shapes) {
      const ext = s.kind === 'circle' ? s.r : Math.max(s.w, s.h) / 2;
      const c0 = Math.max(0, Math.floor((s.x - ext - seed - this.x0) / this.cell));
      const c1 = Math.min(cols - 1, Math.floor((s.x + ext + seed - this.x0) / this.cell));
      const r0 = Math.max(0, Math.floor((s.y - ext - seed - this.y0) / this.cell));
      const r1 = Math.min(rows - 1, Math.floor((s.y + ext + seed - this.y0) / this.cell));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const idx = r * cols + c;
          if (!blocked[idx] && dist[idx] > 0 && distanceToObstacle(this.center(c, r), s) <= seed) {
            dist[idx] = 0;
            open.push(idx, 0);
          }
        }
      }
    }
    if (open.size === 0) return this.distanceField(shapes.map((s) => ({ x: s.x, y: s.y })));
    while (open.size > 0) {
      const d = open.peekPrio();
      const cur = open.pop();
      if (d > dist[cur]) continue;
      const c = cur % cols;
      const r = (cur - c) / cols;
      for (let k = 0; k < 8; k++) {
        const nc = c + NB_DC[k];
        const nr = r + NB_DR[k];
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const nb = nr * cols + nc;
        if (blocked[nb]) continue;
        if (k >= 4 && (blocked[r * cols + nc] || blocked[nr * cols + c])) continue;
        const nd = d + NB_COST[k];
        if (nd < dist[nb]) {
          dist[nb] = nd;
          open.push(nb, nd);
        }
      }
    }
    return dist;
  }

  /** Mittelpunkt der Nachbarzelle, die im Distanzfeld am nächsten am Ziel liegt. */
  downhill(field: Float32Array, p: Vec2): Vec2 | null {
    const idx = this.cellOf(p);
    const c = idx % this.cols;
    const r = (idx / this.cols) | 0;
    let best = -1;
    let bestValue = this.blocked[idx] ? Infinity : field[idx];
    for (const [dc, dr] of NEIGHBORS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
      const nb = nr * this.cols + nc;
      if (field[nb] < bestValue) {
        bestValue = field[nb];
        best = nb;
      }
    }
    if (best === -1 && this.blocked[idx]) {
      // In eine gesperrte Zelle geschoben (z. B. Spalt am Rand): erst zur nächsten freien Zelle zurück
      const free = this.nearestFree(p);
      return this.center(free % this.cols, (free / this.cols) | 0);
    }
    return best === -1 ? null : this.center(best % this.cols, (best / this.cols) | 0);
  }
}

/** Abstand eines Punkts zum Rand eines Hindernisses (negativ = innen). */
export function distanceToObstacle(p: Vec2, o: Shape): number {
  if (o.kind === 'circle') return Math.hypot(p.x - o.x, p.y - o.y) - o.r;
  const dx = Math.abs(p.x - o.x) - o.w / 2;
  const dy = Math.abs(p.y - o.y) - o.h / 2;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0);
}

/** Index des Verstecks an diesem Punkt (−1: keins). */
export function brushAt(arena: ArenaDef, p: Vec2): number {
  const list = arena.brush;
  if (!list) return -1;
  for (let i = 0; i < list.length; i++) if (distanceToObstacle(p, list[i]) <= 0) return i;
  return -1;
}

/** Hält ein Hindernis an diesem Punkt Schüsse auf? Niedrige Hindernisse (blocksShots: false) nicht. */
export function shotBlocked(p: Vec2, arena: ArenaDef): boolean {
  const b = arenaBounds(arena);
  if (p.x < b.x0 || p.y < b.y0 || p.x > b.x1 || p.y > b.y1) return true;
  return arena.obstacles.some((o) => o.blocksShots !== false && distanceToObstacle(p, o) < 0);
}

/**
 * Schiebt einen Kreis (Einheit) aus allen Hindernissen und hält ihn in der
 * Arena. Verändert pos direkt.
 */
export function resolveObstacles(pos: Vec2, radius: number, arena: ArenaDef): void {
  for (const o of arena.obstacles) {
    if (o.kind === 'circle') {
      const dx = pos.x - o.x;
      const dy = pos.y - o.y;
      const d = Math.hypot(dx, dy);
      const min = o.r + radius;
      if (d < min) {
        const nx = d > 1e-9 ? dx / d : 1;
        const ny = d > 1e-9 ? dy / d : 0;
        pos.x = o.x + nx * min;
        pos.y = o.y + ny * min;
      }
    } else {
      const hw = o.w / 2;
      const hh = o.h / 2;
      const cx = clamp(pos.x, o.x - hw, o.x + hw);
      const cy = clamp(pos.y, o.y - hh, o.y + hh);
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const d = Math.hypot(dx, dy);
      if (d > 1e-9) {
        if (d < radius) {
          pos.x = cx + (dx / d) * radius;
          pos.y = cy + (dy / d) * radius;
        }
      } else {
        // Mittelpunkt liegt im Rechteck: an der nächsten Kante hinausschieben.
        const left = pos.x - (o.x - hw);
        const right = o.x + hw - pos.x;
        const top = pos.y - (o.y - hh);
        const bottom = o.y + hh - pos.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = o.x - hw - radius;
        else if (m === right) pos.x = o.x + hw + radius;
        else if (m === top) pos.y = o.y - hh - radius;
        else pos.y = o.y + hh + radius;
      }
    }
  }
  const b = arenaBounds(arena);
  pos.x = clamp(pos.x, b.x0 + radius, b.x1 - radius);
  pos.y = clamp(pos.y, b.y0 + radius, b.y1 - radius);
}

/** Binärer Min-Heap über Zellindizes (wächst bei Bedarf). */
class MinHeap {
  private items: Int32Array;
  private prios: Float32Array;
  size = 0;

  constructor(capacity = 1024) {
    this.items = new Int32Array(capacity);
    this.prios = new Float32Array(capacity);
  }

  clear(): void {
    this.size = 0;
  }

  peekPrio(): number {
    return this.prios[0];
  }

  push(item: number, prio: number): void {
    if (this.size === this.items.length) {
      const items = new Int32Array(this.size * 2);
      const prios = new Float32Array(this.size * 2);
      items.set(this.items);
      prios.set(this.prios);
      this.items = items;
      this.prios = prios;
    }
    const { items, prios } = this;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (prios[p] <= prio) break;
      items[i] = items[p];
      prios[i] = prios[p];
      i = p;
    }
    items[i] = item;
    prios[i] = prio;
  }

  pop(): number {
    const { items, prios } = this;
    const top = items[0];
    const n = --this.size;
    if (n > 0) {
      const lastItem = items[n];
      const lastPrio = prios[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && prios[r] < prios[l] ? r : l;
        if (prios[m] >= lastPrio) break;
        items[i] = items[m];
        prios[i] = prios[m];
        i = m;
      }
      items[i] = lastItem;
      prios[i] = lastPrio;
    }
    return top;
  }
}
