/**
 * Verkleinert eine GLB-Datei aus Blender: gleiche Ecken zusammenfassen (weld),
 * Positionen, Normalen und Farben als kleine Ganzzahlen speichern
 * (KHR_mesh_quantization, lädt three.js ohne Zusatz), Ungenutztes entfernen.
 *   node scripts/pack-glb.mjs public/models/garden.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, weld } from '@gltf-transform/functions';
import { statSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Aufruf: node scripts/pack-glb.mjs <datei.glb>');
  process.exit(1);
}
const before = statSync(file).size;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
await doc.transform(dedup(), weld(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8, quantizeTexcoord: 12 }), prune());
await io.write(file, doc);
console.log(`${file}: ${(before / 1e6).toFixed(2)} MB → ${(statSync(file).size / 1e6).toFixed(2)} MB`);
