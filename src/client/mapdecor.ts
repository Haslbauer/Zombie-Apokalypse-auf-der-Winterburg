import * as THREE from 'three';
import { distanceToObstacle } from '../sim/grid';
import type { ArenaDef, Brush, DecorDef, Obstacle, SpawnPoint } from '../sim/types';

/**
 * Bausteine der Karte (nur Darstellung): Haus mit Fachwerk und Satteldach,
 * Bunker-Luke, Hollywoodschaukel, Gartendeko, Gräber, Teich, Bäume und die
 * Verstecke (Busch, hohes Gras, Schilf), die sich im Wind wiegen. Alles aus
 * einfachen Formen im Low-Poly-Stil; wiederholte Teile als InstancedMesh.
 */

/** Zeit für Wind und Rauch; die Karte setzt sie jedes Bild (MapAnimation.update). */
export const windTime = { value: 0 };

/** Pseudozufall aus einer Zahl (gleiche Karte bei jedem Laden). */
function rand(seed: number): () => number {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 233280 || 1;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/** Kleine Texturen auf einer Canvas (Putz, Ziegel, Pflaster, Kies, Gras). */
function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, size: number) => void, repeat = 1): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function noise(c: CanvasRenderingContext2D, size: number, base: string, colors: string[], count: number, r: [number, number], seed: number): void {
  c.fillStyle = base;
  c.fillRect(0, 0, size, size);
  const rnd = rand(seed);
  for (let i = 0; i < count; i++) {
    c.fillStyle = colors[Math.floor(rnd() * colors.length)];
    c.globalAlpha = 0.25 + rnd() * 0.35;
    c.beginPath();
    c.arc(rnd() * size, rnd() * size, r[0] + rnd() * (r[1] - r[0]), 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

export const TEXTURES = {
  grass: () => canvasTexture(256, (c, s) => noise(c, s, '#6fae4c', ['#5e9c40', '#7fbd58', '#86b84f', '#5a8f3a'], 900, [2, 9], 1)),
  terrain: () => canvasTexture(256, (c, s) => noise(c, s, '#557f3b', ['#4a7233', '#628c42', '#6d7d3a', '#4f6a33', '#7a6a45'], 900, [2, 12], 2)),
  plaster: () => canvasTexture(128, (c, s) => noise(c, s, '#ece0c4', ['#e2d4b4', '#f3e9d3', '#d9caa8'], 300, [1, 5], 3)),
  roof: () =>
    canvasTexture(128, (c, s) => {
      c.fillStyle = '#9a4430';
      c.fillRect(0, 0, s, s);
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        const y = (r * s) / rows;
        c.fillStyle = r % 2 ? '#8a3a28' : '#a54a34';
        c.fillRect(0, y, s, s / rows - 2);
        c.fillStyle = '#6e2c1e';
        for (let x = (r % 2) * 8; x < s; x += 16) c.fillRect(x, y, 2, s / rows);
      }
    }),
  cobbles: () =>
    canvasTexture(128, (c, s) => {
      c.fillStyle = '#7d766b';
      c.fillRect(0, 0, s, s);
      const rnd = rand(5);
      for (let y = 0; y < s; y += 16)
        for (let x = (y / 16) % 2 ? 8 : 0; x < s; x += 16) {
          const g = 140 + Math.floor(rnd() * 40);
          c.fillStyle = `rgb(${g},${g - 6},${g - 16})`;
          c.beginPath();
          c.ellipse(x + 8, y + 8, 7, 6.5, 0, 0, Math.PI * 2);
          c.fill();
        }
    }),
  gravel: () => canvasTexture(128, (c, s) => noise(c, s, '#b8a888', ['#a59576', '#cbbd9e', '#948468', '#d6cab0'], 700, [1, 3], 6)),
  /** Bruchsteinplatten: unregelmäßige Steine (Voronoi), dunkle Fugen mit etwas Moos; kachelbar. */
  flagstone: () =>
    canvasTexture(128, (c, s) => {
      const rnd = rand(11);
      const pts: { x: number; y: number; g: number }[] = [];
      for (let i = 0; i < 16; i++) pts.push({ x: rnd() * s, y: rnd() * s, g: 120 + Math.floor(rnd() * 50) });
      const img = c.createImageData(s, s);
      for (let y = 0; y < s; y++)
        for (let x = 0; x < s; x++) {
          let d1 = Infinity;
          let d2 = Infinity;
          let best = pts[0];
          for (const p of pts)
            for (const ox of [-s, 0, s])
              for (const oy of [-s, 0, s]) {
                const d = Math.hypot(x - p.x - ox, y - p.y - oy);
                if (d < d1) {
                  d2 = d1;
                  d1 = d;
                  best = p;
                } else if (d < d2) d2 = d;
              }
          const i = (y * s + x) * 4;
          const joint = d2 - d1 < 2.6;
          const noiseV = ((x * 13 + y * 7) % 9) - 4;
          if (joint) {
            const moss = (x * 31 + y * 17) % 5 === 0;
            img.data[i] = moss ? 52 : 46;
            img.data[i + 1] = moss ? 70 : 42;
            img.data[i + 2] = moss ? 40 : 36;
          } else {
            // leichte Wölbung: Rand dunkler
            const edge = Math.min(1, (d2 - d1) / 10);
            const g = best.g * (0.82 + 0.18 * edge) + noiseV;
            img.data[i] = g;
            img.data[i + 1] = g - 4;
            img.data[i + 2] = g - 12;
          }
          img.data[i + 3] = 255;
        }
      c.putImageData(img, 0, 0);
    }),
  water: () => canvasTexture(128, (c, s) => noise(c, s, '#3f6f7a', ['#4d8592', '#355f69', '#5e98a3'], 150, [4, 14], 7)),
};

/** Material-Sammlung, damit gleiche Farben nur einmal erzeugt werden. */
export class Mats {
  private cache = new Map<string, THREE.Material>();
  lambert(color: number, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
    const key = `${color}|${JSON.stringify(Object.keys(extra))}|${extra.emissive ?? ''}`;
    let m = this.cache.get(key) as THREE.MeshLambertMaterial | undefined;
    if (!m) this.cache.set(key, (m = new THREE.MeshLambertMaterial({ color, ...extra })));
    return m;
  }
  textured(name: keyof typeof TEXTURES, repeat: number, color = 0xffffff): THREE.MeshLambertMaterial {
    const key = `tex:${name}:${repeat}:${color}`;
    let m = this.cache.get(key) as THREE.MeshLambertMaterial | undefined;
    if (!m) {
      const map = TEXTURES[name]();
      map.repeat.set(repeat, repeat);
      this.cache.set(key, (m = new THREE.MeshLambertMaterial({ map, color })));
    }
    return m;
  }
}

/** Mesh mit Schatten an einer Position (y = Unterkante). */
function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** Prisma (Satteldach) entlang x: Breite w (x), Tiefe d (z), Firsthöhe h. */
function gableGeometry(w: number, d: number, h: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(0, h);
  shape.lineTo(d / 2, 0);
  shape.lineTo(-d / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  geo.translate(0, 0, -w / 2);
  geo.rotateY(Math.PI / 2);
  // UVs für die Ziegeltextur: Weltmaße
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 2, (pos.getY(i) + Math.abs(pos.getZ(i))) / 2);
  return geo;
}

const WALL_H = 3.2;

/**
 * Haus-Teil (Rechteck des Hindernisses): verputzte Wand mit Sockel und
 * Fachwerk, Fenster mit warmem Licht und Läden, Satteldach mit Ziegeln und
 * First; große Teile bekommen einen Schornstein (Rauchpunkt in chimneys).
 */
export function house(o: Extract<Obstacle, { kind: 'rect' }>, mats: Mats, chimneys: THREE.Vector3[]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.y);
  const long = Math.max(o.w, o.h);
  const short = Math.min(o.w, o.h);
  const alongX = o.w >= o.h;
  const plaster = mats.textured('plaster', 2);
  const timber = mats.lambert(0x4a3020);
  // Sockel und Wand
  g.add(part(new THREE.BoxGeometry(o.w + 0.15, 0.5, o.h + 0.15), mats.lambert(0x7d7468), 0, 0.25, 0));
  g.add(part(new THREE.BoxGeometry(o.w, WALL_H, o.h), plaster, 0, WALL_H / 2, 0));
  // Fachwerk: Balken oben und auf halber Höhe, Pfosten alle ~2,4 m (nur an den Längsseiten)
  const beam = (len: number, x: number, y: number, z: number, along: boolean) =>
    g.add(part(new THREE.BoxGeometry(along ? len : 0.16, 0.16, along ? 0.16 : len), timber, x, y, z, false));
  for (const side of [-1, 1]) {
    const off = (alongX ? o.h : o.w) / 2 + 0.02;
    for (const y of [WALL_H - 0.1, 1.6]) {
      if (alongX) beam(o.w, 0, y, side * off, true);
      else beam(o.h, side * off, y, 0, false);
    }
    const posts = Math.max(1, Math.round(long / 2.4));
    for (let i = 0; i <= posts; i++) {
      const t = -long / 2 + (i * long) / posts;
      const post = new THREE.BoxGeometry(0.16, WALL_H - 0.5, 0.16);
      g.add(part(post, timber, alongX ? t : side * off, 0.5 + (WALL_H - 0.5) / 2, alongX ? side * off : t, false));
    }
    // Fenster zwischen den Pfosten
    if (short >= 2.5)
      for (let i = 0; i < posts; i++) {
        const t = -long / 2 + ((i + 0.5) * long) / posts;
        const win = new THREE.Group();
        win.add(part(new THREE.BoxGeometry(0.9, 1, 0.08), mats.lambert(0x3a2a1c), 0, 0, 0, false));
        // Manche Fenster sind dunkel und mit Brettern vernagelt
        const boarded = (i * 7 + Math.round(o.x * 3 + o.y) + (side > 0 ? 1 : 0)) % 3 === 0;
        const glass = part(
          new THREE.BoxGeometry(0.72, 0.82, 0.1),
          boarded ? mats.lambert(0x141210) : mats.lambert(0xffcf7a, { emissive: 0xffa53a, emissiveIntensity: 0.9 }),
          0,
          0,
          0,
          false,
        );
        win.add(glass);
        if (boarded) {
          for (const [y, r] of [[0.22, 0.25], [-0.12, -0.18], [-0.32, 0.1]] as const) {
            const plank = part(new THREE.BoxGeometry(1.0, 0.13, 0.05), mats.lambert(0x6a5238), 0, y, 0.07, false);
            plank.rotation.z = r;
            win.add(plank);
          }
        }
        for (const s of [-1, 1]) win.add(part(new THREE.BoxGeometry(0.42, 1, 0.06), mats.lambert(0x3f6b3f), s * 0.68, 0, 0, false));
        win.position.set(alongX ? t : side * (off + 0.03), 2.35, alongX ? side * (off + 0.03) : t);
        if (!alongX) win.rotation.y = Math.PI / 2;
        g.add(win);
      }
  }
  // Satteldach mit Überstand und First
  const roofH = Math.min(2.6, Math.max(0.9, short * 0.42));
  const roof = new THREE.Mesh(gableGeometry(long + 0.6, short + 0.9, roofH), mats.textured('roof', 1));
  roof.castShadow = true;
  roof.position.y = WALL_H;
  if (!alongX) roof.rotation.y = Math.PI / 2;
  g.add(roof);
  const ridge = part(new THREE.BoxGeometry(alongX ? long + 0.7 : 0.25, 0.18, alongX ? 0.25 : long + 0.7), mats.lambert(0x5e2418), 0, WALL_H + roofH, 0);
  g.add(ridge);
  if (long >= 10) {
    const cx = alongX ? long * 0.28 : short * 0.18;
    const cz = alongX ? short * 0.18 : long * 0.28;
    g.add(part(new THREE.BoxGeometry(0.7, roofH + 1.2, 0.7), mats.lambert(0x8a5a48), cx, WALL_H + (roofH + 1.2) / 2, cz));
    g.add(part(new THREE.BoxGeometry(0.85, 0.15, 0.85), mats.lambert(0x5a4038), cx, WALL_H + roofH + 1.2, cz));
    chimneys.push(new THREE.Vector3(o.x + cx, WALL_H + roofH + 1.4, o.y + cz));
  }
  return g;
}

/**
 * Verfallener Hausflügel: Die eine Hälfte steht noch (hohle Mauern, halbes
 * Dach, kahle Sparren), die andere ist eingestürzt (Mauerstümpfe, Schutt,
 * Balken, umgekippter Schornstein, Efeu). Die Kollision bleibt das Rechteck.
 */
export function ruin(o: Extract<Obstacle, { kind: 'rect' }>, mats: Mats, chimneys: THREE.Vector3[]): THREE.Group {
  const outer = new THREE.Group();
  outer.position.set(o.x, 0, o.y);
  const g = new THREE.Group();
  outer.add(g);
  // Lange Achse lokal entlang x; bei Nord-Süd-Flügeln drehen (lokal −x zeigt dann nach Süden)
  const alongX = o.w >= o.h;
  if (!alongX) g.rotation.y = Math.PI / 2;
  const L = Math.max(o.w, o.h);
  const S = Math.min(o.w, o.h);
  const hl = L / 2;
  const hs = S / 2;
  const rnd = rand(o.x * 7 + o.y * 3);
  const plaster = mats.textured('plaster', 2, 0xd8ccb0);
  const timber = mats.lambert(0x3e2a1c);
  const stone = mats.lambert(0x7d7468);
  const brick = mats.lambert(0x8a4a38);
  const dark = mats.lambert(0x15120f);
  const ivy = mats.lambert(0x2f5a28);
  const T = 0.32; // Mauerstärke
  // Sockel und dunkler Boden innen
  g.add(part(new THREE.BoxGeometry(L + 0.15, 0.45, S + 0.15), stone, 0, 0.22, 0));
  g.add(part(new THREE.BoxGeometry(L - 0.4, 0.02, S - 0.4), dark, 0, 0.46, 0, false));

  // Stehende Hälfte (lokal −x): hohle Mauern in voller Höhe
  const wall = (len: number, h: number, x: number, z: number, alongLong: boolean) =>
    g.add(part(new THREE.BoxGeometry(alongLong ? len : T, h, alongLong ? T : len), plaster, x, 0.45 + h / 2, z));
  for (const side of [-1, 1]) wall(hl, WALL_H, -hl / 2, side * (hs - T / 2), true);
  wall(S, WALL_H, -hl + T / 2, 0, false);
  // Fachwerkbalken und leere bzw. vernagelte Fenster auf der stehenden Hälfte
  for (const side of [-1, 1]) {
    const z = side * (hs + 0.02);
    g.add(part(new THREE.BoxGeometry(hl, 0.16, 0.16), timber, -hl / 2, WALL_H - 0.1, z, false));
    g.add(part(new THREE.BoxGeometry(hl, 0.16, 0.16), timber, -hl / 2, 1.6, z, false));
    for (let x = -hl; x <= 0.01; x += 2.3) g.add(part(new THREE.BoxGeometry(0.16, WALL_H - 0.5, 0.16), timber, x, 0.5 + (WALL_H - 0.5) / 2, z, false));
    for (let x = -hl + 1.15; x < -0.5; x += 2.3) {
      g.add(part(new THREE.BoxGeometry(0.8, 0.95, 0.06), dark, x, 2.35, z + side * 0.02, false));
      if (rnd() < 0.6) {
        const plank = part(new THREE.BoxGeometry(1.0, 0.12, 0.05), mats.lambert(0x6a5238), x, 2.35 + (rnd() - 0.5) * 0.4, z + side * 0.06, false);
        plank.rotation.z = (rnd() - 0.5) * 0.6;
        g.add(plank);
      }
    }
  }
  // Halbes Dach über dem stehenden Teil, dahinter kahle, abgebrochene Sparren
  const roofH = Math.min(2.6, Math.max(0.9, S * 0.42));
  const roofLen = hl * 0.65;
  const roof = new THREE.Mesh(gableGeometry(roofLen, S + 0.9, roofH), mats.textured('roof', 1));
  roof.castShadow = true;
  roof.position.set(-hl + roofLen / 2 - 0.3, 0.45 + WALL_H - 0.45, 0);
  g.add(roof);
  const rafterLen = Math.hypot(hs + 0.45, roofH);
  const tilt = Math.atan2(roofH, hs + 0.45);
  for (let x = -hl + roofLen; x < hl * 0.25; x += 0.7) {
    for (const side of [-1, 1]) {
      if (rnd() < 0.25) continue; // einzelne Sparren fehlen
      const len = rafterLen * (x > -0.5 ? 0.4 + rnd() * 0.5 : 1);
      const r = part(new THREE.BoxGeometry(0.12, len, 0.12), timber, x, 0, 0);
      r.rotation.x = side * (Math.PI / 2 - tilt);
      // Fußpunkt auf der Mauerkrone, Richtung First
      r.position.set(x, WALL_H + 0.45 + Math.sin(tilt) * len / 2 - 0.1, side * (hs + 0.45 - Math.cos(tilt) * len / 2));
      g.add(r);
    }
  }
  g.add(part(new THREE.BoxGeometry(hl * 0.9, 0.16, 0.16), timber, -hl * 0.45, WALL_H + 0.45 + roofH - 0.1, 0));

  // Eingestürzte Hälfte (lokal +x): gezackte Mauerstümpfe
  for (const side of [-1, 1]) {
    for (let x = 0; x < hl; x += 0.55) {
      const h = Math.max(0.3, (WALL_H - 0.4) * (1 - x / hl) * (0.4 + rnd() * 0.7));
      g.add(part(new THREE.BoxGeometry(0.56, h, T), rnd() < 0.3 ? brick : plaster, x + 0.27, 0.45 + h / 2, side * (hs - T / 2)));
      // Efeu an der Außenseite
      if (rnd() < 0.35) g.add(part(new THREE.BoxGeometry(0.5, h * 0.8, 0.05), ivy, x + 0.27, 0.45 + h * 0.4, side * (hs + 0.02), false));
    }
  }
  const endH = 0.4 + rnd() * 0.6;
  g.add(part(new THREE.BoxGeometry(T, endH, S), stone, hl - T / 2, 0.45 + endH / 2, 0));
  // Schutthaufen aus Steinen und Ziegeln
  const rubble = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 9; i++) {
    const m = part(rubble, rnd() < 0.5 ? stone : brick, rnd() * (hl - 0.6) + 0.3, 0.45, (rnd() - 0.5) * (S - 1));
    m.scale.set(0.5 + rnd() * 0.8, 0.3 + rnd() * 0.5, 0.5 + rnd() * 0.7);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    g.add(m);
  }
  const brickGeo = new THREE.BoxGeometry(0.28, 0.1, 0.14);
  for (let i = 0; i < 40; i++) {
    // auch außerhalb der Mauern verstreut (bis 1,2 m)
    const b = part(brickGeo, rnd() < 0.7 ? brick : stone, rnd() * (hl + 1) - 0.5, 0.05 + rnd() * 0.5, (rnd() - 0.5) * (S + 2.4), false);
    b.rotation.set(rnd() * 0.6, rnd() * 3, rnd() * 0.6);
    g.add(b);
  }
  // Herabgestürzte Balken
  for (let i = 0; i < 5; i++) {
    const beam = part(new THREE.BoxGeometry(2.4 + rnd() * 2, 0.16, 0.16), timber, rnd() * hl * 0.8 + 0.3, 0.8 + rnd() * 0.8, (rnd() - 0.5) * (S - 1));
    beam.rotation.set((rnd() - 0.5) * 0.6, rnd() * Math.PI, (rnd() - 0.5) * 0.8);
    g.add(beam);
  }
  // Umgekippter Schornstein auf dem Schutt, aus dem noch Staub steigt
  const ch = part(new THREE.BoxGeometry(2.2, 0.7, 0.7), mats.lambert(0x8a5a48), hl * 0.55, 1.1, (rnd() - 0.5) * 0.8);
  ch.rotation.set(0.15, 0.6, 0.35);
  g.add(ch);
  g.updateMatrixWorld(true);
  outer.updateMatrixWorld(true);
  chimneys.push(new THREE.Vector3(hl * 0.55, 1.2, 0).applyMatrix4(g.matrixWorld));
  return outer;
}

