import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** Höhe eines normalen Zombies in Metern (Spielmaßstab). */
const ZOMBIE_HEIGHT = 1.75;

/** Geladenes Mixamo-Modell mit seinen Animationen (siehe assets/models/). */
export interface RiggedModel {
  scene: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
  /** Faktor, der das Modell auf Spielgröße bringt. */
  scale: number;
}

export async function loadRiggedModel(url: string, height = ZOMBIE_HEIGHT): Promise<RiggedModel> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      // Animierte Figuren nicht wegschneiden (Grenzen stammen aus der Ruhepose)
      o.frustumCulled = false;
    }
  });
  return {
    scene: gltf.scene,
    clips: new Map(gltf.animations.map((c) => [c.name, c])),
    scale: height / Math.max(0.01, size.y),
  };
}

/** Eine Instanz des Modells: eigenes Skelett, eigene Materialien (für Färbung und Treffer-Blitz). */
export interface ModelInstance {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  materials: (THREE.Material & { color: THREE.Color })[];
}

/**
 * Eigene Kopie eines Modells. tint multipliziert die Texturfarbe; paint
 * ersetzt die Textur durch eine Farbe (der dunkle Mocap-Anzug der Helden).
 */
export function instantiate(model: RiggedModel, scale = 1, tint?: [number, number, number], paint?: THREE.ColorRepresentation): ModelInstance {
  const inner = cloneSkinned(model.scene);
  const materials: ModelInstance['materials'] = [];
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    if (paint !== undefined) {
      mat.map = null;
      mat.color.set(paint);
    }
    if (tint) mat.color.multiply(new THREE.Color().setRGB(tint[0], tint[1], tint[2]));
    mat.roughness = 0.9;
    mat.metalness = 0;
    mesh.material = mat;
    materials.push(mat);
  });
  inner.scale.setScalar(model.scale * scale);
  // Mixamo-Figuren schauen nach +z, die Simulation nach +x
  inner.rotation.y = Math.PI / 2;
  const root = new THREE.Group();
  root.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const [name, clip] of model.clips) actions.set(name, mixer.clipAction(clip));
  return { root, mixer, actions, materials };
}
