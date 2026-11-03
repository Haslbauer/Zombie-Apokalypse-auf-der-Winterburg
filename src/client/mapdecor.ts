import * as THREE from 'three';
import { type TreeSpecies, treeMesh } from './foliage';
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
  /** Ziegelmauer (Schornsteine): versetzte Reihen mit hellen Fugen. */
  bricks: () =>
    canvasTexture(128, (c, s) => {
      c.fillStyle = '#b8aa96';
      c.fillRect(0, 0, s, s);
      const rows = 8;
      const h = s / rows;
      const rnd = rand(5);
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * (h * 1.2);
        for (let x = -h * 2.4; x < s; x += h * 2.4) {
          const v = 120 + Math.floor(rnd() * 40);
          c.fillStyle = `rgb(${v + 40},${v - 30},${v - 50})`;
          c.fillRect(x + off + 1, r * h + 1, h * 2.4 - 2, h - 2);
        }
      }
    }),
  /** Festgetretene, helle Erde mit kleinen Kieseln (Untergrund der Wege). */
  dirt: () => canvasTexture(128, (c, s) => noise(c, s, '#a38a66', ['#957c5a', '#b39a74', '#bea782', '#86704f', '#c9b593'], 650, [1, 3], 9)),
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

/**
 * UVs in Weltmetern (je Fläche passend zur Ausrichtung), damit Ziegel auf langen
 * und kurzen Wänden gleich groß sind. scale: Meter pro Texturkachel.
 */
function worldUV<T extends THREE.BufferGeometry>(geo: T, scale = 0.9): T {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n?.getX(i) ?? 0);
    const ay = Math.abs(n?.getY(i) ?? 0);
    const az = Math.abs(n?.getZ(i) ?? 1);
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (ay >= ax && ay >= az) uv.setXY(i, x / scale, z / scale);
    else if (ax >= az) uv.setXY(i, z / scale, y / scale);
    else uv.setXY(i, x / scale, y / scale);
  }
  return geo;
}

/** Ziegelquader (Mauern, Hauswände) mit Ziegeln im richtigen Maßstab. */
function brickBox(w: number, h: number, d: number): THREE.BoxGeometry {
  return worldUV(new THREE.BoxGeometry(w, h, d));
}

