import * as THREE from 'three';
import { arenaBounds } from '../sim/grid';
import type { ArenaDef, Obstacle } from '../sim/types';

const COLORS = {
  grass: 0x74b350,
  outside: 0x5f9443,
  forest: 0x3c6630,
  blocked: 0x5a8c43,
  wall: 0xe3d3b0,
  roof: 0x9c4a36,
  hedge: 0x2f6b2a,
  wood: 0x8a6a45,
  bedWood: 0x7a5634,
  soil: 0x4a3322,
  plant: 0x5fa83f,
  concrete: 0x8d8d86,
  concreteTop: 0x6f6f69,
  doorway: 0x1c1c1c,
  gravel: 0xb3a487,
  gravelStripe: 0x9a8b6f,
  dirt: 0x5b4632,
  trunk: 0x6b4a2b,
  crown: 0x3e8f3a,
};

/** Baut die Karte aus den Kartendaten: Boden, Hang, Spawnflächen und alle Hindernisse nach ihrem Aussehen. */
export function buildMap(scene: THREE.Scene, arena: ArenaDef): void {
  const mat = new Map<number, THREE.MeshLambertMaterial>();
  const m = (color: number) => {
    let material = mat.get(color);
    if (!material) mat.set(color, (material = new THREE.MeshLambertMaterial({ color })));
    return material;
  };
  const add = (mesh: THREE.Mesh, shadows = true) => {
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const flat = (w: number, h: number, x: number, y: number, color: number, height = 0) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), m(color));
    mesh.position.set(x, height, y);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const box = (w: number, height: number, d: number, x: number, y: number, color: number, base = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), m(color));
    mesh.position.set(x, base + height / 2, y);
    return add(mesh);
  };

  // Gelände außerhalb des Gartens dunkler, der Garten heller; ringsum Wald als Kulisse.
  const { x0, y0, x1, y1 } = arenaBounds(arena);
  const g = arena.garden ?? { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  flat((x1 - x0) * 4, (y1 - y0) * 4, (x0 + x1) / 2, (y0 + y1) / 2, COLORS.forest, -0.03);
  flat(x1 - x0, y1 - y0, (x0 + x1) / 2, (y0 + y1) / 2, COLORS.outside, -0.02);
  flat(g.w, g.h, g.x, g.y, COLORS.grass, -0.01);
  for (const p of arena.paths ?? []) flat(p.w, p.h, p.x, p.y, COLORS.dirt, 0.005);
  forestBorder(scene, x0, y0, x1, y1, m);

  // Hang als Kiesweg mit Querstreifen.
  for (const z of arena.slowZones) {
    flat(z.w, z.h, z.x, z.y, COLORS.gravel, 0.01);
    const across = z.w >= z.h;
    const length = across ? z.w : z.h;
    for (let t = 0.75; t < length; t += 1.5) {
      const offset = -length / 2 + t;
      if (across) flat(0.25, z.h, z.x + offset, z.y, COLORS.gravelStripe, 0.015);
      else flat(z.w, 0.25, z.x, z.y + offset, COLORS.gravelStripe, 0.015);
    }
  }

  // Spawnflächen als Erdflecken (der Bunker hat seine Tür).
  for (const s of arena.spawnPoints) {
    if (s.id === 'bunker') continue;
    const patch = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24).rotateX(-Math.PI / 2), m(COLORS.dirt));
    patch.position.set(s.x, 0.02, s.y);
    patch.receiveShadow = true;
    scene.add(patch);
  }

  for (const o of arena.obstacles) buildObstacle(o, { box, flat, add, m }, arena);
}

interface Builders {
  box: (w: number, h: number, d: number, x: number, y: number, color: number, base?: number) => THREE.Mesh;
  flat: (w: number, h: number, x: number, y: number, color: number, height?: number) => THREE.Mesh;
  add: (mesh: THREE.Mesh, shadows?: boolean) => THREE.Mesh;
  m: (color: number) => THREE.MeshLambertMaterial;
}