/**
 * Rattenloch: ein Stück Hausmauer wie die Nachbarn, unten ein dunkles
 * Kellerloch mit zerbrochenen Brettern (auf beiden Seiten der Mauer).
 */
export function rathole(o: Extract<Obstacle, { kind: 'rect' }>, mats: Mats, chimneys: THREE.Vector3[]): THREE.Group {
  const g = house(o, mats, chimneys);
  const alongX = o.w >= o.h;
  const thick = (alongX ? o.h : o.w) + 0.2;
  const hole = part(new THREE.BoxGeometry(alongX ? 0.62 : thick, 0.46, alongX ? thick : 0.62), mats.lambert(0x080706), 0, 0.23, 0, false);
  g.add(hole);
  const board = mats.lambert(0x5a4630);
  for (const side of [-1, 1]) {
    const off = (thick / 2 + 0.03) * side;
    const b1 = part(new THREE.BoxGeometry(0.75, 0.09, 0.04), board, 0, 0.36, 0, false);
    b1.rotation.z = 0.35;
    const b2 = part(new THREE.BoxGeometry(0.4, 0.08, 0.04), board, 0.18, 0.12, 0, false);
    b2.rotation.z = -0.5;
    const boards = new THREE.Group();
    boards.add(b1, b2);
    boards.position.set(alongX ? 0 : off, 0, alongX ? off : 0);
    if (!alongX) boards.rotation.y = Math.PI / 2;
    g.add(boards);
  }
  return g;
}