/** Prisma (Satteldach) entlang x: Breite w (x), Tiefe d (z), Firsthöhe h. */
function gableGeometry(w: number, d: number, h: number, thick = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(0, h);
  shape.lineTo(d / 2, 0);
  if (thick > 0) {
    // Hohles Dach (zwei Dachflächen), damit der Giebel darunter sichtbar bleibt
    const k = thick / Math.cos(Math.atan2(h, d / 2));
    shape.lineTo(d / 2 - (k * d) / 2 / h, 0);
    shape.lineTo(0, h - k);
    shape.lineTo(-d / 2 + (k * d) / 2 / h, 0);
  }
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
  const rnd = rand(o.x * 13 + o.y * 7);
  // Ziegelbau: Wände aus Ziegeln, Gesims und Fensterstürze aus hellem Stein
  const plaster = mats.textured('bricks', 1);
  const grime = mats.textured('bricks', 1, 0x8a7e6e);
  const timber = mats.lambert(0xb8ae9c);
  const dark = mats.lambert(0x3a2a1c);
  // Sockel aus Bruchstein, darüber ein Schmutzrand am Putz
  g.add(part(new THREE.BoxGeometry(o.w + 0.15, 0.5, o.h + 0.15), mats.textured('flagstone', 1, 0x9a9080), 0, 0.25, 0));
  g.add(part(brickBox(o.w, WALL_H, o.h), plaster, 0, WALL_H / 2, 0));
  g.add(part(brickBox(o.w + 0.02, 0.45, o.h + 0.02), grime, 0, 0.72, 0, false));
  /** Balken an der Fassade: lokale Koordinate t entlang der Wand, y Höhe, Winkel in der Wandebene. */
  const facade = (side: number, longSide: boolean) => {
    // Längsseite: Wand verläuft entlang der langen Achse; Giebelseite: entlang der kurzen
    const wallAlongX = longSide ? alongX : !alongX;
    const off = (wallAlongX ? o.h : o.w) / 2 + 0.02;
    return (len: number, t: number, y: number, angle = 0, thick = 0.14) => {
      // Ziegelbau: nur waagrechte Steinbänder (Gesims unter dem Dach), kein Fachwerk
      if (angle !== 0 || y < WALL_H - 0.5) return;
      const m = part(new THREE.BoxGeometry(len + 0.1, thick + 0.06, thick), timber, 0, 0, 0, false);
      // Wand entlang x (Normalen ±z) bzw. entlang z (Normalen ±x)
      if (wallAlongX) {
        m.position.set(t, y, side * off);
        m.rotation.z = angle;
      } else {
        m.position.set(side * off, y, t);
        m.rotation.y = Math.PI / 2;
        m.rotation.z = angle;
      }
      g.add(m);
    };
  };
  const BELT = 1.6;
  // ---------- Längsseiten: Fachwerk, Fenster, Tür ----------
  const posts = Math.max(1, Math.round(long / 2.4));
  const doorSide = long >= 7 ? 1 : 0;
  const doorPanel = Math.floor(posts / 2);
  for (const side of [-1, 1]) {
    const beam = facade(side, true);
    beam(long, 0, WALL_H - 0.1, 0, 0.16);
    beam(long, 0, BELT);
    beam(long, 0, 0.55);
    const span = long / posts;
    for (let i = 0; i <= posts; i++) beam(WALL_H - 0.5, -long / 2 + i * span, 0.5 + (WALL_H - 0.5) / 2, Math.PI / 2, 0.16);
    for (let i = 0; i < posts; i++) {
      const t = -long / 2 + (i + 0.5) * span;
      const isDoor = side === doorSide && i === doorPanel;
      // Unteres Feld: schräge Strebe (abwechselnd), über der Tür keine
      if (!isDoor) {
        const dy = BELT - 0.55;
        const ang = Math.atan2(dy, span) * (i % 2 ? 1 : -1);
        beam(Math.hypot(span, dy) - 0.05, t, (BELT + 0.55) / 2, ang, 0.12);
      }
      if (isDoor) {
        // Haustür: Rahmen, Bretter, Beschläge, Stufe und Laterne
        const door = new THREE.Group();
        door.add(part(new THREE.BoxGeometry(1.15, 2.15, 0.1), dark, 0, 1.075, 0, false));
        for (let k = -2; k <= 2; k++) door.add(part(new THREE.BoxGeometry(0.17, 1.95, 0.06), mats.lambert(k % 2 ? 0x6a4a2c : 0x7a5634), k * 0.18, 1.0, 0.06, false));
        for (const y of [0.45, 1.55]) door.add(part(new THREE.BoxGeometry(0.85, 0.06, 0.03), mats.lambert(0x2a2a2a), 0, y, 0.1, false));
        door.add(part(new THREE.SphereGeometry(0.04, 6, 4), mats.lambert(0xc9a24a), 0.3, 1.0, 0.11, false));
        door.add(part(new THREE.BoxGeometry(1.4, 0.18, 0.5), mats.lambert(0x8a8378), 0, 0.09, 0.3));
        door.add(part(new THREE.BoxGeometry(0.2, 0.28, 0.2), mats.lambert(0xffd88a, { emissive: 0xffb347, emissiveIntensity: 1 }), 0.8, 2.35, 0.18, false));
        door.add(part(new THREE.ConeGeometry(0.18, 0.16, 4), mats.lambert(0x2b2b2b), 0.8, 2.56, 0.18, false));
        const off = (alongX ? o.h : o.w) / 2 + 0.03;
        if (alongX) door.position.set(t, 0.1, side * off);
        else {
          door.position.set(side * off, 0.1, t);
          door.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        if (alongX && side < 0) door.rotation.y = Math.PI;
        g.add(door);
        continue;
      }
      // Fenster im oberen Feld (bei schmalen Teilen keine), sonst Andreaskreuz
      if (short < 2.5) continue;
      const win = new THREE.Group();
      win.add(part(new THREE.BoxGeometry(0.9, 1, 0.08), dark, 0, 0, 0, false));
      win.add(part(new THREE.BoxGeometry(1.1, 0.16, 0.12), timber, 0, 0.58, 0.02, false));
      const boarded = (i * 7 + Math.round(o.x * 3 + o.y) + (side > 0 ? 1 : 0)) % 3 === 0;
      win.add(part(new THREE.BoxGeometry(0.72, 0.82, 0.1), boarded ? mats.lambert(0x141210) : mats.lambert(0xffcf7a, { emissive: 0xffa53a, emissiveIntensity: 0.9 }), 0, 0, 0, false));
      if (boarded) {
        for (const [y, r] of [[0.22, 0.25], [-0.12, -0.18], [-0.32, 0.1]] as const) {
          const plank = part(new THREE.BoxGeometry(1.0, 0.13, 0.05), mats.lambert(0x6a5238), 0, y, 0.07, false);
          plank.rotation.z = r;
          win.add(plank);
        }
      } else {
        // Fensterkreuz
        win.add(part(new THREE.BoxGeometry(0.05, 0.82, 0.04), dark, 0, 0, 0.07, false));
        win.add(part(new THREE.BoxGeometry(0.72, 0.05, 0.04), dark, 0, 0.08, 0.07, false));
      }
      // Fensterbank, manchmal mit Blumenkasten
      win.add(part(new THREE.BoxGeometry(1.0, 0.07, 0.2), mats.lambert(0x8a8378), 0, -0.54, 0.08, false));
      if (!boarded && rnd() < 0.5) {
        win.add(part(new THREE.BoxGeometry(0.8, 0.16, 0.18), mats.lambert(0x6a4a2c), 0, -0.44, 0.18, false));
        const petals = [0xd8455a, 0xf2c94c, 0xb48cff, 0xf0f0e8];
        for (let k = 0; k < 6; k++) win.add(part(new THREE.SphereGeometry(0.06, 5, 4), mats.lambert(petals[(k + i) % petals.length]), -0.32 + k * 0.13, -0.32, 0.2, false));
      }
      for (const s2 of [-1, 1]) win.add(part(new THREE.BoxGeometry(0.42, 1, 0.06), mats.lambert(0x3f6b3f), s2 * 0.68, 0, 0, false));
      const off = (alongX ? o.h : o.w) / 2 + 0.05;
      win.position.set(alongX ? t : side * off, 2.35, alongX ? side * off : t);
      if (!alongX) win.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      else if (side < 0) win.rotation.y = Math.PI;
      g.add(win);
    }
  }
  // ---------- Giebelseiten: Fachwerk mit Andreaskreuzen und Giebeldreieck ----------
  const roofH = Math.min(2.6, Math.max(0.9, short * 0.42));
  for (const side of [-1, 1]) {
    const beam = facade(side, false);
    beam(short, 0, WALL_H - 0.1, 0, 0.16);
    beam(short, 0, BELT);
    for (const t of [-short / 2, 0, short / 2]) beam(WALL_H - 0.5, t, 0.5 + (WALL_H - 0.5) / 2, Math.PI / 2, 0.16);
    if (short >= 2.5) {
      const half = short / 2;
      const dy = BELT - 0.55;
      for (const t of [-half / 2, half / 2])
        for (const sgn of [-1, 1]) beam(Math.hypot(half, dy) - 0.05, t, (BELT + 0.55) / 2, Math.atan2(dy, half) * sgn, 0.12);
    }
    // Giebeldreieck aus Putz mit Mittelpfosten und Streben
    const tri = new THREE.Shape();
    tri.moveTo(-short / 2, 0);
    tri.lineTo(0, roofH - 0.12);
    tri.lineTo(short / 2, 0);
    tri.lineTo(-short / 2, 0);
    const gableGeo = new THREE.ShapeGeometry(tri);
    const guv = gableGeo.attributes.uv;
    const gp = gableGeo.attributes.position;
    for (let i = 0; i < gp.count; i++) guv.setXY(i, gp.getX(i) / 0.9, gp.getY(i) / 0.9);
    const gable = new THREE.Mesh(gableGeo, plaster);
    gable.receiveShadow = true;
    const off = (alongX ? o.w : o.h) / 2;
    if (alongX) {
      gable.position.set(side * off, WALL_H, 0);
      gable.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      gable.position.set(0, WALL_H, side * off);
      if (side < 0) gable.rotation.y = Math.PI;
    }
    g.add(gable);
    beam(roofH - 0.2, 0, WALL_H + (roofH - 0.2) / 2, Math.PI / 2, 0.14);
    for (const sgn of [-1, 1]) beam(Math.hypot(short / 4, roofH * 0.45), sgn * short / 8, WALL_H + roofH * 0.22, Math.atan2(roofH * 0.45, short / 4) * -sgn, 0.12);
  }
  // ---------- Dach: zwei Dachflächen, Ziegelreihen, Ortgang, Moos, Dachrinne ----------
  const roof = new THREE.Mesh(gableGeometry(long + 0.6, short + 0.9, roofH, 0.16), mats.textured('roof', 1));
  roof.castShadow = true;
  roof.position.y = WALL_H;
  if (!alongX) roof.rotation.y = Math.PI / 2;
  g.add(roof);
  const slope = Math.atan2(roofH, (short + 0.9) / 2);
  const slopeLen = Math.hypot(roofH, (short + 0.9) / 2);
  const rowMat = mats.lambert(0x7a2e1e);
  const roofGroup = new THREE.Group();
  for (const sgn of [-1, 1]) {
    // Ziegelreihen: Leisten quer zur Dachneigung
    for (let k = 0.35; k < slopeLen - 0.2; k += 0.42) {
      const d = ((short + 0.9) / 2) * (1 - k / slopeLen);
      const strip = part(new THREE.BoxGeometry(long + 0.6, 0.05, 0.07), rowMat, 0, WALL_H + roofH * (k / slopeLen) + 0.03, sgn * d, false);
      strip.rotation.x = sgn * slope;
      roofGroup.add(strip);
    }
    // Ortgangbretter an beiden Giebeln
    for (const end of [-1, 1]) {
      const board = part(new THREE.BoxGeometry(0.08, 0.2, slopeLen + 0.1), mats.lambert(0x3a2418), end * ((long + 0.6) / 2 + 0.02), WALL_H + roofH / 2, sgn * (short + 0.9) / 4, false);
      board.rotation.x = sgn > 0 ? -slope : slope;
      roofGroup.add(board);
    }
    // Moosflecken
    for (let k = 0; k < 3; k++) {
      if (rnd() < 0.4) continue;
      const t = rnd();
      const moss = part(new THREE.CircleGeometry(0.3 + rnd() * 0.4, 7), mats.lambert(0x4a6a32), (rnd() - 0.5) * long, WALL_H + roofH * t + 0.09, sgn * ((short + 0.9) / 2) * (1 - t), false);
      moss.rotation.x = -Math.PI / 2 + sgn * slope;
      moss.scale.set(1.6, 1, 1);
      roofGroup.add(moss);
    }
    // Dachrinne an der Traufe
    const gutter = part(new THREE.CylinderGeometry(0.07, 0.07, long + 0.6, 6, 1, true), mats.lambert(0x6a6e72), 0, WALL_H - 0.02, sgn * ((short + 0.9) / 2 + 0.02), false);
    gutter.rotation.z = Math.PI / 2;
    roofGroup.add(gutter);
  }
  // Fallrohr an einer Ecke
  roofGroup.add(part(new THREE.CylinderGeometry(0.05, 0.05, WALL_H, 6), mats.lambert(0x6a6e72), (long + 0.4) / 2, WALL_H / 2, (short + 0.9) / 2 + 0.02, false));
  if (!alongX) roofGroup.rotation.y = Math.PI / 2;
  g.add(roofGroup);
  const ridge = part(new THREE.BoxGeometry(alongX ? long + 0.7 : 0.25, 0.18, alongX ? 0.25 : long + 0.7), mats.lambert(0x5e2418), 0, WALL_H + roofH, 0);
  g.add(ridge);
  if (long >= 10) {
    const cx = alongX ? long * 0.28 : short * 0.18;
    const cz = alongX ? short * 0.18 : long * 0.28;
    g.add(part(new THREE.BoxGeometry(0.7, roofH + 1.2, 0.7), mats.textured('bricks', 1), cx, WALL_H + (roofH + 1.2) / 2, cz));
    g.add(part(new THREE.BoxGeometry(0.85, 0.15, 0.85), mats.lambert(0x5a4038), cx, WALL_H + roofH + 1.2, cz));
    chimneys.push(new THREE.Vector3(o.x + cx, WALL_H + roofH + 1.4, o.y + cz));
  }
  return g;
}

/**
 * Hofmauer aus Ziegeln (schmale Teile am Innenhof): 2,6 m hoch, Mauerabdeckung
 * aus Stein, Pfeiler alle 2,5 m, ein wenig Efeu.
 */
export function courtyardWall(o: Extract<Obstacle, { kind: 'rect' }>, mats: Mats): THREE.Group {
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.y);
  const H = 2.6;
  const rnd = rand(o.x * 3 + o.y * 5);
  const alongX = o.w >= o.h;
  const len = Math.max(o.w, o.h);
  const brick = mats.textured('bricks', 1);
  const cap = mats.lambert(0xb8ae9c);
  const wallT = Math.min(o.w, o.h);
  g.add(part(brickBox(o.w, H, o.h), brick, 0, H / 2, 0));
  g.add(part(new THREE.BoxGeometry(o.w + 0.12, 0.12, o.h + 0.12), cap, 0, H + 0.06, 0));
  const piers = Math.max(1, Math.round(len / 2.5));
  for (let i = 0; i <= piers; i++) {
    const t = -len / 2 + (i * len) / piers;
    g.add(part(brickBox(alongX ? 0.45 : wallT + 0.18, H + 0.2, alongX ? wallT + 0.18 : 0.45), brick, alongX ? t : 0, (H + 0.2) / 2, alongX ? 0 : t));
    g.add(part(new THREE.BoxGeometry(alongX ? 0.55 : wallT + 0.28, 0.12, alongX ? wallT + 0.28 : 0.55), cap, alongX ? t : 0, H + 0.26, alongX ? 0 : t));
  }
  const ivy = mats.lambert(0x2f5a28);
  for (let i = 0; i < 3; i++) {
    if (rnd() < 0.4) continue;
    const t = (rnd() - 0.5) * (len - 1);
    const side = rnd() < 0.5 ? -1 : 1;
    const h = 0.8 + rnd() * 1.5;
    g.add(part(new THREE.BoxGeometry(alongX ? 0.6 + rnd() * 0.6 : 0.05, h, alongX ? 0.05 : 0.6 + rnd() * 0.6), ivy, alongX ? t : side * (wallT / 2 + 0.03), h / 2, alongX ? side * (wallT / 2 + 0.03) : t, false));
  }
  return g;
}

