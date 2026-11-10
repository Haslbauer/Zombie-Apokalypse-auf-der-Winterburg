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
