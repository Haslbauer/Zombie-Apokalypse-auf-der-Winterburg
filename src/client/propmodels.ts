import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PropDef } from '../sim/types';

/**
 * Deko als 3D-Modell (Quaternius, CC0; Quellen in assets/props/, umgewandelt
 * mit `npm run props` nach public/models/props.glb). Die Modelle stehen mit
 * der Unterseite auf y = 0, Mitte bei x = z = 0, Größe in Metern.
 */
export const MODEL_PROPS = new Set<PropDef['look']>(['oakbarrel', 'woodcrate', 'handcart', 'picketfence', 'grainsacks', 'axe', 'shovel']);

/** Lage des Modells im Deko-Punkt: Werkzeug liegt am Boden, steckt in der Erde oder im Baumstumpf (h). */
function pose(p: PropDef, obj: THREE.Object3D): void {
  switch (p.look) {
    case 'axe':
      if (p.h) {
        // Im Baumstumpf eingeschlagen, Stiel schräg nach oben
        obj.position.y = p.h - 0.16;
        obj.rotation.z = 0.5;
      } else {
        // Flach auf der Seite liegend
        obj.rotation.x = -Math.PI / 2;
        obj.position.y = 0.025;
      }
      break;
    case 'shovel':
      // In die Erde gesteckt, leicht schräg
      obj.rotation.z = 0.22;
      obj.position.y = -0.28;
      break;
  }
}

/**
 * Lädt die Modelle und stellt sie an die Deko-Punkte. Gleiche Materialien
 * werden zu einem Mesh zusammengefasst (wenige Zeichenaufrufe); ohne die
 * Datei bleibt die Karte einfach ohne diese Deko.
 */
export function addPropModels(target: THREE.Object3D, props: PropDef[]): void {
  const list = props.filter((p) => MODEL_PROPS.has(p.look));
  if (!list.length) return;
  new GLTFLoader()
    .loadAsync('models/props.glb')
    .then((gltf) => {
      const root = new THREE.Group();
      for (const p of list) {
        const src = gltf.scene.getObjectByName(p.look);
        if (!src) continue;
        const outer = new THREE.Group();
        outer.position.set(p.x, 0, p.y);
        outer.rotation.y = p.rot ?? 0;
        const inner = src.clone();
        inner.position.set(0, 0, 0);
        pose(p, inner);
        outer.add(inner);
        root.add(outer);
      }
      root.updateMatrixWorld(true);
      const groups = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[] }>();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.material as THREE.MeshStandardMaterial;
        let g = groups.get(src.name);
        if (!g) groups.set(src.name, (g = { material: new THREE.MeshLambertMaterial({ color: src.color }), geos: [] }));
        const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
        g.geos.push(geo.index ? geo.toNonIndexed() : geo);
      });
      const out = new THREE.Group();
      out.name = 'propModels';
      for (const { material, geos } of groups.values()) {
        const merged = new THREE.Mesh(mergeGeometries(geos), material);
        merged.castShadow = true;
        merged.receiveShadow = true;
        merged.matrixAutoUpdate = false;
        out.add(merged);
        for (const g of geos) g.dispose();
      }
      out.matrixAutoUpdate = false;
      target.add(out);
    })
    .catch((err) => console.warn('Deko-Modelle nicht geladen:', err));
}