/** Bunker unter der Erde: flache Luke im Rasen mit Betonrand und rostiger Doppeltür. */
export function hatch(s: SpawnPoint, mats: Mats): THREE.Group {
  const g = new THREE.Group();
  g.position.set(s.x, 0, s.y);
  g.add(part(new THREE.BoxGeometry(3, 0.18, 2.4), mats.lambert(0x8d8d86), 0, 0.09, 0));
  g.add(part(new THREE.BoxGeometry(2.6, 0.04, 2), mats.lambert(0x1c1c1c), 0, 0.19, 0, false));
  for (const side of [-1, 1]) {
    const door = part(new THREE.BoxGeometry(1.22, 0.08, 1.9), mats.lambert(0x6e4a32), side * 0.64, 0.22, 0, false);
    g.add(door);
    // Rostflecken und Griffe
    g.add(part(new THREE.BoxGeometry(0.5, 0.02, 0.4), mats.lambert(0x8a4a22), side * 0.5, 0.27, 0.4, false));
    g.add(part(new THREE.BoxGeometry(0.08, 0.08, 0.4), mats.lambert(0x2c2c2c), side * 0.12, 0.3, 0, false));
  }
  return g;
}

/** Hollywoodschaukel: Gestell, Sitzbank mit Kissen, gestreiftes Stoffdach. */
function swing(o: Extract<Obstacle, { kind: 'rect' }>, mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const frame = mats.lambert(0xdedede);
  const w = Math.max(o.w, o.h);
  for (const side of [-1, 1])
    for (const lean of [-1, 1]) {
      const leg = part(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6), frame, side * (w / 2 - 0.1), 1, lean * 0.45);
      leg.rotation.x = lean * 0.38;
      g.add(leg);
    }
  g.add(part(new THREE.CylinderGeometry(0.05, 0.05, w, 6).rotateZ(Math.PI / 2), frame, 0, 1.95, 0));
  // Bank an Ketten
  const seat = new THREE.Group();
  seat.add(part(new THREE.BoxGeometry(w - 0.5, 0.12, 0.6), mats.lambert(0xf2f2f2), 0, 0.55, 0));
  seat.add(part(new THREE.BoxGeometry(w - 0.5, 0.6, 0.1), mats.lambert(0xf2f2f2), 0, 0.85, -0.28));
  seat.add(part(new THREE.BoxGeometry(w - 0.6, 0.12, 0.5), mats.lambert(0x4f86c6), 0, 0.66, 0.02));
  for (const s of [-1, 1]) seat.add(part(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 4), frame, s * (w / 2 - 0.3), 1.3, 0, false));
  g.add(seat);
  // Stoffdach mit Streifen
  for (let i = 0; i < 6; i++) {
    const stripe = part(new THREE.BoxGeometry(w / 6, 0.04, 1.4), mats.lambert(i % 2 ? 0xf2f2f2 : 0x4f86c6), -w / 2 + (i + 0.5) * (w / 6), 2.15, 0);
    stripe.rotation.x = 0.18;
    g.add(stripe);
  }
  if (o.h > o.w) g.rotation.y = Math.PI / 2;
  return g;
}