/**
 * Hoftor in der Mauer: zwei Ziegelpfeiler mit Steinkugeln, ein Bogen darüber,
 * zwei offene Holztorflügel mit Eisenbändern.
 */
export function courtyardGate(d: DecorDef, mats: Mats): THREE.Group {
  const g = new THREE.Group();
  g.position.set(d.x, 0, d.y);
  const alongX = d.w >= d.h;
  if (!alongX) g.rotation.y = Math.PI / 2;
  const W = Math.max(d.w, d.h);
  const brick = mats.textured('bricks', 1);
  const cap = mats.lambert(0xb8ae9c);
  for (const s of [-1, 1]) {
    g.add(part(brickBox(0.5, 3.0, 0.7), brick, s * (W / 2 + 0.05), 1.5, 0));
    g.add(part(new THREE.BoxGeometry(0.62, 0.12, 0.82), cap, s * (W / 2 + 0.05), 3.06, 0));
    g.add(part(new THREE.SphereGeometry(0.2, 10, 8), cap, s * (W / 2 + 0.05), 3.3, 0));
  }
  // Bogen aus Ziegeln über dem Tor
  const arch = part(new THREE.TorusGeometry(W / 2 + 0.05, 0.16, 6, 16, Math.PI), brick, 0, 2.55, 0);
  g.add(arch);
  // Offene Torflügel (nach innen gedreht)
  const wood = [mats.lambert(0x6a4a2c), mats.lambert(0x7a5634)];
  const iron = mats.lambert(0x2f2f2f);
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    const lw = W / 2 - 0.05;
    for (let k = 0; k < 5; k++) leaf.add(part(new THREE.BoxGeometry(lw / 5 - 0.02, 2.1, 0.06), wood[k % 2], s * (-(k + 0.5) * (lw / 5)), 1.1, 0, false));
    for (const y of [0.5, 1.7]) leaf.add(part(new THREE.BoxGeometry(lw, 0.07, 0.03), iron, (-s * lw) / 2, y, 0.05, false));
    leaf.position.set(s * (W / 2 - 0.02), 0, 0.05);
    leaf.rotation.y = s * 1.25;
    g.add(leaf);
  }
  // Ausgetretene Schwelle
  g.add(part(new THREE.BoxGeometry(W, 0.05, 0.7), mats.lambert(0x8a8378), 0, 0.025, 0, false));
  return g;
}

