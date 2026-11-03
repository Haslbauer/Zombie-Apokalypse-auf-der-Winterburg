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

/** Ein ganzer Baum (für einzelne Bäume auf der Karte). */
export function treeMesh(x: number, y: number, r: number): THREE.Group {
  const seed = x * 31 + y * 17;
  const rnd = rand(seed);
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
