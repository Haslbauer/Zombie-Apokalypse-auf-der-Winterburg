import * as THREE from 'three';
import { arenaBounds } from '../sim/grid';
import type { ArenaDef, Obstacle, PropDef } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { gardenMesh, loadGarden } from './gardenmodels';
import { Mats } from './mapdecor';

/**
 * Nachtstimmung und Kleinkram: brennende Fässer an den Toren, Barrikaden,
 * Knochen, Blut, Pilze, Spinnweben, offene Grube, Vogelscheuche, Handwagen,
 * Krähen (flattern auf, wenn ein Held nahe kommt), Bodennebel; dazu die
 * Hindernisse Autowrack und Brunnen. Feste Teile kommen in static (wird
 * zusammengefasst), bewegte in live.
 */
export interface NightAnimation {
  update(time: number, heroes: Vec2[]): void;
  setDetail(on: boolean): void;
}

function rand(seed: number): () => number {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 233280 || 1;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

let dirtMat: THREE.MeshLambertMaterial | null = null;
/** Kahle Erdstelle: unregelmäßiger Fleck mit weichem Rand und ein paar Steinchen. */
function dirtMaterial(): THREE.MeshLambertMaterial {
  if (dirtMat) return dirtMat;
  if (typeof document === 'undefined') return (dirtMat = new THREE.MeshLambertMaterial({ color: 0x3a2e22, transparent: true, opacity: 0.5 }));
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rnd = rand(5);
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * 22;
    const x = S / 2 + Math.cos(a) * d;
    const y = S / 2 + Math.sin(a) * d;
    const r = 18 + rnd() * 22;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const col = rnd() < 0.5 ? '78,60,40' : '96,76,50';
    grad.addColorStop(0, `rgba(${col},0.55)`);
    grad.addColorStop(0.6, `rgba(${col},0.3)`);
    grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Steinchen
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * 30;
    g.fillStyle = `rgba(${150 + Math.floor(rnd() * 40)},${140 + Math.floor(rnd() * 30)},${120 + Math.floor(rnd() * 30)},0.8)`;
    g.beginPath();
    g.ellipse(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 1 + rnd() * 2, 1 + rnd() * 1.5, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  dirtMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  return dirtMat;
}

let softTexture: THREE.CanvasTexture | null = null;
/** Weicher, runder Fleck (Lichtschein, Flammen, Nebel). */
function soft(): THREE.CanvasTexture {
  if (softTexture) return softTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  softTexture = new THREE.CanvasTexture(c);
  return softTexture;
}

let fogTexture: THREE.CanvasTexture | null = null;
/** Wolkige Nebelschwade aus vielen weichen Flecken. */
function fogTex(): THREE.CanvasTexture {
  if (fogTexture) return fogTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rnd = rand(7);
  for (let i = 0; i < 40; i++) {
    const x = 20 + rnd() * 88;
    const y = 20 + rnd() * 88;
    const r = 10 + rnd() * 24;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(200,210,230,0.16)');
    grad.addColorStop(1, 'rgba(200,210,230,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  fogTexture = new THREE.CanvasTexture(c);
  return fogTexture;
}

/** Leuchtende, flache Scheibe am Boden (Lichtschein). */
export function groundGlow(color: number, size: number, opacity: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ map: soft(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
  disc.position.y = 0.04;
  disc.renderOrder = 2;
  return disc;
}

/** Hindernisse mit eigenem Aussehen: verrostetes Autowrack und Brunnen. */
export function nightObstacle(o: Obstacle, mats: Mats): THREE.Object3D | null {
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.y);
  if (o.look === 'car' && o.kind === 'rect') {
    const alongX = o.w >= o.h;
    const inner = new THREE.Group();
    if (!alongX) inner.rotation.y = Math.PI / 2;
    const len = Math.max(o.w, o.h);
    const wid = Math.min(o.w, o.h);
    const rust = mats.lambert(0x7a4a32);
    const paint = mats.lambert(0x4f6a6e);
    inner.add(part(new THREE.BoxGeometry(len, 0.7, wid), paint, 0, 0.65, 0));
    inner.add(part(new THREE.BoxGeometry(len * 0.55, 0.55, wid * 0.92), rust, -len * 0.08, 1.27, 0));
    // Scheiben dunkel, eine zerbrochen
    inner.add(part(new THREE.BoxGeometry(0.06, 0.42, wid * 0.8), mats.lambert(0x1a2228), len * 0.2 + 0.02, 1.28, 0, false));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const wheel = part(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 10).rotateX(Math.PI / 2), mats.lambert(0x1c1c1c), sx * len * 0.32, 0.33, sz * (wid / 2 - 0.05));
        inner.add(wheel);
      }
    }
    // offene Tür
    const door = part(new THREE.BoxGeometry(len * 0.3, 0.6, 0.06), paint, len * 0.05 + 0.3, 0.75, wid / 2 + 0.35);
    door.rotation.y = -0.9;
    inner.add(door);
    // Roststellen
    inner.add(part(new THREE.BoxGeometry(len * 0.3, 0.02, wid * 0.5), rust, len * 0.3, 1.01, 0.1, false));
    inner.rotation.z = 0.04;
    g.add(inner);
    return g;
  }
  if (o.look === 'well' && o.kind === 'circle') {
    const stone = mats.lambert(0x8e897f);
    g.add(part(new THREE.CylinderGeometry(o.r, o.r * 1.05, 0.85, 14, 1, true), stone, 0, 0.42, 0));
    g.add(part(new THREE.CylinderGeometry(o.r * 0.85, o.r * 0.85, 0.05, 14), mats.lambert(0x05080a), 0, 0.7, 0, false));
    g.add(part(new THREE.TorusGeometry(o.r * 0.95, 0.09, 6, 14).rotateX(Math.PI / 2), mats.lambert(0x8a857c), 0, 0.86, 0));
    const wood = mats.lambert(0x5a4030);
    for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.12, 1.5, 0.12), wood, s * o.r * 0.85, 1.2, 0));
    g.add(part(new THREE.CylinderGeometry(0.08, 0.08, o.r * 1.8, 6).rotateZ(Math.PI / 2), wood, 0, 1.75, 0));
    const roof = part(new THREE.ConeGeometry(o.r * 1.35, 0.7, 4), mats.lambert(0x5e2418), 0, 2.25, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    g.add(part(new THREE.BoxGeometry(0.28, 0.25, 0.28), wood, 0.1, 1.35, 0));
    return g;
  }
  return null;
}

