import * as THREE from 'three';
import type { ArenaDef, Obstacle } from '../sim/types';

const COLORS = {
  grass: 0x74b350,
  outside: 0x4f7f3a,
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

  const { width, height } = arena;
  flat(width * 4, height * 4, width / 2, height / 2, COLORS.outside, -0.02);
  flat(width, height, width / 2, height / 2, COLORS.grass);

  // Niedriger Zaun am Kartenrand.
  box(width, 0.5, 0.2, width / 2, -0.1, COLORS.wood);
  box(width, 0.5, 0.2, width / 2, height + 0.1, COLORS.wood);
  box(0.2, 0.5, height, -0.1, height / 2, COLORS.wood);
  box(0.2, 0.5, height, width + 0.1, height / 2, COLORS.wood);

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
      // Tür an der Seite, die dem Bunker-Spawn am nächsten liegt.
      const spawn = arena.spawnPoints.find((s) => s.id === 'bunker');
      if (spawn) {
        const east = spawn.x > x;
        b.box(0.1, 1.8, 1.8, east ? x + w / 2 + 0.05 : x - w / 2 - 0.05, spawn.y, COLORS.doorway);
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