/** Lichtschein am Boden unter Laternen (statt teurer Punktlichter): weicher, additiver Kreis. */
let glowTexture: THREE.CanvasTexture | null = null;
function glow(): THREE.Mesh {
  glowTexture ??= canvasTexture(64, (c, size) => {
    const grad = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,190,90,0.85)');
    grad.addColorStop(1, 'rgba(255,190,90,0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, size, size);
  });
  const mat = new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), mat);
  disc.position.y = 0.03;
  disc.renderOrder = 2;
  return disc;
}

/** Laterne: Pfahl, Glaskasten mit warmem Licht und Lichtschein am Boden. */
function lamp(mats: Mats): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(0.07, 0.1, 2.4, 6), mats.lambert(0x2b2b2b), 0, 1.2, 0));
  g.add(part(new THREE.BoxGeometry(0.34, 0.42, 0.34), mats.lambert(0xffd88a, { emissive: 0xffb347, emissiveIntensity: 1 }), 0, 2.55, 0, false));
  g.add(part(new THREE.ConeGeometry(0.3, 0.25, 4), mats.lambert(0x2b2b2b), 0, 2.88, 0));
  g.add(glow());
  return g;
}

/** Baum: Laubbaum (zwei Kronen-Stufen) oder Nadelbaum, je nach Ort. */
export function tree(x: number, y: number, r: number, mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const rnd = rand(x * 31 + y * 17);
  const s = 0.85 + rnd() * 0.35;
  g.add(part(new THREE.CylinderGeometry(r * 0.22, r * 0.3, 1.8 * s, 7), mats.lambert(0x5e4128), 0, 0.9 * s, 0));
  if (rnd() < 0.35) {
    for (let i = 0; i < 3; i++) g.add(part(new THREE.ConeGeometry(r * (1.25 - i * 0.3) * s, 1.5 * s, 8), mats.lambert(0x2f6b35), 0, (1.4 + i * 0.9) * s + 0.75 * s, 0));
  } else {
    const greens = [0x3e8f3a, 0x4a9a3e, 0x357f33];
    g.add(part(new THREE.IcosahedronGeometry(r * 1.35 * s, 0), mats.lambert(greens[Math.floor(rnd() * 3)]), 0, 1.8 * s + r * s, 0));
    g.add(part(new THREE.IcosahedronGeometry(r * 0.9 * s, 0), mats.lambert(greens[Math.floor(rnd() * 3)]), r * 0.5, 1.8 * s + r * 1.9 * s, -r * 0.3));
  }
  g.position.set(x, 0, y);
  g.rotation.y = rnd() * Math.PI * 2;
  return g;
}

