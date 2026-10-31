import * as THREE from 'three';
import { arenaBounds } from '../sim/grid';
import type { ArenaDef, Obstacle, PropDef } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { Mats } from './mapdecor';

/**
 * Nachtstimmung und Kleinkram: brennende Fässer an den Toren, Barrikaden,
 * Knochen, Blut, Pilze, Spinnweben, offene Grube, Vogelscheuche, Handwagen,
 * Krähen (flattern auf, wenn ein Held nahe kommt), Bodennebel; dazu die
 * Hindernisse Autowrack und Brunnen. Feste Teile kommen in static (wird
 * zusammengefasst), bewegte in live.
 */
export interface NightAnimation {
  update(time: number, heroes: Vec2[]): void;
}

function rand(seed: number): () => number {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 233280 || 1;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

let softTexture: THREE.CanvasTexture | null = null;
/** Weicher, runder Fleck (Lichtschein, Flammen, Nebel). */
function soft(): THREE.CanvasTexture {
  if (softTexture) return softTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  softTexture = new THREE.CanvasTexture(c);
  return softTexture;
}

let fogTexture: THREE.CanvasTexture | null = null;
/** Wolkige Nebelschwade aus vielen weichen Flecken. */
function fogTex(): THREE.CanvasTexture {
  if (fogTexture) return fogTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rnd = rand(7);
  for (let i = 0; i < 40; i++) {
    const x = 20 + rnd() * 88;
    const y = 20 + rnd() * 88;
    const r = 10 + rnd() * 24;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(200,210,230,0.16)');
    grad.addColorStop(1, 'rgba(200,210,230,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  fogTexture = new THREE.CanvasTexture(c);
  return fogTexture;
}

/** Leuchtende, flache Scheibe am Boden (Lichtschein). */
export function groundGlow(color: number, size: number, opacity: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ map: soft(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
  disc.position.y = 0.04;
  disc.renderOrder = 2;
  return disc;
}

/** Hindernisse mit eigenem Aussehen: verrostetes Autowrack und Brunnen. */
export function nightObstacle(o: Obstacle, mats: Mats): THREE.Object3D | null {
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.y);
  if (o.look === 'car' && o.kind === 'rect') {
    const alongX = o.w >= o.h;
    const inner = new THREE.Group();
    if (!alongX) inner.rotation.y = Math.PI / 2;
    const len = Math.max(o.w, o.h);
    const wid = Math.min(o.w, o.h);
    const rust = mats.lambert(0x7a4a32);
    const paint = mats.lambert(0x4f6a6e);
    inner.add(part(new THREE.BoxGeometry(len, 0.7, wid), paint, 0, 0.65, 0));
    inner.add(part(new THREE.BoxGeometry(len * 0.55, 0.55, wid * 0.92), rust, -len * 0.08, 1.27, 0));
    // Scheiben dunkel, eine zerbrochen
    inner.add(part(new THREE.BoxGeometry(0.06, 0.42, wid * 0.8), mats.lambert(0x1a2228), len * 0.2 + 0.02, 1.28, 0, false));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const wheel = part(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 10).rotateX(Math.PI / 2), mats.lambert(0x1c1c1c), sx * len * 0.32, 0.33, sz * (wid / 2 - 0.05));
        inner.add(wheel);
      }
    }
    // offene Tür
    const door = part(new THREE.BoxGeometry(len * 0.3, 0.6, 0.06), paint, len * 0.05 + 0.3, 0.75, wid / 2 + 0.35);
    door.rotation.y = -0.9;
    inner.add(door);
    // Roststellen
    inner.add(part(new THREE.BoxGeometry(len * 0.3, 0.02, wid * 0.5), rust, len * 0.3, 1.01, 0.1, false));
    inner.rotation.z = 0.04;
    g.add(inner);
    return g;
  }
  if (o.look === 'well' && o.kind === 'circle') {
    const stone = mats.lambert(0x8e897f);
    g.add(part(new THREE.CylinderGeometry(o.r, o.r * 1.05, 0.85, 14, 1, true), stone, 0, 0.42, 0));
    g.add(part(new THREE.CylinderGeometry(o.r * 0.85, o.r * 0.85, 0.05, 14), mats.lambert(0x05080a), 0, 0.7, 0, false));
    g.add(part(new THREE.TorusGeometry(o.r * 0.95, 0.09, 6, 14).rotateX(Math.PI / 2), mats.lambert(0x8a857c), 0, 0.86, 0));
    const wood = mats.lambert(0x5a4030);
    for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.12, 1.5, 0.12), wood, s * o.r * 0.85, 1.2, 0));
    g.add(part(new THREE.CylinderGeometry(0.08, 0.08, o.r * 1.8, 6).rotateZ(Math.PI / 2), wood, 0, 1.75, 0));
    const roof = part(new THREE.ConeGeometry(o.r * 1.35, 0.7, 4), mats.lambert(0x5e2418), 0, 2.25, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    g.add(part(new THREE.BoxGeometry(0.28, 0.25, 0.28), wood, 0.1, 1.35, 0));
    return g;
  }
  return null;
}

