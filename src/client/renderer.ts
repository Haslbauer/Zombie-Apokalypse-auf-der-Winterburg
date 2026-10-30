import * as THREE from 'three';
import type { ArenaDef, AttackDef, GameData, GameState, Hero, Unit, Zombie } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { GameCamera } from './camera';

/** Position und Blickrichtung eines Objekts im vorherigen Tick (für Interpolation). */
export interface Snapshot {
  x: number;
  y: number;
  facing: number;
}

const UNIT_HEIGHT = 1.6;

/** Darstellung einer Einheit: Körper, Blickrichtung, Lebensbalken, Markierungsring. */
class UnitView {
  readonly group = new THREE.Group();
  readonly body: THREE.Mesh;
  readonly material: THREE.MeshLambertMaterial;
  private readonly barFill: THREE.Mesh;
  readonly bar = new THREE.Group();
  readonly ring: THREE.Mesh;
  private flash = 0;
  private readonly baseColor: THREE.Color;

  constructor(radius: number, color: string, barColor: number, height = UNIT_HEIGHT) {
    this.baseColor = new THREE.Color(color);
    this.material = new THREE.MeshLambertMaterial({ color: this.baseColor });
    const capsule = new THREE.CapsuleGeometry(radius, Math.max(0.1, height - 2 * radius), 4, 12);
    this.body = new THREE.Mesh(capsule, this.material);
    this.body.position.y = height / 2;
    this.body.castShadow = true;
    this.group.add(this.body);

    // Kleine "Nase" zeigt die Blickrichtung.
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 0.7, radius * 0.4, radius * 0.4),
      new THREE.MeshLambertMaterial({ color: this.baseColor.clone().multiplyScalar(0.6) }),
    );
    nose.position.set(radius * 0.9, height * 0.2, 0);
    this.body.add(nose);

    const w = Math.max(1, radius * 2.4);
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.08, 0.2), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    this.barFill = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 0.13).translate(w / 2, 0, 0),
      new THREE.MeshBasicMaterial({ color: barColor }),
    );
    this.barFill.position.set(-w / 2, 0, 0.01);
    this.bar.add(bg, this.barFill);
    this.bar.position.y = height + 0.45;
    this.group.add(this.bar);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(radius + 0.12, radius + 0.25, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.9 }),
    );
    this.ring.position.y = 0.03;
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  update(unit: Unit, prev: Snapshot | undefined, alpha: number, camera: THREE.Camera, dt: number): void {
    const x = prev ? prev.x + (unit.pos.x - prev.x) * alpha : unit.pos.x;
    const y = prev ? prev.y + (unit.pos.y - prev.y) * alpha : unit.pos.y;
    this.group.position.set(x, 0, y);
    this.body.rotation.y = -unit.facing;
    this.bar.quaternion.copy(camera.quaternion);
    this.barFill.scale.x = Math.max(0.001, unit.hp / unit.maxHp);
    if (unit.hp < unit.maxHp) this.bar.visible = true;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.material.color.copy(this.baseColor).lerp(WHITE, this.flash);
  }

  hit(): void {
    this.flash = 1;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

const WHITE = new THREE.Color(0xffffff);

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam: GameCamera;
  private readonly units = new Map<number, UnitView>();
  private readonly projectiles = new Map<number, THREE.Mesh>();
  private readonly projectileGeometry = new THREE.SphereGeometry(0.15, 8, 6);
  private readonly projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xffe066 });
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private aimIndicator: THREE.Mesh | null = null;

  constructor(container: HTMLElement, private readonly data: GameData) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.cam = new GameCamera(container.clientWidth / container.clientHeight);
    this.cam.lookAt(data.arena.width / 2, data.arena.height / 2);
    this.scene.background = new THREE.Color(0x9cc6e0);
    this.scene.fog = new THREE.Fog(0x9cc6e0, 45, 90);
    this.scene.add(new THREE.HemisphereLight(0xfff6e0, 0x3d5a2e, 1.3));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2);
    const { width, height } = data.arena;
    sun.position.set(width / 2 - 15, 30, height / 2 + 10);
    sun.target.position.set(width / 2, 0, height / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = Math.max(width, height) * 0.75;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 100 });
    this.scene.add(sun, sun.target);

    this.buildArena(data.arena);

    window.addEventListener('resize', () => {
      this.renderer.setSize(container.clientWidth, container.clientHeight);
      this.cam.resize(container.clientWidth / container.clientHeight);
    });
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  private buildArena(arena: ArenaDef): void {
    const { width, height } = arena;
    // Umgebung außerhalb der Arena, etwas dunkler.
    const outside = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 4, height * 4).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x4f7f3a }),
    );
    outside.position.set(width / 2, -0.02, height / 2);
    outside.receiveShadow = true;
    this.scene.add(outside);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x74b350 }),
    );
    ground.position.set(width / 2, 0, height / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Niedriger Zaun als Arenagrenze.
    const fenceMat = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
    const fence = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), fenceMat);
      m.position.set(x, 0.25, z);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    };
    fence(width, 0.2, width / 2, -0.1);
    fence(width, 0.2, width / 2, height + 0.1);
    fence(0.2, height, -0.1, height / 2);
    fence(0.2, height, width + 0.1, height / 2);

    // Spawnpunkte als dunkle Erdflecken.
    const dirt = new THREE.MeshLambertMaterial({ color: 0x5b4632 });
    for (const sp of arena.spawnPoints) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(2, 24).rotateX(-Math.PI / 2), dirt);
      m.position.set(sp.x, 0.01, sp.y);
      m.receiveShadow = true;
      this.scene.add(m);
    }

    const hedge = new THREE.MeshLambertMaterial({ color: 0x2f6b2a });
    const trunk = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
    const crown = new THREE.MeshLambertMaterial({ color: 0x3e8f3a });
    for (const o of arena.obstacles) {
      if (o.kind === 'rect') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, 1.3, o.h), hedge);
        m.position.set(o.x, 0.65, o.y);
        m.castShadow = m.receiveShadow = true;
        this.scene.add(m);
      } else {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.25, o.r * 0.3, 1.6, 8), trunk);
        t.position.set(o.x, 0.8, o.y);
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry(o.r * 1.15, 0), crown);
        c.position.set(o.x, 1.6 + o.r * 0.8, o.y);
        t.castShadow = c.castShadow = true;
        this.scene.add(t, c);
      }
    }
  }

  /** Alle Einheiten entfernen (neues Spiel). */
  reset(): void {
    for (const v of this.units.values()) {
      this.scene.remove(v.group);
      v.dispose();
    }
    this.units.clear();
    for (const m of this.projectiles.values()) this.scene.remove(m);
    this.projectiles.clear();
  }

  /** Szene an den Spielzustand angleichen, zwischen den Ticks interpoliert. */
  sync(state: GameState, prev: Map<number, Snapshot>, alpha: number, dt: number): void {
    const camera = this.cam.camera;
    const seen = new Set<number>();
    const upsert = (unit: Hero | Zombie, make: () => UnitView) => {
      seen.add(unit.id);
      let view = this.units.get(unit.id);
      if (!view) {
        view = make();
        this.units.set(unit.id, view);
        this.scene.add(view.group);
      }
      view.update(unit, prev.get(unit.id), alpha, camera, dt);
      return view;
    };

    for (const h of state.heroes) {
      if (!h.alive) continue;
      const def = this.data.heroes.find((d) => d.id === h.defId)!;
      upsert(h, () => {
        const view = new UnitView(h.radius, def.color, 0x4cd964);
        view.bar.visible = true;
        (view.ring.material as THREE.MeshBasicMaterial).color.set(0x4cd964);
        view.ring.visible = true;
        return view;
      });
    }
    for (const z of state.zombies) {
      const def = this.data.zombies.find((d) => d.id === z.defId)!;
      upsert(z, () => {
        const view = new UnitView(z.radius, def.color, 0xff453a, UNIT_HEIGHT * (0.7 + z.radius * 0.6));
        view.bar.visible = false;
        return view;
      });
    }
    for (const [id, view] of this.units) {
      if (!seen.has(id)) {
        this.scene.remove(view.group);
        view.dispose();
        this.units.delete(id);
      }
    }

    const seenP = new Set<number>();
    for (const p of state.projectiles) {
      seenP.add(p.id);
      let m = this.projectiles.get(p.id);
      if (!m) {
        m = new THREE.Mesh(this.projectileGeometry, this.projectileMaterial);
        this.projectiles.set(p.id, m);
        this.scene.add(m);
      }
      const pr = prev.get(p.id);
      const x = pr ? pr.x + (p.pos.x - pr.x) * alpha : p.pos.x;
      const y = pr ? pr.y + (p.pos.y - pr.y) * alpha : p.pos.y;
      m.position.set(x, 1.1, y);
    }
    for (const [id, m] of this.projectiles) {
      if (!seenP.has(id)) {
        this.scene.remove(m);
        this.projectiles.delete(id);
      }
    }
  }

  /**
   * Zielmarkierung am Boden für die Waffe des Helden: Kreissektor beim
   * Nahkampf, Pfeil beim Fernkampf. Zeigt Reichweite und Trefferbereich.
   */
  setAimIndicator(attack: AttackDef, heroRadius: number): void {
    if (this.aimIndicator) {
      this.scene.remove(this.aimIndicator);
      this.aimIndicator.geometry.dispose();
    }
    let geometry: THREE.BufferGeometry;
    if (attack.type === 'melee') {
      const arc = ((attack.arc ?? 90) * Math.PI) / 180;
      geometry = new THREE.RingGeometry(heroRadius + 0.15, heroRadius + attack.range, 40, 1, -arc / 2, arc);
    } else {
      // Pfeil entlang +x: Schaft vom Heldenrand bis kurz vor die Reichweite, dann die Spitze.
      const w = Math.max(0.12, (attack.projectileRadius ?? 0.2) * 1.2);
      const end = heroRadius + attack.range;
      const head = Math.min(0.9, attack.range * 0.15);
      const shape = new THREE.Shape();
      shape.moveTo(heroRadius + 0.15, -w / 2);
      shape.lineTo(end - head, -w / 2);
      shape.lineTo(end - head, -w * 2);
      shape.lineTo(end, 0);
      shape.lineTo(end - head, w * 2);
      shape.lineTo(end - head, w / 2);
      shape.lineTo(heroRadius + 0.15, w / 2);
      shape.closePath();
      geometry = new THREE.ShapeGeometry(shape);
    }
    geometry.rotateX(-Math.PI / 2);
    this.aimIndicator = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.aimIndicator.position.y = 0.04;
    this.aimIndicator.renderOrder = 1;
    this.scene.add(this.aimIndicator);
  }

  /** Markierung unter den Helden legen und zur Maus drehen; kräftiger, wenn der Angriff bereit ist. */
  updateAimIndicator(pos: Vec2 | null, facing: number, ready: boolean): void {
    if (!this.aimIndicator) return;
    this.aimIndicator.visible = pos !== null;
    if (!pos) return;
    this.aimIndicator.position.x = pos.x;
    this.aimIndicator.position.z = pos.y;
    this.aimIndicator.rotation.y = -facing;
    (this.aimIndicator.material as THREE.MeshBasicMaterial).opacity = ready ? 0.42 : 0.18;
  }

  /** Treffer-Aufblitzen einer Einheit. */
  flash(id: number): void {
    this.units.get(id)?.hit();
  }

  /** Gerenderte Position einer Einheit (interpoliert). */
  unitPosition(id: number): Vec2 | null {
    const v = this.units.get(id);
    return v ? { x: v.group.position.x, y: v.group.position.z } : null;
  }

  private setRay(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.cam.camera);
  }

  /** Bodenpunkt unter dem Mauszeiger in Spielkoordinaten. */
  pickGround(clientX: number, clientY: number): Vec2 | null {
    this.setRay(clientX, clientY);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
    return hit ? { x: hit.x, y: hit.z } : null;
  }

  render(): void {
    this.renderer.render(this.scene, this.cam.camera);
  }
}
