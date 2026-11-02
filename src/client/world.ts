import * as THREE from 'three';
import type { Ball, Defense, GameState, Zone } from '../sim/types';
import type { Snapshot } from './renderer';

let glowTex: THREE.CanvasTexture | null = null;
function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function glow(color: number, size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

/** Schweif hinter dem Geschoss (entlang −x), additiv und nach hinten ausblendend. */
function trail(color: number, length: number, width: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(length, width).rotateX(-Math.PI / 2).translate(-length / 2, 0, 0);
  // Ausblenden über Vertex-Farben: vorn hell, hinten dunkel (additiv = durchsichtig)
  const colors: number[] = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + pos.getX(i) / length; // 1 vorn, 0 hinten
    colors.push(k, k, k);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
}

/**
 * Aussehen der Geschosse (Modell entlang +x, wird in Flugrichtung gedreht):
 * Pfeil (Hagedorn), Enterhaken an der Leine (Rauchbarth), Sternenfunken
 * (Somnia), leuchtender Ball (Spike). Unbekannte: leuchtende Kugel.
 */
function buildProjectile(look: string): THREE.Group {
  const g = new THREE.Group();
  switch (look) {
    case 'stone':
    case 'bigstone': {
      const big = look === 'bigstone' ? 1.4 : 1;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * big, 0.018 * big, 0.75 * big, 5).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a6a45 }));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05 * big, 0.14 * big, 5).rotateZ(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8d8d0 }));
      tip.position.x = 0.42 * big;
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.16 * big, 0.08 * big), new THREE.MeshBasicMaterial({ color: 0xc8f0a0, side: THREE.DoubleSide }));
      fl.position.x = -0.33 * big;
      const fl2 = fl.clone();
      fl2.rotation.x = Math.PI / 2;
      g.add(shaft, tip, fl, fl2, trail(0x9fe36a, 1.6 * big, 0.12 * big));
      if (big > 1) g.add(glow(0xb8ff7a, 0.9));
      break;
    }
    case 'hook': {
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 5, 10, Math.PI * 1.3), new THREE.MeshBasicMaterial({ color: 0x9a9a9a }));
      hook.rotation.x = Math.PI / 2;
      const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x777777 }));
      shank.position.x = -0.15;
      g.add(hook, shank);
      break;
    }
    case 'star': {
      g.add(glow(0x9fe3ff, 0.9), glow(0xffffff, 0.35), trail(0x7fb8ff, 1.4, 0.3));
      break;
    }
    case 'harpoon': {
      // Harpunenspeer
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6b4a2b }));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6).rotateZ(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8d8d0 }));
      tip.position.x = 0.5;
      g.add(shaft, tip, trail(0x9fd8ff, 1.2, 0.1));
      break;
    }
    case 'pebble': {
      // Kiesel aus der Steinschleuder
      g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), new THREE.MeshLambertMaterial({ color: 0x9a968a })), trail(0xd8d4c8, 0.7, 0.08));
      break;
    }
    case 'soot': {
      // Rußball: schwarze Kugel mit grauer Rauchspur
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshLambertMaterial({ color: 0x1a1a1a })), trail(0x6a6a6a, 0.9, 0.14));
      break;
    }
    case 'chime': {
      // Schallwelle der Glocke: violetter Ring mit Schimmer
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 18), new THREE.MeshBasicMaterial({ color: 0xc7b8ff, transparent: true, opacity: 0.85 }));
      ring.rotation.y = Math.PI / 2;
      const ring2 = ring.clone();
      ring2.scale.setScalar(0.6);
      ring2.position.x = -0.18;
      g.add(ring, ring2, glow(0xb39dff, 0.5), trail(0x9d8cff, 0.9, 0.1));
      break;
    }
    case 'nugget': {
      // Goldnugget: unregelmäßiger, glänzender Klumpen mit goldener Spur
      const n = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.9, roughness: 0.3, emissive: 0x7a4e00, emissiveIntensity: 0.6 }));
      n.scale.set(1.2, 0.85, 1);
      g.add(n, glow(0xffd166, 0.45), trail(0xffd166, 1.0, 0.12));
      break;
    }
    case 'swarm': {
      // Kleiner Bienenschwarm: gelb-schwarze Pünktchen um einen warmen Schimmer
      const bee = new THREE.MeshBasicMaterial({ color: 0xffc83d });
      const dark = new THREE.MeshBasicMaterial({ color: 0x2a2010 });
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39;
        const r = 0.12 + (i % 3) * 0.08;
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), i % 3 === 0 ? dark : bee);
        m.position.set(Math.cos(a) * r * 0.8 - (i % 4) * 0.06, Math.sin(a * 1.3) * 0.12, Math.sin(a) * r);
        g.add(m);
      }
      g.add(glow(0xffd166, 0.5));
      g.name = 'swarm';
      break;
    }
    case 'volley': {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      g.add(ball, glow(0xff9a4a, 0.8), trail(0xff8a3d, 1.3, 0.25));
      break;
    }
    default:
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe066 })), glow(0xffe066, 0.6));
  }
  return g;
}

