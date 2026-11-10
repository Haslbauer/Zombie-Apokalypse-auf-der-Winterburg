import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Garten-Modelle aus Blender (tools/blender/garden.py → public/models/garden.glb):
 * Bienenstock, Laubbäume (oak_a/b/c), Nadelbäume (pine_a/b), Baumarten
 * (tree_<species>), Gemüse (plant_<art>), Hochbeet-Rahmen (bed_<L>x<B>_a/b)
 * und Schuppen (shed_<B>x<T>, Maße in cm). Die Farben
 * stecken in den Ecken (inklusive vorberechneter Verdeckung), daher reicht ein
 * einfaches Lambert-Material mit Vertex-Farben. Bis die Datei geladen ist (oder
 * wenn sie fehlt), bleiben die bisherigen, im Code gebauten Formen stehen.
 */
export interface GardenModel {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

let pending: Promise<Map<string, GardenModel>> | null = null;
let material: THREE.MeshLambertMaterial | null = null;

export function loadGarden(): Promise<Map<string, GardenModel>> {
  if (typeof window === 'undefined') return Promise.resolve(new Map());
  pending ??= new GLTFLoader()
    .loadAsync('models/garden.glb')
    .then((gltf) => {
      // Blätter sind einseitige Flächen: von beiden Seiten zeichnen
      material ??= new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const out = new Map<string, GardenModel>();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Gepackte Ecken (KHR_mesh_quantization) in Gleitkomma umwandeln und die
        // Knoten-Verschiebung/-Skalierung einrechnen: das Modell steht dann im Ursprung
        const geometry = toFloat(mesh.geometry);
        geometry.applyMatrix4(mesh.matrixWorld);
        out.set(mesh.name || o.parent?.name || '', { geometry, material: material! });
      });
      return out;
    })
    .catch((err) => {
      console.warn('Garten-Modelle nicht geladen:', err);
      return new Map<string, GardenModel>();
    });
  return pending;
}

/** Kopie mit Float32-Attributen (Position, Normale, Farbe), ohne den Rest. */
function toFloat(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const a = src.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const n = a.itemSize;
    const arr = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) {
      arr[i * n] = a.getX(i);
      if (n > 1) arr[i * n + 1] = a.getY(i);
      if (n > 2) arr[i * n + 2] = a.getZ(i);
      if (n > 3) arr[i * n + 3] = a.getW(i);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  if (src.index) out.setIndex(src.index.clone());
  return out;
}

