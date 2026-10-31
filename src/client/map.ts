import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { arenaBounds } from '../sim/grid';
import type { ArenaDef, Obstacle } from '../sim/types';
import { nightDecor, nightObstacle } from './nightdecor';
import { brushes, decor, hatch, hedge, house, Mats, obstacleDecor, smoke, thicket, tree, windTime, rathole } from './mapdecor';

const COLORS = {
  forest: 0x3a6230,
  blocked: 0x5a8c43,
  wood: 0x8a6a45,
  bedWood: 0x7a5634,
  soil: 0x4a3322,
  plant: 0x5fa83f,
  gravel: 0xb3a487,
  gravelStripe: 0x9a8b6f,
  dirt: 0x5b4632,
  stone: 0x8d8d86,
};

/** Bewegte Teile der Karte (Wind in Gras und Büschen, Rauch). */
export interface MapAnimation {
  /** heroes: Positionen der Helden (Krähen flattern auf). */
  update(time: number, heroes?: { x: number; y: number }[]): void;
  /** Bodennebel und Rauch an/aus (Grafik Niedrig). */
  setDetail(on: boolean): void;
}

/**
 * Baut die Karte aus den Kartendaten: Boden (Garten und Gelände), Wege und
 * Pflaster, Hang, Spawnflächen, alle Hindernisse nach ihrem Aussehen, Verstecke,
 * Lagerplätze und den Wald als Kulisse.
 */
export function buildMap(target: THREE.Scene, arena: ArenaDef): MapAnimation {
  // Alles Feste entsteht zuerst in einer eigenen Gruppe und wird am Ende zusammengefasst (mergeStatic)
  const scene = new THREE.Group();
  const mats = new Mats();
  const m = (color: number) => mats.lambert(color);
  const add = (obj: THREE.Object3D) => scene.add(obj);
  const flat = (w: number, h: number, x: number, y: number, material: THREE.Material, height = 0) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), material);
    mesh.position.set(x, height, y);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const box = (w: number, height: number, d: number, x: number, y: number, color: number, base = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), m(color));
    mesh.position.set(x, base + height / 2, y);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  // Boden: dunkler Wald, Gelände, heller Garten (alle mit leichter Fleckentextur)
  const { x0, y0, x1, y1 } = arenaBounds(arena);
  const g = arena.garden ?? { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  flat((x1 - x0) * 4, (y1 - y0) * 4, (x0 + x1) / 2, (y0 + y1) / 2, m(COLORS.forest), -0.03);
  flat(x1 - x0, y1 - y0, (x0 + x1) / 2, (y0 + y1) / 2, mats.textured('terrain', 8), -0.02);
  flat(g.w, g.h, g.x, g.y, mats.textured('grass', 7), -0.01);
  for (const p of arena.paths ?? []) scene.add(decor({ look: 'gravel', ...p }, mats));
  for (const d of arena.decor ?? []) scene.add(decor(d, mats));
  forestBorder(scene, x0, y0, x1, y1, mats);

  // Hang als Kiesweg mit Querstreifen.
  for (const z of arena.slowZones) {
    flat(z.w, z.h, z.x, z.y, m(COLORS.gravel), 0.01);
    const across = z.w >= z.h;
    const length = across ? z.w : z.h;
    for (let t = 0.75; t < length; t += 1.5) {
      const offset = -length / 2 + t;
      if (across) flat(0.25, z.h, z.x + offset, z.y, m(COLORS.gravelStripe), 0.015);
      else flat(z.w, 0.25, z.x, z.y + offset, m(COLORS.gravelStripe), 0.015);
    }
  }

  // Spawnflächen als Erdflecken; der Bunker ist eine Luke im Rasen.
  for (const s of arena.spawnPoints) {
    if (s.id === 'bunker') {
      scene.add(hatch(s, mats));
      continue;
    }
    const patch = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24).rotateX(-Math.PI / 2), m(COLORS.dirt));
    patch.position.set(s.x, 0.02, s.y);
    patch.receiveShadow = true;
    scene.add(patch);
  }

  const chimneys: THREE.Vector3[] = [];
  for (const o of arena.obstacles) {
    if (o.kind === 'rect' && o.look === 'house') scene.add(house(o, mats, chimneys));
    else if (o.kind === 'rect' && o.look === 'rathole') scene.add(rathole(o, mats, chimneys));
    else if (o.look === 'car' || o.look === 'well') {
      const d = nightObstacle(o, mats);
      if (d) scene.add(d);
    }
    else if (o.kind === 'rect' && (o.look ?? 'hedge') === 'hedge') scene.add(hedge(o, mats));
    else if (o.kind === 'circle' && o.look === 'tree') scene.add(tree(o.x, o.y, o.r, mats));
    else if (o.kind === 'rect' && o.look === 'blocked') {
      flat(o.w, o.h, o.x, o.y, m(COLORS.blocked), 0.012);
      scene.add(thicket(o, mats));
    }
    else {
      const d = obstacleDecor(o, mats);
      if (d) scene.add(d);
      else simpleObstacle(o, { box, flat, m, add });
    }
  }
  scene.add(brushes(arena.brush ?? []));

  // Neutrale Lager: zertrampelte Erde mit ein paar Steinen
  const stone = new THREE.DodecahedronGeometry(0.35, 0);
  for (const c of arena.camps ?? []) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(3, 24).rotateX(-Math.PI / 2), m(COLORS.dirt));
    patch.position.set(c.x, 0.015, c.y);
    patch.receiveShadow = true;
    scene.add(patch);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + c.x;
      const rock = new THREE.Mesh(stone, m(COLORS.stone));
      rock.position.set(c.x + Math.cos(a) * 3.2, 0.2, c.y + Math.sin(a) * 3.2);
      rock.castShadow = true;
      scene.add(rock);
    }
  }

  const live = new THREE.Group();
  const night = nightDecor(scene, live, arena, mats);
  target.add(mergeStatic(scene));
  target.add(live);
  const smokes = smoke(chimneys);
  target.add(smokes.group);
  return {
    update(time, heroes = []) {
      windTime.value = time;
      smokes.update(time);
      night.update(time, heroes);
    },
    setDetail(on) {
      night.setDetail(on);
      smokes.group.visible = on;
    },
  };
}

