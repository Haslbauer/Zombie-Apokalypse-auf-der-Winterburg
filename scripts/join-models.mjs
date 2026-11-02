/**
 * Fertige GLB-Modelle nachbearbeiten: Teile (Primitive) mit gleichem Material
 * zusammenfassen, damit jede Figur nur wenige Zeichenaufrufe braucht.
 * Aufruf: node scripts/join-models.mjs [public/models/rat.glb …] (ohne Angabe: alle).
 * Der Konverter (npm run models) macht das inzwischen selbst.
 */
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { joinPrimitives, prune } from '@gltf-transform/functions';

/**
 * Innerhalb jedes Meshes Primitive mit gleichem Material und gleichen Attributen
 * zu einem zusammenfassen (auch bei Figuren mit Skelett; join() lässt die aus).
 */
export function joinByMaterial(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    const groups = new Map();
    for (const p of mesh.listPrimitives()) {
      if (p.listTargets().length) continue;
      const key = [p.getMaterial()?.getName() ?? '', doc.getRoot().listMaterials().indexOf(p.getMaterial()), p.getMode(), !!p.getIndices(), ...p.listSemantics().sort()].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    for (const prims of groups.values()) {
      if (prims.length < 2) continue;
      const joined = joinPrimitives(prims);
      for (const p of prims) {
        mesh.removePrimitive(p);
        p.dispose();
      }
      mesh.addPrimitive(joined);
    }
  }
}

import { fileURLToPath } from 'node:url';
const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const dir = resolve('public/models');
const files = !direct ? [] : process.argv.length > 2 ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith('.glb')).map((f) => join(dir, f));
const io = new NodeIO();
for (const file of files) {
  const doc = await io.read(file);
  const count = () => doc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().length, 0);
  const before = count();
  joinByMaterial(doc);
  await doc.transform(prune());
  const after = count();
  if (after < before) await io.write(file, doc);
  console.log(`${file.split('/').pop()}: ${before} → ${after} Teile${after < before ? '' : ' (unverändert)'}`);
}