/** Einzelnes Modell als Mesh (z. B. Bienenstock). */
export function gardenMesh(models: Map<string, GardenModel>, name: string): THREE.Mesh | null {
  const m = models.get(name);
  if (!m) return null;
  const mesh = new THREE.Mesh(m.geometry, m.material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface TreeSpot {
  x: number;
  y: number;
  r: number;
  /** Baumart (Kartendaten species); ohne: Laub- oder Nadelbaum nach Ort. */
  species?: string;
}

/** Hindernis-Radius, für den das Modell der Art gebaut ist (Maßstab = r / Bezug). */
const SPECIES_REF: Record<string, number> = { apple: 1.2, fruit: 1.4, olive: 0.45, fig: 1.0, rowan: 1.2, yew: 1.1, elder: 0.65, fir: 1.4 };
export const MODEL_SPECIES = Object.keys(SPECIES_REF);

/** Fester Zufallswert je Ort (gleich bei allen Spielern). */
function hash(x: number, y: number, k = 0): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/** Welches Modell an diesem Ort steht: etwa ein Drittel Nadelbäume, sonst eine der drei Laubbaum-Formen. */
export function treeVariant(x: number, y: number): string {
  const h = hash(x, y);
  if (h < 0.3) return h < 0.15 ? 'pine_a' : 'pine_b';
  return ['oak_a', 'oak_b', 'oak_c'][Math.floor(hash(x, y, 1) * 3)];
}

/**
 * Bäume als InstancedMesh (eine Zeichnung je Baumform). Größe nach dem
 * Hindernis-Radius (1,4 m = Normalgröße), leicht gestreut, zufällig gedreht.
 */
export function treeInstances(models: Map<string, GardenModel>, spots: TreeSpot[]): THREE.Group | null {
  const byVariant = new Map<string, TreeSpot[]>();
  for (const s of spots) {
    const v = s.species ? `tree_${s.species}` : treeVariant(s.x, s.y);
    if (!models.has(v)) return null;
    byVariant.set(v, [...(byVariant.get(v) ?? []), s]);
  }
  const group = new THREE.Group();
  group.name = 'gardenTrees';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [variant, list] of byVariant) {
    const model = models.get(variant)!;
    const inst = new THREE.InstancedMesh(model.geometry, model.material, list.length);
    list.forEach((s, i) => {
      const k = (s.r / (s.species ? SPECIES_REF[s.species] ?? 1.4 : 1.4)) * (0.88 + hash(s.x, s.y, 2) * 0.24);
      q.setFromAxisAngle(up, hash(s.x, s.y, 3) * Math.PI * 2);
      m.compose(new THREE.Vector3(s.x, 0, s.y), q, new THREE.Vector3(k, k * (0.92 + hash(s.x, s.y, 4) * 0.16), k));
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  return group;
}

// ---------- Häuser (tools/blender/houses.py → public/models/houses.glb) ----------

/** Name des Hausmodells zu einem Hindernis-Rechteck (wie im Blender-Skript). */
export function houseKey(o: { x: number; y: number }): string {
  return buildingKey('house', o);
}

/** Name eines Gebäudemodells (house, ruin) nach Art und Mittelpunkt des Rechtecks. */
export function buildingKey(kind: string, o: { x: number; y: number }): string {
  return `${kind}_${Math.round(o.x * 100)}_${Math.round(o.y * 100)}`;
}

let housesPending: Promise<Map<string, THREE.Object3D>> | null = null;

/**
 * Häuser mit gebackener Textur (Ziegel, Dachziegel, Stein, Holz und
 * Umgebungsverdeckung in einem Bild je Haus) und leuchtenden Fenstern.
 * Schlüssel: houseKey(), dazu Objekte mit der Endung _glow.
 */
export function loadHouses(): Promise<Map<string, THREE.Object3D>> {
  if (typeof window === 'undefined') return Promise.resolve(new Map());
  housesPending ??= new GLTFLoader()
    .loadAsync('models/houses.glb')
    .then((gltf) => {
      const glow = new THREE.MeshLambertMaterial({ color: 0xffcf7a, emissive: 0xffa53a, emissiveIntensity: 0.9 });
      const out = new Map<string, THREE.Object3D>();
      for (const child of [...gltf.scene.children]) {
        child.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const src = mesh.material as THREE.MeshStandardMaterial;
          if (child.name.endsWith('_glow')) mesh.material = glow;
          else {
            if (src.map) src.map.anisotropy = 8;
            mesh.material = new THREE.MeshLambertMaterial({ map: src.map, color: new THREE.Color(1.15, 1.15, 1.15) });
            mesh.castShadow = true;
          }
          mesh.receiveShadow = true;
        });
        // in eine Hülle packen: der Knoten selbst trägt die Entpack-Skalierung (Quantisierung)
        const shell = new THREE.Group();
        shell.name = child.name;
        shell.add(child);
        out.set(child.name, shell);
      }
      return out;
    })
    .catch((err) => {
      console.warn('Häuser nicht geladen:', err);
      return new Map<string, THREE.Object3D>();
    });
  return housesPending;
}

// ---------- Gelände: Wald, Dickicht, Büsche, Hecken, Gartenkram ----------

/** Zufallsfolge mit festem Startwert (gleich bei allen Spielern). */
function seq(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Instanzen eines Modells an Orten (x, z) mit Drehung um y und Maßstab (sx, sy, sz). */
function instances(models: Map<string, GardenModel>, name: string, list: { x: number; z: number; rot: number; sx: number; sy?: number; sz?: number }[], shadow = true): THREE.InstancedMesh | null {
  const model = models.get(name);
  if (!model || !list.length) return null;
  const inst = new THREE.InstancedMesh(model.geometry, model.material, list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  list.forEach((p, i) => {
    q.setFromAxisAngle(up, p.rot);
    m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(p.sx, p.sy ?? p.sx, p.sz ?? p.sx));
    inst.setMatrixAt(i, m);
  });
  inst.castShadow = shadow;
  inst.receiveShadow = true;
  inst.computeBoundingSphere();
  return inst;
}

export interface ForestSpot {
  x: number;
  y: number;
  s: number;
  pine: boolean;
  row: number;
}

/** Waldrand aus sparsamen Blender-Bäumen (drei Laub-, zwei Nadelformen). */
export function forestInstances(models: Map<string, GardenModel>, spots: ForestSpot[]): THREE.Group | null {
  const names = ['forest_oak_a', 'forest_oak_b', 'forest_oak_c', 'forest_pine_a', 'forest_pine_b'];
  if (names.some((n) => !models.has(n))) return null;
  const g = new THREE.Group();
  for (const [k, name] of names.entries()) {
    const pine = k >= 3;
    const list = spots
      .filter((s, i) => s.pine === pine && i % (pine ? 2 : 3) === (pine ? k - 3 : k))
      .map((s) => ({ x: s.x, z: s.y, rot: hash(s.x, s.y, 5) * Math.PI * 2, sx: s.s, sy: s.s * (pine ? 1.1 : 1) }));
    const inst = instances(models, name, list);
    if (inst) g.add(inst);
  }
  return g;
}

/** Dickicht auf gesperrten Flächen: Büsche und (östlich der Häuser) große Tannen. */
export function thicketInstances(models: Map<string, GardenModel>, rects: { x: number; y: number; w: number; h: number }[]): THREE.Group | null {
  if (!['bush_a', 'bush_b', 'bush_c', 'tree_fir', 'forest_oak_a'].every((n) => models.has(n))) return null;
  const g = new THREE.Group();
  const bushes: { x: number; z: number; rot: number; sx: number; sy: number }[][] = [[], [], []];
  const firs: { x: number; z: number; rot: number; sx: number }[] = [];
  const oaks: { x: number; z: number; rot: number; sx: number }[] = [];
  for (const o of rects) {
    const rnd = seq(o.x * 31 + o.y * 7);
    const count = Math.round(o.w * o.h * 0.45);
    for (let i = 0; i < count; i++) {
      const s = 1.0 + rnd() * 1.0;
      bushes[i % 3].push({ x: o.x + (rnd() - 0.5) * o.w, z: o.y + (rnd() - 0.5) * o.h, rot: rnd() * 6.3, sx: s, sy: s * (0.8 + rnd() * 0.4) });
    }
    const trees = Math.round((o.w * o.h) / 40);
    for (let i = 0; i < trees; i++) {
      const p = { x: o.x + (rnd() - 0.5) * (o.w - 2), z: o.y + (rnd() - 0.5) * (o.h - 2), rot: rnd() * 6.3, sx: 0.9 + rnd() * 0.3 };
      (o.x > 50 ? firs : oaks).push(p);
    }
  }
  bushes.forEach((list, k) => {
    const inst = instances(models, `bush_${'abc'[k]}`, list);
    if (inst) g.add(inst);
  });
  for (const [name, list] of [['tree_fir', firs], ['forest_oak_a', oaks]] as const) {
    const inst = instances(models, name, list);
    if (inst) g.add(inst);
  }
  return g;
}

/** Büsche (Verstecke): Ballen verteilt über die Fläche jedes Buschs. */
export function bushInstances(models: Map<string, GardenModel>, list: { kind: 'circle' | 'rect'; x: number; y: number; r?: number; w?: number; h?: number }[]): THREE.Group | null {
  if (!['bush_a', 'bush_b', 'bush_c'].every((n) => models.has(n))) return null;
  const spots: { x: number; z: number; rot: number; sx: number; sy: number }[][] = [[], [], []];
  for (const b of list) {
    const rnd = seq(b.x * 13 + b.y * 29);
    const area = b.kind === 'circle' ? Math.PI * b.r! * b.r! : b.w! * b.h!;
    const n = Math.max(3, Math.round(area * 0.9));
    for (let i = 0; i < n; i++) {
      let x: number;
      let z: number;
      if (b.kind === 'circle') {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * b.r! * 0.85;
        x = b.x + Math.cos(a) * r;
        z = b.y + Math.sin(a) * r;
      } else {
        x = b.x + (rnd() - 0.5) * b.w! * 0.9;
        z = b.y + (rnd() - 0.5) * b.h! * 0.9;
      }
      const s = 0.85 + rnd() * 0.5;
      spots[i % 3].push({ x, z, rot: rnd() * 6.3, sx: s, sy: s * (0.85 + rnd() * 0.35) });
    }
  }
  const g = new THREE.Group();
  spots.forEach((l, k) => {
    const inst = instances(models, `bush_${'abc'[k]}`, l);
    if (inst) g.add(inst);
  });
  return g;
}

/** Hecken: 1-m-Stücke aneinandergereiht, auf Länge und Tiefe gestreckt. */
export function hedgeInstances(models: Map<string, GardenModel>, rects: { x: number; y: number; w: number; h: number }[]): THREE.InstancedMesh | null {
  if (!models.has('hedge_seg')) return null;
  const list: { x: number; z: number; rot: number; sx: number; sy: number; sz: number }[] = [];
  for (const o of rects) {
    const alongX = o.w >= o.h;
    const len = Math.max(o.w, o.h);
    const depth = Math.min(o.w, o.h);
    const n = Math.max(1, Math.round(len));
    const seg = len / n;
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + (i + 0.5) * seg;
      const k = hash(o.x + t, o.y, 6);
      list.push({ x: alongX ? o.x + t : o.x, z: alongX ? o.y : o.y + t, rot: (alongX ? 0 : Math.PI / 2) + (k > 0.5 ? Math.PI : 0), sx: seg * 1.08, sy: 0.95 + k * 0.15, sz: depth / 1.1 });
    }
  }
  return instances(models, 'hedge_seg', list);
}

/** Gartenkram und Gelände-Hindernisse aus Blender: Modellname(n) und Bezugsmaß. */
export const OBSTACLE_MODELS: Record<string, { names: string[]; rect?: [number, number]; r?: number }> = {
  bench: { names: ['bench'], rect: [2.2, 0.7] },
  compost: { names: ['compost'], rect: [2.2, 2.2] },
  woodpile: { names: ['woodpile'], rect: [3.2, 1.2] },
  wheelbarrow: { names: ['wheelbarrow'], rect: [1.7, 0.8] },
  swing: { names: ['swing'], rect: [2.8, 1.4] },
  car: { names: ['car'], rect: [4.2, 1.9] },
  log: { names: ['log'], rect: [3.6, 0.9] },
  grave: { names: ['grave_a', 'grave_b', 'grave_c'], rect: [0.7, 0.3] },
  barrel: { names: ['rain_barrel'], r: 0.4 },
  rock: { names: ['rock_a', 'rock_b', 'rock_c'], r: 1.0 },
  deadtree: { names: ['deadtree'], r: 0.45 },
  well: { names: ['well'], r: 0.9 },
  pond: { names: ['pond'], r: 2.6 },
};

/** Modell für ein Hindernis (Größe und Lage nach dem Rechteck bzw. Kreis), sonst null. */
export function obstacleMesh(models: Map<string, GardenModel>, o: { look?: string; kind: string; x: number; y: number; w?: number; h?: number; r?: number }): THREE.Mesh | null {
  const spec = o.look ? OBSTACLE_MODELS[o.look] : undefined;
  if (!spec) return null;
  const name = spec.names[Math.floor(hash(o.x, o.y, 7) * spec.names.length) % spec.names.length];
  const mesh = gardenMesh(models, name);
  if (!mesh) return null;
  mesh.position.set(o.x, 0, o.y);
  if (o.kind === 'rect' && spec.rect) {
    const long = Math.max(o.w!, o.h!);
    const short = Math.min(o.w!, o.h!);
    const s = long / spec.rect[0];
    mesh.scale.set(s, s, short / spec.rect[1]);
    if (o.h! > o.w!) mesh.rotation.y = Math.PI / 2;
  } else if (o.kind === 'circle' && spec.r) {
    mesh.scale.setScalar(o.r! / spec.r);
    mesh.rotation.y = hash(o.x, o.y, 8) * Math.PI * 2;
  }
  return mesh;
}