interface Builders {
  box: (w: number, h: number, d: number, x: number, y: number, color: number, base?: number) => THREE.Mesh;
  flat: (w: number, h: number, x: number, y: number, material: THREE.Material, height?: number) => THREE.Mesh;
  m: (color: number) => THREE.MeshLambertMaterial;
  add: (obj: THREE.Object3D) => void;
}

/** Zaun, Hochbeet, gesperrte Fläche (Nachbargrundstück). */
function simpleObstacle(o: Obstacle, b: Builders): void {
  if (o.kind !== 'rect') return;
  const { x, y, w, h } = o;
  switch (o.look) {
    case 'fence': {
      // Latten statt einer durchgehenden Wand
      const along = w >= h;
      const len = Math.max(w, h);
      for (let t = -len / 2; t <= len / 2; t += 0.5) b.box(0.08, 0.9, 0.08, along ? x + t : x, along ? y : y + t, COLORS.wood);
      b.box(along ? len : 0.06, 0.08, along ? 0.06 : len, x, y, COLORS.wood, 0.65);
      b.box(along ? len : 0.06, 0.08, along ? 0.06 : len, x, y, COLORS.wood, 0.3);
      break;
    }
    case 'bed': {
      b.box(w, 0.6, h, x, y, COLORS.bedWood);
      b.flat(w - 0.3, h - 0.3, x, y, b.m(COLORS.soil), 0.61);
      const along = w >= h;
      const length = along ? w : h;
      for (let t = 0.6; t < length - 0.3; t += 1.1) {
        const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), b.m(COLORS.plant));
        const offset = -length / 2 + t;
        plant.position.set(along ? x + offset : x, 0.8, along ? y : y + offset);
        plant.castShadow = true;
        b.add(plant);
      }
      break;
    }
    case 'blocked':
      b.flat(w, h, x, y, b.m(COLORS.blocked), 0.012);
      break;
  }
}

/**
 * Unbewegliche Teile mit gleichem Material zu je einem Mesh zusammenfassen:
 * Hunderte Balken, Fenster, Latten und Steine werden so zu wenigen
 * Zeichenaufrufen (auch für die Schatten). InstancedMeshes bleiben, wie sie sind.
 */
function mergeStatic(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const groups = new Map<string, { material: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const keep: THREE.Object3D[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) {
      keep.push(mesh);
      return;
    }
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.clearGroups();
    const key = `${mesh.material.uuid}|${mesh.castShadow}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { material: mesh.material, cast: mesh.castShadow, geos: [] }));
    group.geos.push(geo);
  });
  const out = new THREE.Group();
  for (const { material, cast, geos } of groups.values()) {
    const merged = new THREE.Mesh(mergeGeometries(geos), material);
    merged.castShadow = cast;
    merged.receiveShadow = true;
    out.add(merged);
    for (const g of geos) g.dispose();
  }
  for (const k of keep) out.attach(k);
  return out;
}

/** Dichter Wald jenseits des Kartenrands (nur Kulisse, instanziert, feste Anordnung). */
function forestBorder(scene: THREE.Object3D, x0: number, y0: number, x1: number, y1: number, mats: Mats): void {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spots: { x: number; y: number; s: number; pine: boolean }[] = [];
  for (let row = 0; row < 4; row++) {
    const d = 2.5 + row * 4;
    const push = (x: number, y: number) => spots.push({ x, y, s: 0.8 + rnd() * 0.6, pine: rnd() < 0.4 });
    for (let x = x0 - d; x <= x1 + d; x += 4) {
      push(x + rnd() * 2, y0 - d - rnd() * 1.5);
      push(x + rnd() * 2, y1 + d + rnd() * 1.5);
    }
    for (let y = y0; y <= y1; y += 4) {
      push(x0 - d - rnd() * 1.5, y + rnd() * 2);
      push(x1 + d + rnd() * 1.5, y + rnd() * 2);
    }
  }
  const m = new THREE.Matrix4();
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.45, 1.8, 6).translate(0, 0.9, 0), mats.lambert(0x5e4128), spots.length);
  const leafy = spots.filter((s) => !s.pine);
  const pines = spots.filter((s) => s.pine);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2, 0).translate(0, 3.6, 0), mats.lambert(0x3b7f36), leafy.length);
  const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 5, 7).translate(0, 4, 0), mats.lambert(0x2c5e31), pines.length);
  spots.forEach((s, i) => trunks.setMatrixAt(i, m.makeScale(s.s, s.s, s.s).setPosition(s.x, 0, s.y)));
  leafy.forEach((s, i) => crowns.setMatrixAt(i, m.makeScale(s.s, s.s, s.s).setPosition(s.x, 0, s.y)));
  pines.forEach((s, i) => cones.setMatrixAt(i, m.makeScale(s.s, s.s * 1.1, s.s).setPosition(s.x, 0, s.y)));
  for (const inst of [trunks, crowns, cones]) {
    inst.castShadow = true;
    scene.add(inst);
  }
}
