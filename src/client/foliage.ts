import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Organischere Bäume, Bodenflecken und Glühwürmchen für die Karte.
 *  - Laubkronen aus mehreren unregelmäßigen Ballen mit Farbverlauf (innen und
 *    unten dunkler, oben heller), Nadelbäume aus versetzten Etagen
 *  - Stämme mit Wurzelansatz und einem Ast
 *  - großflächige Bodenflecken (Moos, Erde, trockenes Gras) gegen das Kachelmuster
 *  - Glühwürmchen, die über Garten und Waldrand schweben und blinken
 * Alle Formen tragen Vertex-Farben; ein Material reicht für alle Bäume.
 */

function rand(seed: number): () => number {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 233280 || 1;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

/** Glatte, unregelmäßige Kugel: Ecken zusammenführen, dann nach Rauschen verschieben. */
function lumpy(radius: number, rnd: () => number, detail = 1, amount = 0.22): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const phase = [rnd() * 10, rnd() * 10, rnd() * 10];
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 2.1 + phase[0]) * Math.sin(v.y * 1.7 + phase[1]) * Math.sin(v.z * 2.3 + phase[2]);
    v.multiplyScalar(1 + n * amount + (rnd() - 0.5) * amount * 0.5);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g.toNonIndexed();
}

/** Vertex-Farben nach Höhe und Abstand zur Mitte (Licht von oben, Schatten innen). */
function paint(g: THREE.BufferGeometry, low: THREE.Color, high: THREE.Color, y0: number, y1: number, rnd: () => number): void {
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    // Je Dreieck eine Farbe (Low-Poly-Look), mit leichtem Zufall
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const k = THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1);
    c.copy(low).lerp(high, k);
    c.offsetHSL((rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.05);
    for (let j = 0; j < 3; j++) colors.set([c.r, c.g, c.b], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

const LEAF_LOW = new THREE.Color(0x1f4d22);
const LEAF_HIGH = new THREE.Color(0x5aa646);
const PINE_LOW = new THREE.Color(0x173a20);
const PINE_HIGH = new THREE.Color(0x3f7c3c);
const BARK_LOW = new THREE.Color(0x3a2616);
const BARK_HIGH = new THREE.Color(0x6e4a2c);

/** Laubkrone (Höhe ab Boden), Radius r: 4–6 Ballen. */
export function crownGeometry(seed: number, r: number, base: number): THREE.BufferGeometry {
  const rnd = rand(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd();
    const rr = r * (0.55 + rnd() * 0.3);
    const g = lumpy(rr, rnd);
    const off = i === 0 ? 0 : r * (0.45 + rnd() * 0.25);
    g.translate(Math.cos(a) * off, base + r * 0.75 + (i === 0 ? r * 0.45 : rnd() * r * 0.6), Math.sin(a) * off);
    parts.push(g);
  }
  const g = mergeGeometries(parts)!;
  paint(g, LEAF_LOW, LEAF_HIGH, base, base + r * 2.2, rnd);
  g.computeVertexNormals();
  return g;
}

/** Nadelbaum: 4 versetzte, leicht unregelmäßige Etagen. */
export function pineGeometry(seed: number, r: number, base: number): THREE.BufferGeometry {
  const rnd = rand(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const rr = r * (1.25 - i * 0.25);
    const h = r * (1.5 - i * 0.15);
    let g: THREE.BufferGeometry = new THREE.ConeGeometry(rr, h, 9, 2);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) if (p.getY(k) < h / 2 - 0.01) p.setX(k, p.getX(k) * (0.85 + rnd() * 0.3));
    g = g.toNonIndexed();
    g.rotateY(rnd() * Math.PI);
    g.translate((rnd() - 0.5) * 0.1, base + h / 2 + i * r * 0.8, (rnd() - 0.5) * 0.1);
    parts.push(g);
  }
  const g = mergeGeometries(parts)!;
  paint(g, PINE_LOW, PINE_HIGH, base, base + r * 4, rnd);
  g.computeVertexNormals();
  return g;
}

/** Stamm mit Wurzelansatz (und bei Laubbäumen einem Ast). */
export function trunkGeometry(seed: number, r: number, h: number, branch = true): THREE.BufferGeometry {
  const rnd = rand(seed + 7);
  const prof = [
    new THREE.Vector2(r * 1.7, 0),
    new THREE.Vector2(r * 1.15, h * 0.08),
    new THREE.Vector2(r, h * 0.25),
    new THREE.Vector2(r * 0.85, h * 0.7),
    new THREE.Vector2(r * 0.7, h),
    new THREE.Vector2(0, h),
  ];
  let g: THREE.BufferGeometry = new THREE.LatheGeometry(prof, 7);
  g.deleteAttribute('uv');
  const parts = [g.toNonIndexed()];
  if (branch) {
    const b = new THREE.CylinderGeometry(r * 0.25, r * 0.4, h * 0.45, 5).toNonIndexed();
    b.deleteAttribute('uv');
    b.rotateZ(0.9 + rnd() * 0.3);
    b.rotateY(rnd() * Math.PI * 2);
    b.translate(0, h * 0.7, 0);
    parts.push(b);
  }
  g = mergeGeometries(parts.map((x) => (x.deleteAttribute('normal'), x)))!;
  paint(g, BARK_LOW, BARK_HIGH, 0, h, rnd);
  g.computeVertexNormals();
  return g;
}

let foliageMat: THREE.MeshLambertMaterial | null = null;
/** Gemeinsames Material aller Bäume (Vertex-Farben, flach schattiert). */
export function foliageMaterial(): THREE.MeshLambertMaterial {
  return (foliageMat ??= new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

/** Baumarten auf der Karte (Kartendaten: obstacle.species). */
export type TreeSpecies = 'apple' | 'fruit' | 'olive' | 'fig' | 'rowan' | 'yew' | 'elder' | 'fir';

/** Kleine Kugeln (Früchte, Beeren, Blüten) in einer Farbe, als eine Geometrie. */
function dots(points: THREE.Vector3[], radius: number, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const parts = points.map((p) => {
    const g = new THREE.IcosahedronGeometry(radius, 0);
    g.deleteAttribute('uv');
    g.translate(p.x, p.y, p.z);
    return g;
  });
  const g = mergeGeometries(parts)!;
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Punkte auf der Oberfläche einer Krone (grob: Halbkugel um center). */
function crownPoints(rnd: () => number, n: number, cx: number, cy: number, cz: number, r: number, low = 0.1): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const e = Math.asin(low + rnd() * (1 - low)) * (rnd() < 0.8 ? 1 : -0.4);
    out.push(new THREE.Vector3(cx + Math.cos(a) * Math.cos(e) * r, cy + Math.sin(e) * r * 0.8, cz + Math.sin(a) * Math.cos(e) * r));
  }
  return out;
}

/** Krone mit eigenen Farben (für besondere Arten). */
function tintedCrown(seed: number, r: number, base: number, low: number, high: number, balls = 0): THREE.BufferGeometry {
  const rnd = rand(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = balls || 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd();
    const g = lumpy(r * (0.5 + rnd() * 0.3), rnd);
    const off = i === 0 ? 0 : r * (0.45 + rnd() * 0.3);
    g.translate(Math.cos(a) * off, base + r * 0.7 + (i === 0 ? r * 0.4 : rnd() * r * 0.5), Math.sin(a) * off);
    parts.push(g);
  }
  const g = mergeGeometries(parts)!;
  paint(g, new THREE.Color(low), new THREE.Color(high), base, base + r * 2, rnd);
  return g;
}

/** Besondere Baumart als fertige Gruppe (Stamm + Krone + Früchte/Blüten). */
function speciesTree(species: TreeSpecies, seed: number, r: number): THREE.Group {
  const rnd = rand(seed);
  const g = new THREE.Group();
  const mesh = (geo: THREE.BufferGeometry) => {
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, foliageMaterial());
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  const s = 0.9 + rnd() * 0.25;
  switch (species) {
    case 'apple':
    case 'fruit': {
      // Obstbaum: kurzer Stamm, runde, lockere Krone, Früchte rundherum (auch ein paar im Gras)
      const h = 1.4 * s;
      mesh(trunkGeometry(seed, r * 0.2, h));
      const cr = r * 1.05 * s;
      const crown = tintedCrown(seed, cr, h * 0.75, 0x2a5a24, 0x6aae4a);
      const cy = h * 0.75 + cr * 0.95;
      const fruitColor = species === 'apple' ? 0xd2302a : rnd() < 0.5 ? 0xd8c040 : 0x6a2a6a;
      const fruits = dots(crownPoints(rnd, 26, 0, cy, 0, cr * 1.05), 0.09, fruitColor);
      const fallen = dots(Array.from({ length: 5 }, () => new THREE.Vector3((rnd() - 0.5) * cr * 2, 0.07, (rnd() - 0.5) * cr * 2)), 0.08, fruitColor);
      mesh(mergeGeometries([crown.toNonIndexed(), fruits.toNonIndexed(), fallen.toNonIndexed()].map((x) => (x.deleteAttribute('normal'), x)))!);
      break;
    }
    case 'olive': {
      // Olivenbaum: zwei bis drei knorrige, gedrehte Stämme, silbrig-graugrünes, lockeres Laub
      for (let i = 0; i < 3; i++) {
        const t = trunkGeometry(seed + i * 3, r * 0.13, 1.6 * s, false);
        t.rotateZ((rnd() - 0.5) * 0.5);
        t.rotateY(i * 2.1);
        t.translate(Math.cos(i * 2.1) * 0.12, 0, Math.sin(i * 2.1) * 0.12);
        mesh(t);
      }
      const crown = tintedCrown(seed, r * 1.0 * s, 1.2 * s, 0x5a6a4a, 0xa8b48a, 7);
      const olives = dots(crownPoints(rnd, 16, 0, 1.2 * s + r * 0.9, 0, r * 1.0), 0.05, 0x3a3a2a);
      mesh(mergeGeometries([crown.toNonIndexed(), olives.toNonIndexed()].map((x) => (x.deleteAttribute('normal'), x)))!);
      break;
    }
    case 'fig': {
      // Feigenbaum: mehrere Stämme, breite, niedrige Krone mit großem, dunklem Laub
      for (let i = 0; i < 3; i++) {
        const t = trunkGeometry(seed + i, r * 0.12, 1.3 * s, false);
        t.rotateZ(0.35);
        t.rotateY(i * 2.1 + 0.4);
        mesh(t);
      }
      const crown = tintedCrown(seed, r * 1.15 * s, 0.8 * s, 0x1f4a22, 0x4f8a3a, 6);
      crown.scale(1.25, 0.8, 1.25);
      const figs = dots(crownPoints(rnd, 12, 0, 0.8 * s + r * 0.8, 0, r * 1.3), 0.07, 0x5a3a5a);
      mesh(mergeGeometries([crown.toNonIndexed(), figs.toNonIndexed()].map((x) => (x.deleteAttribute('normal'), x)))!);
      break;
    }
    case 'rowan': {
      // Eberesche: schlanker Stamm, luftige Krone, leuchtend orangerote Beerendolden
      const h = 2.2 * s;
      mesh(trunkGeometry(seed, r * 0.16, h));
      const cr = r * 0.9 * s;
      const crown = tintedCrown(seed, cr, h * 0.7, 0x2f5a2a, 0x7ab84e, 5);
      const clusters: THREE.Vector3[] = [];
      for (const c of crownPoints(rnd, 9, 0, h * 0.7 + cr * 0.9, 0, cr * 1.05)) for (let k = 0; k < 5; k++) clusters.push(c.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.18, (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.18)));
      mesh(mergeGeometries([crown.toNonIndexed(), dots(clusters, 0.05, 0xe8501e).toNonIndexed()].map((x) => (x.deleteAttribute('normal'), x)))!);
      break;
    }
    case 'yew': {
      // Eibe: sehr dunkel, dicht, schon ab dem Boden benadelt, ein paar rote Beeren
      mesh(trunkGeometry(seed, r * 0.15, 0.6, false));
      const crown = tintedCrown(seed, r * 0.95 * s, -0.2, 0x0f2618, 0x2a4a2c, 6);
      crown.scale(1, 1.35, 1);
      const berries = dots(crownPoints(rnd, 10, 0, r * 1.2, 0, r * 0.95), 0.04, 0xc8201e);
      mesh(mergeGeometries([crown.toNonIndexed(), berries.toNonIndexed()].map((x) => (x.deleteAttribute('normal'), x)))!);
      break;
    }
    case 'elder': {
      // Holunder: Strauch aus mehreren dünnen Stämmen, weiße, flache Blütendolden
      for (let i = 0; i < 4; i++) {
        const t = trunkGeometry(seed + i * 5, r * 0.07, 1.1 * s, false);
        t.rotateZ(0.25 + rnd() * 0.25);
        t.rotateY(i * 1.6);
        mesh(t);
      }
      const crown = tintedCrown(seed, r * 0.85 * s, 0.3, 0x24502a, 0x5a9a44, 6);
      crown.scale(1.2, 0.85, 1.2);
      const umbels: THREE.BufferGeometry[] = [];
      for (const c of crownPoints(rnd, 12, 0, 0.3 + r * 0.75, 0, r * 1.0, 0.3)) {
        const u = new THREE.CylinderGeometry(0.13, 0.08, 0.04, 7);
        u.deleteAttribute('uv');
        u.translate(c.x, c.y, c.z);
        umbels.push(u.toNonIndexed());
      }
      const white = mergeGeometries(umbels)!;
      const col = new Float32Array(white.attributes.position.count * 3).fill(0.95);
      white.setAttribute('color', new THREE.BufferAttribute(col, 3));
      mesh(mergeGeometries([crown.toNonIndexed(), white].map((x) => (x.deleteAttribute('normal'), x)))!);
      break;
    }
    case 'fir': {
      // Große Tanne
      mesh(trunkGeometry(seed, r * 0.22, 1.6, false));
      mesh(pineGeometry(seed, r * 1.2 * s, 1.0));
      g.scale.setScalar(1.6);
      break;
    }
  }
  return g;
}

/** Ein ganzer Baum (für einzelne Bäume auf der Karte); species: besondere Art. */
export function treeMesh(x: number, y: number, r: number, species?: TreeSpecies): THREE.Group {
  const seed = x * 31 + y * 17;
  const rnd = rand(seed);
  if (species) {
    const t = speciesTree(species, seed, r);
    t.position.set(x, 0, y);
    t.rotation.y = rnd() * Math.PI * 2;
    return t;
  }
  const g = new THREE.Group();
  const s = 0.85 + rnd() * 0.35;
  const pine = rnd() < 0.35;
  const trunkH = (pine ? 1.4 : 1.9) * s;
  const trunk = new THREE.Mesh(trunkGeometry(seed, r * 0.24, trunkH, !pine), foliageMaterial());
  const crown = new THREE.Mesh(pine ? pineGeometry(seed, r * 1.05 * s, trunkH * 0.6) : crownGeometry(seed, r * 1.25 * s, trunkH * 0.8), foliageMaterial());
  for (const m of [trunk, crown]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  g.position.set(x, 0, y);
  g.rotation.y = rnd() * Math.PI * 2;
  return g;
}

// ---------- Boden ----------

/** Großflächige Flecken (Moos, Erde, trockenes Gras) als halbtransparente Bodenschicht. */
export function groundPatches(x0: number, y0: number, x1: number, y1: number): THREE.Mesh | null {
  if (typeof document === 'undefined') return null;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rnd = rand(42);
  const blob = (color: string, count: number, rMin: number, rMax: number, alpha: number) => {
    for (let i = 0; i < count; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = rMin + rnd() * (rMax - rMin);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${color},${alpha})`);
      grad.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, r, r * (0.6 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  };
  blob('20,40,18', 70, 20, 70, 0.45); // dunkles Moos
  blob('92,70,40', 40, 12, 45, 0.35); // nackte Erde
  blob('150,150,80', 35, 15, 50, 0.22); // trockenes Gras
  blob('60,90,40', 60, 8, 25, 0.3); // Grasbüschel-Schatten
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, y1 - y0).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  mesh.position.set((x0 + x1) / 2, -0.004, (y0 + y1) / 2);
  mesh.receiveShadow = true;
  mesh.renderOrder = -1;
  return mesh;
}

// ---------- Glühwürmchen ----------

/** Glühwürmchen: schweben langsam, blinken unregelmäßig (eine Zeichnung für alle). */
export function fireflies(x0: number, y0: number, x1: number, y1: number, count = 70): { points: THREE.Points; update: (time: number) => void } {
  const rnd = rand(7);
  const base = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) base.set([x0 + rnd() * (x1 - x0), 0.4 + rnd() * 2.2, y0 + rnd() * (y1 - y0)], i * 3);
  const pos = new Float32Array(base);
  const col = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  let map: THREE.Texture | null = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    map = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.PointsMaterial({ size: 0.35, map, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const phase = Array.from({ length: count }, () => rnd() * 100);
  return {
    points,
    update(time) {
      for (let i = 0; i < count; i++) {
        const t = time * 0.35 + phase[i];
        pos[i * 3] = base[i * 3] + Math.sin(t * 0.9) * 1.2;
        pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 1.7) * 0.35;
        pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.7) * 1.2;
        const blink = Math.max(0, Math.sin(time * 1.3 + phase[i] * 3)) ** 3;
        col.set([0.75 * blink, 1.0 * blink, 0.35 * blink], i * 3);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}
