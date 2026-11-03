/**
 * Wandelt die Deko-Modelle aus assets/props/ (FBX, Quaternius, CC0) in eine
 * gemeinsame GLB für das Spiel um (public/models/props.glb):
 *   1. Im Browser (Playwright/Chromium) lädt der FBXLoader jedes Modell, die
 *      Teile werden in Weltkoordinaten gebacken, auf die Zielgröße aus
 *      assets/props/props.json skaliert und mit der Unterseite auf y = 0
 *      gestellt (Mitte bei x = z = 0). Je Material bleibt ein Mesh.
 *   2. glTF-Transform entfernt doppelte Daten.
 * Jedes Modell ist ein Knoten mit dem Schlüssel aus props.json als Namen.
 * Aufruf: npm run props
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, weld } from '@gltf-transform/functions';

const { chromium } = createRequire(import.meta.url)('playwright');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const propsDir = join(root, 'assets/props');
const cfg = JSON.parse(readFileSync(join(propsDir, 'props.json'), 'utf8'));
delete cfg['//'];
const output = join(root, 'public/models/props.glb');
const TYPES = { '.js': 'text/javascript', '.html': 'text/html' };

const BROWSER_CODE = `
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

window.convert = async (cfg) => {
  const out = new THREE.Group();
  const info = [];
  for (const [key, c] of Object.entries(cfg)) {
    const src = await new FBXLoader().loadAsync('/files/' + c.file);
    src.updateMatrixWorld(true);
    const byMat = new Map();
    let tris = 0;
    src.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: (geo.index ?? geo.attributes.position).count, materialIndex: 0 }];
      const base = geo.index ? geo.toNonIndexed() : geo;
      for (const g of groups) {
        const mat = mats[g.materialIndex ?? 0];
        const part = new THREE.BufferGeometry();
        for (const name of ['position', 'normal']) {
          const a = base.attributes[name];
          part.setAttribute(name, new THREE.BufferAttribute(a.array.slice(g.start * 3, (g.start + g.count) * 3), 3));
        }
        tris += g.count / 3;
        if (!byMat.has(mat.name)) byMat.set(mat.name, { mat, geos: [] });
        byMat.get(mat.name).geos.push(part);
      }
    });
    const node = new THREE.Group();
    node.name = key;
    const box = new THREE.Box3();
    const merged = [];
    for (const { mat, geos } of byMat.values()) {
      const geo = mergeGeometries(geos);
      geo.computeBoundingBox();
      box.union(geo.boundingBox);
      merged.push({ mat, geo });
    }
    const size = box.getSize(new THREE.Vector3());
    const ref = c.axis === 'y' ? size.y : Math.max(size.x, size.y, size.z);
    const k = c.size / ref;
    const center = box.getCenter(new THREE.Vector3());
    for (const { mat, geo } of merged) {
      geo.translate(-center.x, -box.min.y, -center.z).scale(k, k, k);
      // Blender speichert die Farben schon linear, der FBXLoader rechnet sie trotzdem
      // von sRGB um (zu dunkel): einmal zurückrechnen.
      const m = new THREE.MeshStandardMaterial({ name: mat.name, color: mat.color.clone().convertLinearToSRGB(), roughness: 0.9, metalness: 0 });
      const mesh = new THREE.Mesh(geo, m);
      mesh.name = key + '_' + mat.name;
      node.add(mesh);
    }
    out.add(node);
    info.push(key + ': ' + c.file + ', ' + tris + ' Dreiecke, ' + merged.length + ' Materialien, ' + [size.x, size.y, size.z].map((v) => (v * k).toFixed(2)).join(' × ') + ' m');
  }
  const glb = await new GLTFExporter().parseAsync(out, { binary: true });
  const bytes = new Uint8Array(glb);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { glb: btoa(bin), info };
};
window.ready = true;
`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('Browser:', e.message));
  await page.route('http://props.local/**', async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    let file = null;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script><script type="module">${BROWSER_CODE}</script>` });
    if (path.startsWith('/three/')) file = join(root, 'node_modules', path);
    if (path.startsWith('/files/')) file = join(propsDir, path.slice('/files/'.length));
    if (!file) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await page.goto('http://props.local/');
  await page.waitForFunction(() => window.ready === true);
  const res = await page.evaluate((c) => window.convert(c), cfg);
  const io = new NodeIO();
  const doc = await io.readBinary(Buffer.from(res.glb, 'base64'));
  await doc.transform(dedup(), weld(), prune());
  const bytes = await io.writeBinary(doc);
  writeFileSync(output, bytes);
  for (const line of res.info) console.log(line);
  console.log(`${(bytes.length / 1024).toFixed(0)} KB → public/models/props.glb`);
} finally {
  await browser.close();
}
