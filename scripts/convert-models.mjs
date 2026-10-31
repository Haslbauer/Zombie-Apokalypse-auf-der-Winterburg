/**
 * Wandelt Modelle aus assets/models/<name>/ (Mixamo-FBX + model.json) in
 * kompakte GLB-Dateien für das Spiel um:
 *   1. Im Browser (Playwright/Chromium) lädt der FBXLoader aus Three.js die
 *      Figur und alle Animationen, der GLTFExporter schreibt eine GLB.
 *   2. glTF-Transform verkleinert sie (doppelte Daten, Netz vereinfachen,
 *      Keyframes ausdünnen).
 * Aufruf: npm run models [name …]
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { createRequire } from 'node:module';

// Playwright ist nur für dieses Skript nötig (lokal: npx playwright install chromium).
const { chromium } = createRequire(import.meta.url)('playwright');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelsDir = join(root, 'assets/models');
const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(modelsDir).filter((d) => statSync(join(modelsDir, d)).isDirectory() && existsSync(join(modelsDir, d, 'model.json')));

const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.gltf': 'model/gltf+json' };

/** Läuft im Browser: FBX laden, Clips anhängen, Root-Motion entfernen, Textur verkleinern, GLB exportieren. */
const BROWSER_CODE = `
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

window.convert = async (cfg) => {
  const cache = new Map();
  const loadFile = async (file) => {
    if (file.endsWith('.fbx')) return new FBXLoader().loadAsync('/files/' + file);
    const gltf = await new GLTFLoader().loadAsync('/files/' + file);
    gltf.scene.animations = gltf.animations;
    return gltf.scene;
  };
  const load = async (file) => {
    if (!cache.has(file)) cache.set(file, await loadFile(file));
    return cache.get(file);
  };
  const clips = [];
  const entries = Object.entries(cfg.clips);
  if (cfg.idleFrom) entries.push(['idle', { file: cfg.idleFrom, firstFrame: true }]);
  const base = await load(cfg.base);
  for (const [name, c] of entries) {
    const file = c.file ?? cfg.base;
    const obj = await load(file);
    if (!obj.animations.length) throw new Error('Keine Animation in ' + file);
    // Dateien mit mehreren Animationen: Clip über den Namen wählen ("Armature|Run" passt zu "Run")
    const src = c.clip ? obj.animations.find((a) => a.name === c.clip || a.name.endsWith('|' + c.clip)) : obj.animations[0];
    if (!src) throw new Error('Clip ' + c.clip + ' fehlt in ' + file + ': ' + obj.animations.map((a) => a.name).join(', '));
    let clip = src.clone();
    // Stand-Pose: nur das erste Bild der Animation
    if (c.firstFrame) clip = THREE.AnimationUtils.subclip(clip, 'idle', 0, 1, 30);
    clip.name = name;
    if (c.inPlace ?? cfg.inPlace) {
      // Hüfte: waagerechte Bewegung entfernen, Höhe behalten
      for (const t of clip.tracks) {
        if (!/Hips\\.position$/.test(t.name)) continue;
        const v = t.values;
        const x0 = v[0], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
      }
    }
    // Skalierungs-Spuren braucht niemand
    clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
    clips.push(clip);
  }
  let triangles = 0;
  base.traverse((o) => {
    if (!o.isMesh) return;
    triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m.map || !m.map.image) continue;
      const img = m.map.image;
      const size = Math.min(cfg.textureSize, img.width || cfg.textureSize);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(img, 0, 0, size, size);
      const tex = new THREE.CanvasTexture(canvas);
      tex.flipY = m.map.flipY;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.userData.mimeType = 'image/jpeg';
      m.map = tex;
    }
  });
  base.animations = clips;
  const glb = await new GLTFExporter().parseAsync(base, { binary: true, animations: clips, onlyVisible: false });
  const bytes = new Uint8Array(glb);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { glb: btoa(bin), triangles, clips: clips.map((c) => c.name + ' ' + c.duration.toFixed(2) + 's') };
};
window.ready = true;
`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const name of names) {
    const dir = join(modelsDir, name);
    const cfg = JSON.parse(readFileSync(join(dir, 'model.json'), 'utf8'));
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('Browser:', e.message));
    // Dateipfade relativ zu assets/models, damit auch gemeinsame Dateien (../shared/…) gehen
    const rel = (f) => relative(modelsDir, join(dir, f)).split('\\').join('/');
    cfg.base = rel(cfg.base);
    if (cfg.idleFrom) cfg.idleFrom = rel(cfg.idleFrom);
    for (const c of Object.values(cfg.clips)) if (c.file) c.file = rel(c.file);
    await page.route('http://models.local/**', async (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname);
      let file = null;
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script><script type="module">${BROWSER_CODE}</script>` });
      if (path.startsWith('/three/')) file = join(root, 'node_modules', path);
      if (path.startsWith('/files/')) file = join(modelsDir, path.slice('/files/'.length));
      if (!file) return route.fulfill({ status: 404, body: '' });
      route.fulfill({ contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
    });
    await page.goto('http://models.local/');
    await page.waitForFunction(() => window.ready === true);
    const res = await page.evaluate((c) => window.convert(c), cfg);
    await page.close();

    // Nachbearbeitung mit glTF-Transform
    const io = new NodeIO();
    const doc = await io.readBinary(Buffer.from(res.glb, 'base64'));
    await MeshoptSimplifier.ready;
    // simplifyRatio 1: Netz unverändert lassen (Low-Poly-Modelle)
    const ratio = cfg.simplifyRatio ?? 0.5;
    await doc.transform(
      dedup(),
      weld(),
      ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 })] : []),
      resample(),
      prune(),
    );
    let tris = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    }
    const out = join(root, cfg.output);
    const bytes = await io.writeBinary(doc);
    writeFileSync(out, bytes);
    console.log(`${name}: ${res.triangles} → ${tris} Dreiecke, Clips: ${res.clips.join(', ')}, ${(bytes.length / 1e6).toFixed(2)} MB → ${cfg.output}`);
  }
} finally {
  await browser.close();
}
