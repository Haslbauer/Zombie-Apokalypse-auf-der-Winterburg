import * as THREE from 'three';
import { hasBuff, shieldAmount } from '../sim/status';
import { type AbilityDef, type AttackDef, DT, type GameData, type GameState, type Hero, type Zombie } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { GameCamera } from './camera';
import { buildMap } from './map';
import { ObjectiveView } from './objectives';
import { AbilityPreview } from './preview';
import type { RiggedModel } from './models';
import { heroView, UnitView, zombieView } from './units';
import { WorldView } from './world';

/** Position und Blickrichtung eines Objekts im vorherigen Tick (für Interpolation). */
export interface Snapshot {
  x: number;
  y: number;
  facing: number;
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam: GameCamera;
  private readonly units = new Map<number, UnitView>();
  private readonly world: WorldView;
  readonly preview: AbilityPreview;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private aimIndicator: THREE.Mesh | null = null;
  /** Animiertes Zombie-Modell; bis es geladen ist, erscheinen die einfachen Figuren. */
  zombieModel: RiggedModel | null = null;
  /** Held des Spielers (grüner Ring); Bots bekommen einen blauen Ring. null = nur Bots. */
  playerId: number | null = null;
  private readonly objectives = new Map<string, ObjectiveView>();

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

    buildMap(this.scene, data.arena);
    this.world = new WorldView(this.scene);
    this.preview = new AbilityPreview(this.scene);
    for (const def of data.arena.objectives) {
      const view = new ObjectiveView(def);
      this.objectives.set(def.id, view);
      this.scene.add(view.group);
    }

    window.addEventListener('resize', () => {
      this.renderer.setSize(container.clientWidth, container.clientHeight);
      this.cam.resize(container.clientWidth / container.clientHeight);
    });
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Alle Einheiten entfernen (neues Spiel). */
  reset(): void {
    for (const v of this.units.values()) {
      this.scene.remove(v.group);
      v.dispose();
    }
    this.units.clear();
    this.world.reset();
    this.preview.hide();
  }

  /** Szene an den Spielzustand angleichen, zwischen den Ticks interpoliert. */
  sync(state: GameState, prev: Map<number, Snapshot>, alpha: number, dt: number, time: number): void {
    const camera = this.cam.camera;
    const seen = new Set<number>();
    const upsert = (unit: Hero | Zombie, make: () => UnitView, lift = 0) => {
      seen.add(unit.id);
      let view = this.units.get(unit.id);
      if (!view) {
        view = make();
        this.units.set(unit.id, view);
        this.scene.add(view.group);
      }
      view.update(unit, prev.get(unit.id), alpha, camera, dt, lift);
      return view;
    };

    // Chupa wittert verwundete Zombies (unter revealBelow) auch hinter Wänden.
    const chupa = state.heroes.find((h) => h.alive && h.defId === 'chupa');
    const revealBelow = chupa ? (this.data.heroes.find((d) => d.id === 'chupa')?.passive.values.revealBelow ?? 0) : 0;

    for (const h of state.heroes) {
      if (!h.alive) continue;
      const def = this.data.heroes.find((d) => d.id === h.defId)!;
      const lift = h.dash ? Math.sin((h.dash.elapsed / h.dash.duration) * Math.PI) * h.dash.height : 0;
      const view = upsert(h, () => heroView(h, def, h.id === this.playerId), lift);
      view.showHero(h, shieldAmount(h), hasBuff(h, 'invisible'));
    }
    for (const z of state.zombies) {
      const def = this.data.zombies.find((d) => d.id === z.defId)!;
      const view = upsert(z, () => zombieView(z, def, this.zombieModel));
      view.showStatus(z, state.time, z.hp / z.maxHp < revealBelow);
      const p = prev.get(z.id);
      const speed = p ? Math.hypot(z.pos.x - p.x, z.pos.y - p.y) / DT : 0;
      view.animate(dt, speed, state.time < z.st.sleepUntil || state.time < z.st.stunUntil || state.gameOver);
    }
    for (const [id, view] of this.units) {
      if (!seen.has(id)) {
        this.scene.remove(view.group);
        view.dispose();
        this.units.delete(id);
      }
    }

    for (const obj of state.objectives) {
      this.objectives.get(obj.id)?.update(obj, state.time, state.time < obj.aggroUntil, camera, dt);
    }
    this.world.sync(state, prev, alpha, time);
  }

  /** Vorschau einer Fähigkeit (Taste gehalten) oder ausblenden. */
  showPreview(ability: AbilityDef | null, hero: Hero | undefined, aim: { x: number; y: number }): void {
    if (!ability || !hero) {
      this.preview.hide();
      return;
    }
    const pos = this.unitPosition(hero.id) ?? hero.pos;
    const ball = hero.ball ? (hero.ball.heldBy !== null ? pos : hero.ball.pos) : undefined;
    this.preview.show(ability, pos, hero.radius, aim, ball);
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

  /** Angriffsanimation eines Zombies. */
  zombieAttack(id: number): void {
    this.units.get(id)?.playAttack();
  }

  /** Treffer-Aufblitzen einer Einheit. */
  flash(id: number): void {
    this.units.get(id)?.hit();
  }

  /** Treffer-Aufblitzen eines Ziels. */
  flashObjective(id: string): void {
    this.objectives.get(id)?.hit();
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
