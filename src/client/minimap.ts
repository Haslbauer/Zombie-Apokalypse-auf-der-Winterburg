import { arenaBounds } from '../sim/grid';
import { zombieRevealed } from './renderer';
import type { GameData, GameState } from '../sim/types';
import type { Vec2 } from '../sim/vec';

/** Größe der Minimap in CSS-Pixeln (die längere Seite der Karte). */
const SIZE = 210;
/** So oft pro Sekunde neu zeichnen. */
const REDRAW = 0.1;
/** So lange blinkt ein Ping auf der Minimap (s). */
const PING_TIME = 3;

const COLORS = {
  outside: '#3f6b34',
  garden: '#6ea84c',
  house: '#c9b48a',
  ruin: '#8f8270',
  hedge: '#2f5f2a',
  fence: '#8a6a45',
  blocked: '#557f42',
  bunker: '#8d8d86',
  brush: '#2e5a26',
  reed: '#4f6f52',
  water: '#4d8592',
  rock: '#8a8a82',
  grave: '#c8c8c0',
  cobbles: '#9a9286',
  prop: '#7a5f43',
  tree: '#2d6b2a',
  path: '#7a5f43',
  camp: '#5b4632',
  bed: '#7a5634',
  bedDead: '#555',
  food: '#ff6b8a',
  hive: '#ffcf33',
  zombie: '#ff3b30',
  elite: '#ff9f1c',
  neutral: '#b9b9b9',
  courier: '#ffd166',
};

/**
 * Minimap unten rechts (wie in LoL): Garten, Gelände, Ziele, Helden, Zombies,
 * Lager, Pings und der sichtbare Ausschnitt. Rechtsklick setzt einen Ping.
 */
export class Minimap {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bg = document.createElement('canvas');
  private readonly b: { x0: number; y0: number; x1: number; y1: number };
  private readonly scale: number;
  private readonly ratio = Math.min(2, window.devicePixelRatio || 1);
  private readonly pings: { pos: Vec2; color: string; until: number }[] = [];
  private since = REDRAW;
  private clock = 0;

  constructor(
    parent: HTMLElement,
    private readonly data: GameData,
  ) {
    const arena = data.arena;
    this.b = arenaBounds(arena);
    const w = this.b.x1 - this.b.x0;
    const h = this.b.y1 - this.b.y0;
    this.scale = SIZE / Math.max(w, h);
    for (const c of [this.canvas, this.bg]) {
      c.width = Math.round(w * this.scale * this.ratio);
      c.height = Math.round(h * this.scale * this.ratio);
    }
    this.canvas.style.width = `${Math.round(w * this.scale)}px`;
    this.canvas.style.height = `${Math.round(h * this.scale)}px`;
    this.canvas.className = 'hud-minimap';
    this.canvas.style.display = 'none';
    this.ctx = this.canvas.getContext('2d')!;
    this.drawBackground();
    parent.append(this.canvas);
  }

  set visible(v: boolean) {
    this.canvas.style.display = v ? '' : 'none';
  }

  /** Bildschirmpunkt → Ort auf der Karte (null: nicht über der Minimap). */
  worldAt(clientX: number, clientY: number): Vec2 | null {
    if (this.canvas.style.display === 'none') return null;
    const r = this.canvas.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
    return {
      x: this.b.x0 + ((clientX - r.left) / r.width) * (this.b.x1 - this.b.x0),
      y: this.b.y0 + ((clientY - r.top) / r.height) * (this.b.y1 - this.b.y0),
    };
  }

  ping(pos: Vec2, color: string): void {
    this.pings.push({ pos: { ...pos }, color, until: this.clock + PING_TIME });
  }

