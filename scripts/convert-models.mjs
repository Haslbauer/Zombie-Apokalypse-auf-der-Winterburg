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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  // Animation einer anderen Mixamo-Figur auf die Basisfigur übertragen:
  // Knochennamen angleichen (mixamorig1: …), nur die Hüfte darf sich
  // verschieben (sonst bekäme die Figur die Knochenlängen der anderen),
  // und deren Weg wird auf die Beinlänge der Basisfigur umgerechnet.
  const bare = (n) => n.replace(/^mixamorig\d*:?/, '');
  const bonesOf = (o) => { const m = new Map(); o.traverse((b) => { if (b.isBone) m.set(bare(b.name), b); }); return m; };
  const retarget = (clip, src, dst) => {
    const sb = bonesOf(src), db = bonesOf(dst);
    const sh = sb.get('Hips'), dh = db.get('Hips');
    const tr = clip.tracks.find((t) => /Hips\.position$/.test(t.name));
    const k = sh && dh && Math.abs(sh.position.y) > 1e-3 ? dh.position.y / sh.position.y : 1;
    clip.tracks = clip.tracks.filter((t) => {
      const dot = t.name.lastIndexOf('.');
      const bone = db.get(bare(t.name.slice(0, dot)));
      if (!bone) return false;
      const prop = t.name.slice(dot + 1);
      t.name = bone.name + '.' + prop;
      if (prop !== 'position') return true;
      if (bare(bone.name) !== 'Hips') return false;
      for (let i = 0; i < t.values.length; i++) t.values[i] *= k;
      return true;
    });
  };

  const unifySkeletons = (root) => {
    const skinned = [];
    root.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
    if (skinned.length < 2) return 0;
    root.updateMatrixWorld(true);
    // Gemeinsames Skelett: je Name der erste Knochen in der Baumreihenfolge
    // (denselben findet auch die Animation über den Namen)
    const canon = new Map();
    root.traverse((o) => { if (o.isBone && !canon.has(o.name)) canon.set(o.name, o); });
    const keep = new Set(canon.values());
    let maxDiff = 0;
    for (const m of skinned) {
      const bones = m.skeleton.bones.map((b) => {
        const c = canon.get(b.name);
        for (let i = 0; i < 16; i++) maxDiff = Math.max(maxDiff, Math.abs(c.matrixWorld.elements[i] - b.matrixWorld.elements[i]));
        return c;
      });
      m.bind(new THREE.Skeleton(bones, m.skeleton.boneInverses), m.bindMatrix);
    }
    // Gemeinsame Knochen, die unter einem Duplikat hängen, an den gleichnamigen Elternknochen hängen
    for (const b of keep) {
      const p = b.parent;
      if (p && p.isBone && !keep.has(p)) canon.get(p.name).attach(b);
    }
    // Alle übrigen Knochen (Duplikate) entfernen
    const extra = [];
    root.traverse((o) => { if (o.isBone && !keep.has(o)) extra.push(o); });
    for (const b of extra) b.removeFromParent();
    if (maxDiff > 1e-3) console.warn('Skelette weichen ab: ' + maxDiff.toFixed(4));
    mergeParts(skinned);
    return skinned.length;
  };

  // Teile mit gleichem Elternknoten, gleicher Lage und gleicher Bind-Matrix zu
  // einem Mesh mit mehreren Materialien zusammenfassen (weniger Zeichenaufrufe).
  // Die Knochen-Indizes jedes Teils werden auf eine gemeinsame Liste umgerechnet.
  const mergeParts = (skinned) => {
    const same = (a, b) => a.elements.every((v, i) => Math.abs(v - b.elements[i]) < 1e-5);
    const groups = [];
    for (const m of skinned) {
      const g = groups.find((x) => x[0].parent === m.parent && same(x[0].matrix, m.matrix) && same(x[0].bindMatrix, m.bindMatrix));
      if (g) g.push(m);
      else groups.push([m]);
    }
    for (const parts of groups) {
      if (parts.length < 2) continue;
      const bones = [];
      const inverses = [];
      const geos = [];
      const mats = [];
      for (const m of parts) {
        const map = m.skeleton.bones.map((b, i) => {
          let k = bones.indexOf(b);
          if (k < 0) {
            k = bones.length;
            bones.push(b);
            inverses.push(m.skeleton.boneInverses[i].clone());
          }
          return k;
        });
        const geo = m.geometry.clone();
        for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(name)) geo.deleteAttribute(name);
        const si = geo.attributes.skinIndex;
        const idx = new Uint16Array(si.count * 4);
        for (let i = 0; i < si.count; i++) for (let c = 0; c < 4; c++) idx[i * 4 + c] = map[si.getComponent(i, c)] ?? 0;
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
        const mm = Array.isArray(m.material) ? m.material : [m.material];
        geo.clearGroups();
        geo.addGroup(0, geo.index ? geo.index.count : geo.attributes.position.count, mats.length);
        mats.push(mm[0]);
        geos.push(geo);
      }
      if (!geos.every((g) => Object.keys(g.attributes).sort().join() === Object.keys(geos[0].attributes).sort().join())) continue;
      if (!geos.every((g) => !!g.index === !!geos[0].index)) continue;
      const merged = mergeGeometries(geos, true);
      if (!merged) continue;
      const mesh = new THREE.SkinnedMesh(merged, mats);
      mesh.name = parts[0].name;
      mesh.position.copy(parts[0].position);
      mesh.quaternion.copy(parts[0].quaternion);
      mesh.scale.copy(parts[0].scale);
      parts[0].parent.add(mesh);
      mesh.bind(new THREE.Skeleton(bones, inverses), parts[0].bindMatrix);
      for (const m of parts) m.removeFromParent();
    }
  };
  /**
   * Füße auf den Boden: Jeden Clip an 24 Zeitpunkten abspielen und den
   * tiefsten Knochen messen. Stehen/Laufen/Angriff: Das untere Fünftel der
   * Messwerte (Standfuß) soll so tief liegen wie in der Ruhepose; Liegen,
   * Kriechen, Sterben: der tiefste Wert. Die Hüft-Spur wird um die Differenz
   * verschoben. Gibt die Verschiebung je Clip in Prozent der Figurenhöhe zurück.
   */
  const groundClips = (root, list) => {
    const bones = [];
    root.traverse((o) => { if (o.isBone) bones.push(o); });
    const hips = bones.find((b) => /Hips$/.test(b.name));
    if (!hips || !list.length) return [];
    const saved = bones.map((b) => [b.position.clone(), b.quaternion.clone()]);
    const restore = () => bones.forEach((b, i) => { b.position.copy(saved[i][0]); b.quaternion.copy(saved[i][1]); });
    const v = new THREE.Vector3();
    const lowest = () => {
      root.updateMatrixWorld(true);
      let m = Infinity;
      for (const b of bones) m = Math.min(m, b.getWorldPosition(v).y);
      return m;
    };
    const restMin = lowest();
    const box = new THREE.Box3().setFromObject(root);
    const height = Math.max(1e-6, box.max.y - box.min.y);
    const parentScale = hips.parent ? hips.parent.getWorldScale(v).y : 1;
    const out = [];
    for (const clip of list) {
      const track = clip.tracks.find((t) => t.name === hips.name + '.position');
      if (!track) continue;
      const mixer = new THREE.AnimationMixer(root);
      const action = mixer.clipAction(clip);
      action.play();
      const samples = [];
      for (let i = 0; i < 24; i++) {
        mixer.setTime((clip.duration * i) / 24);
        samples.push(lowest());
      }
      action.stop();
      mixer.uncacheRoot(root);
      restore();
      samples.sort((a, b) => a - b);
      const lying = /crawl|death|down|laying|ability3$/.test(clip.name) && clip.name !== 'ability3' ? true : /crawl|death|down/.test(clip.name);
      const measured = lying ? samples[0] : samples[Math.floor(samples.length / 5)];
      const shift = (restMin - measured) / parentScale;
      if (Math.abs(shift * parentScale) / height < 0.003) continue;
      for (let i = 1; i < track.values.length; i += 3) track.values[i] += shift;
      out.push(clip.name + ' ' + ((100 * shift * parentScale) / height).toFixed(1) + '%');
    }
    restore();
    root.updateMatrixWorld(true);
    return out;
  };
  /**
   * Treffermoment je Angriffs-Clip (attack…, bite…, ability…): Zeitpunkt der
   * schnellsten Bewegung von Händen bzw. Kopf, als Anteil der Clip-Dauer.
   */
  const findImpacts = (root, list) => {
    const parts = [];
    root.traverse((o) => { if (o.isBone && /(RightHand|LeftHand|Head)$/.test(o.name)) parts.push(o); });
    if (!parts.length) return {};
    const all = [];
    root.traverse((o) => { if (o.isBone) all.push(o); });
    const saved = all.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
    const out = {};
    const v = new THREE.Vector3();
    for (const clip of list) {
      if (!/^(attack|bite|ability)/.test(clip.name)) continue;
      const mixer = new THREE.AnimationMixer(root);
      const action = mixer.clipAction(clip);
      action.play();
      const N = 40;
      let prev = null;
      let best = 0;
      let bestT = 0.5;
      for (let i = 0; i <= N; i++) {
        mixer.setTime((clip.duration * i) / N);
        root.updateMatrixWorld(true);
        const pos = parts.map((b) => b.getWorldPosition(v).clone());
        if (prev && i > 1) {
          const speed = Math.max(...pos.map((p, k) => p.distanceTo(prev[k])));
          if (speed > best) {
            best = speed;
            bestT = (i - 0.5) / N;
          }
        }
        prev = pos;
      }
      action.stop();
      mixer.uncacheRoot(root);
      out[clip.name] = Math.round(bestT * 100) / 100;
    }
    // Ruhepose wiederherstellen (sonst würde die letzte Pose exportiert)
    all.forEach((b, i) => { b.position.copy(saved[i][0]); b.quaternion.copy(saved[i][1]); b.scale.copy(saved[i][2]); });
    root.updateMatrixWorld(true);
    return out;
  };
  const clips = [];
  const entries = Object.entries(cfg.clips);
  if (cfg.idleFrom) entries.push(['idle', { file: cfg.idleFrom, firstFrame: true }]);
  const base = await load(cfg.base);
  // Figuren aus mehreren Teilen (Körper, Kleidung, Haare …) haben nach dem
  // Laden je Teil ein eigenes Skelett; die Animation träfe nur eines davon.
  // Alle Teile auf ein gemeinsames Skelett binden, doppelte Knochen entfernen.
  // Das muss vor dem Übertragen der Animationen geschehen, sonst wird die
  // Hüfthöhe an einem doppelten Knochen gemessen.
  const unified = unifySkeletons(base);
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
    if (obj !== base) retarget(clip, obj, base);
    clips.push(clip);
  }
  let triangles = 0;
  base.traverse((o) => {
    if (!o.isMesh) return;
    triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      // Nur Farb- und Normalen-Textur behalten, beide verkleinert; Glanz-,
      // Höhen- und sonstige Karten fallen weg (die Dateien blieben sonst riesig).
      for (const key of ['specularMap', 'bumpMap', 'aoMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'displacementMap', 'lightMap']) {
        if (m[key]) m[key] = null;
      }
      for (const key of ['map', 'normalMap']) {
        const t = m[key];
        if (!t || !t.image) continue;
        const img = t.image;
        const max = key === 'map' ? cfg.textureSize : cfg.normalSize ?? 0;
        if (!max) { m[key] = null; continue; }
        let size = Math.min(max, img.width || max);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        // Durchsichtige Teile (Haare, Wimpern) brauchen den Alphakanal und
        // damit PNG; das nur, wenn die Textur wirklich Transparenz enthält.
        let alpha = false;
        if (key === 'map') {
          const px = ctx.getImageData(0, 0, size, size).data;
          for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { alpha = true; break; }
        }
        if (alpha && size > 512) {
          // PNG ist groß: halbe Auflösung reicht für Haare
          const small = document.createElement('canvas');
          small.width = small.height = 512;
          small.getContext('2d').drawImage(canvas, 0, 0, 512, 512);
          canvas.width = canvas.height = size = 512;
          ctx.drawImage(small, 0, 0);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.flipY = t.flipY;
        tex.wrapS = t.wrapS;
        tex.wrapT = t.wrapT;
        if (key === 'map') tex.colorSpace = THREE.SRGBColorSpace;
        tex.userData.mimeType = alpha ? 'image/png' : 'image/jpeg';
        if (key === 'map' && !alpha) m.transparent = false;
        if (alpha) { m.transparent = false; m.alphaTest = 0.5; }
        m[key] = tex;
      }
      m.needsUpdate = true;
    }
  });
  const grounded = groundClips(base, clips);
  const impacts = findImpacts(base, clips);
  base.animations = clips;
  const skeletons = new Set();
  let meshes = 0;
  base.traverse((o) => { if (o.isSkinnedMesh) { skeletons.add(o.skeleton.bones[0]); meshes++; } });
  const glb = await new GLTFExporter().parseAsync(base, { binary: true, animations: clips, onlyVisible: false });
  const bytes = new Uint8Array(glb);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { glb: btoa(bin), triangles, skeletons: skeletons.size, meshes, unified, grounded, impacts, clips: clips.map((c) => c.name + ' ' + c.duration.toFixed(2) + 's') };
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
    page.on('console', (m) => { if (m.type() === 'warning' && !m.text().includes('GLTFExporter')) console.warn(name + ':', m.text()); });
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
    // Treffermomente neben die GLB schreiben (der Client stimmt Angriffe darauf ab)
    writeFileSync(out.replace(/\.glb$/, '.meta.json'), JSON.stringify({ impacts: res.impacts ?? {} }, null, 1) + '\n');
    const bytes = await io.writeBinary(doc);
    writeFileSync(out, bytes);
    if (res.grounded?.length) console.log(`${name}: Füße auf den Boden: ${res.grounded.join(', ')}`);
    if (res.impacts && Object.keys(res.impacts).length) console.log(`${name}: Treffermomente ${Object.entries(res.impacts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`${name}: Skelette ${res.skeletons}, Meshes ${res.meshes}, ${res.triangles} → ${tris} Dreiecke, Clips: ${res.clips.join(', ')}, ${(bytes.length / 1e6).toFixed(2)} MB → ${cfg.output}`);
  }
} finally {
  await browser.close();
}
