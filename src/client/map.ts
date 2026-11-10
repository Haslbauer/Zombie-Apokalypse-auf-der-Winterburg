import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { arenaBounds } from '../sim/grid';
import type { ArenaDef, Obstacle } from '../sim/types';
import { nightDecor, nightObstacle } from './nightdecor';
import { addPropModels } from './propmodels';
import { buildingKey, bushInstances, forestInstances, gardenMesh, type ForestSpot, type GardenModel, hedgeInstances, houseKey, loadGarden, loadHouses, MODEL_SPECIES, OBSTACLE_MODELS, obstacleMesh, thicketInstances, treeInstances, type TreeSpot } from './gardenmodels';
import { crownGeometry, fireflies, foliageMaterial, groundPatches, pineGeometry, type TreeSpecies, trunkGeometry } from './foliage';
import { brushes, courtyardWall, decor, hatch, hedge, house, Mats, obstacleDecor, smoke, thicket, tree, windTime, rathole, ruin, grassTufts } from './mapdecor';

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
  // Großflächige Flecken (Moos, Erde, trockenes Gras) gegen das Kachelmuster
  const patches = groundPatches(x0, y0, x1, y1);
  if (patches) target.add(patches);
  for (const p of arena.paths ?? []) scene.add(decor({ look: 'gravel', ...p }, mats));
  // Gebäude aus Blender (houses.glb): Häuser, Ruine, Hofmauern mit Tor; bis zum Laden die Code-Formen
  const fallbackHouses = new THREE.Group();
  const buildings: { key: string; x: number; y: number }[] = [];
  const needCourtyard = () => {
    if (!buildings.some((b) => b.key === 'courtyard')) buildings.push({ key: 'courtyard', x: 0, y: 0 });
  };
  for (const d of arena.decor ?? []) {
    if (d.look === 'gate') {
      fallbackHouses.add(decor(d, mats));
      needCourtyard();
    } else scene.add(decor(d, mats));
  }
  // Waldrand, Dickicht, Büsche, Hecken und Gartenkram: Blender-Modelle (garden.glb), bis dahin die Code-Formen
  const fallbackForest = new THREE.Group();
  const forestSpots = forestBorder(fallbackForest, x0, y0, x1, y1, mats);
  const fallbackThicket = new THREE.Group();
  const thickets: { x: number; y: number; w: number; h: number }[] = [];
  const fallbackHedges = new THREE.Group();
  const hedgeRects: { x: number; y: number; w: number; h: number }[] = [];
  const fallbackDecor = new THREE.Group();
  const decoObstacles: Obstacle[] = [];

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
  const plainTrees: TreeSpot[] = [];
  const fallbackTrees = new THREE.Group();
  const fallbackShed = new THREE.Group();
  const sheds: Obstacle[] = [];
  // Laternen bleiben eigene Gruppen (nicht zusammengefasst): Mast und Dach werden später getauscht
  const lamps = new THREE.Group();
  target.add(lamps);
  for (const o of arena.obstacles) {
    if (o.look === 'lamp') {
      const d = obstacleDecor(o, mats);
      if (d) lamps.add(d);
      continue;
    }
    if (o.look && OBSTACLE_MODELS[o.look]) {
      const d = o.look === 'car' || o.look === 'well' ? nightObstacle(o, mats) : obstacleDecor(o, mats);
      if (d) fallbackDecor.add(d);
      decoObstacles.push(o);
      continue;
    }
    // Schmale Hausteile am Innenhof sind Ziegelmauern (ohne Dach)
    if (o.kind === 'rect' && o.look === 'house' && Math.min(o.w, o.h) <= 1.2) {
      fallbackHouses.add(courtyardWall(o, mats));
      needCourtyard();
    }
    else if (o.kind === 'rect' && o.look === 'house') {
      fallbackHouses.add(house(o, mats, chimneys));
      buildings.push({ key: houseKey(o), x: o.x, y: o.y });
    }
    else if (o.kind === 'rect' && o.look === 'rathole') scene.add(rathole(o, mats, chimneys));
    else if (o.kind === 'rect' && o.look === 'ruin') {
      fallbackHouses.add(ruin(o, mats, chimneys));
      buildings.push({ key: buildingKey('ruin', o), x: o.x, y: o.y });
    }
    else if (o.look === 'car' || o.look === 'well') {
      const d = nightObstacle(o, mats);
      if (d) scene.add(d);
    }
    else if (o.kind === 'rect' && (o.look ?? 'hedge') === 'hedge' && o.species !== 'rosemary') {
      fallbackHedges.add(hedge(o, mats));
      hedgeRects.push(o);
    }
    else if (o.kind === 'rect' && (o.look ?? 'hedge') === 'hedge') scene.add(hedge(o, mats));
    else if (o.kind === 'circle' && o.look === 'tree' && (!o.species || MODEL_SPECIES.includes(o.species))) {
      // Bäume: Blender-Modelle (werden nachgeladen), bis dahin die im Code gebaute Form
      plainTrees.push({ x: o.x, y: o.y, r: o.r, species: o.species });
      fallbackTrees.add(tree(o.x, o.y, o.r, mats, o.species as TreeSpecies | undefined));
    }
    else if (o.kind === 'circle' && o.look === 'tree') scene.add(tree(o.x, o.y, o.r, mats, o.species as TreeSpecies | undefined));
    else if (o.kind === 'rect' && o.look === 'shed') {
      // Schuppen aus Blender, wenn es ihn in diesen Maßen gibt
      const d = obstacleDecor(o, mats);
      if (d) fallbackShed.add(d);
      sheds.push(o);
    }
    else if (o.kind === 'rect' && o.look === 'blocked') {
      flat(o.w, o.h, o.x, o.y, m(COLORS.blocked), 0.012);
      fallbackThicket.add(thicket(o, mats));
      thickets.push(o);
    }
    else {
      const d = obstacleDecor(o, mats);
      if (d) scene.add(d);
      else simpleObstacle(o, { box, flat, m, add });
    }
  }
  scene.add(brushes((arena.brush ?? []).filter((b) => b.look !== 'bush')));
  const bushList = (arena.brush ?? []).filter((b) => b.look === 'bush');
  const fallbackBushes = brushes(bushList);

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
  // Glühwürmchen über Garten und Waldrand
  const flies = fireflies(x0 - 4, y0 - 4, x1 + 4, y1 + 4);
  live.add(flies.points);
  const night = nightDecor(scene, live, arena, mats);
  // Deko-Gras bleibt eigenständig (Grafik „Niedrig“ blendet es aus)
  const tufts = grassTufts(arena);
  live.add(tufts);
  target.add(mergeStatic(scene));
  // Gebäude aus Blender: ersetzen die Code-Formen, sobald houses.glb geladen ist (alle oder keins)
  const houseFallback = mergeStatic(fallbackHouses);
  target.add(houseFallback);
  void loadHouses().then((models) => {
    if (!buildings.length || buildings.some((b) => !models.has(b.key))) return;
    target.remove(houseFallback);
    for (const b of buildings) {
      for (const name of [b.key, b.key + '_glow']) {
        const m = models.get(name);
        if (!m) continue;
        m.position.set(b.x, 0, b.y);
        target.add(m);
      }
    }
  });
  // Bäume aus Blender: ersetzen die einfachen Formen, sobald garden.glb geladen ist
  const fallback = mergeStatic(fallbackTrees);
  target.add(fallback);
  const shedFallback = mergeStatic(fallbackShed);
  target.add(shedFallback);
  // Kulisse: jede Gruppe wird getrennt getauscht, sobald ihre Modelle da sind
  const swaps: [THREE.Object3D, (models: Map<string, GardenModel>) => THREE.Object3D | null][] = [
    [fallbackForest, (ms) => forestInstances(ms, forestSpots)],
    [mergeStatic(fallbackThicket), (ms) => thicketInstances(ms, thickets)],
    [fallbackBushes, (ms) => bushInstances(ms, bushList)],
    [mergeStatic(fallbackHedges), (ms) => hedgeInstances(ms, hedgeRects)],
    [
      mergeStatic(fallbackDecor),
      (ms) => {
        const meshes = decoObstacles.map((o) => obstacleMesh(ms, o));
        if (meshes.some((m) => !m)) return null;
        const g = new THREE.Group();
        for (const m of meshes) g.add(m!);
        // Teich: Wasserfläche (mit Textur) bleibt aus dem Code, Rand kommt aus Blender
        for (const o of decoObstacles) {
          if (o.look !== 'pond' || o.kind !== 'circle') continue;
          const water = new THREE.Mesh(new THREE.CircleGeometry(o.r * 0.95, 40).rotateX(-Math.PI / 2), mats.textured('water', 2, 0xbfe3ea));
          water.position.set(o.x, 0.04, o.y);
          water.receiveShadow = true;
          g.add(water);
        }
        return g;
      },
    ],
  ];
  for (const [fb] of swaps) target.add(fb);
  void loadGarden().then((models) => {
    if (models.has('lamp_post'))
      for (const l of lamps.children) {
        for (const b of l.children.filter((c) => c.name === 'body')) l.remove(b);
        l.add(gardenMesh(models, 'lamp_post')!);
      }
    for (const [fb, make] of swaps) {
      const obj = make(models);
      if (!obj) continue;
      target.remove(fb);
      target.add(obj);
    }
    const trees = treeInstances(models, plainTrees);
    if (trees) {
      target.remove(fallback);
      target.add(trees);
    }
    const shedMeshes = sheds.map((o) => {
      const m = o.kind === 'rect' ? gardenMesh(models, `shed_${Math.round(o.w * 100)}x${Math.round(o.h * 100)}`) : null;
      m?.position.set(o.x, 0, o.y);
      return m;
    });
    if (shedMeshes.length && shedMeshes.every((m) => m)) {
      target.remove(shedFallback);
      for (const m of shedMeshes) target.add(m!);
    }
  });
  // Fässer, Kisten, Karren, Zäune und Werkzeug als 3D-Modelle (werden nachgeladen)
  addPropModels(target, arena.props ?? []);
  target.add(live);
  const smokes = smoke(chimneys);
  target.add(smokes.group);
  return {
    update(time, heroes = []) {
      windTime.value = time;
      smokes.update(time);
      night.update(time, heroes);
      if (flies.points.visible) flies.update(time);
    },
    setDetail(on) {
      flies.points.visible = on;
      night.setDetail(on);
      tufts.visible = on;
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
    // Vertex-Farben behalten, wenn das Material sie nutzt (Bäume)
    const keepAttr = (mesh.material as THREE.MeshLambertMaterial).vertexColors ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
    for (const name of Object.keys(geo.attributes)) if (!keepAttr.includes(name)) geo.deleteAttribute(name);
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
function forestBorder(scene: THREE.Object3D, x0: number, y0: number, x1: number, y1: number, _mats: Mats): ForestSpot[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spots: ForestSpot[] = [];
  for (let row = 0; row < 4; row++) {
    const d = 2.5 + row * 4;
    const push = (x: number, y: number) => spots.push({ x, y, s: 0.8 + rnd() * 0.6, pine: rnd() < 0.4, row });
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
  // Waldrand: je drei Formen für Laub- und Nadelbäume (weniger Wiederholung), leicht unterschiedlich getönt
  const trunks = new THREE.InstancedMesh(trunkGeometry(3, 0.38, 1.8, false), foliageMaterial(), spots.length);
  const leafy = spots.filter((s) => !s.pine);
  const pines = spots.filter((s) => s.pine);
  const tint = new THREE.Color();
  const variants: THREE.InstancedMesh[] = [];
  for (let v = 0; v < 3; v++) {
    const list = leafy.filter((_, i) => i % 3 === v);
    const crowns = new THREE.InstancedMesh(crownGeometry(11 + v * 5, 2, 1.4), foliageMaterial(), Math.max(1, list.length));
    crowns.count = list.length;
    list.forEach((s, i) => {
      crowns.setMatrixAt(i, m.makeRotationY(s.x * 1.7).scale(new THREE.Vector3(s.s, s.s, s.s)).setPosition(s.x, 0, s.y));
      crowns.setColorAt(i, tint.setHSL(0.3, 0.2, 0.85 + ((s.x * 13 + s.y * 7) % 10) / 50));
    });
    const plist = pines.filter((_, i) => i % 3 === v);
    const cones = new THREE.InstancedMesh(pineGeometry(23 + v * 7, 1.7, 1.2), foliageMaterial(), Math.max(1, plist.length));
    cones.count = plist.length;
    plist.forEach((s, i) => {
      cones.setMatrixAt(i, m.makeRotationY(s.y * 1.3).scale(new THREE.Vector3(s.s, s.s * 1.1, s.s)).setPosition(s.x, 0, s.y));
      cones.setColorAt(i, tint.setHSL(0.33, 0.2, 0.85 + ((s.x * 7 + s.y * 13) % 10) / 50));
    });
    variants.push(crowns, cones);
  }
  spots.forEach((s, i) => trunks.setMatrixAt(i, m.makeScale(s.s, s.s, s.s).setPosition(s.x, 0, s.y)));
  for (const inst of [trunks, ...variants]) {
    inst.castShadow = true;
    scene.add(inst);
  }
  return spots;
}
