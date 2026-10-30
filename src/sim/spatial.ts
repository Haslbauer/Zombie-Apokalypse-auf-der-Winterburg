import type { Vec2 } from './vec';

/** Raster-Hash für schnelle Nachbarsuche bei vielen Einheiten. */
export class SpatialHash<T extends { pos: Vec2 }> {
  private buckets = new Map<number, T[]>();

  constructor(private readonly size: number) {}

  private key(cx: number, cy: number): number {
    return cx * 73856093 + cy * 19349663;
  }

  rebuild(items: readonly T[]): void {
    this.buckets.clear();
    for (const item of items) {
      const k = this.key(Math.floor(item.pos.x / this.size), Math.floor(item.pos.y / this.size));
      let bucket = this.buckets.get(k);
      if (!bucket) this.buckets.set(k, (bucket = []));
      bucket.push(item);
    }
  }

  /** Alle Einträge in Zellen, die den Kreis um p mit Radius r berühren. */
  query(p: Vec2, r: number, out: T[] = []): T[] {
    out.length = 0;
    const x0 = Math.floor((p.x - r) / this.size);
    const x1 = Math.floor((p.x + r) / this.size);
    const y0 = Math.floor((p.y - r) / this.size);
    const y1 = Math.floor((p.y + r) / this.size);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const bucket = this.buckets.get(this.key(cx, cy));
        if (bucket) for (const item of bucket) out.push(item);
      }
    }
    return out;
  }
}