/**
 * Verfallener Hausflügel: Die eine Hälfte steht noch (hohle Mauern, halbes
 * Dach, kahle Sparren), die andere ist eingestürzt (Mauerstümpfe, Schutt,
 * Balken, umgekippter Schornstein, Efeu). Die Kollision bleibt das Rechteck.
 */
export function ruin(o: Extract<Obstacle, { kind: 'rect' }>, mats: Mats, _chimneys: THREE.Vector3[]): THREE.Group {
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
  const plaster = mats.textured('bricks', 1, 0xd8ccc0);
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
    g.add(part(brickBox(alongLong ? len : T, h, alongLong ? T : len), plaster, x, 0.45 + h / 2, z));
  for (const side of [-1, 1]) wall(hl, WALL_H, -hl / 2, side * (hs - T / 2), true);
  wall(S, WALL_H, -hl + T / 2, 0, false);
  // Fachwerkbalken und leere bzw. vernagelte Fenster auf der stehenden Hälfte
  for (const side of [-1, 1]) {
    const z = side * (hs + 0.02);
    // Steinband unter der Dachkante (Ziegelbau, kein Fachwerk)
    g.add(part(new THREE.BoxGeometry(hl, 0.18, 0.12), mats.lambert(0xb8ae9c), -hl / 2, 0.45 + WALL_H - 0.12, z, false));
    for (let x = -hl + 1.15; x < -0.5; x += 2.3) {
      g.add(part(new THREE.BoxGeometry(0.8, 0.95, 0.06), dark, x, 2.35, z + side * 0.02, false));
      if (rnd() < 0.6) {
        const plank = part(new THREE.BoxGeometry(1.0, 0.12, 0.05), mats.lambert(0x6a5238), x, 2.35 + (rnd() - 0.5) * 0.4, z + side * 0.06, false);
        plank.rotation.z = (rnd() - 0.5) * 0.6;
        g.add(plank);
      }
    }
  }
  // Flachdach mit Dachpappe über dem stehenden Teil: Bahnen mit überlappenden Nähten,
  // Blechkante am Rand, Flicken und eine Pfütze; zur Abbruchkante hin ausgefranst
  const felt = mats.lambert(0x2c2c30);
  const feltLight = mats.lambert(0x3a3a40);
  const roofY = 0.45 + WALL_H;
  g.add(part(new THREE.BoxGeometry(hl + 0.25, 0.12, S + 0.3), felt, -hl / 2 - 0.1, roofY + 0.06, 0));
  for (let z = -hs; z <= hs + 0.01; z += 1) g.add(part(new THREE.BoxGeometry(hl + 0.2, 0.03, 0.08), feltLight, -hl / 2 - 0.1, roofY + 0.13, z, false));
  const trim = mats.lambert(0x6a6e72);
  for (const side of [-1, 1]) g.add(part(new THREE.BoxGeometry(hl + 0.3, 0.1, 0.06), trim, -hl / 2 - 0.1, roofY + 0.1, side * (hs + 0.15), false));
  g.add(part(new THREE.BoxGeometry(0.06, 0.1, S + 0.3), trim, -hl - 0.22, roofY + 0.1, 0, false));
  for (let i = 0; i < 4; i++) {
    const patch = part(new THREE.BoxGeometry(0.5 + rnd() * 0.6, 0.02, 0.4 + rnd() * 0.5), feltLight, -hl + 0.6 + rnd() * (hl - 1.2), roofY + 0.135, (rnd() - 0.5) * (S - 0.6), false);
    patch.rotation.y = rnd();
    g.add(patch);
  }
  g.add(part(new THREE.CircleGeometry(0.55, 10).rotateX(-Math.PI / 2), mats.lambert(0x3f5560), -hl * 0.6, roofY + 0.14, (rnd() - 0.5) * (S - 1.5), false));
  // Abbruchkante: Dachpappe hängt in Fetzen über die Mauer
  for (let z = -hs; z < hs; z += 0.45) {
    const flap = part(new THREE.BoxGeometry(0.35, 0.03, 0.42), felt, 0.1, roofY - 0.05, z + 0.2, false);
    flap.rotation.z = -0.6 - rnd() * 0.6;
    g.add(flap);
  }

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
  // (Kein Schornstein im eingestürzten Teil: Dort hätte keiner gestanden)
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
export function tree(x: number, y: number, r: number, _mats?: Mats, species?: TreeSpecies): THREE.Group {
  // Organischer Baum (unregelmäßige Laubballen bzw. Nadel-Etagen, Stamm mit Wurzeln) oder eine besondere Art, siehe foliage.ts
  return treeMesh(x, y, r, species);
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
      // Geräteschuppen: Bretterwand (unterschiedlich getönt), Wellblechdach mit Rost,
      // Tür mit Z-Strebe und Beschlägen, kleines Fenster, Werkzeug und Regentonne
      const rnd = rand(o.x * 5 + o.y * 3);
      g.add(part(new THREE.BoxGeometry(w, 2.2, h), mats.lambert(0x6e5034), 0, 1.1, 0));
      const tones = [0x7a5a3a, 0x6a4c30, 0x86643f, 0x5e4429].map((c) => mats.lambert(c));
      for (const side of [-1, 1]) {
        for (let i = -w / 2 + 0.12; i < w / 2; i += 0.24) g.add(part(new THREE.BoxGeometry(0.22, 2.2 + rnd() * 0.06, 0.04), tones[Math.floor(rnd() * 4)], i, 1.1, side * (h / 2 + 0.02), false));
        for (let i = -h / 2 + 0.12; i < h / 2; i += 0.24) g.add(part(new THREE.BoxGeometry(0.04, 2.2, 0.22), tones[Math.floor(rnd() * 4)], side * (w / 2 + 0.02), 1.1, i, false));
      }
      // Wellblech: Dach als zwei Flächen mit Rippen
      const roofH = 0.9;
      const roof = new THREE.Mesh(gableGeometry(w + 0.5, h + 0.6, roofH, 0.06), mats.lambert(0x6a6560));
      roof.position.y = 2.2;
      roof.castShadow = true;
      g.add(roof);
      const slope = Math.atan2(roofH, (h + 0.6) / 2);
      const rust = [mats.lambert(0x8a5a3a), mats.lambert(0x7a7470), mats.lambert(0x9a6a40)];
      for (const sgn of [-1, 1])
        for (let x = -(w + 0.5) / 2 + 0.1; x < (w + 0.5) / 2; x += 0.2) {
          const rib = part(new THREE.BoxGeometry(0.05, 0.04, Math.hypot(roofH, (h + 0.6) / 2)), rust[Math.floor(rnd() * 3)], x, 2.2 + roofH / 2 + 0.03, (sgn * (h + 0.6)) / 4, false);
          rib.rotation.x = sgn > 0 ? slope : -slope;
          g.add(rib);
        }
      // Tür mit Z-Strebe, Bändern und Riegel
      const door = new THREE.Group();
      door.add(part(new THREE.BoxGeometry(1.0, 1.85, 0.06), mats.lambert(0x4a321e), 0, 0.93, 0, false));
      for (const y of [0.3, 1.55]) door.add(part(new THREE.BoxGeometry(0.95, 0.1, 0.04), mats.lambert(0x5e4429), 0, y, 0.05, false));
      const diag = part(new THREE.BoxGeometry(0.1, 1.45, 0.04), mats.lambert(0x5e4429), 0, 0.93, 0.05, false);
      diag.rotation.z = 0.62;
      door.add(diag);
      for (const y of [0.3, 1.55]) door.add(part(new THREE.BoxGeometry(0.35, 0.05, 0.02), mats.lambert(0x2a2a2a), -0.32, y, 0.08, false));
      door.add(part(new THREE.BoxGeometry(0.18, 0.06, 0.04), mats.lambert(0x3a3a3a), 0.4, 1.0, 0.08, false));
      door.position.set(-w * 0.15, 0, h / 2 + 0.05);
      g.add(door);
      // Fenster mit trübem, warmem Licht
      g.add(part(new THREE.BoxGeometry(0.6, 0.5, 0.06), mats.lambert(0x3a2a1c), w * 0.28, 1.5, h / 2 + 0.05, false));
      g.add(part(new THREE.BoxGeometry(0.48, 0.38, 0.07), mats.lambert(0xc8a060, { emissive: 0x8a5a20, emissiveIntensity: 0.6 }), w * 0.28, 1.5, h / 2 + 0.06, false));
      g.add(part(new THREE.BoxGeometry(0.04, 0.38, 0.08), mats.lambert(0x3a2a1c), w * 0.28, 1.5, h / 2 + 0.07, false));
      // Angelehnter Rechen und Spaten
      const handle = mats.lambert(0x8a6340);
      const metal = mats.lambert(0x6a6e72);
      const rake = new THREE.Group();
      rake.add(part(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 5), handle, 0, 0.85, 0, false));
      rake.add(part(new THREE.BoxGeometry(0.45, 0.04, 0.04), metal, 0, 1.7, 0, false));
      for (let k = 0; k < 6; k++) rake.add(part(new THREE.BoxGeometry(0.02, 0.1, 0.02), metal, -0.2 + k * 0.08, 1.65, 0.02, false));
      rake.position.set(w / 2 - 0.25, 0, h / 2 + 0.25);
      rake.rotation.x = -0.18;
      g.add(rake);
      const spade = new THREE.Group();
      spade.add(part(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5), handle, 0, 0.75, 0, false));
      spade.add(part(new THREE.BoxGeometry(0.2, 0.28, 0.02), metal, 0, 0.14, 0, false));
      spade.position.set(w / 2 + 0.25, 0, h * 0.1);
      spade.rotation.z = 0.15;
      g.add(spade);
      // Regentonne an der Ecke
      g.add(part(new THREE.CylinderGeometry(0.32, 0.28, 0.85, 12), mats.lambert(0x5a4630), -w / 2 - 0.3, 0.43, h / 2 - 0.2));
      for (const y of [0.15, 0.7]) g.add(part(new THREE.CylinderGeometry(0.33, 0.33, 0.05, 12), mats.lambert(0x3a3a3a), -w / 2 - 0.3, y, h / 2 - 0.2, false));
      g.add(part(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 12), mats.lambert(0x2f4f5a), -w / 2 - 0.3, 0.8, h / 2 - 0.2, false));
      break;
    }
    case 'compost': {
      // Komposthaufen: Bretterkiste mit Lücken, darin Erde, Grünschnitt und Stroh
      const rnd = rand(o.x * 9 + o.y);
      const plank = [mats.lambert(0x6b4e30), mats.lambert(0x5a4028)];
      for (let row = 0; row < 3; row++)
        for (const [dx, dz, lw, lh] of [[0, -h / 2, w, 0.08], [0, h / 2, w, 0.08], [-w / 2, 0, 0.08, h], [w / 2, 0, 0.08, h]] as const)
          g.add(part(new THREE.BoxGeometry(lw, 0.2, lh), plank[(row + (lw > 0.1 ? 0 : 1)) % 2], dx, 0.15 + row * 0.27, dz));
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) g.add(part(new THREE.BoxGeometry(0.1, 0.95, 0.1), plank[0], (px * w) / 2, 0.47, (pz * h) / 2));
      const soil = [0x4a3420, 0x5a4028, 0x3d2a18].map((c) => mats.lambert(c, { flatShading: true }));
      for (let i = 0; i < 6; i++) {
        const geo = new THREE.IcosahedronGeometry(0.35 + rnd() * 0.2, 0);
        geo.scale(1, 0.5, 1);
        g.add(part(geo, soil[i % 3], (rnd() - 0.5) * (w - 0.6), 0.62, (rnd() - 0.5) * (h - 0.6), false));
      }
      const green = [mats.lambert(0x5a7a32), mats.lambert(0x8a9a3a), mats.lambert(0xd8c070)];
      for (let i = 0; i < 18; i++) {
        const leaf = part(new THREE.BoxGeometry(0.2, 0.02, 0.06), green[i % 3], (rnd() - 0.5) * (w - 0.4), 0.78 + rnd() * 0.08, (rnd() - 0.5) * (h - 0.4), false);
        leaf.rotation.set(rnd(), rnd() * 3, rnd());
        g.add(leaf);
      }
      break;
    }
    case 'woodpile':
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 5 - row; i++) {
          const log = part(new THREE.CylinderGeometry(0.17, 0.17, h, 7).rotateX(Math.PI / 2), mats.lambert(row % 2 ? 0x8a6340 : 0x7a5535), -w / 2 + 0.35 + (i + row * 0.5) * 0.6, 0.18 + row * 0.3, 0);
          g.add(log);
        }
      break;
    case 'barrel': {
      // Regentonne aus Holzdauben mit Eisenreifen, Wasser mit Spiegelung, Deckel halb daneben
      const r0 = w / 2;
      const staves = [mats.lambert(0x6a4a2c), mats.lambert(0x5a3e24), mats.lambert(0x7a5634)];
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const st = part(new THREE.BoxGeometry(r0 * 0.46, 1.0, 0.05), staves[i % 3], Math.cos(a) * r0 * 0.95, 0.5, Math.sin(a) * r0 * 0.95, true);
        st.rotation.y = -a + Math.PI / 2;
        g.add(st);
      }
      for (const y of [0.15, 0.5, 0.85]) g.add(part(new THREE.CylinderGeometry(r0 * 1.0, r0 * 1.0, 0.06, 14, 1, true), mats.lambert(0x2f2f2f), 0, y, 0, false));
      g.add(part(new THREE.CylinderGeometry(r0 * 0.9, r0 * 0.9, 0.02, 14), mats.lambert(0x2f4f5a, { emissive: 0x0a1a20 }), 0, 0.9, 0, false));
      g.add(part(new THREE.CylinderGeometry(r0 * 0.9, r0 * 0.9, 0.9, 12), mats.lambert(0x3a2a1a), 0, 0.45, 0, false));
      break;
    }
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
      // Blumenbeet mit Steinkante; Rosenbeet (species: roses) mit Rosenbüschen und vielen anderen Blumen
      const roses = o.species === 'roses';
      g.add(part(new THREE.BoxGeometry(w, 0.12, h), mats.lambert(0x4a3322), 0, 0.06, 0, false));
      const edge = mats.lambert(0x9a9284);
      for (let x = -w / 2; x < w / 2; x += 0.3)
        for (const zs of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.26, 0.14, 0.12), edge, x + 0.15, 0.07, zs * (h / 2), false));
      const stemMat = mats.lambert(0x3f7a30);
      const leafMat = mats.lambert(0x2f6a2a, { flatShading: true });
      const colors = roses ? [0xc81e3a, 0xe8466a, 0xf0f0e8, 0xffd166, 0xb48cff, 0xff9f43] : [0xff6f91, 0xffd166, 0xc77dff, 0xffffff, 0xff9f43];
      const count = Math.round(w * h * (roses ? 9 : 6));
      const stem = new THREE.CylinderGeometry(0.012, 0.012, 1, 3).translate(0, 0.5, 0);
      const head = new THREE.IcosahedronGeometry(0.07, 0);
      const stems = new THREE.InstancedMesh(stem, stemMat, count);
      const heads = new THREE.InstancedMesh(head, mats.lambert(0xffffff), count);
      const m = new THREE.Matrix4();
      for (let i = 0; i < count; i++) {
        const x = (rnd() - 0.5) * (w - 0.25);
        const z = (rnd() - 0.5) * (h - 0.25);
        const ht = 0.25 + rnd() * 0.35;
        m.makeScale(1, ht, 1).setPosition(x, 0.12, z);
        stems.setMatrixAt(i, m);
        m.makeScale(1, 0.8, 1).setPosition(x, 0.12 + ht, z);
        heads.setMatrixAt(i, m);
        heads.setColorAt(i, new THREE.Color(colors[Math.floor(rnd() * colors.length)]));
      }
      g.add(stems, heads);
      if (roses) {
        // Rosenbüsche: dunkles Laub mit großen roten und rosa Blüten
        for (let x = -w / 2 + 0.45; x < w / 2 - 0.3; x += 0.9) {
          const bush = part(new THREE.IcosahedronGeometry(0.32, 1), leafMat, x, 0.42, 0);
          bush.scale.set(1, 0.9, 0.85);
          g.add(bush);
          for (let k = 0; k < 6; k++) {
            const a = rnd() * Math.PI * 2;
            const bloom = part(new THREE.DodecahedronGeometry(0.075, 0), mats.lambert(rnd() < 0.6 ? 0xc81e3a : 0xe8466a), x + Math.cos(a) * 0.27, 0.45 + rnd() * 0.28, Math.sin(a) * 0.22, false);
            g.add(bloom);
          }
        }
      }
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
  if (d.look === 'dung') return dungHeap(d, mats);
  if (d.look === 'gate') return courtyardGate(d, mats);
  if (d.look === 'meadow') return meadow(d, mats);
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
  // Heller, erdiger Untergrund (vorher fast schwarzer Schlamm)
  const mud = mats.textured('dirt', 1);
  const mudDark = mats.textured('dirt', 1, 0xc9b89a);
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
  const stones = [0xaaa293, 0x9a9284, 0xb5ac9b, 0x8c857a].map((c) => mats.lambert(c));
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