/** Alle übrigen Hindernisse nach Aussehen (Schuppen, Kompost, Gräber, Teich …). */
export function obstacleDecor(o: Obstacle, mats: Mats): THREE.Object3D | null {
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.y);
  const rect = o.kind === 'rect' ? o : null;
  const w = rect ? rect.w : (o as { r: number }).r * 2;
  const h = rect ? rect.h : (o as { r: number }).r * 2;
  const rnd = rand(o.x * 13 + o.y * 7);
  switch (o.look) {
    case 'swing':
      g.add(swing(rect!, mats));
      break;
    case 'shed': {
      g.add(part(new THREE.BoxGeometry(w, 2.2, h), mats.lambert(0x7a5a3a), 0, 1.1, 0));
      for (let i = -w / 2 + 0.3; i < w / 2; i += 0.45) g.add(part(new THREE.BoxGeometry(0.06, 2.2, h + 0.04), mats.lambert(0x5e4429), i, 1.1, 0, false));
      const roof = new THREE.Mesh(gableGeometry(w + 0.4, h + 0.5, 1), mats.lambert(0x3d3d3d));
      roof.position.y = 2.2;
      roof.castShadow = true;
      g.add(roof);
      g.add(part(new THREE.BoxGeometry(0.9, 1.7, 0.05), mats.lambert(0x4a321e), 0, 0.85, h / 2 + 0.03, false));
      break;
    }
    case 'compost':
      for (const [dx, dz, lw, lh] of [[0, -h / 2, w, 0.1], [0, h / 2, w, 0.1], [-w / 2, 0, 0.1, h], [w / 2, 0, 0.1, h]] as const)
        g.add(part(new THREE.BoxGeometry(lw, 0.8, lh), mats.lambert(0x6b4e30), dx, 0.4, dz));
      g.add(part(new THREE.BoxGeometry(w - 0.2, 0.15, h - 0.2), mats.lambert(0x3d2a18), 0, 0.7, 0, false));
      break;
    case 'woodpile':
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 5 - row; i++) {
          const log = part(new THREE.CylinderGeometry(0.17, 0.17, h, 7).rotateX(Math.PI / 2), mats.lambert(row % 2 ? 0x8a6340 : 0x7a5535), -w / 2 + 0.35 + (i + row * 0.5) * 0.6, 0.18 + row * 0.3, 0);
          g.add(log);
        }
      break;
    case 'barrel':
      g.add(part(new THREE.CylinderGeometry(w / 2, w / 2 * 0.9, 1, 12), mats.lambert(0x3a6aa0), 0, 0.5, 0));
      g.add(part(new THREE.CylinderGeometry(w / 2 - 0.05, w / 2 - 0.05, 0.02, 12), mats.lambert(0x2c4f70), 0, 1.01, 0, false));
      break;
    case 'bench':
      g.add(part(new THREE.BoxGeometry(w, 0.08, 0.45), mats.lambert(0x8a6a45), 0, 0.45, 0));
      g.add(part(new THREE.BoxGeometry(w, 0.4, 0.06), mats.lambert(0x8a6a45), 0, 0.75, -0.22));
      for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.08, 0.45, 0.45), mats.lambert(0x2b2b2b), s * (w / 2 - 0.15), 0.22, 0));
      break;
    case 'lamp':
      g.add(lamp(mats));
      break;
    case 'wheelbarrow': {
      const tray = part(new THREE.BoxGeometry(w * 0.6, 0.35, h), mats.lambert(0x4f7f3f), 0.1, 0.45, 0);
      g.add(tray);
      g.add(part(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10).rotateX(Math.PI / 2), mats.lambert(0x222222), w * 0.42, 0.22, 0));
      for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(w * 0.5, 0.05, 0.05), mats.lambert(0x6b4e30), -w * 0.3, 0.55, s * h * 0.35, false));
      break;
    }
    case 'flowers': {
      g.add(part(new THREE.BoxGeometry(w, 0.15, h), mats.lambert(0x4a3322), 0, 0.075, 0, false));
      const colors = [0xff6f91, 0xffd166, 0xc77dff, 0xffffff, 0xff9f43];
      const geo = new THREE.IcosahedronGeometry(0.13, 0);
      const count = Math.round(w * h * 5);
      const inst = new THREE.InstancedMesh(geo, mats.lambert(0xffffff), count);
      const m = new THREE.Matrix4();
      for (let i = 0; i < count; i++) {
        m.setPosition((rnd() - 0.5) * (w - 0.2), 0.3 + rnd() * 0.15, (rnd() - 0.5) * (h - 0.2));
        inst.setMatrixAt(i, m);
        inst.setColorAt(i, new THREE.Color(colors[Math.floor(rnd() * colors.length)]));
      }
      g.add(inst);
      break;
    }
    case 'grave': {
      const stone = mats.lambert(rnd() < 0.5 ? 0x8f8f8a : 0x7a7a74);
      if (rnd() < 0.4) {
        g.add(part(new THREE.BoxGeometry(0.12, 1, 0.12), stone, 0, 0.5, 0));
        g.add(part(new THREE.BoxGeometry(0.6, 0.12, 0.12), stone, 0, 0.7, 0));
      } else {
        g.add(part(new THREE.BoxGeometry(w, 0.9, 0.18), stone, 0, 0.45, 0));
        g.add(part(new THREE.CylinderGeometry(w / 2, w / 2, 0.18, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(-Math.PI / 2).rotateY(Math.PI / 2), stone, 0, 0.9, 0));
      }
      g.add(part(new THREE.BoxGeometry(w + 0.2, 0.08, 1.4), mats.lambert(0x4a3a28), 0, 0.04, 0.75, false));
      g.rotation.z = (rnd() - 0.5) * 0.15;
      break;
    }
    case 'rock': {
      const rock = part(new THREE.DodecahedronGeometry(w / 2, 0), mats.lambert(rnd() < 0.5 ? 0x7d7d78 : 0x8c8a80), 0, w * 0.25, 0);
      rock.scale.set(1, 0.65, 0.85);
      rock.rotation.y = rnd() * 3;
      g.add(rock);
      break;
    }
    case 'log': {
      const len = Math.max(w, h);
      const log = part(new THREE.CylinderGeometry(0.42, 0.45, len, 9).rotateZ(Math.PI / 2), mats.lambert(0x6b4a2b), 0, 0.42, 0);
      if (h > w) log.rotation.y = Math.PI / 2;
      g.add(log);
      g.add(part(new THREE.CylinderGeometry(0.38, 0.38, 0.02, 9).rotateZ(Math.PI / 2), mats.lambert(0xb08a5a), 0, 0.42, 0, false));
      break;
    }
    case 'deadtree': {
      g.add(part(new THREE.CylinderGeometry(0.12, 0.3, 3.2, 6), mats.lambert(0x4e3b2a), 0, 1.6, 0));
      for (let i = 0; i < 4; i++) {
        const br = part(new THREE.CylinderGeometry(0.04, 0.09, 1.3, 5), mats.lambert(0x4e3b2a), 0, 2 + i * 0.35, 0);
        br.rotation.z = 0.9 * (i % 2 ? 1 : -1);
        br.rotation.y = i * 1.7;
        g.add(br);
      }
      break;
    }
    case 'pond': {
      const water = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 32).rotateX(-Math.PI / 2), mats.textured('water', 2, 0xbfe3ea));
      water.position.y = 0.04;
      water.receiveShadow = true;
      g.add(water);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const st = part(new THREE.DodecahedronGeometry(0.28 + rnd() * 0.15, 0), mats.lambert(0x8a8a82), Math.cos(a) * (w / 2 + 0.1), 0.1, Math.sin(a) * (w / 2 + 0.1));
        g.add(st);
      }
      for (let i = 0; i < 3; i++) g.add(part(new THREE.CylinderGeometry(0.35, 0.35, 0.02, 12), mats.lambert(0x4f9a3a), (rnd() - 0.5) * w * 0.6, 0.06, (rnd() - 0.5) * w * 0.6, false));
      break;
    }
    default:
      return null;
  }
  return g;
}

