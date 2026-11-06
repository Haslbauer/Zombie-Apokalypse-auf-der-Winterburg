import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Garten-Modelle aus Blender (tools/blender/garden.py → public/models/garden.glb):
 * Bienenstock, Laubbäume (oak_a/b/c) und Nadelbäume (pine_a/b). Die Farben
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
      material ??= new THREE.MeshLambertMaterial({ vertexColors: true });
      const out = new Map<string, GardenModel>();
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry;
        for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'color'].includes(name)) geometry.deleteAttribute(name);
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
}

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
    const v = treeVariant(s.x, s.y);
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
      const k = (s.r / 1.4) * (0.85 + hash(s.x, s.y, 2) * 0.3);
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