/** Blumenwiese (nur Aussehen): viele Wildblumen mit Stängeln, Klee und höheres Gras. */
function meadow(d: DecorDef, mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const rnd = rand(d.x * 13 + d.y * 7);
  const count = Math.round(d.w * d.h * 12);
  const stem = new THREE.CylinderGeometry(0.01, 0.01, 1, 3).translate(0, 0.5, 0);
  const head = new THREE.IcosahedronGeometry(0.05, 0);
  const stems = new THREE.InstancedMesh(stem, mats.lambert(0x4a8a36), count);
  const heads = new THREE.InstancedMesh(head, mats.lambert(0xffffff), count);
  const palette = [0xf4f0e8, 0xffd84a, 0xb48cff, 0xff8aa0, 0x7ab8ff, 0xffffff];
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    // dichter zur Mitte, ausfransender Rand
    const x = d.x + (rnd() - 0.5) * d.w * (0.6 + rnd() * 0.4);
    const z = d.y + (rnd() - 0.5) * d.h * (0.6 + rnd() * 0.4);
    const ht = 0.15 + rnd() * 0.3;
    m.makeScale(1, ht, 1).setPosition(x, 0, z);
    stems.setMatrixAt(i, m);
    m.makeScale(1, 0.7, 1).setPosition(x, ht, z);
    heads.setMatrixAt(i, m);
    heads.setColorAt(i, new THREE.Color(palette[Math.floor(rnd() * palette.length)]));
  }
  g.add(stems, heads);
  return g;
}