/** Modell einer Verteidigung (Spiel-Koordinaten: x/y → Three x/z). */
function buildDefense(kind: Defense['kind'], rot: number): { g: THREE.Group; flame?: THREE.Object3D } {
  const g = new THREE.Group();
  const lam = (c: number, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  if (kind === 'stacheldraht') {
    // Drahtrolle im Kreis (Radius ~1,3 m) mit Pflöcken
    const wire = lam(0x4a4a4c);
    const loop = new THREE.TorusGeometry(0.28, 0.014, 3, 12);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const l = part(loop, wire, Math.cos(a) * 1.05, 0.3, Math.sin(a) * 1.05);
      l.rotation.y = -a;
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      part(new THREE.CylinderGeometry(0.04, 0.05, 0.75, 5), lam(0x6b4a2b), Math.cos(a) * 1.05, 0.37, Math.sin(a) * 1.05);
    }
  } else if (kind === 'barrikade') {
    // Bretterwand 2,4 m breit, quer (rot 0: entlang x) oder längs
    const w = 2.4;
    const wood = lam(0x8a6a45);
    const dark = lam(0x5a4028);
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) part(new THREE.BoxGeometry(0.14, 1.6, 0.14), dark, x, 0.8, 0);
    for (let i = 0; i < 5; i++) {
      const p = part(new THREE.BoxGeometry(w, 0.2, 0.06), i % 2 ? wood : lam(0x7a6448), 0, 0.3 + i * 0.28, 0.08);
      p.rotation.z = (i % 2 ? 1 : -1) * 0.06;
    }
    part(new THREE.BoxGeometry(w * 1.05, 0.14, 0.05), wood, 0, 0.85, 0.12).rotation.z = 0.45;
    g.rotation.y = rot ? Math.PI / 2 : 0;
  } else {
    // Feuerfass mit Flamme und Lichtschein
    part(new THREE.CylinderGeometry(0.36, 0.33, 0.95, 12), lam(0x4a3a30), 0, 0.47, 0);
    part(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 10), lam(0xff7a20, 0xff5a10), 0, 0.93, 0);
    const flame = new THREE.Group();
    flame.add(glow(0xff8a30, 1.1), glow(0xffd166, 0.5));
    flame.position.y = 1.3;
    g.add(flame);
    return { g, flame };
  }
  return { g };
}

/** Zonen, Libero-Ball und Geschosse in der Szene. */
export class WorldView {
  private readonly zones = new Map<number, THREE.Object3D>();
  private readonly projectiles = new Map<number, THREE.Group>();
  private readonly balls = new Map<number, THREE.Group>();
  /** Leinen der Enterhaken (Geschoss-Id → Linie zum Werfer). */
  private readonly ropes = new Map<number, THREE.Line>();

  constructor(private readonly scene: THREE.Scene) {}

  reset(): void {
    for (const o of [...this.zones.values(), ...this.projectiles.values(), ...this.balls.values()]) this.scene.remove(o);
    this.zones.clear();
    this.projectiles.clear();
    this.balls.clear();
  }

  private readonly defenses = new Map<number, { g: THREE.Group; flame?: THREE.Object3D }>();
  private ghost: { g: THREE.Group; key: string } | null = null;

  /** Aufgestellte Verteidigungen: Stacheldraht, Bretterbarrikade, Feuerfass (Feuer flackert). */
  private syncDefenses(list: Defense[], time: number): void {
    const seen = new Set<number>();
    for (const d of list) {
      seen.add(d.id);
      let v = this.defenses.get(d.id);
      if (!v) {
        v = buildDefense(d.kind, d.rot);
        v.g.position.set(d.pos.x, 0, d.pos.y);
        this.defenses.set(d.id, v);
        this.scene.add(v.g);
      }
      // Beschädigt: sinkt leicht ein
      v.g.scale.y = 0.55 + 0.45 * Math.max(0, d.hp / d.maxHp);
      if (v.flame) v.flame.scale.setScalar(0.8 + Math.sin(time * 13 + d.id) * 0.15 + 0.3 * (d.hp / d.maxHp));
    }
    for (const [id, v] of this.defenses) {
      if (seen.has(id)) continue;
      this.scene.remove(v.g);
      this.defenses.delete(id);
    }
  }