/**
 * Deko ohne Kollision. static: wird zusammengefasst, live: bewegte Teile
 * (Flammen, Krähen, Nebel).
 */
export function nightDecor(stat: THREE.Group, live: THREE.Group, arena: ArenaDef, mats: Mats): NightAnimation {
  const flames: { mesh: THREE.Sprite; glow: THREE.Mesh; seed: number }[] = [];
  const crows: { bird: THREE.Group; home: THREE.Vector3; seed: number; fly: number }[] = [];
  const wood = mats.lambert(0x5e4429);
  const darkWood = mats.lambert(0x3b2a1c);
  const bone = mats.lambert(0xd8d0bc);
  const blood = new THREE.MeshLambertMaterial({ color: 0x4a0608, transparent: true, opacity: 0.7, depthWrite: false });
  const flameMat = new THREE.SpriteMaterial({ map: soft(), color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const crowMat = mats.lambert(0x111114);

  for (const p of arena.props ?? []) {
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.y);
    g.rotation.y = p.rot ?? 0;
    const rnd = rand(p.x * 17 + p.y * 3);
    switch (p.look) {
      case 'firebarrel': {
        g.add(part(new THREE.CylinderGeometry(0.36, 0.33, 0.95, 12), mats.lambert(0x4a3a30), 0, 0.47, 0));
        g.add(part(new THREE.TorusGeometry(0.35, 0.03, 4, 12).rotateX(Math.PI / 2), mats.lambert(0x2a2420), 0, 0.3, 0, false));
        g.add(part(new THREE.TorusGeometry(0.35, 0.03, 4, 12).rotateX(Math.PI / 2), mats.lambert(0x2a2420), 0, 0.75, 0, false));
        g.add(part(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 10), mats.lambert(0xff7a20, { emissive: 0xff5a10 }), 0, 0.93, 0, false));
        stat.add(g);
        // Flamme und flackernder Lichtschein (bewegt)
        const flame = new THREE.Sprite(flameMat);
        flame.position.set(p.x, 1.45, p.y);
        const glow = groundGlow(0xff8a30, 9, 0.55);
        glow.position.set(p.x, 0.05, p.y);
        live.add(flame, glow);
        flames.push({ mesh: flame, glow, seed: rnd() * 10 });
        continue;
      }
      case 'barricade': {
        const w = p.w ?? 2;
        // Sandsäcke unten, Kisten und schräge Bretter darüber
        for (let t = -w / 2 + 0.3; t < w / 2; t += 0.55) {
          const bag = part(new THREE.SphereGeometry(0.3, 7, 5), mats.lambert(0x8a7d5c), t, 0.2, 0);
          bag.scale.set(1, 0.6, 0.75);
          g.add(bag);
        }
        g.add(part(new THREE.BoxGeometry(0.7, 0.6, 0.7), mats.lambert(0x7a5a3a), -w / 4, 0.62, 0.05));
        g.add(part(new THREE.BoxGeometry(0.55, 0.5, 0.55), mats.lambert(0x6a4a2a), w / 4, 0.55, -0.05));
        for (let i = 0; i < 3; i++) {
          const plank = part(new THREE.BoxGeometry(w * 0.9, 0.12, 0.05), wood, (rnd() - 0.5) * 0.4, 0.6 + i * 0.35, 0.4);
          plank.rotation.z = (rnd() - 0.5) * 0.5;
          g.add(plank);
        }
        break;
      }
      case 'bones': {
        for (let i = 0; i < 5; i++) {
          const b = part(new THREE.CylinderGeometry(0.035, 0.035, 0.4 + rnd() * 0.25, 5), bone, (rnd() - 0.5) * 1.4, 0.04, (rnd() - 0.5) * 1.4, false);
          b.rotation.set(Math.PI / 2, 0, rnd() * Math.PI);
          g.add(b);
        }
        // Schädel
        const skull = part(new THREE.SphereGeometry(0.14, 8, 6), bone, 0.2, 0.12, -0.1, false);
        skull.scale.set(1, 0.9, 1.15);
        g.add(skull);
        for (const s of [-1, 1]) g.add(part(new THREE.SphereGeometry(0.035, 5, 4), mats.lambert(0x111111), 0.2 + s * 0.05, 0.15, 0.04, false));
        break;
      }
      case 'blood': {
        for (let i = 0; i < 4; i++) {
          const r = 0.25 + rnd() * 0.55;
          const spot = new THREE.Mesh(new THREE.CircleGeometry(r, 9).rotateX(-Math.PI / 2), blood);
          spot.position.set((rnd() - 0.5) * 1.6, 0.018 + i * 0.001, (rnd() - 0.5) * 1.6);
          spot.scale.set(1, 1, 0.6 + rnd() * 0.6);
          spot.receiveShadow = true;
          g.add(spot);
        }
        break;
      }
      case 'mushrooms': {
        for (let i = 0; i < 6; i++) {
          const x = (rnd() - 0.5) * 1.6;
          const z = (rnd() - 0.5) * 1.6;
          const s = 0.6 + rnd() * 0.8;
          g.add(part(new THREE.CylinderGeometry(0.03 * s, 0.04 * s, 0.18 * s, 5), mats.lambert(0xe8e0cc), x, 0.09 * s, z, false));
          const glowing = i % 3 === 0;
          const cap = part(
            new THREE.SphereGeometry(0.11 * s, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2),
            glowing ? mats.lambert(0x6fd8c8, { emissive: 0x2a9a8a }) : mats.lambert(0x9a3a2a),
            x,
            0.17 * s,
            z,
            false,
          );
          g.add(cap);
        }
        // Wurzeln
        for (let i = 0; i < 2; i++) {
          const root = part(new THREE.TorusGeometry(0.5 + rnd() * 0.3, 0.05, 4, 8, Math.PI), darkWood, (rnd() - 0.5) * 1.5, 0, (rnd() - 0.5) * 1.5, false);
          root.rotation.y = rnd() * Math.PI;
          g.add(root);
        }
        break;
      }
      case 'web': {
        const webMat = new THREE.LineBasicMaterial({ color: 0xd8dde8, transparent: true, opacity: 0.55 });
        const pts: THREE.Vector3[] = [];
        const R = 0.7;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          pts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0));
        }
        for (let ring = 1; ring <= 3; ring++) {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const b = ((i + 1) / 6) * Math.PI * 2;
            const r = (R * ring) / 3.4;
            pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0), new THREE.Vector3(Math.cos(b) * r, Math.sin(b) * r, 0));
          }
        }
        const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), webMat);
        lines.position.y = 0.75;
        g.add(lines);
        live.add(g); // Linien nicht zusammenfassen
        continue;
      }
      case 'opengrave': {
        g.add(part(new THREE.BoxGeometry(1, 0.03, 2.1), mats.lambert(0x050403), 0, 0.016, 0, false));
        const mound = part(new THREE.SphereGeometry(0.8, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mats.lambert(0x4a3322), 1.1, 0, 0.2);
        mound.scale.set(0.7, 0.5, 1.3);
        g.add(mound);
        const shovel = new THREE.Group();
        shovel.add(part(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5), wood, 0, 0.55, 0));
        shovel.add(part(new THREE.BoxGeometry(0.22, 0.28, 0.03), mats.lambert(0x6a6a66), 0, 0, 0));
        shovel.position.set(1.0, 0.3, -0.5);
        shovel.rotation.z = 0.35;
        g.add(shovel);
        const stone = part(new THREE.BoxGeometry(0.7, 0.9, 0.18), mats.lambert(0x7d7a74), 0, 0.45, -1.2);
        stone.rotation.z = 0.15;
        g.add(stone);
        break;
      }
      case 'scarecrow': {
        g.add(part(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6), wood, 0, 1.05, 0));
        g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6).rotateZ(Math.PI / 2), wood, 0, 1.55, 0));
        g.add(part(new THREE.BoxGeometry(0.5, 0.7, 0.3), mats.lambert(0x5a5a3a), 0, 1.3, 0));
        for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.55, 0.16, 0.2), mats.lambert(0x5a5a3a), s * 0.45, 1.55, 0));
        g.add(part(new THREE.SphereGeometry(0.2, 8, 6), mats.lambert(0xc8a868), 0, 1.92, 0));
        g.add(part(new THREE.ConeGeometry(0.32, 0.38, 8), mats.lambert(0x3a2a1a), 0, 2.2, 0));
        g.add(part(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 10), mats.lambert(0x3a2a1a), 0, 2.03, 0));
        for (const s of [-1, 1]) g.add(part(new THREE.SphereGeometry(0.03, 4, 3), mats.lambert(0xff4a20, { emissive: 0xff3010 }), s * 0.07, 1.96, 0.17, false));
        break;
      }
      case 'cart': {
        // Umgekippter Handwagen
        const body = part(new THREE.BoxGeometry(1.6, 0.5, 0.9), wood, 0, 0.45, 0);
        body.rotation.x = 1.3;
        g.add(body);
        const wheel = part(new THREE.TorusGeometry(0.35, 0.05, 5, 12), darkWood, 0.5, 0.36, 0.5);
        g.add(wheel);
        const wheel2 = part(new THREE.TorusGeometry(0.35, 0.05, 5, 12).rotateX(Math.PI / 2), darkWood, -0.7, 0.05, -0.4);
        g.add(wheel2);
        for (let i = 0; i < 3; i++) g.add(part(new THREE.BoxGeometry(0.4, 0.3, 0.4), mats.lambert(0xa0743f), -0.4 + i * 0.5, 0.15, -0.9 - rnd() * 0.4));
        break;
      }
      case 'crows': {
        // Krähen sitzen am Ort; nähert sich ein Held, flattern sie auf
        const n = 3 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const bird = new THREE.Group();
          const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), crowMat);
          body.scale.set(1.5, 0.9, 0.9);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 4), crowMat);
          head.position.set(0.15, 0.08, 0);
          const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4).rotateZ(-Math.PI / 2), mats.lambert(0x3a3020));
          beak.position.set(0.24, 0.07, 0);
          const wingGeo = new THREE.PlaneGeometry(0.3, 0.14);
          const wingMat = new THREE.MeshLambertMaterial({ color: 0x111114, side: THREE.DoubleSide });
          const w1 = new THREE.Mesh(wingGeo, wingMat);
          w1.name = 'wing';
          w1.rotation.x = -Math.PI / 2;
          w1.position.set(0, 0.04, 0.12);
          const w2 = w1.clone();
          w2.position.z = -0.12;
          bird.add(body, head, beak, w1, w2);
          const home = new THREE.Vector3(p.x + (rnd() - 0.5) * 2.2, 0.12 + (p.h ?? 0), p.y + (rnd() - 0.5) * 2.2);
          bird.position.copy(home);
          bird.rotation.y = rnd() * Math.PI * 2;
          live.add(bird);
          crows.push({ bird, home, seed: rnd() * 10, fly: 0 });
        }
        continue;
      }
    }
    stat.add(g);
  }

  // Bodennebel: langsam ziehende Schwaden über dem Gelände
  const b = arenaBounds(arena);
  const fogMat = new THREE.MeshBasicMaterial({ map: fogTex(), transparent: true, opacity: 0.55, depthWrite: false, color: 0x8a96b8 });
  const wisps: { mesh: THREE.Mesh; base: THREE.Vector3; speed: number; seed: number }[] = [];
  const frnd = rand(42);
  for (let i = 0; i < 18; i++) {
    const size = 10 + frnd() * 12;
    const wisp = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), fogMat);
    const base = new THREE.Vector3(b.x0 + frnd() * (b.x1 - b.x0), 0.35 + frnd() * 0.5, b.y0 + frnd() * (b.y1 - b.y0));
    wisp.position.copy(base);
    wisp.renderOrder = 3;
    live.add(wisp);
    wisps.push({ mesh: wisp, base, speed: 0.25 + frnd() * 0.35, seed: frnd() * 100 });
  }

  const tmp = new THREE.Vector3();
  let last = 0;
  return {
    update(time, heroes) {
      const dt = Math.min(0.1, Math.max(0, time - last));
      last = time;
      for (const f of flames) {
        const k = 0.75 + 0.25 * Math.sin(time * 13 + f.seed) * Math.sin(time * 7.3 + f.seed * 2);
        f.mesh.scale.set(0.9 + 0.15 * Math.sin(time * 9 + f.seed), 1.2 * (k + 0.15), 1);
        (f.glow.material as THREE.MeshBasicMaterial).opacity = 0.42 + 0.18 * k;
      }
      for (const w of wisps) {
        const x = ((w.base.x - b.x0 + time * w.speed) % (b.x1 - b.x0)) + b.x0;
        w.mesh.position.set(x, w.base.y, w.base.z + Math.sin(time * 0.1 + w.seed) * 2);
      }
      for (const c of crows) {
        const near = heroes.some((h) => Math.hypot(h.x - c.home.x, h.y - c.home.z) < 4);
        c.fly = Math.max(0, Math.min(1, c.fly + (near ? dt * 1.5 : -dt * 0.25)));
        const wings = c.bird.children.filter((x) => x.name === 'wing');
        if (c.fly > 0.02) {
          // Auffliegen: Kreise über dem Platz, Flügelschlag
          const a = time * 1.6 + c.seed;
          tmp.set(c.home.x + Math.cos(a) * 3 * c.fly, c.home.y + 4 * c.fly, c.home.z + Math.sin(a) * 3 * c.fly);
          c.bird.position.copy(tmp);
          c.bird.rotation.y = -a - Math.PI / 2;
          const flap = Math.sin(time * 22 + c.seed) * 0.9;
          wings.forEach((w, i) => (w.rotation.x = -Math.PI / 2 + (i ? -flap : flap)));
        } else {
          c.bird.position.copy(c.home);
          c.bird.position.y = c.home.y + Math.max(0, Math.sin(time * 3 + c.seed * 5)) * 0.02;
          wings.forEach((w) => (w.rotation.x = -Math.PI / 2));
        }
      }
    },
  };
}

export type { PropDef };