/** Misthaufen: dunkler, klumpiger Haufen mit Stroh, Pfütze und einer Mistgabel darin. */
function dungHeap(d: DecorDef, mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const rnd = rand(d.x * 7 + d.y * 11);
  const browns = [0x7a5634, 0x8a6440, 0x6a4a2c, 0x946e46].map((c) => mats.lambert(c, { flatShading: true }));
  // Pfütze aus Jauche am Fuß
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(d.w * 0.62, 12).rotateX(-Math.PI / 2), mats.lambert(0x4a3a22));
  puddle.scale.set(1, 1, 0.75);
  puddle.position.set(d.x, 0.006, d.y);
  puddle.receiveShadow = true;
  g.add(puddle);
  // Haufen aus abgeflachten Klumpen
  for (let i = 0; i < 7; i++) {
    const r = (0.35 + rnd() * 0.35) * (i === 0 ? 1.4 : 1);
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.9 + rnd() * 0.2), Math.max(-0.05, p.getY(k)) * (0.55 + rnd() * 0.2), p.getZ(k) * (0.9 + rnd() * 0.2));
    geo.computeVertexNormals();
    const a = rnd() * Math.PI * 2;
    const off = i === 0 ? 0 : (d.w / 2) * (0.25 + rnd() * 0.35);
    g.add(part(geo, browns[Math.floor(rnd() * browns.length)], d.x + Math.cos(a) * off, i === 0 ? 0.1 : 0.04, d.y + Math.sin(a) * off * 0.8));
  }
  // Stroh: helle Halme kreuz und quer
  const straw = [mats.lambert(0xe8d080), mats.lambert(0xc8ac60)];
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25 + rnd() * 0.25, 3), straw[i % 2]);
    const a = rnd() * Math.PI * 2;
    const r = rnd() * d.w * 0.45;
    s.position.set(d.x + Math.cos(a) * r, 0.18 + rnd() * 0.35 * (1 - r / d.w), d.y + Math.sin(a) * r * 0.8);
    s.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    g.add(s);
  }
  // Mistgabel, schräg im Haufen
  const fork = new THREE.Group();
  fork.add(part(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), mats.lambert(0x7a5532), 0, 0.75, 0));
  const iron = mats.lambert(0x5a5c60);
  fork.add(part(new THREE.BoxGeometry(0.28, 0.03, 0.03), iron, 0, 1.52, 0));
  for (const x of [-0.12, -0.04, 0.04, 0.12]) fork.add(part(new THREE.CylinderGeometry(0.01, 0.006, 0.3, 4), iron, x, 1.68, 0));
  // Zinken nach unten im Mist, Stiel ragt schräg heraus
  fork.rotation.set(Math.PI - 0.4, rnd() * 3, 0.2);
  fork.position.set(d.x + 0.25, 1.75, d.y - 0.1);
  g.add(fork);
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
  // Östlich der Häuser (unerreichbares Dickicht): große Tannen
  const firs = o.x > 50;
  for (let i = 0; i < trees; i++) g.add(tree(o.x + (rnd() - 0.5) * (o.w - 2), o.y + (rnd() - 0.5) * (o.h - 2), firs ? 1.5 : 1.4, mats, firs ? 'fir' : undefined));
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