  /** Baumodus: halb durchsichtige Vorschau an der Maus (null = aus). */
  showGhost(kind: Defense['kind'] | null, pos: { x: number; y: number } | null, rot: number): void {
    const key = kind ? `${kind}-${rot}` : '';
    if (this.ghost && this.ghost.key !== key) {
      this.scene.remove(this.ghost.g);
      this.ghost = null;
    }
    if (!kind || !pos) return;
    if (!this.ghost) {
      const g = buildDefense(kind, rot).g;
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material = (o.material as THREE.Material).clone();
          (o.material as THREE.MeshLambertMaterial).transparent = true;
          (o.material as THREE.MeshLambertMaterial).opacity = 0.5;
          o.castShadow = false;
        }
      });
      this.ghost = { g, key };
      this.scene.add(g);
    }
    this.ghost.g.position.set(pos.x, 0, pos.y);
  }

  sync(state: GameState, prev: Map<number, Snapshot>, alpha: number, time: number): void {
    this.syncDefenses(state.defenses ?? [], time);
    this.syncZones(state.zones, state.time, time);
    this.syncProjectiles(state, prev, alpha);
    const seen = new Set<number>();
    for (const h of state.heroes) {
      if (!h.ball) continue;
      seen.add(h.id);
      let ball = this.balls.get(h.id);
      if (!ball) {
        ball = buildBall();
        this.balls.set(h.id, ball);
        this.scene.add(ball);
      }
      placeBall(ball, h.ball, state, time);
    }
    // Ball ohne Besitzer nur verstecken und sein Licht dunkel stellen: Lichter entfernen oder
    // hinzufügen ändert die Lichtzahl, und die Grafikkarte übersetzt alle Shader neu (Ruckler)
    for (const [id, b] of this.balls) {
      const on = seen.has(id);
      for (const c of b.children) {
        if ((c as THREE.PointLight).isPointLight) (c as THREE.PointLight).intensity = on ? 2 : 0;
        else c.visible = on;
      }
    }
  }

  private syncZones(zones: Zone[], simTime: number, time: number): void {
    const seen = new Set<number>();
    for (const z of zones) {
      seen.add(z.id);
      let o = this.zones.get(z.id);
      if (!o) {
        o = buildZone(z);
        this.zones.set(z.id, o);
        this.scene.add(o);
      }
      animateZone(o, z, simTime, time);
    }
    for (const [id, o] of this.zones) {
      if (!seen.has(id)) {
        this.scene.remove(o);
        this.zones.delete(id);
      }
    }
  }

  private syncProjectiles(state: GameState, prev: Map<number, Snapshot>, alpha: number): void {
    const seen = new Set<number>();
    for (const p of state.projectiles) {
      seen.add(p.id);
      let m = this.projectiles.get(p.id);
      if (!m) {
        m = buildProjectile(p.look ?? '');
        this.projectiles.set(p.id, m);
        this.scene.add(m);
      }
      const pr = prev.get(p.id);
      m.position.set(pr ? pr.x + (p.pos.x - pr.x) * alpha : p.pos.x, 1.15, pr ? pr.y + (p.pos.y - pr.y) * alpha : p.pos.y);
      m.rotation.y = -Math.atan2(p.dir.y, p.dir.x);
      if (p.look === 'hook') {
        // Leine vom Werfer zum Haken
        const owner = state.heroes.find((h) => h.id === p.ownerId);
        let rope = this.ropes.get(p.id);
        if (!rope) {
          rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xc8b08a }));
          this.ropes.set(p.id, rope);
          this.scene.add(rope);
        }
        const pos = rope.geometry.attributes.position as THREE.BufferAttribute;
        if (owner) pos.setXYZ(0, owner.pos.x, 1.2, owner.pos.y);
        pos.setXYZ(1, m.position.x, m.position.y, m.position.z);
        pos.needsUpdate = true;
      }
    }
    for (const [id, m] of this.projectiles) {
      if (!seen.has(id)) {
        this.scene.remove(m);
        this.projectiles.delete(id);
        const rope = this.ropes.get(id);
        if (rope) {
          this.scene.remove(rope);
          rope.geometry.dispose();
          this.ropes.delete(id);
        }
      }
    }
  }
}

