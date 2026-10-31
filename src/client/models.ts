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
  /** Treffermoment je Angriffs-Clip als Anteil der Dauer (aus <name>.meta.json). */
  impacts: Record<string, number>;
}

export async function loadRiggedModel(url: string, height = ZOMBIE_HEIGHT): Promise<RiggedModel> {
  const [gltf, meta] = await Promise.all([
    new GLTFLoader().loadAsync(url),
    fetch(url.replace(/\.glb$/, '.meta.json'))
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({})) as Promise<{ impacts?: Record<string, number> }>,
  ]);
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
    impacts: meta.impacts ?? {},
  };
}

const upperCache = new WeakMap<THREE.AnimationClip, THREE.AnimationClip>();
/** Nur die Spuren oberhalb der Hüfte (Wirbelsäule, Arme, Kopf); Beine und Hüfte bleiben beim Laufen. */
function upperBody(clip: THREE.AnimationClip): THREE.AnimationClip {
  let c = upperCache.get(clip);
  if (!c) {
    const lower = /Hips|UpLeg|Leg|Foot|Toe/;
    c = new THREE.AnimationClip(`${clip.name}Upper`, clip.duration, clip.tracks.filter((t) => !lower.test(t.name.split('.')[0])));
    upperCache.set(clip, c);
  }
  return c;
}

/** Eine Instanz des Modells: eigenes Skelett, eigene Materialien (für Färbung und Treffer-Blitz). */
export interface ModelInstance {
  /** Treffermomente (siehe RiggedModel). */
  impacts: Record<string, number>;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  materials: (THREE.Material & { color: THREE.Color })[];
}

/**
 * Randlicht (Fresnel): Kanten, die vom Betrachter weg zeigen, leuchten in
 * einer Farbe. So bleiben Figuren auch bei Nacht gut zu erkennen.
 */
function addRimLight(mat: THREE.MeshStandardMaterial, color: THREE.ColorRepresentation, strength: number): void {
  const uniforms = { rimColor: { value: new THREE.Color(color).multiplyScalar(strength) } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = uniforms.rimColor;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  float rimK = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);\n  totalEmissiveRadiance += rimColor * pow(rimK, 2.2);',
      );
  };
  mat.customProgramCacheKey = () => 'rim';
}

/**
 * Eigene Kopie eines Modells. tint multipliziert die Texturfarbe; paint
 * ersetzt die Textur durch eine Farbe; rim gibt ein farbiges Randlicht.
 */
export function instantiate(
  model: RiggedModel,
  scale = 1,
  tint?: [number, number, number],
  paint?: THREE.ColorRepresentation,
  rim?: { color: THREE.ColorRepresentation; strength: number },
): ModelInstance {
  const inner = cloneSkinned(model.scene);
  const materials: ModelInstance['materials'] = [];
  const copy = (source: THREE.Material): THREE.MeshStandardMaterial => {
    const mat = (source as THREE.MeshStandardMaterial).clone();
    if (paint !== undefined) {
      mat.map = null;
      mat.color.set(paint);
    }
    if (tint) mat.color.multiply(new THREE.Color().setRGB(tint[0], tint[1], tint[2]));
    mat.roughness = 0.85;
    mat.metalness = 0;
    if (rim) addRimLight(mat, rim.color, rim.strength);
    materials.push(mat);
    return mat;
  };
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Figuren mit mehreren Materialien (z. B. Haut, Kleidung, Haare)
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copy) : copy(mesh.material);
  });
  inner.scale.setScalar(model.scale * scale);
  // Mixamo-Figuren schauen nach +z, die Simulation nach +x
  inner.rotation.y = Math.PI / 2;
  const root = new THREE.Group();
  root.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const [name, clip] of model.clips) actions.set(name, mixer.clipAction(clip));
  // Angriffe zusätzlich nur für den Oberkörper (zum Schießen im Laufen)
  for (const [name, clip] of model.clips) {
    if (!name.startsWith('attack') && !name.startsWith('bite')) continue;
    actions.set(`${name}Upper`, mixer.clipAction(upperBody(clip)));
  }
  return { root, mixer, actions, materials, impacts: model.impacts };
}
