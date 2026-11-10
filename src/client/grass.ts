import * as THREE from 'three';
import { distanceToObstacle } from '../sim/grid';
import type { ArenaDef } from '../sim/types';

/**
 * Gras aus einzelnen Halmen: Ein Büschel besteht aus mehreren dünnen,
 * gebogenen, spitz zulaufenden Halmen (unten dunkel, oben hell). Alle Büschel
 * einer Art sind ein InstancedMesh und wiegen sich im Wind (je höher, desto
 * mehr). Die Normalen zeigen nach oben, damit die Halme von allen Seiten
 * gleichmäßig wie Rasen beleuchtet sind.
 */

export const grassWind = { value: 0 };

function rand(seed: number): () => number {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 233280 || 1;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

/** Büschel aus n Halmen, Höhe h (m), Streuung spread (m). */
export function clumpGeometry(n: number, h: number, spread: number, seed: number, width = 0.035, root = 0.32): THREE.BufferGeometry {
  const rnd = rand(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const SEG = 3;
  for (let b = 0; b < n; b++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * spread;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const hh = h * (0.6 + rnd() * 0.5);
    // Halm neigt sich nach außen und biegt sich zur Spitze hin
    const lean = 0.15 + rnd() * 0.35;
    const dir = a + (rnd() - 0.5) * 1.2;
    const dx = Math.cos(dir);
    const dz = Math.sin(dir);
    // Blattfläche quer zur Neigung
    const sx = -dz;
    const sz = dx;
    const w0 = width * (0.7 + rnd() * 0.6);
    const pts: { x: number; y: number; z: number; w: number; t: number }[] = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const bend = lean * t * t * hh;
      pts.push({ x: bx + dx * bend, y: hh * t * (1 - lean * 0.25 * t), z: bz + dz * bend, w: w0 * (1 - t * 0.85), t });
    }
    const shade = (t: number) => root + (1 - root) * t; // unten dunkel
    const v = (p: (typeof pts)[0], s: number) => {
      pos.push(p.x + sx * p.w * s, p.y, p.z + sz * p.w * s);
      const c = shade(p.t);
      col.push(c, c, c);
    };
    for (let i = 0; i < SEG; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      if (i === SEG - 1) {
        // Spitze als Dreieck
        v(p0, -1);
        v(p0, 1);
        pos.push(p1.x, p1.y, p1.z);
        col.push(1, 1, 1);
      } else {
        v(p0, -1);
        v(p0, 1);
        v(p1, 1);
        v(p0, -1);
        v(p1, 1);
        v(p1, -1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.computeBoundingSphere();
  return g;
}

const materials = new Map<number, THREE.MeshLambertMaterial>();

/** Grasmaterial mit Ecken-Farben und Wind (strength: Ausschlag je Meter Höhe). */
export function grassMaterial(strength: number): THREE.MeshLambertMaterial {
  let mat = materials.get(strength);
  if (mat) return mat;
  mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassWind;
    // Rückseiten der Halme nicht abdunkeln (Normale zeigt immer nach oben)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'),
    );
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float sway = position.y * position.y * ${strength.toFixed(3)};
        vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float gust = sin(uTime * 0.6 + base.x * 0.08 + base.z * 0.05) * 0.5 + 0.7;
        transformed.x += sin(uTime * 1.9 + base.x * 0.7 + base.z * 0.4) * sway * gust;
        transformed.z += cos(uTime * 1.5 + base.z * 0.6 + base.x * 0.2) * sway * gust * 0.6;`,
      );
  };
  materials.set(strength, mat);
  return mat;
}

/** Grüntöne für Büschel (Farbe je Instanz, multipliziert mit dem Hell-Dunkel-Verlauf). */
export function grassTint(rnd: () => number, out: THREE.Color, dry = 0): THREE.Color {
  const h = 0.22 + rnd() * 0.07 - dry * 0.08;
  const s = 0.5 + rnd() * 0.15 - dry * 0.2;
  const l = 0.4 + rnd() * 0.14 + dry * 0.08;
  return out.setHSL(h, s, l, THREE.SRGBColorSpace);
}

/**
 * Rasen: Büschel über die ganze Gartenfläche (und lichter im Gelände), nicht auf
 * Wegen, Pflaster, Beeten, Hindernissen und in den Verstecken (dort steht das hohe Gras).
 */
export function lawnGrass(arena: ArenaDef, density = 1.3): THREE.Group {
  const g = new THREE.Group();
  const rnd = rand(4242);
  const garden = arena.garden ?? { x: arena.width / 2, y: arena.height / 2, w: arena.width, h: arena.height };
  const x0 = arena.minX ?? 0;
  const y0 = arena.minY ?? 0;
  const x1 = x0 + arena.width;
  const y1 = y0 + arena.height;
  const rects: { x: number; y: number; w: number; h: number; pad: number }[] = [];
  for (const d of arena.decor ?? []) if (d.look === 'gravel' || d.look === 'cobbles') rects.push({ ...d, pad: d.look === 'gravel' ? 0.75 : 0.1 });
  for (const p of arena.paths ?? []) rects.push({ ...p, pad: 0.75 });
  for (const o of arena.objectives) if (o.kind === 'bed') rects.push({ x: o.x, y: o.y, w: o.w ?? 2, h: o.h ?? 1, pad: 0.15 });
  for (const s of arena.spawnPoints) if (s.id === 'bunker') rects.push({ x: s.x, y: s.y, w: 3, h: 4, pad: 0.2 });
  const inRect = (x: number, z: number) => rects.some((r) => Math.abs(x - r.x) < r.w / 2 + r.pad && Math.abs(z - r.y) < r.h / 2 + r.pad);
  const inBrush = (x: number, z: number) =>
    (arena.brush ?? []).some((b) => (b.kind === 'circle' ? Math.hypot(x - b.x, z - b.y) < b.r : Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.y) < b.h / 2));
  const blocked = (x: number, z: number) => arena.obstacles.some((o) => o.look !== 'fence' && distanceToObstacle({ x, y: z }, o) < 0.15);
  const inGarden = (x: number, z: number) => Math.abs(x - garden.x) < garden.w / 2 && Math.abs(z - garden.y) < garden.h / 2;
  const spots: { x: number; z: number; dry: number }[] = [];
  const step = 1 / Math.sqrt(density);
  for (let x = x0 + step / 2; x < x1; x += step)
    for (let z = y0 + step / 2; z < y1; z += step) {
      const px = x + (rnd() - 0.5) * step;
      const pz = z + (rnd() - 0.5) * step;
      const garden = inGarden(px, pz);
      // im Gelände außerhalb lichter und trockener
      if (!garden && rnd() < 0.45) continue;
      if (inRect(px, pz) || inBrush(px, pz) || blocked(px, pz)) continue;
      spots.push({ x: px, z: pz, dry: garden ? rnd() * 0.3 : 0.4 + rnd() * 0.5 });
    }
  const VARIANTS = 3;
  const geos = Array.from({ length: VARIANTS }, (_, k) => clumpGeometry(8, 0.24, 0.18, 11 + k * 7, 0.032, 0.55));
  const mat = grassMaterial(0.5);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  for (let k = 0; k < VARIANTS; k++) {
    const list = spots.filter((_, i) => i % VARIANTS === k);
    const inst = new THREE.InstancedMesh(geos[k], mat, Math.max(1, list.length));
    list.forEach((s, i) => {
      q.setFromAxisAngle(up, rnd() * Math.PI * 2);
      const sc = 0.75 + rnd() * 0.6;
      m.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(sc, sc * (0.8 + rnd() * 0.5), sc));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, grassTint(rnd, c, s.dry));
    });
    inst.count = list.length;
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    g.add(inst);
  }
  g.name = 'lawnGrass';
  return g;
}