function buildBall(): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 12),
    new THREE.MeshLambertMaterial({ color: 0xf5f5f5, emissive: 0xff8a3d, emissiveIntensity: 0.35 }),
  );
  ball.castShadow = true;
  ball.name = 'ball';
  // Rote und blaue Streifen
  for (const [color, rot] of [[0xc0392b, 0], [0x2c5fa8, Math.PI / 2]] as const) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.035, 6, 20), new THREE.MeshBasicMaterial({ color }));
    band.rotation.y = rot;
    ball.add(band);
  }
  g.add(ball);
  const glow = new THREE.PointLight(0xff9a3d, 2, 3);
  g.add(glow);
  return g;
}

function placeBall(g: THREE.Group, ball: Ball, state: GameState, time: number): void {
  const holder = ball.heldBy !== null ? state.heroes.find((h) => h.id === ball.heldBy) : undefined;
  let height = 0.3;
  let pos = ball.pos;
  if (holder) {
    pos = holder.pos;
    height = 1.3 + Math.sin(time * 4) * 0.08;
  } else if (ball.flight) {
    const k = ball.flight.elapsed / ball.flight.duration;
    height = 0.6 + Math.sin(k * Math.PI) * 1.5;
  }
  g.position.set(pos.x, height, pos.y);
  g.getObjectByName('ball')!.rotation.x = time * 6;
}

function buildZone(z: Zone): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(z.pos.x, 0, z.pos.y);
  const disc = (r: number, color: number, opacity: number) => {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
    );
    m.position.y = 0.05;
    g.add(m);
    return m;
  };
  switch (z.kind) {
    case 'thorns': {
      disc(z.radius, 0x2e7d32, 0.35).name = 'area';
      const seed = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }));
      seed.position.y = 0.15;
      seed.name = 'seed';
      g.add(seed);
      const spikes = new THREE.Group();
      spikes.name = 'spikes';
      const mat = new THREE.MeshLambertMaterial({ color: 0x3f7d2a });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const r = z.radius * (0.3 + ((i * 37) % 10) / 14);
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), mat);
        spike.position.set(Math.cos(a) * r, 0.35, Math.sin(a) * r);
        spikes.add(spike);
      }
      g.add(spikes);
      break;
    }
    case 'smoke':
    case 'bigsmoke': {
      const mat = new THREE.MeshLambertMaterial({ color: 0xb8b8b8, transparent: true, opacity: 0.55, depthWrite: false });
      const n = z.kind === 'bigsmoke' ? 22 : 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + i;
        const r = z.radius * Math.sqrt(((i * 53) % 100) / 100) * 0.85;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(z.radius * 0.35, 10, 8), mat);
        puff.position.set(Math.cos(a) * r, 0.6 + (i % 3) * 0.35, Math.sin(a) * r);
        g.add(puff);
      }
      break;
    }
    case 'hedge': {
      // Ring aus Heckenstücken mit Dornen
      const hedge = new THREE.Group();
      hedge.name = 'hedge';
      const width = (z.ring ?? 0.6) * 1.6;
      const n = Math.max(12, Math.round((z.radius * Math.PI * 2) / 0.9));
      const leaf = new THREE.MeshLambertMaterial({ color: 0x2f6b2a });
      const thorn = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(width, 1.2, (z.radius * Math.PI * 2) / n + 0.05), leaf);
        seg.position.set(Math.cos(a) * z.radius, 0.6, Math.sin(a) * z.radius);
        seg.rotation.y = -a;
        seg.castShadow = true;
        hedge.add(seg);
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 4), thorn);
        spike.position.set(Math.cos(a) * (z.radius + width / 2), 0.8, Math.sin(a) * (z.radius + width / 2));
        spike.rotation.z = -Math.PI / 2;
        spike.rotation.y = -a;
        hedge.add(spike);
      }
      g.add(hedge);
      break;
    }
    case 'block':
      disc(z.radius, 0x7fd1ff, 0.3);
      break;
    case 'molten': {
      // Flüssiges Gold: glühende Fläche mit Blasen
      disc(z.radius, 0xffa51e, 0.7).name = 'area';
      const hot = new THREE.MeshBasicMaterial({ color: 0xffe08a });
      for (let i = 0; i < 9; i++) {
        const a = i * 2.3;
        const r = z.radius * (0.15 + ((i * 37) % 10) / 12);
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6).scale(1, 0.5, 1), hot);
        m.position.set(Math.cos(a) * r, 0.07, Math.sin(a) * r);
        g.add(m);
      }
      break;
    }
    case 'sparks': {
      // Funkenflug: glühender Boden mit Funken
      disc(z.radius, 0xff6a1e, 0.45).name = 'area';
      const spark = new THREE.MeshBasicMaterial({ color: 0xffd27a });
      const cloud = new THREE.Group();
      cloud.name = 'cloud';
      for (let i = 0; i < 40; i++) {
        const a = i * 2.39996;
        const r = z.radius * Math.sqrt(((i * 61) % 100) / 100);
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 3), spark);
        m.position.set(Math.cos(a) * r, 0.3 + ((i * 17) % 10) * 0.2, Math.sin(a) * r);
        cloud.add(m);
      }
      g.add(cloud);
      break;
    }
    case 'honey': {
      // Honigfläche: bernsteinfarbener, glänzender Fleck mit Tropfen
      disc(z.radius, 0xd99a1e, 0.55).name = 'area';
      const drop = new THREE.MeshLambertMaterial({ color: 0xf2b230, emissive: 0x6a3d00 });
      for (let i = 0; i < 8; i++) {
        const a = i * 2.1;
        const r = z.radius * (0.2 + ((i * 41) % 10) / 13);
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.4, 1), drop);
        m.position.set(Math.cos(a) * r, 0.07, Math.sin(a) * r);
        g.add(m);
      }
      break;
    }
    case 'swarm': {
      // Großer Schwarm: dunkler Schatten am Boden, viele Bienen in der Luft
      disc(z.radius, 0x3a2a00, 0.3);
      const cloud = new THREE.Group();
      cloud.name = 'cloud';
      const bee = new THREE.MeshBasicMaterial({ color: 0xffc83d });
      const dark = new THREE.MeshBasicMaterial({ color: 0x1e1608 });
      for (let i = 0; i < 70; i++) {
        const a = i * 2.39996;
        const r = z.radius * Math.sqrt(((i * 61) % 100) / 100);
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), i % 3 === 0 ? dark : bee);
        m.position.set(Math.cos(a) * r, 0.6 + ((i * 17) % 10) * 0.18, Math.sin(a) * r);
        cloud.add(m);
      }
      g.add(cloud);
      break;
    }
  }
  return g;
}