/**
 * Deko ohne Kollision. static: wird zusammengefasst, live: bewegte Teile
 * (Flammen, Krähen, Nebel).
 */
export function nightDecor(stat: THREE.Group, live: THREE.Group, arena: ArenaDef, mats: Mats): NightAnimation {
  const flames: { mesh: THREE.Sprite; glow: THREE.Mesh; seed: number }[] = [];
  const sparks: { s: THREE.Sprite; x: number; z: number; seed: number }[] = [];
  const flowerSpots: { x: number; z: number; kind: number }[] = [];
  const crows: { bird: THREE.Group; home: THREE.Vector3; seed: number; fly: number }[] = [];
  const wood = mats.lambert(0x5e4429);
  const darkWood = mats.lambert(0x3b2a1c);
  const bone = mats.lambert(0xd8d0bc);
  const blood = new THREE.MeshLambertMaterial({ color: 0x4a0608, transparent: true, opacity: 0.7, depthWrite: false });
  const flameMat = new THREE.SpriteMaterial({ map: soft(), color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const crowMat = mats.lambert(0x111114);

  const barrelBodies = new THREE.Group();
  const barrelSpots: { x: number; z: number; rot: number }[] = [];
  live.add(barrelBodies);
  for (const p of arena.props ?? []) {
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.y);
    g.rotation.y = p.rot ?? 0;
    const rnd = rand(p.x * 17 + p.y * 3);
    switch (p.look) {
      case 'firebarrel': {
        // Fass (wird gegen das Blender-Modell getauscht), Glut bleibt leuchtend im Code
        const body = new THREE.Group();
        body.position.copy(g.position);
        body.rotation.copy(g.rotation);
        body.add(part(new THREE.CylinderGeometry(0.36, 0.33, 0.95, 12), mats.lambert(0x4a3a30), 0, 0.47, 0));
        body.add(part(new THREE.TorusGeometry(0.35, 0.03, 4, 12).rotateX(Math.PI / 2), mats.lambert(0x2a2420), 0, 0.3, 0, false));
        body.add(part(new THREE.TorusGeometry(0.35, 0.03, 4, 12).rotateX(Math.PI / 2), mats.lambert(0x2a2420), 0, 0.75, 0, false));
        barrelBodies.add(body);
        barrelSpots.push({ x: p.x, z: p.y, rot: (p.rot ?? 0) + rnd() * 6 });
        g.add(part(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 10), mats.lambert(0xff7a20, { emissive: 0xff5a10 }), 0, 0.88, 0, false));
        stat.add(g);
        // Flamme und flackernder Lichtschein (bewegt)
        const flame = new THREE.Sprite(flameMat);
        flame.position.set(p.x, 1.45, p.y);
        const glow = groundGlow(0xff8a30, 9, 0.55);
        glow.position.set(p.x, 0.05, p.y);
        live.add(flame, glow);
        flames.push({ mesh: flame, glow, seed: rnd() * 10 });
        continue;
      }
      case 'barbedwire': {
        // Stacheldrahtrolle: gedrehte Drahtschlaufen an Holzpflöcken, mit Stacheln
        const w = p.w ?? 3;
        const wire = mats.lambert(0x3a3a3c);
        const loop = new THREE.TorusGeometry(0.32, 0.012, 3, 14);
        for (let x = -w / 2; x <= w / 2; x += 0.22) {
          const l = part(loop, wire, x, 0.34, (rnd() - 0.5) * 0.06, false);
          l.rotation.set(0, Math.PI / 2 + (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.3);
          g.add(l);
        }
        const barb = new THREE.BoxGeometry(0.07, 0.012, 0.012);
        for (let i = 0; i < w * 6; i++) {
          const a = rnd() * Math.PI * 2;
          const b = part(barb, wire, -w / 2 + rnd() * w, 0.34 + Math.sin(a) * 0.32, Math.cos(a) * 0.32, false);
          b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
          g.add(b);
        }
        for (let x = -w / 2; x <= w / 2 + 0.01; x += Math.max(1, w / 3)) g.add(part(new THREE.CylinderGeometry(0.04, 0.05, 0.85, 5), wood, x, 0.42, 0));
        break;
      }
      case 'planks': {
        // Bretterbarrikade: Pfosten, kreuz und quer vernagelte Bretter mit Nägeln
        const w = p.w ?? 2;
        for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) g.add(part(new THREE.BoxGeometry(0.14, 1.9, 0.14), darkWood, x, 0.95, 0));
        const nail = new THREE.BoxGeometry(0.03, 0.03, 0.03);
        for (let i = 0; i < 6; i++) {
          const len = w * (0.85 + rnd() * 0.35);
          const y = 0.3 + i * 0.27 + (rnd() - 0.5) * 0.1;
          const broken = rnd() < 0.2;
          const plank = part(new THREE.BoxGeometry(broken ? len * 0.55 : len, 0.18, 0.04), rnd() < 0.5 ? wood : mats.lambert(0x7a6448), broken ? -w * 0.2 : 0, y, 0.1 + (i % 2) * 0.03);
          plank.rotation.z = (rnd() - 0.5) * (i % 3 === 0 ? 0.7 : 0.25);
          g.add(plank);
          for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) g.add(part(nail, mats.lambert(0x8a8a8a), x, y, 0.15, false));
        }
        break;
      }
      case 'campfire': {
        // Steinkreis, verkohlte Scheite, Sitzstämme, Topf am Dreibein; Flamme und Glut bewegt
        const r = p.w ?? 0.8;
        const stoneGeo = new THREE.DodecahedronGeometry(0.17, 0);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const s = part(stoneGeo, mats.lambert(0x6f6a64), Math.cos(a) * r, 0.1, Math.sin(a) * r, false);
          s.scale.set(1, 0.7, 1);
          s.rotation.set(rnd(), rnd(), rnd());
          g.add(s);
        }
        g.add(part(new THREE.CircleGeometry(r * 0.9, 12).rotateX(-Math.PI / 2), mats.lambert(0x1c1410), 0, 0.02, 0, false));
        for (let i = 0; i < 4; i++) {
          const log = part(new THREE.CylinderGeometry(0.06, 0.07, r * 1.3, 6).rotateZ(Math.PI / 2), mats.lambert(0x2a1a10), 0, 0.12, 0, false);
          log.rotation.y = (i / 4) * Math.PI + rnd() * 0.3;
          g.add(log);
        }
        g.add(part(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.04, 10), mats.lambert(0xff6a20, { emissive: 0xff4a10 }), 0, 0.08, 0, false));
        for (const side of [-1, 1]) {
          const seat = part(new THREE.CylinderGeometry(0.2, 0.22, 1.6, 8).rotateZ(Math.PI / 2), wood, 0, 0.2, side * (r + 0.9));
          seat.rotation.y = (rnd() - 0.5) * 0.4;
          g.add(seat);
        }
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const leg = part(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), darkWood, Math.cos(a) * 0.45, 0.62, Math.sin(a) * 0.45, false);
          leg.rotation.set(Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32);
          g.add(leg);
        }
        g.add(part(new THREE.CylinderGeometry(0.16, 0.12, 0.22, 10), mats.lambert(0x2a2a2a), 0, 0.85, 0, false));
        stat.add(g);
        const flame = new THREE.Sprite(flameMat);
        flame.position.set(p.x, 0.75, p.y);
        const glow = groundGlow(0xff8a30, 11, 0.6);
        glow.position.set(p.x, 0.05, p.y);
        live.add(flame, glow);
        flames.push({ mesh: flame, glow, seed: rnd() * 10 });
        // aufsteigende Funken
        for (let i = 0; i < 6; i++) {
          const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft(), color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
          spark.scale.setScalar(0.08);
          live.add(spark);
          sparks.push({ s: spark, x: p.x, z: p.y, seed: rnd() * 10 });
        }
        continue;
      }
      case 'stump': {
        g.add(part(new THREE.CylinderGeometry(0.35, 0.45, 0.5, 9), mats.lambert(0x5e4128), 0, 0.25, 0));
        g.add(part(new THREE.CylinderGeometry(0.33, 0.33, 0.02, 9), mats.lambert(0xb08a5a), 0, 0.51, 0, false));
        for (let i = 0; i < 3; i++) {
          const root = part(new THREE.ConeGeometry(0.12, 0.7, 5).rotateZ(Math.PI / 2), mats.lambert(0x4e3520), 0, 0.08, 0, false);
          root.rotation.y = (i / 3) * Math.PI * 2 + rnd();
          root.position.set(Math.cos(root.rotation.y) * 0.45, 0.08, -Math.sin(root.rotation.y) * 0.45);
          g.add(root);
        }
        break;
      }
      case 'fern': {
        const frond = new THREE.PlaneGeometry(0.18, 0.9).translate(0, 0.45, 0);
        const fm = new THREE.MeshLambertMaterial({ color: 0x3f6a2c, side: THREE.DoubleSide });
        for (let i = 0; i < 9; i++) {
          const f = new THREE.Mesh(frond, fm);
          f.rotation.set(-0.9 - rnd() * 0.4, (i / 9) * Math.PI * 2, 0, 'YXZ');
          g.add(f);
        }
        break;
      }
      case 'tires': {
        const tire = new THREE.TorusGeometry(0.32, 0.12, 6, 14).rotateX(Math.PI / 2);
        const n = 2 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) g.add(part(tire, mats.lambert(0x1a1a1a), (rnd() - 0.5) * 0.15, 0.12 + i * 0.22, (rnd() - 0.5) * 0.15));
        break;
      }
      case 'birdbath': {
        g.add(part(new THREE.CylinderGeometry(0.1, 0.18, 0.8, 8), mats.lambert(0x9a958c), 0, 0.4, 0));
        g.add(part(new THREE.CylinderGeometry(0.42, 0.3, 0.14, 12), mats.lambert(0x9a958c), 0, 0.85, 0));
        g.add(part(new THREE.CircleGeometry(0.36, 12).rotateX(-Math.PI / 2), mats.lambert(0x2a4048), 0, 0.93, 0, false));
        break;
      }
      case 'cross': {
        // Holzkreuz mit Helm (Grab)
        const c = new THREE.Group();
        c.add(part(new THREE.BoxGeometry(0.1, 1.1, 0.08), darkWood, 0, 0.55, 0));
        c.add(part(new THREE.BoxGeometry(0.6, 0.1, 0.08), darkWood, 0, 0.8, 0));
        c.add(part(new THREE.SphereGeometry(0.17, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mats.lambert(0x4a5038), 0, 1.08, 0));
        c.rotation.z = (rnd() - 0.5) * 0.25;
        g.add(c);
        g.add(part(new THREE.BoxGeometry(0.7, 0.12, 1.5), mats.lambert(0x4a3322), 0, 0.06, 0.6, false));
        break;
      }
      case 'woodstack': {
        const log = new THREE.CylinderGeometry(0.12, 0.12, 1.1, 7).rotateX(Math.PI / 2);
        for (let row = 0; row < 3; row++)
          for (let i = 0; i < 5 - row; i++) g.add(part(log, rnd() < 0.5 ? wood : darkWood, -0.5 + i * 0.25 + row * 0.12, 0.12 + row * 0.22, 0));
        break;
      }
      case 'wildflowers': {
        // Verwilderte Blumen: Mohn, Margeriten, Lupinen, Kornblumen, ein Teil verwelkt (instanziert, siehe unten)
        const r = p.w ?? 1.5;
        const n = Math.round(r * r * 24);
        for (let i = 0; i < n; i++) {
          const a = rnd() * Math.PI * 2;
          const d = Math.sqrt(rnd()) * r;
          flowerSpots.push({ x: p.x + Math.cos(a) * d, z: p.y + Math.sin(a) * d * (p.h ?? 1), kind: rnd() });
        }
        continue;
      }
      case 'brokenfence': {
        // umgestürzte, gebrochene Zaunfelder
        const w = p.w ?? 3;
        for (let x = -w / 2; x < w / 2; x += 1.1) {
          const panel = new THREE.Group();
          for (let i = 0; i < 4; i++) {
            if (rnd() < 0.25) continue;
            panel.add(part(new THREE.BoxGeometry(0.08, 0.9 - rnd() * 0.3, 0.04), wood, -0.4 + i * 0.27, 0.42, 0, false));
          }
          panel.add(part(new THREE.BoxGeometry(1.05, 0.07, 0.04), darkWood, 0, 0.6, 0.02, false));
          panel.position.set(x + 0.5, 0, 0);
          const fallen = rnd() < 0.6;
          panel.rotation.set(fallen ? -1.3 - rnd() * 0.25 : (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3);
          if (fallen) panel.position.y = 0.04;
          g.add(panel);
        }
        break;
      }
      case 'clothesline': {
        const w = p.w ?? 4;
        for (const x of [-w / 2, w / 2]) g.add(part(new THREE.CylinderGeometry(0.05, 0.06, 2, 5), darkWood, x, 1, 0));
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, w, 3).rotateZ(Math.PI / 2), mats.lambert(0xbbbbbb));
        line.position.y = 1.85;
        g.add(line);
        const rags = [0x8a7a6a, 0x5a6a7a, 0xa09070, 0x6a4a4a];
        for (let x = -w / 2 + 0.6; x < w / 2 - 0.4; x += 0.7 + rnd() * 0.4) {
          const rag = new THREE.Mesh(new THREE.PlaneGeometry(0.4 + rnd() * 0.3, 0.5 + rnd() * 0.4).translate(0, -0.3, 0), new THREE.MeshLambertMaterial({ color: rags[Math.floor(rnd() * rags.length)], side: THREE.DoubleSide }));
          rag.position.set(x, 1.85, 0);
          rag.rotation.set(0, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.3);
          g.add(rag);
        }
        break;
      }
      case 'trashcan': {
        const rust = mats.lambert(0x6a5a48);
        const can = new THREE.Group();
        can.add(part(new THREE.CylinderGeometry(0.3, 0.26, 0.85, 10, 1, true), rust, 0, 0.42, 0));
        can.add(part(new THREE.CircleGeometry(0.26, 10).rotateX(-Math.PI / 2), mats.lambert(0x1a1612), 0, 0.01, 0, false));
        const tipped = rnd() < 0.6;
        if (tipped) {
          can.rotation.z = Math.PI / 2;
          can.position.y = 0.3;
          for (let i = 0; i < 5; i++) g.add(part(new THREE.BoxGeometry(0.15 + rnd() * 0.2, 0.05, 0.12 + rnd() * 0.15), mats.lambert([0x6a6a5a, 0xd8d0c0, 0x4a5a3a][i % 3]), 0.6 + rnd() * 0.6, 0.03, (rnd() - 0.5) * 0.7, false));
        }
        g.add(can);
        const lid = part(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 10), rust, tipped ? -0.6 : 0.5, 0.03, 0.3);
        lid.rotation.x = 0.1;
        g.add(lid);
        break;
      }
      case 'canister': {
        for (let i = 0; i < 2; i++) {
          const c = part(new THREE.BoxGeometry(0.28, 0.4, 0.16), mats.lambert(i ? 0x8a2a1a : 0x2a5a2a), i * 0.4, 0.2, (rnd() - 0.5) * 0.3);
          if (rnd() < 0.5) {
            c.rotation.z = Math.PI / 2;
            c.position.y = 0.14;
          }
          g.add(c);
        }
        break;
      }
      case 'glass': {
        const glassMat = new THREE.MeshLambertMaterial({ color: 0xc8e0f0, transparent: true, opacity: 0.55, emissive: 0x203040 });
        for (let i = 0; i < 12; i++) {
          const sh = new THREE.Mesh(new THREE.CircleGeometry(0.05 + rnd() * 0.08, 3).rotateX(-Math.PI / 2), glassMat);
          sh.position.set((rnd() - 0.5) * 1.6, 0.02, (rnd() - 0.5) * 1.6);
          sh.rotation.y = rnd() * 3;
          g.add(sh);
        }
        live.add(g); // durchsichtig: nicht zusammenfassen
        continue;
      }
      case 'scorch': {
        const r = p.w ?? 1.5;
        const scorch = new THREE.MeshLambertMaterial({ color: 0x0e0b09, transparent: true, opacity: 0.75, depthWrite: false });
        for (let i = 0; i < 5; i++) {
          const m = new THREE.Mesh(new THREE.CircleGeometry(r * (0.4 + rnd() * 0.5), 9).rotateX(-Math.PI / 2), scorch);
          m.position.set((rnd() - 0.5) * r, 0.015 + i * 0.001, (rnd() - 0.5) * r);
          m.scale.set(1, 1, 0.6 + rnd() * 0.6);
          g.add(m);
        }
        for (let i = 0; i < 3; i++) {
          const ch = part(new THREE.BoxGeometry(0.6 + rnd() * 0.5, 0.08, 0.1), mats.lambert(0x1a1410), (rnd() - 0.5) * r, 0.05, (rnd() - 0.5) * r, false);
          ch.rotation.y = rnd() * 3;
          g.add(ch);
        }
        live.add(g);
        continue;
      }
      case 'puddle': {
        const r = p.w ?? 1;
        const water = new THREE.MeshLambertMaterial({ color: 0x1a2630, emissive: 0x0a1418, transparent: true, opacity: 0.85 });
        const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12).rotateX(-Math.PI / 2), water);
        m.position.y = 0.018;
        m.scale.set(1, 1, 0.6 + rnd() * 0.3);
        g.add(m);
        live.add(g);
        continue;
      }
      case 'crates': {
        const n = 2 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const s = 0.4 + rnd() * 0.25;
          const c = part(new THREE.BoxGeometry(s, s, s), mats.lambert(rnd() < 0.5 ? 0x7a5a3a : 0x6a4a2a), (rnd() - 0.5) * 1.2, s / 2, (rnd() - 0.5) * 1.2);
          c.rotation.set(rnd() < 0.3 ? 0.4 : 0, rnd() * 3, 0);
          g.add(c);
        }
        break;
      }
      case 'papers': {
        const paper = new THREE.MeshLambertMaterial({ color: 0xd8d0b8, side: THREE.DoubleSide });
        for (let i = 0; i < 8; i++) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.28).rotateX(-Math.PI / 2), paper);
          m.position.set((rnd() - 0.5) * 2, 0.02 + rnd() * 0.01, (rnd() - 0.5) * 2);
          m.rotation.set((rnd() - 0.5) * 0.3, rnd() * 3, 0);
          g.add(m);
        }
        break;
      }
      case 'tent': {
        // eingefallenes Zelt: Plane über schiefen Stangen
        const cloth = new THREE.MeshLambertMaterial({ color: 0x4a5a3a, side: THREE.DoubleSide });
        const tentGeo = new THREE.ConeGeometry(1.4, 1.3, 4, 1, true);
        const tent = new THREE.Mesh(tentGeo, cloth);
        tent.position.y = 0.55;
        tent.rotation.set(0.15, Math.PI / 4, 0.2);
        tent.scale.set(1, 0.8, 1.3);
        tent.castShadow = true;
        g.add(tent);
        g.add(part(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 4), darkWood, 0.3, 0.6, 0.2, false));
        g.add(part(new THREE.BoxGeometry(0.8, 0.12, 0.5), mats.lambert(0x6a3a2a), 1.4, 0.06, 0.6));
        break;
      }
      case 'tape': {
        // Absperrband zwischen Pflöcken (gelb-schwarz)
        const w = p.w ?? 4;
        for (const x of [-w / 2, 0, w / 2]) g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 1, 4), mats.lambert(0xd84a20), x, 0.5, 0, false));
        const tapeTex = document.createElement('canvas');
        tapeTex.width = 64;
        tapeTex.height = 8;
        const tc = tapeTex.getContext('2d')!;
        for (let i = 0; i < 8; i++) {
          tc.fillStyle = i % 2 ? '#111' : '#f0c020';
          tc.fillRect(i * 8, 0, 8, 8);
        }
        const tm = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(tapeTex), side: THREE.DoubleSide });
        for (const half of [-1, 1]) {
          const band = new THREE.Mesh(new THREE.PlaneGeometry(w / 2, 0.08), tm);
          band.position.set((half * w) / 4, 0.85 - rnd() * 0.15, 0);
          band.rotation.z = (rnd() - 0.5) * 0.15;
          g.add(band);
        }
        live.add(g);
        continue;
      }
      case 'sign': {
        // Warnschild „SPERRZONE“
        const cv = document.createElement('canvas');
        cv.width = 128;
        cv.height = 64;
        const c2 = cv.getContext('2d')!;
        c2.fillStyle = '#c8b020';
        c2.fillRect(0, 0, 128, 64);
        c2.fillStyle = '#111';
        c2.font = 'bold 22px sans-serif';
        c2.textAlign = 'center';
        c2.fillText('SPERRZONE', 64, 30);
        c2.font = 'bold 14px sans-serif';
        c2.fillText('BETRETEN VERBOTEN', 64, 52);
        const board = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide }));
        board.position.set(0, 1.35, 0.03);
        board.rotation.z = (rnd() - 0.5) * 0.25;
        g.add(board);
        g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 5), mats.lambert(0x5a5a5a), 0, 0.75, 0));
        live.add(g);
        continue;
      }
      case 'bodybag': {
        const bag = part(new THREE.CapsuleGeometry(0.22, 1.2, 4, 8).rotateZ(Math.PI / 2), mats.lambert(0x1a1a1c), 0, 0.18, 0);
        bag.scale.set(1, 0.7, 1);
        g.add(bag);
        g.add(part(new THREE.BoxGeometry(1.3, 0.02, 0.03), mats.lambert(0x8a8a8a), 0, 0.33, 0, false));
        break;
      }
      case 'mailbox': {
        const box = part(new THREE.BoxGeometry(0.4, 0.3, 0.6), mats.lambert(0xc8a020), 0.3, 0.16, 0);
        box.rotation.set(0.2, 0.4, 1.4);
        g.add(box);
        const post = part(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), darkWood, -0.3, 0.06, 0);
        post.rotation.z = Math.PI / 2 - 0.1;
        g.add(post);
        break;
      }
      case 'dirt': {
        // kahle Erdstelle mit ein paar Steinchen
        const r = p.w ?? 1.5;
        // weicher Rand (Textur mit Verlauf), damit kein hartes Vieleck im Rasen liegt
        const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.4, r * 2.4).rotateX(-Math.PI / 2), dirtMaterial());
        m.position.y = 0.006 + rnd() * 0.002;
        m.renderOrder = -1;
        m.scale.set(1, 1, 0.6 + rnd() * 0.5);
        m.rotation.y = rnd() * 3;
        m.receiveShadow = true;
        g.add(m);
        break;
      }
      case 'barricade': {
        const w = p.w ?? 2;
        // Sandsäcke unten, Kisten und schräge Bretter darüber
        for (let t = -w / 2 + 0.3; t < w / 2; t += 0.55) {
          const bag = part(new THREE.SphereGeometry(0.3, 7, 5), mats.lambert(0x8a7d5c), t, 0.2, 0);
          bag.scale.set(1, 0.6, 0.75);
          g.add(bag);
        }
        g.add(part(new THREE.BoxGeometry(0.7, 0.6, 0.7), mats.lambert(0x7a5a3a), -w / 4, 0.62, 0.05));
        g.add(part(new THREE.BoxGeometry(0.55, 0.5, 0.55), mats.lambert(0x6a4a2a), w / 4, 0.55, -0.05));
        for (let i = 0; i < 3; i++) {
          const plank = part(new THREE.BoxGeometry(w * 0.9, 0.12, 0.05), wood, (rnd() - 0.5) * 0.4, 0.6 + i * 0.35, 0.4);
          plank.rotation.z = (rnd() - 0.5) * 0.5;
          g.add(plank);
        }
        break;
      }
      case 'bones': {
        for (let i = 0; i < 5; i++) {
          const b = part(new THREE.CylinderGeometry(0.035, 0.035, 0.4 + rnd() * 0.25, 5), bone, (rnd() - 0.5) * 1.4, 0.04, (rnd() - 0.5) * 1.4, false);
          b.rotation.set(Math.PI / 2, 0, rnd() * Math.PI);
          g.add(b);
        }
        // Schädel
        const skull = part(new THREE.SphereGeometry(0.14, 8, 6), bone, 0.2, 0.12, -0.1, false);
        skull.scale.set(1, 0.9, 1.15);
        g.add(skull);
        for (const s of [-1, 1]) g.add(part(new THREE.SphereGeometry(0.035, 5, 4), mats.lambert(0x111111), 0.2 + s * 0.05, 0.15, 0.04, false));
        break;
      }
      case 'blood': {
        for (let i = 0; i < 4; i++) {
          const r = 0.25 + rnd() * 0.55;
          const spot = new THREE.Mesh(new THREE.CircleGeometry(r, 9).rotateX(-Math.PI / 2), blood);
          spot.position.set((rnd() - 0.5) * 1.6, 0.018 + i * 0.001, (rnd() - 0.5) * 1.6);
          spot.scale.set(1, 1, 0.6 + rnd() * 0.6);
          spot.receiveShadow = true;
          g.add(spot);
        }
        break;
      }
      case 'mushrooms': {
        for (let i = 0; i < 6; i++) {
          const x = (rnd() - 0.5) * 1.6;
          const z = (rnd() - 0.5) * 1.6;
          const s = 0.6 + rnd() * 0.8;
          g.add(part(new THREE.CylinderGeometry(0.03 * s, 0.04 * s, 0.18 * s, 5), mats.lambert(0xe8e0cc), x, 0.09 * s, z, false));
          const glowing = i % 3 === 0;
          const cap = part(
            new THREE.SphereGeometry(0.11 * s, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2),
            glowing ? mats.lambert(0x6fd8c8, { emissive: 0x2a9a8a }) : mats.lambert(0x9a3a2a),
            x,
            0.17 * s,
            z,
            false,
          );
          g.add(cap);
        }
        // Wurzeln
        for (let i = 0; i < 2; i++) {
          const root = part(new THREE.TorusGeometry(0.5 + rnd() * 0.3, 0.05, 4, 8, Math.PI), darkWood, (rnd() - 0.5) * 1.5, 0, (rnd() - 0.5) * 1.5, false);
          root.rotation.y = rnd() * Math.PI;
          g.add(root);
        }
        break;
      }
      case 'web': {
        const webMat = new THREE.LineBasicMaterial({ color: 0xd8dde8, transparent: true, opacity: 0.55 });
        const pts: THREE.Vector3[] = [];
        const R = 0.7;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          pts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0));
        }
        for (let ring = 1; ring <= 3; ring++) {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const b = ((i + 1) / 6) * Math.PI * 2;
            const r = (R * ring) / 3.4;
            pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0), new THREE.Vector3(Math.cos(b) * r, Math.sin(b) * r, 0));
          }
        }
        const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), webMat);
        lines.position.y = 0.75;
        g.add(lines);
        live.add(g); // Linien nicht zusammenfassen
        continue;
      }
      case 'opengrave': {
        g.add(part(new THREE.BoxGeometry(1, 0.03, 2.1), mats.lambert(0x050403), 0, 0.016, 0, false));
        const mound = part(new THREE.SphereGeometry(0.8, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mats.lambert(0x4a3322), 1.1, 0, 0.2);
        mound.scale.set(0.7, 0.5, 1.3);
        g.add(mound);
        const shovel = new THREE.Group();
        shovel.add(part(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5), wood, 0, 0.55, 0));
        shovel.add(part(new THREE.BoxGeometry(0.22, 0.28, 0.03), mats.lambert(0x6a6a66), 0, 0, 0));
        shovel.position.set(1.0, 0.3, -0.5);
        shovel.rotation.z = 0.35;
        g.add(shovel);
        const stone = part(new THREE.BoxGeometry(0.7, 0.9, 0.18), mats.lambert(0x7d7a74), 0, 0.45, -1.2);
        stone.rotation.z = 0.15;
        g.add(stone);
        break;
      }
      case 'scarecrow': {
        g.add(part(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6), wood, 0, 1.05, 0));
        g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6).rotateZ(Math.PI / 2), wood, 0, 1.55, 0));
        g.add(part(new THREE.BoxGeometry(0.5, 0.7, 0.3), mats.lambert(0x5a5a3a), 0, 1.3, 0));
        for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.55, 0.16, 0.2), mats.lambert(0x5a5a3a), s * 0.45, 1.55, 0));
        g.add(part(new THREE.SphereGeometry(0.2, 8, 6), mats.lambert(0xc8a868), 0, 1.92, 0));
        g.add(part(new THREE.ConeGeometry(0.32, 0.38, 8), mats.lambert(0x3a2a1a), 0, 2.2, 0));
        g.add(part(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 10), mats.lambert(0x3a2a1a), 0, 2.03, 0));
        for (const s of [-1, 1]) g.add(part(new THREE.SphereGeometry(0.03, 4, 3), mats.lambert(0xff4a20, { emissive: 0xff3010 }), s * 0.07, 1.96, 0.17, false));
        break;
      }
      case 'cart': {
        // Umgekippter Handwagen
        const body = part(new THREE.BoxGeometry(1.6, 0.5, 0.9), wood, 0, 0.45, 0);
        body.rotation.x = 1.3;
        g.add(body);
        const wheel = part(new THREE.TorusGeometry(0.35, 0.05, 5, 12), darkWood, 0.5, 0.36, 0.5);
        g.add(wheel);
        const wheel2 = part(new THREE.TorusGeometry(0.35, 0.05, 5, 12).rotateX(Math.PI / 2), darkWood, -0.7, 0.05, -0.4);
        g.add(wheel2);
        for (let i = 0; i < 3; i++) g.add(part(new THREE.BoxGeometry(0.4, 0.3, 0.4), mats.lambert(0xa0743f), -0.4 + i * 0.5, 0.15, -0.9 - rnd() * 0.4));
        break;
      }
      case 'crows': {
        // Krähen sitzen am Ort; nähert sich ein Held, flattern sie auf
        const n = 3 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const bird = new THREE.Group();
          const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), crowMat);
          body.scale.set(1.5, 0.9, 0.9);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 4), crowMat);
          head.position.set(0.15, 0.08, 0);
          const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4).rotateZ(-Math.PI / 2), mats.lambert(0x3a3020));
          beak.position.set(0.24, 0.07, 0);
          const wingGeo = new THREE.PlaneGeometry(0.3, 0.14);
          const wingMat = new THREE.MeshLambertMaterial({ color: 0x111114, side: THREE.DoubleSide });
          const w1 = new THREE.Mesh(wingGeo, wingMat);
          w1.name = 'wing';
          w1.rotation.x = -Math.PI / 2;
          w1.position.set(0, 0.04, 0.12);
          const w2 = w1.clone();
          w2.position.z = -0.12;
          bird.add(body, head, beak, w1, w2);
          const home = new THREE.Vector3(p.x + (rnd() - 0.5) * 2.2, 0.12 + (p.h ?? 0), p.y + (rnd() - 0.5) * 2.2);
          bird.position.copy(home);
          bird.rotation.y = rnd() * Math.PI * 2;
          live.add(bird);
          crows.push({ bird, home, seed: rnd() * 10, fly: 0 });
        }
        continue;
      }
    }
    stat.add(g);
  }

  // Wildblumen: Stängel und Köpfe als je ein InstancedMesh
  const flowers = new THREE.Group();
  if (flowerSpots.length) {
    const stemGeo = new THREE.CylinderGeometry(0.012, 0.015, 1, 3).translate(0, 0.5, 0);
    const headGeo = new THREE.IcosahedronGeometry(0.1, 0);
    const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), flowerSpots.length);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), flowerSpots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    // Mohn, Margerite, Lupine, Kornblume, verwelkt
    const palette = [0xc8281e, 0xeeeee0, 0x8a5ac8, 0x3a6ad8, 0x6a4a2a];
    const frnd2 = rand(5);
    flowerSpots.forEach((f, i) => {
      const k = f.kind < 0.25 ? 0 : f.kind < 0.45 ? 1 : f.kind < 0.6 ? 2 : f.kind < 0.75 ? 3 : 4;
      const wilted = k === 4;
      const h = (wilted ? 0.25 : 0.35) + frnd2() * 0.3;
      e.set((frnd2() - 0.5) * (wilted ? 1.2 : 0.3), frnd2() * 3, (frnd2() - 0.5) * (wilted ? 1.2 : 0.3));
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(f.x, 0, f.z), q, new THREE.Vector3(1, h, 1));
      stems.setMatrixAt(i, m4);
      stems.setColorAt(i, col.setHex(wilted ? 0x5a4a2a : 0x3f6a2c));
      const top = new THREE.Vector3(0, h, 0).applyQuaternion(q).add(new THREE.Vector3(f.x, 0, f.z));
      const s = k === 2 ? 1.4 : k === 1 ? 1.1 : 1;
      m4.compose(top, q, new THREE.Vector3(s, k === 2 ? 2.2 : 0.7, s));
      heads.setMatrixAt(i, m4);
      heads.setColorAt(i, col.setHex(palette[k]));
    });
    flowers.add(stems, heads);
    live.add(flowers);
  }

  // Bodennebel: langsam ziehende Schwaden über dem Gelände
  const b = arenaBounds(arena);
  const fogMat = new THREE.MeshBasicMaterial({ map: fogTex(), transparent: true, opacity: 0.55, depthWrite: false, color: 0x8a96b8 });
  const wisps: { mesh: THREE.Mesh; base: THREE.Vector3; speed: number; seed: number }[] = [];
  const frnd = rand(42);
  for (let i = 0; i < 18; i++) {
    const size = 10 + frnd() * 12;
    const wisp = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), fogMat);
    const base = new THREE.Vector3(b.x0 + frnd() * (b.x1 - b.x0), 0.35 + frnd() * 0.5, b.y0 + frnd() * (b.y1 - b.y0));
    wisp.position.copy(base);
    wisp.renderOrder = 3;
    live.add(wisp);
    wisps.push({ mesh: wisp, base, speed: 0.25 + frnd() * 0.35, seed: frnd() * 100 });
  }

  const tmp = new THREE.Vector3();
  let last = 0;
  let detail = true;
  // Feuertonnen aus Blender (garden.glb)
  void loadGarden().then((models) => {
    if (!models.has('firebarrel') || !barrelSpots.length) return;
    barrelBodies.clear();
    for (const b of barrelSpots) {
      const m = gardenMesh(models, 'firebarrel')!;
      m.position.set(b.x, 0, b.z);
      m.rotation.y = b.rot;
      barrelBodies.add(m);
    }
  });
  return {
    setDetail(on) {
      detail = on;
      for (const w of wisps) w.mesh.visible = on;
      flowers.visible = on;
    },
    update(time, heroes) {
      if (!detail) return;
      const dt = Math.min(0.1, Math.max(0, time - last));
      last = time;
      for (const f of flames) {
        const k = 0.75 + 0.25 * Math.sin(time * 13 + f.seed) * Math.sin(time * 7.3 + f.seed * 2);
        f.mesh.scale.set(0.9 + 0.15 * Math.sin(time * 9 + f.seed), 1.2 * (k + 0.15), 1);
        (f.glow.material as THREE.MeshBasicMaterial).opacity = 0.42 + 0.18 * k;
      }
      for (const sp of sparks) {
        // Funken steigen auf und verglühen (Zyklus 1,6 s)
        const t = (time * 0.62 + sp.seed) % 1;
        sp.s.position.set(sp.x + Math.sin(sp.seed * 7 + time) * 0.25 * t, 0.6 + t * 2.4, sp.z + Math.cos(sp.seed * 5 + time) * 0.25 * t);
        (sp.s.material as THREE.SpriteMaterial).opacity = 1 - t;
      }
      for (const w of wisps) {
        const x = ((w.base.x - b.x0 + time * w.speed) % (b.x1 - b.x0)) + b.x0;
        w.mesh.position.set(x, w.base.y, w.base.z + Math.sin(time * 0.1 + w.seed) * 2);
      }
      for (const c of crows) {
        const near = heroes.some((h) => Math.hypot(h.x - c.home.x, h.y - c.home.z) < 4);
        c.fly = Math.max(0, Math.min(1, c.fly + (near ? dt * 1.5 : -dt * 0.25)));
        const wings = c.bird.children.filter((x) => x.name === 'wing');
        if (c.fly > 0.02) {
          // Auffliegen: Kreise über dem Platz, Flügelschlag
          const a = time * 1.6 + c.seed;
          tmp.set(c.home.x + Math.cos(a) * 3 * c.fly, c.home.y + 4 * c.fly, c.home.z + Math.sin(a) * 3 * c.fly);
          c.bird.position.copy(tmp);
          c.bird.rotation.y = -a - Math.PI / 2;
          const flap = Math.sin(time * 22 + c.seed) * 0.9;
          wings.forEach((w, i) => (w.rotation.x = -Math.PI / 2 + (i ? -flap : flap)));
        } else {
          c.bird.position.copy(c.home);
          c.bird.position.y = c.home.y + Math.max(0, Math.sin(time * 3 + c.seed * 5)) * 0.02;
          wings.forEach((w) => (w.rotation.x = -Math.PI / 2));
        }
      }
    },
  };
}

export type { PropDef };