/** Hecke mit buschigem Rand oben (statt glatter Kiste). */
export function hedge(o: Extract<Obstacle, { kind: 'rect' }>, mats: Mats): THREE.Group {
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.y);
  g.add(part(new THREE.BoxGeometry(o.w, 1.3, o.h), mats.lambert(0x2f6b2a), 0, 0.65, 0));
  const alongX = o.w >= o.h;
  const len = Math.max(o.w, o.h);
  const count = Math.max(2, Math.round(len / 0.9));
  const geo = new THREE.IcosahedronGeometry(0.5, 0);
  const inst = new THREE.InstancedMesh(geo, mats.lambert(0x377a30), count);
  inst.castShadow = true;
  const rnd = rand(o.x + o.y * 3);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const t = -len / 2 + ((i + 0.5) * len) / count;
    const s = 0.8 + rnd() * 0.5;
    m.makeScale(s, s * 0.8, s).setPosition(alongX ? t : (rnd() - 0.5) * 0.2, 1.3, alongX ? (rnd() - 0.5) * 0.2 : t);
    inst.setMatrixAt(i, m);
  }
  g.add(inst);
  return g;
}

/** Deko-Flächen: Pflaster, Kieswege, schiefer Friedhofszaun. */
export function decor(d: DecorDef, mats: Mats): THREE.Object3D {
  if (d.look === 'gravefence') {
    const g = new THREE.Group();
    g.position.set(d.x, 0, d.y);
    const wood = mats.lambert(0x5a4632);
    const rnd = rand(d.x);
    const edge = (len: number, x: number, z: number, along: boolean) => {
      for (let t = -len / 2; t <= len / 2; t += 0.6) {
        if (rnd() < 0.15) continue; // fehlende Latten
        const p = part(new THREE.BoxGeometry(0.08, 0.9, 0.05), wood, along ? x + t : x, 0.45, along ? z : z + t);
        p.rotation.z = (rnd() - 0.5) * 0.4;
        g.add(p);
      }
      g.add(part(new THREE.BoxGeometry(along ? len : 0.05, 0.06, along ? 0.05 : len), wood, x, 0.7, z, false));
    };
    edge(d.w, 0, -d.h / 2, true);
    edge(d.h, -d.w / 2, 0, false);
    edge(d.h, d.w / 2, 0, false);
    return g;
  }
  const cobbles = d.look === 'cobbles';
  if (cobbles) {
    const geo = new THREE.PlaneGeometry(d.w, d.h).rotateX(-Math.PI / 2);
    const k = 0.5;
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * d.w * k + d.x * k, uv.getY(i) * d.h * k + d.y * k);
    const mesh = new THREE.Mesh(geo, mats.textured('cobbles', 1));
    mesh.position.set(d.x, 0.012, d.y);
    mesh.receiveShadow = true;
    return mesh;
  }
  // Pfad: schlammige Erdspur, darauf einzelne Trittplatten aus Bruchstein
  // (unregelmäßig, teils verschoben oder gebrochen), Lücken mit Erde und Gras.
  const g = new THREE.Group();
  const rnd = rand(d.x * 3 + d.y * 5);
  const along = d.w >= d.h;
  const len = along ? d.w : d.h;
  const wid = along ? d.h : d.w;
  const mud = mats.lambert(0x3e3226);
  const mudDark = mats.lambert(0x2e261d);
  // Erdspur mit unregelmäßigem Rand aus überlappenden Flecken
  for (let t = -len / 2; t < len / 2; t += 0.6) {
    const r = wid * (0.45 + rnd() * 0.25);
    const off = (rnd() - 0.5) * wid * 0.3;
    const blot = new THREE.Mesh(new THREE.CircleGeometry(r, 7).rotateX(-Math.PI / 2), rnd() < 0.2 ? mudDark : mud);
    blot.position.set(d.x + (along ? t : off), 0.008 + rnd() * 0.002, d.y + (along ? off : t));
    blot.scale.set(1, 1, 0.7 + rnd() * 0.5);
    blot.rotation.y = rnd() * 3;
    blot.receiveShadow = true;
    g.add(blot);
  }
  // Trittplatten
  const stones = [0x8a8378, 0x7a746a, 0x958d80, 0x6e695f].map((c) => mats.lambert(c));
  const step = 0.55;
  for (let t = -len / 2 + 0.3; t < len / 2 - 0.2; t += step + rnd() * 0.25) {
    const pairs = wid > 1 ? 2 : 1;
    for (let k = 0; k < pairs; k++) {
      if (rnd() < 0.12) continue; // fehlende Platte
      const r = 0.22 + rnd() * 0.16;
      const off = pairs === 2 ? (k - 0.5) * wid * 0.45 + (rnd() - 0.5) * 0.12 : (rnd() - 0.5) * 0.2;
      const sides = 5 + Math.floor(rnd() * 3);
      const geo = new THREE.CylinderGeometry(r, r * 1.05, 0.06, sides);
      // unregelmäßiger Umriss: Ecken zufällig nach innen/außen
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const f = 0.8 + ((Math.sin(i * 12.9898 + t * 78.233) * 43758.5453) % 1 + 1) % 1 * 0.35;
        pos.setX(i, pos.getX(i) * f);
        pos.setZ(i, pos.getZ(i) * f);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, stones[Math.floor(rnd() * stones.length)]);
      const tilt = rnd() < 0.15 ? 0.12 : 0.03; // manche Platten stehen schief hoch
      m.position.set(d.x + (along ? t : off), 0.03, d.y + (along ? off : t));
      m.rotation.set((rnd() - 0.5) * tilt, rnd() * 3, (rnd() - 0.5) * tilt);
      m.receiveShadow = true;
      g.add(m);
      if (rnd() < 0.08) {
        // gebrochene Platte: Splitter daneben
        const shard = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.4, 0.05, 4), m.material as THREE.Material);
        shard.position.set(m.position.x + 0.3, 0.025, m.position.z + 0.2);
        shard.rotation.y = rnd() * 3;
        g.add(shard);
      }
    }
  }
  return g;
}