  /** view: Ecken des sichtbaren Bodens (Kameraausschnitt), im Uhrzeigersinn. */
  update(dt: number, state: GameState, heroId: number, view: Vec2[]): void {
    this.clock += dt;
    this.since += dt;
    if (this.since < REDRAW) return;
    this.since = 0;
    const c = this.ctx;
    const k = this.scale * this.ratio;
    const px = (p: Vec2) => [(p.x - this.b.x0) * k, (p.y - this.b.y0) * k] as const;
    const dot = (p: Vec2, r: number, fill: string, stroke?: string) => {
      const [x, y] = px(p);
      c.beginPath();
      c.arc(x, y, r * this.ratio, 0, Math.PI * 2);
      c.fillStyle = fill;
      c.fill();
      if (stroke) {
        c.lineWidth = 1.5 * this.ratio;
        c.strokeStyle = stroke;
        c.stroke();
      }
    };
    c.drawImage(this.bg, 0, 0);

    // Ziele: Vorrat und Bienenstock mit Lebensfarbe, Beete (zerstörte grau)
    for (const o of state.objectives) {
      if (o.kind === 'bed') {
        const def = this.data.arena.objectives.find((d) => d.id === o.id);
        if (!def?.w || !def.h) continue;
        const [x, y] = px({ x: o.pos.x - def.w / 2, y: o.pos.y - def.h / 2 });
        c.fillStyle = o.destroyed ? COLORS.bedDead : COLORS.bed;
        c.fillRect(x, y, def.w * k, def.h * k);
      } else {
        const color = o.kind === 'food' ? COLORS.food : COLORS.hive;
        dot(o.pos, 4.5, o.destroyed ? COLORS.bedDead : color, '#000');
      }
    }

    // Zombies, Lager, Postbote
    const blink = Math.sin(this.clock * 8) > 0;
    for (const z of state.zombies) {
      if (!zombieRevealed(this.data, state, z)) continue;
      const def = this.data.zombies.find((d) => d.id === z.defId);
      if (z.courier) dot(z.pos, blink ? 4 : 3, COLORS.courier, '#000');
      else if (z.neutral) dot(z.pos, def?.rank ? 2.6 : 1.8, COLORS.neutral);
      else if (def?.rank) dot(z.pos, 3, COLORS.elite);
      else dot(z.pos, 1.6, COLORS.zombie);
    }

    // Helden: Farbe des Helden, eigener mit weißem Rand, Gefallene als Kreuz
    for (const h of state.heroes) {
      const color = this.data.heroes.find((d) => d.id === h.defId)?.color ?? '#fff';
      if (!h.alive) {
        const [x, y] = px(h.pos);
        const s = 3 * this.ratio;
        c.strokeStyle = color;
        c.lineWidth = 2 * this.ratio;
        c.beginPath();
        c.moveTo(x - s, y - s);
        c.lineTo(x + s, y + s);
        c.moveTo(x + s, y - s);
        c.lineTo(x - s, y + s);
        c.stroke();
      } else dot(h.pos, h.id === heroId ? 4.5 : 3.8, color, h.id === heroId ? '#fff' : '#000');
    }

    // Kameraausschnitt
    if (view.length === 4) {
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 1 * this.ratio;
      c.beginPath();
      view.forEach((p, i) => (i === 0 ? c.moveTo(...px(p)) : c.lineTo(...px(p))));
      c.closePath();
      c.stroke();
    }

    // Pings: pulsierende Ringe
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      const left = p.until - this.clock;
      if (left <= 0) {
        this.pings.splice(i, 1);
        continue;
      }
      const phase = (this.clock * 2) % 1;
      const [x, y] = px(p.pos);
      c.strokeStyle = p.color;
      c.globalAlpha = Math.min(1, left);
      c.lineWidth = 2 * this.ratio;
      c.beginPath();
      c.arc(x, y, (4 + phase * 8) * this.ratio, 0, Math.PI * 2);
      c.stroke();
      dot(p.pos, 3, p.color);
      c.globalAlpha = 1;
    }
  }

  /** Feste Teile der Karte einmal vorzeichnen. */
  private drawBackground(): void {
    const c = this.bg.getContext('2d')!;
    const arena = this.data.arena;
    const k = this.scale * this.ratio;
    const rect = (x: number, y: number, w: number, h: number, color: string) => {
      c.fillStyle = color;
      c.fillRect((x - w / 2 - this.b.x0) * k, (y - h / 2 - this.b.y0) * k, Math.max(1, w * k), Math.max(1, h * k));
    };
    c.fillStyle = COLORS.outside;
    c.fillRect(0, 0, this.bg.width, this.bg.height);
    const g = arena.garden;
    if (g) rect(g.x, g.y, g.w, g.h, COLORS.garden);
    for (const p of arena.paths ?? []) rect(p.x, p.y, p.w, p.h, COLORS.path);
    for (const d of arena.decor ?? []) if (d.look !== 'gravefence') rect(d.x, d.y, d.w, d.h, d.look === 'cobbles' ? COLORS.cobbles : COLORS.path);
    // Verstecke: dunkleres Grün (Schilf bläulich)
    for (const b of arena.brush ?? []) {
      c.fillStyle = b.look === 'reed' ? COLORS.reed : COLORS.brush;
      if (b.kind === 'circle') {
        c.beginPath();
        c.arc((b.x - this.b.x0) * k, (b.y - this.b.y0) * k, b.r * k, 0, Math.PI * 2);
        c.fill();
      } else rect(b.x, b.y, b.w, b.h, c.fillStyle as string);
    }
    // Bunker-Luke
    const bunker = arena.spawnPoints.find((s) => s.id === 'bunker');
    if (bunker) rect(bunker.x, bunker.y, 3, 2.4, COLORS.bunker);
    for (const camp of arena.camps ?? []) {
      c.fillStyle = COLORS.camp;
      c.beginPath();
      c.arc((camp.x - this.b.x0) * k, (camp.y - this.b.y0) * k, 3 * k, 0, Math.PI * 2);
      c.fill();
    }
    for (const o of arena.obstacles) {
      if (o.kind === 'circle') {
        if (o.look === 'objective' || o.look === 'lamp') continue;
        c.fillStyle = o.look === 'pond' ? COLORS.water : o.look === 'rock' ? COLORS.rock : COLORS.tree;
        c.beginPath();
        c.arc((o.x - this.b.x0) * k, (o.y - this.b.y0) * k, o.r * k, 0, Math.PI * 2);
        c.fill();
        continue;
      }
      const look = o.look ?? 'hedge';
      if (look === 'rathole') {
        // Rattenloch: kleiner dunkler Punkt in der Mauer
        c.fillStyle = '#1a1210';
        c.beginPath();
        c.arc((o.x - this.b.x0) * k, (o.y - this.b.y0) * k, Math.max(1.5 * this.ratio, 0.5 * k), 0, Math.PI * 2);
        c.fill();
        continue;
      }
      if (look === 'objective' || look === 'bed' || look === 'flowers' || look === 'bench' || look === 'wheelbarrow') continue;
      const color =
        look === 'house' ? COLORS.house
        : look === 'ruin' ? COLORS.ruin
        : look === 'fence' ? COLORS.fence
        : look === 'blocked' ? COLORS.blocked
        : look === 'grave' ? COLORS.grave
        : look === 'hedge' ? COLORS.hedge
        : COLORS.prop;
      // Zäune sind sehr dünn: mindestens 1,5 Pixel
      const thin = 1.5 / k;
      rect(o.x, o.y, Math.max(o.w, thin), Math.max(o.h, thin), color);
    }
  }
}