function buildObstacle(o: Obstacle, b: Builders, arena: ArenaDef): void {
  if (o.kind === 'circle') {
    if (o.look === 'objective') return;
    // Kreise sind Bäume.
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.25, o.r * 0.3, 1.6, 8), b.m(COLORS.trunk));
    trunk.position.set(o.x, 0.8, o.y);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(o.r * 1.4, 0), b.m(COLORS.crown));
    crown.position.set(o.x, 1.6 + o.r, o.y);
    b.add(trunk);
    b.add(crown);
    return;
  }

  const { x, y, w, h } = o;
  switch (o.look ?? 'hedge') {
    case 'house':
      b.box(w, 3, h, x, y, COLORS.wall);
      b.box(w + 0.3, 0.3, h + 0.3, x, y, COLORS.roof, 3);
      break;
    case 'hedge':
      b.box(w, 1.4, h, x, y, COLORS.hedge);
      break;
    case 'fence':
      b.box(Math.max(w, 0.15), 0.8, Math.max(h, 0.15), x, y, COLORS.wood);
      break;
    case 'bed': {
      b.box(w, 0.6, h, x, y, COLORS.bedWood);
      b.flat(w - 0.3, h - 0.3, x, y, COLORS.soil, 0.61);
      const along = w >= h;
      const length = along ? w : h;
      for (let t = 0.6; t < length - 0.3; t += 1.1) {
        const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), b.m(COLORS.plant));
        const offset = -length / 2 + t;
        plant.position.set(along ? x + offset : x, 0.8, along ? y : y + offset);
        b.add(plant);
      }
      break;
    }
    case 'bunker': {
      b.box(w, 2.2, h, x, y, COLORS.concrete);
      b.box(w + 0.2, 0.25, h + 0.2, x, y, COLORS.concreteTop, 2.2);
      // Tür an der Seite, auf der der Bunker-Spawn liegt.
      const spawn = arena.spawnPoints.find((s) => s.id === 'bunker');
      if (spawn) {
        const dx = (spawn.x - x) / (w / 2);
        const dy = (spawn.y - y) / (h / 2);
        if (Math.abs(dx) > Math.abs(dy)) b.box(0.1, 1.8, 1.8, x + Math.sign(dx) * (w / 2 + 0.05), spawn.y, COLORS.doorway);
        else b.box(1.8, 1.8, 0.1, spawn.x, y + Math.sign(dy) * (h / 2 + 0.05), COLORS.doorway);
      }
      break;
    }
    case 'blocked':
      b.flat(w, h, x, y, COLORS.blocked, 0.012);
      break;
    case 'tree':
    case 'objective':
      break;
  }
}

/** Dichter Wald jenseits des Kartenrands (nur Kulisse, feste Anordnung). */
function forestBorder(scene: THREE.Scene, x0: number, y0: number, x1: number, y1: number, m: (c: number) => THREE.MeshLambertMaterial): void {
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 1.6, 6);
  const crownGeo = new THREE.IcosahedronGeometry(2, 0);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tree = (x: number, y: number) => {
    const s = 0.8 + rnd() * 0.6;
    const trunk = new THREE.Mesh(trunkGeo, m(COLORS.trunk));
    trunk.position.set(x, 0.8, y);
    const crown = new THREE.Mesh(crownGeo, m(COLORS.crown));
    crown.scale.setScalar(s);
    crown.position.set(x, 1.6 + 2 * s, y);
    crown.castShadow = true;
    scene.add(trunk, crown);
  };
  for (let row = 0; row < 3; row++) {
    const d = 2.5 + row * 4;
    for (let x = x0 - d; x <= x1 + d; x += 4.5) {
      tree(x + rnd() * 2, y0 - d - rnd() * 1.5);
      tree(x + rnd() * 2, y1 + d + rnd() * 1.5);
    }
    for (let y = y0; y <= y1; y += 4.5) {
      tree(x0 - d - rnd() * 1.5, y + rnd() * 2);
      tree(x1 + d + rnd() * 1.5, y + rnd() * 2);
    }
  }
}