/** Material, dessen Ecken sich im Wind wiegen (je höher, desto mehr). */
function windMaterial(color: number, strength: number): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float sway = max(position.y, 0.0) * ${strength.toFixed(3)};
        vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        transformed.x += sin(uTime * 1.7 + base.x * 0.6 + base.z * 0.3) * sway;
        transformed.z += cos(uTime * 1.3 + base.z * 0.5) * sway * 0.5;`,
      );
  };
  return mat;
}

/** Punkte gleichmäßig zufällig in einem Versteck verteilen. */
function scatter(b: Brush, count: number, rnd: () => number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (b.kind === 'circle') {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * b.r;
      out.push({ x: b.x + Math.cos(a) * r, z: b.y + Math.sin(a) * r });
    } else out.push({ x: b.x + (rnd() - 0.5) * b.w, z: b.y + (rnd() - 0.5) * b.h });
  }
  return out;
}

/** Alle Verstecke als wenige InstancedMeshes: Grashalme, Buschballen, Schilf mit Kolben. */
export function brushes(list: Brush[]): THREE.Group {
  const g = new THREE.Group();
  const rnd = rand(42);
  const area = (b: Brush) => (b.kind === 'circle' ? Math.PI * b.r * b.r : b.w * b.h);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();

  // Hohes Gras: schmale Halme, leicht schräg
  const grass = list.filter((b) => b.look === 'grass');
  const blades = grass.flatMap((b) => scatter(b, Math.round(area(b) * 30), rnd));
  if (blades.length) {
    const geo = new THREE.ConeGeometry(0.12, 1, 3).translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(geo, windMaterial(0xffffff, 0.12), blades.length);
    blades.forEach((p, i) => {
      q.setFromAxisAngle(up, rnd() * Math.PI);
      const s = 0.7 + rnd() * 0.6;
      m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, s, 1));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, color.setHSL(0.24 + rnd() * 0.06, 0.55, 0.26 + rnd() * 0.12, THREE.SRGBColorSpace));
    });
    inst.castShadow = true;
    g.add(inst);
  }

  // Büsche: dichte Ballen
  const bush = list.filter((b) => b.look === 'bush');
  const balls = bush.flatMap((b) => scatter(b, Math.max(4, Math.round(area(b) * 1.1)), rnd));
  if (balls.length) {
    const geo = new THREE.IcosahedronGeometry(0.75, 0).translate(0, 0.6, 0);
    const inst = new THREE.InstancedMesh(geo, windMaterial(0xffffff, 0.05), balls.length);
    balls.forEach((p, i) => {
      const s = 0.8 + rnd() * 0.6;
      m.compose(new THREE.Vector3(p.x, 0, p.z), q.setFromAxisAngle(up, rnd() * 6), new THREE.Vector3(s, s * (0.9 + rnd() * 0.4), s));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, color.setHSL(0.29 + rnd() * 0.05, 0.6, 0.16 + rnd() * 0.07, THREE.SRGBColorSpace));
    });
    inst.castShadow = true;
    g.add(inst);
  }

  // Schilf: hohe Halme mit braunem Kolben (nur am Rand des Teichs)
  const reed = list.filter((b) => b.look === 'reed');
  const stems = reed.flatMap((b) =>
    scatter(b, Math.round(area(b) * 5), rnd).filter((p) => b.kind !== 'circle' || Math.hypot(p.x - b.x, p.z - b.y) > b.r * 0.72),
  );
  if (stems.length) {
    const stemGeo = new THREE.CylinderGeometry(0.025, 0.035, 1.8, 4).translate(0, 0.9, 0);
    const headGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5).translate(0, 1.75, 0);
    const stemInst = new THREE.InstancedMesh(stemGeo, windMaterial(0x6f8f3a, 0.1), stems.length);
    const headInst = new THREE.InstancedMesh(headGeo, windMaterial(0x6b4428, 0.1), stems.length);
    stems.forEach((p, i) => {
      const s = 0.8 + rnd() * 0.4;
      m.compose(new THREE.Vector3(p.x, 0, p.z), q.identity(), new THREE.Vector3(1, s, 1));
      stemInst.setMatrixAt(i, m);
      headInst.setMatrixAt(i, m);
    });
    g.add(stemInst, headInst);
  }
  return g;
}

/** Rauch aus den Schornsteinen: aufsteigende, verblassende Wölkchen. */
export function smoke(points: THREE.Vector3[]): { group: THREE.Group; update: (time: number) => void } {
  const group = new THREE.Group();
  const puffs: { mesh: THREE.Mesh; base: THREE.Vector3; phase: number }[] = [];
  const geo = new THREE.IcosahedronGeometry(0.35, 0);
  for (const p of points)
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xd8d4cc, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      puffs.push({ mesh, base: p, phase: i / 6 });
    }
  return {
    group,
    update(time) {
      for (const p of puffs) {
        const t = (time * 0.18 + p.phase) % 1;
        p.mesh.position.set(p.base.x + t * 1.2, p.base.y + t * 3.2, p.base.z + Math.sin(t * 6 + p.phase * 9) * 0.3);
        p.mesh.scale.setScalar(0.6 + t * 1.8);
        (p.mesh.material as THREE.MeshLambertMaterial).opacity = 0.55 * (1 - t);
      }
    },
  };
}

/** Verwildertes Dickicht auf gesperrten Flächen (Nachbargrundstück): dichte Büsche und Bäume, nur Kulisse. */
export function thicket(o: Extract<Obstacle, { kind: 'rect' }>, mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const rnd = rand(o.x * 3 + o.y);
  const count = Math.round(o.w * o.h * 0.5);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0).translate(0, 0.8, 0), new THREE.MeshLambertMaterial({ flatShading: true }), count);
  for (let i = 0; i < count; i++) {
    const s = 0.9 + rnd() * 0.9;
    m.compose(new THREE.Vector3(o.x + (rnd() - 0.5) * o.w, 0, o.y + (rnd() - 0.5) * o.h), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6), new THREE.Vector3(s, s * 0.8, s));
    bushes.setMatrixAt(i, m);
    bushes.setColorAt(i, color.setHSL(0.27 + rnd() * 0.06, 0.5, 0.17 + rnd() * 0.08, THREE.SRGBColorSpace));
  }
  bushes.castShadow = true;
  g.add(bushes);
  const trees = Math.round((o.w * o.h) / 40);
  for (let i = 0; i < trees; i++) g.add(tree(o.x + (rnd() - 0.5) * (o.w - 2), o.y + (rnd() - 0.5) * (o.h - 2), 1.4, mats));
  return g;
}

/**
 * Deko-Gras ohne Spielwirkung: Grasbüschel und Wildblumen entlang von Zäunen,
 * Hecken, Mauern und Wegrändern (zwei InstancedMeshes, wiegen sich im Wind).
 */
export function grassTufts(arena: ArenaDef): THREE.Group {
  const g = new THREE.Group();
  const rnd = rand(77);
  const spots: { x: number; z: number }[] = [];
  const free = (x: number, z: number) => !arena.obstacles.some((o) => distanceToObstacle({ x, y: z }, o) < 0.12);
  const edge = (x: number, y: number, w: number, h: number, gap: number) => {
    const along = w >= h;
    const len = along ? w : h;
    const wid = along ? h : w;
    for (let t = -len / 2; t < len / 2; t += 0.35 + rnd() * 0.5) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.35) continue;
        const off = side * (wid / 2 + gap + rnd() * 0.5);
        const px = x + (along ? t : off);
        const pz = y + (along ? off : t);
        if (free(px, pz)) spots.push({ x: px, z: pz });
      }
    }
  };
  for (const o of arena.obstacles) {
    if (o.kind !== 'rect') continue;
    const look = o.look ?? 'hedge';
    if (['hedge', 'fence', 'house', 'ruin', 'shed', 'bed'].includes(look)) edge(o.x, o.y, o.w, o.h, 0.08);
  }
  for (const d of arena.decor ?? []) if (d.look === 'gravel') edge(d.x, d.y, d.w, d.h, 0.35);
  for (const p of arena.paths ?? []) edge(p.x, p.y, p.w, p.h, 0.35);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  // Büschel aus drei schmalen Halmen
  const blade = new THREE.ConeGeometry(0.07, 0.6, 3).translate(0, 0.3, 0);
  const tuft = new THREE.InstancedMesh(blade, windMaterial(0xffffff, 0.08), spots.length * 3);
  let n = 0;
  for (const s of spots) {
    for (let i = 0; i < 3; i++) {
      q.setFromAxisAngle(up, rnd() * Math.PI);
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (rnd() - 0.5) * 0.5);
      q.multiply(tilt);
      const k = 0.5 + rnd() * 0.8;
      m.compose(new THREE.Vector3(s.x + (rnd() - 0.5) * 0.2, 0, s.z + (rnd() - 0.5) * 0.2), q, new THREE.Vector3(1, k, 1));
      tuft.setMatrixAt(n, m);
      tuft.setColorAt(n, color.setHSL(0.2 + rnd() * 0.08, 0.5, 0.22 + rnd() * 0.12, THREE.SRGBColorSpace));
      n++;
    }
  }
  tuft.count = n;
  g.add(tuft);
  // Wildblumen (weiß, gelb, violett) an jedem fünften Büschel
  const flowers = spots.filter(() => rnd() < 0.2);
  const head = new THREE.SphereGeometry(0.05, 5, 3).translate(0, 0.45, 0);
  const fl = new THREE.InstancedMesh(head, new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, flowers.length));
  const palette = [0xf0f0e8, 0xffd84a, 0xb48cff, 0xff8aa0];
  flowers.forEach((s, i) => {
    m.makeTranslation(s.x + (rnd() - 0.5) * 0.3, rnd() * 0.15, s.z + (rnd() - 0.5) * 0.3);
    fl.setMatrixAt(i, m);
    fl.setColorAt(i, color.setHex(palette[Math.floor(rnd() * palette.length)]));
  });
  fl.count = flowers.length;
  g.add(fl);
  return g;
}
