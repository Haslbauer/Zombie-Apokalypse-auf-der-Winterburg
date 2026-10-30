import * as THREE from 'three';
import type { Ball, GameState, Projectile, Zone } from '../sim/types';
import type { Snapshot } from './renderer';

/** Aussehen der Geschosse je Held. */
const PROJECTILES: Record<string, { color: number; size: number }> = {
  stone: { color: 0x8d8d86, size: 0.13 },
  bigstone: { color: 0x6f6f69, size: 0.22 },
  hook: { color: 0x3a3a3a, size: 0.16 },
  star: { color: 0x9fe3ff, size: 0.16 },
  volley: { color: 0xffffff, size: 0.14 },
};

/** Zonen, Libero-Ball und Geschosse in der Szene. */
export class WorldView {
  private readonly zones = new Map<number, THREE.Object3D>();
  private readonly projectiles = new Map<number, THREE.Mesh>();
  private readonly balls = new Map<number, THREE.Group>();
  private readonly geometries = new Map<string, THREE.SphereGeometry>();
  private readonly materials = new Map<string, THREE.MeshBasicMaterial>();

  constructor(private readonly scene: THREE.Scene) {}

  reset(): void {
    for (const o of [...this.zones.values(), ...this.projectiles.values(), ...this.balls.values()]) this.scene.remove(o);
    this.zones.clear();
    this.projectiles.clear();
    this.balls.clear();
  }

  sync(state: GameState, prev: Map<number, Snapshot>, alpha: number, time: number): void {
    this.syncZones(state.zones, state.time, time);
    this.syncProjectiles(state.projectiles, prev, alpha);
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
    for (const [id, b] of this.balls) {
      if (!seen.has(id)) {
        this.scene.remove(b);
        this.balls.delete(id);
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

  private syncProjectiles(projectiles: Projectile[], prev: Map<number, Snapshot>, alpha: number): void {
    const seen = new Set<number>();
    for (const p of projectiles) {
      seen.add(p.id);
      let m = this.projectiles.get(p.id);
      if (!m) {
        const look = PROJECTILES[p.look ?? ''] ?? { color: 0xffe066, size: 0.15 };
        const key = p.look ?? 'default';
        if (!this.geometries.has(key)) this.geometries.set(key, new THREE.SphereGeometry(look.size, 8, 6));
        if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshBasicMaterial({ color: look.color }));
        m = new THREE.Mesh(this.geometries.get(key), this.materials.get(key));
        this.projectiles.set(p.id, m);
        this.scene.add(m);
      }
      const pr = prev.get(p.id);
      m.position.set(pr ? pr.x + (p.pos.x - pr.x) * alpha : p.pos.x, 1.1, pr ? pr.y + (p.pos.y - pr.y) * alpha : p.pos.y);
    }
    for (const [id, m] of this.projectiles) {
      if (!seen.has(id)) {
        this.scene.remove(m);
        this.projectiles.delete(id);
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
  } else if (z.kind === 'smoke' || z.kind === 'bigsmoke') {
    o.rotation.y = time * 0.2;
    o.scale.setScalar(0.85 + 0.15 * fade);
  }
}