function animateZone(o: THREE.Object3D, z: Zone, simTime: number, time: number): void {
  const remaining = z.until - simTime;
  const fade = Math.min(1, remaining / 0.5);
  if (z.kind === 'thorns') {
    const grown = simTime >= z.activeAt;
    o.getObjectByName('seed')!.visible = !grown;
    const spikes = o.getObjectByName('spikes')!;
    spikes.visible = grown;
    spikes.scale.y = grown ? Math.min(1, (simTime - z.activeAt) / 0.3) * fade : 0;
    (o.getObjectByName('area') as THREE.Mesh).visible = grown;
  } else if (z.kind === 'hedge') {
    o.getObjectByName('hedge')!.scale.y = Math.max(0.01, Math.min(1, (simTime - z.activeAt + 0.05) / 0.4) * fade);
  } else if (z.kind === 'swarm') {
    const cloud = o.getObjectByName('cloud')!;
    cloud.rotation.y = time * 1.4;
    cloud.position.y = Math.sin(time * 5) * 0.12;
    cloud.scale.setScalar(Math.max(0.05, fade));
  } else if (z.kind === 'sparks') {
    const cloud = o.getObjectByName('cloud')!;
    cloud.position.y = -((time * 1.5) % 1) * 0.6;
    cloud.rotation.y = time * 0.6;
    o.scale.setScalar(Math.max(0.05, fade));
  } else if (z.kind === 'molten') {
    o.scale.setScalar(Math.max(0.05, fade) * (0.97 + Math.sin(time * 6) * 0.03));
  } else if (z.kind === 'honey') {
    o.scale.setScalar(Math.max(0.05, fade));
  } else if (z.kind === 'smoke' || z.kind === 'bigsmoke') {
    o.rotation.y = time * 0.2;
    o.scale.setScalar(0.85 + 0.15 * fade);
  }
}
