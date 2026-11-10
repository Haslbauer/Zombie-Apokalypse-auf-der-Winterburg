import * as THREE from 'three';

/**
 * Gartenwege: ein Erdband mit weichem Rand (festgetretene, hellere Erde mit
 * Kies, außen ein Saum aus niedergetretenem, trockenem Gras) und darauf
 * Bruchsteinplatten, die wie ein Mosaik lückenlos ineinanderpassen
 * (Voronoi-Zellen mit schmalen Erdfugen). Die Platten liegen fast bündig
 * im Boden: nur 1–3 cm hoch, abgerundete, dunklere Kanten, manche bemoost,
 * einzelne fehlen.
 */

function rand(seed: number): () => number {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 233280 || 1;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

// ---------- Erdband ----------

let bandTex: THREE.CanvasTexture | null = null;

/** Glattes Rauschen (Gitterwerte, kubisch interpoliert), in y periodisch. */
function makeNoise(seed: number, period: number): (x: number, y: number) => number {
  const r = rand(seed);
  const N = 64;
  const grid = Array.from({ length: N * N }, () => r());
  const at = (i: number, j: number) => grid[(((i % N) + N) % N) * N + (((j % period) + period) % period) % N];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = s(x - i);
    const fy = s(y - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}

/** Querprofil des Wegs: Mitte Erde mit Kies, außen trockenes Gras, Rand ausgefranst (u quer, v längs; 1 Kachel = 4 m). */
function bandTexture(): THREE.CanvasTexture | null {
  if (bandTex) return bandTex;
  if (typeof document === 'undefined') return null;
  const W = 128;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const n1 = makeNoise(3, 16);
  const n2 = makeNoise(7, 64);
  const r = rand(11);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const d = Math.abs(u - 0.5) * 2; // 0 Mitte, 1 Rand
      const edge = (n1((y / H) * 16, u * 4) - 0.5) * 0.22 + (n2((y / H) * 64, u * 16) - 0.5) * 0.08;
      const core = 0.6 + edge;
      const k = n2((y / H) * 64 + 13, u * 20);
      // Erde: festgetreten, heller in der Mitte
      let cr = 132 + k * 28 - d * 18;
      let cg = 114 + k * 24 - d * 16;
      let cb = 88 + k * 18 - d * 12;
      // Kies: helle und dunkle Steinchen
      const q = r();
      if (q < 0.035) {
        cr += 40;
        cg += 38;
        cb += 36;
      } else if (q < 0.06) {
        cr -= 35;
        cg -= 32;
        cb -= 28;
      }
      let a = 255;
      if (d > core) {
        // Saum: trockenes, niedergetretenes Gras, nach außen durchsichtig
        const t = Math.min(1, (d - core) / Math.max(0.05, 1 - core));
        const grass = [118 + k * 20, 116 + k * 18, 64 + k * 10];
        const m = Math.min(1, t * 2.2);
        cr = cr + (grass[0] - cr) * m;
        cg = cg + (grass[1] - cg) * m;
        cb = cb + (grass[2] - cb) * m;
        a = Math.round(255 * (1 - t) ** 1.4 * 0.9);
      }
      const i = (y * W + x) * 4;
      img.data[i] = cr;
      img.data[i + 1] = cg;
      img.data[i + 2] = cb;
      img.data[i + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  bandTex = new THREE.CanvasTexture(c);
  bandTex.colorSpace = THREE.SRGBColorSpace;
  bandTex.wrapT = THREE.RepeatWrapping;
  bandTex.anisotropy = 4;
  return bandTex;
}

let bandMat: THREE.MeshLambertMaterial | null = null;
let stoneMat: THREE.MeshLambertMaterial | null = null;

// ---------- Platten (Voronoi) ----------

type P = [number, number];

/** Polygon an der Halbebene (p - m)·n <= 0 abschneiden (Sutherland-Hodgman). */
function clip(poly: P[], m: P, n: P): P[] {
  const out: P[] = [];
  const side = (p: P) => (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa <= 0) !== (sb <= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

const PALETTE = [0xb8b0a0, 0xa8a090, 0xc4baa6, 0x9c9588, 0xb0a692, 0xbcb09a].map((c) => new THREE.Color(c));
const MOSS = new THREE.Color(0x56703a);

/** Plattenmosaik für einen Weg der Länge len (entlang x) und Breite wid (entlang z), lokal um (0,0). */
function stones(len: number, wid: number, seed: number): THREE.BufferGeometry {
  const rnd = rand(seed);
  const sp = Math.min(0.46, wid / 2.6);
  const hl = len / 2;
  const hw = wid / 2;
  const pts: P[] = [];
  for (let x = -hl - sp; x <= hl + sp; x += sp)
    for (let z = -hw - sp; z <= hw + sp; z += sp * 0.9) pts.push([x + (rnd() - 0.5) * sp * 0.75, z + (rnd() - 0.5) * sp * 0.75]);
  // Zellen berechnen; zweimal Lloyd-Glättung (Punkte in die Zellmitte), damit die Platten
  // gleichmäßig und rundlich werden statt spitzer Splitter
  type Cell = { poly: P[]; cx: number; cz: number; area: number };
  const cellOf = (i: number): Cell | null => {
    const p = pts[i];
    let poly: P[] = [
      [-hl, -hw],
      [hl, -hw],
      [hl, hw],
      [-hl, hw],
    ];
    for (let j = 0; j < pts.length && poly.length >= 3; j++) {
      if (j === i) continue;
      const q = pts[j];
      const dx = q[0] - p[0];
      const dz = q[1] - p[1];
      if (dx * dx + dz * dz > sp * sp * 6) continue;
      poly = clip(poly, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], [dx, dz]);
    }
    if (poly.length < 3) return null;
    let area = 0;
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k];
      const b = poly[(k + 1) % poly.length];
      const cr = a[0] * b[1] - b[0] * a[1];
      area += cr;
      cx += (a[0] + b[0]) * cr;
      cz += (a[1] + b[1]) * cr;
    }
    area /= 2;
    if (Math.abs(area) < 1e-4) return null;
    return { poly, cx: cx / (6 * area), cz: cz / (6 * area), area: Math.abs(area) };
  };
  for (let it = 0; it < 2; it++) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (Math.abs(p[0]) > hl || Math.abs(p[1]) > hw) continue;
      const c = cellOf(i);
      if (c) pts[i] = [c.cx, c.cz];
    }
  }
  const pos: number[] = [];
  const col: number[] = [];
  const tmp = new THREE.Color();
  const push = (x: number, y: number, z: number, c: THREE.Color) => {
    pos.push(x, y, z);
    col.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (Math.abs(p[0]) > hl + sp * 0.5 || Math.abs(p[1]) > hw + sp * 0.5) continue;
    const cell = cellOf(i);
    if (!cell || cell.area < 0.03) continue;
    const { poly, cx, cz } = cell;
    // Randplatten fehlen öfter (ausgefranster Rand), sonst selten
    const edge = Math.abs(cz) > hw - sp * 0.6 || Math.abs(cx) > hl - sp * 0.6;
    if (rnd() < (edge ? 0.1 : 0.03)) continue;
    // Fuge: Umriss zur Mitte hin schrumpfen; Fase: innerer Ring etwas höher
    const gap = 0.012 + rnd() * 0.012;
    const shrink = (k: number, extra: number): P => {
      const v = poly[k];
      const dx = cx - v[0];
      const dz = cz - v[1];
      const dl = Math.hypot(dx, dz) || 1;
      const m = Math.min(dl * 0.8, gap + extra);
      return [v[0] + (dx / dl) * m, v[1] + (dz / dl) * m];
    };
    const outer = poly.map((_, k) => shrink(k, 0));
    const inner = poly.map((_, k) => shrink(k, 0.03));
    const h = 0.012 + rnd() * 0.016;
    const tx = (rnd() - 0.5) * 0.03;
    const tz = (rnd() - 0.5) * 0.03;
    const y = (x: number, z: number, base: number) => base + (x - cx) * tx + (z - cz) * tz;
    const base = PALETTE[Math.floor(rnd() * PALETTE.length)].clone().multiplyScalar(0.88 + rnd() * 0.22);
    const mossy = rnd() < 0.18;
    const top = base.clone().multiplyScalar(1.05);
    const rim = (mossy ? base.clone().lerp(MOSS, 0.55) : base.clone()).multiplyScalar(0.78);
    const foot = base.clone().multiplyScalar(0.45);
    const n = poly.length;
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      const a = inner[k];
      const b = inner[k2];
      // Deckfläche (Fächer von der Mitte)
      push(cx, y(cx, cz, h + 0.004), cz, tmp.copy(top).multiplyScalar(1.04));
      push(b[0], y(b[0], b[1], h), b[1], top);
      push(a[0], y(a[0], a[1], h), a[1], top);
      // Fase
      const oa = outer[k];
      const ob = outer[k2];
      push(a[0], y(a[0], a[1], h), a[1], top);
      push(b[0], y(b[0], b[1], h), b[1], top);
      push(ob[0], y(ob[0], ob[1], h - 0.012), ob[1], rim);
      push(a[0], y(a[0], a[1], h), a[1], top);
      push(ob[0], y(ob[0], ob[1], h - 0.012), ob[1], rim);
      push(oa[0], y(oa[0], oa[1], h - 0.012), oa[1], rim);
      // Seitenwand bis knapp unter den Boden
      push(oa[0], y(oa[0], oa[1], h - 0.012), oa[1], rim);
      push(ob[0], y(ob[0], ob[1], h - 0.012), ob[1], rim);
      push(ob[0], -0.02, ob[1], foot);
      push(oa[0], y(oa[0], oa[1], h - 0.012), oa[1], rim);
      push(ob[0], -0.02, ob[1], foot);
      push(oa[0], -0.02, oa[1], foot);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Umlaufsinn: Dreiecke so drehen, dass die Normalen nach oben zeigen
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i);
    const az = p.getZ(i);
    const bx = p.getX(i + 1);
    const bz = p.getZ(i + 1);
    const cx = p.getX(i + 2);
    const cz = p.getZ(i + 2);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny < 0) {
      // b und c tauschen
      for (const attr of [p, geo.attributes.color as THREE.BufferAttribute]) {
        const tx = attr.getX(i + 1);
        const ty = attr.getY(i + 1);
        const tz = attr.getZ(i + 1);
        attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
        attr.setXYZ(i + 2, tx, ty, tz);
      }
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/** Weg (Rechteck x/y, Breite w, Höhe h) als Gruppe aus Erdband und Plattenmosaik. */
export function pathMesh(d: { x: number; y: number; w: number; h: number }): THREE.Group {
  const g = new THREE.Group();
  const along = d.w >= d.h;
  const len = along ? d.w : d.h;
  const wid = along ? d.h : d.w;
  const inner = new THREE.Group();
  inner.position.set(d.x, 0, d.y);
  if (!along) inner.rotation.y = Math.PI / 2;
  g.add(inner);
  // Erdband (breiter als der Weg; der Saum läuft in die Wiese aus)
  const tex = bandTexture();
  bandMat ??= new THREE.MeshLambertMaterial({ map: tex, color: tex ? 0xffffff : 0x8a7a62, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const bw = wid + 1.5;
  const bl = len + 0.8;
  const band = new THREE.PlaneGeometry(bl, bw).rotateX(-Math.PI / 2);
  const uv = band.attributes.uv as THREE.BufferAttribute;
  const bp = band.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (bp.getZ(i) + bw / 2) / bw, (bp.getX(i) + d.x * (along ? 1 : 0) + d.y * (along ? 0 : 1)) / 4);
  const bandMesh = new THREE.Mesh(band, bandMat);
  bandMesh.position.y = 0.006;
  bandMesh.receiveShadow = true;
  bandMesh.renderOrder = -1;
  inner.add(bandMesh);
  // Platten
  stoneMat ??= new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const st = new THREE.Mesh(stones(len, wid * 0.94, d.x * 7 + d.y * 13 + len), stoneMat);
  st.receiveShadow = true;
  inner.add(st);
  return g;
}
