import * as THREE from 'three';
import { hasBuff, shieldAmount } from '../sim/status';
import { type AbilityDef, type AttackDef, DT, type GameData, type GameState, type Hero, type Zombie } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { GameCamera } from './camera';
import { buildMap } from './map';
import { ObjectiveView } from './objectives';
import { AbilityPreview } from './preview';
import type { RiggedModel } from './models';
import { ATTACK_ANIM, heroView, UnitView, zombieView } from './units';

/** So lange bleibt ein toter Zombie liegen (s), die letzte Sekunde versinkt er. */
const CORPSE_TIME = 2.5;
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
  /** Animierte Modelle nach Name (public/models/<name>.glb); fehlende: einfache Figur. */
  readonly models = new Map<string, RiggedModel>();
  /** Gestorbene Zombies: Leiche bleibt liegen und versinkt (Restzeit in s). */
  private readonly corpses = new Map<UnitView, number>();
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
    for (const v of [...this.units.values(), ...this.corpses.keys()]) {
      this.scene.remove(v.group);
      v.dispose();
    }
    this.units.clear();
    this.corpses.clear();
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
      // Gefallene Helden mit Modell liegen bis zum Respawn am Boden, sonst verschwinden sie.
      if (!h.alive && !this.units.get(h.id)?.isAnimated) continue;
      const def = this.data.heroes.find((d) => d.id === h.defId)!;
      const lift = h.dash ? Math.sin((h.dash.elapsed / h.dash.duration) * Math.PI) * h.dash.height : 0;
      const view = upsert(h, () => heroView(h, def, h.id === this.playerId, this.models), lift);
      const p = prev.get(h.id);
      const speed = p && h.alive ? Math.hypot(h.pos.x - p.x, h.pos.y - p.y) / DT : 0;
      if (!h.alive) {
        // Menschen liegen (down), Chupa spielt seine Sterbe-Animation und bleibt liegen
        if (view.hasClip('down')) view.animate(dt, 0, false, 'down');
        else {
          view.die();
          view.animate(dt, 0, false);
        }
        view.bar.visible = false;
        view.ring.visible = false;
        continue;
      }
      view.revive();
      view.ring.visible = true;
      view.showHero(h, shieldAmount(h), hasBuff(h, 'invisible'));
      const hold = h.channel?.tag === 'nap' ? 'ability3' : undefined;
      view.animate(dt, speed, state.gameOver, hold);
    }
    for (const z of state.zombies) {
      const def = this.data.zombies.find((d) => d.id === z.defId)!;
      const view = upsert(z, () => zombieView(z, def, this.models));
      view.showStatus(z, state.time, z.hp / z.maxHp < revealBelow);
      if (z.courier) view.markCourier();
      const p = prev.get(z.id);
      const speed = p ? Math.hypot(z.pos.x - p.x, z.pos.y - p.y) / DT : 0;
      view.animate(dt, speed, state.time < z.st.sleepUntil || state.time < z.st.stunUntil || state.gameOver);
    }
    for (const [id, view] of this.units) {
      if (!seen.has(id)) {
        this.units.delete(id);
        if (view.isDying) this.corpses.set(view, CORPSE_TIME);
        else {
          this.scene.remove(view.group);
          view.dispose();
        }
      }
    }
    for (const [view, left] of this.corpses) {
      const t = left - dt;
      view.animate(dt, 0, false);
      // In der letzten Sekunde im Boden versinken
      if (t < 1) view.group.position.y = -(1 - Math.max(0, t)) * 1.2;
      if (t > 0) this.corpses.set(view, t);
      else {
        this.corpses.delete(view);
        this.scene.remove(view.group);
        view.dispose();
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

  /** Angriffsanimation eines Zombies (zufällige Variante). */
  zombieAttack(id: number): void {
    this.units.get(id)?.playAttack(ATTACK_ANIM, true);
  }

  /** Heldenanimation: Standardangriff (duration = Angriffstakt), Fähigkeit (slot) oder Trank benutzen. */
  heroAction(id: number, action: 'attack' | 'ability' | 'use', value = 0): void {
    const view = this.units.get(id);
    if (!view) return;
    if (action === 'attack') view.playAttack(value);
    else if (action === 'ability') view.playAbility(value);
    else view.playOnce('use', 0.9);
  }

  /** Zombie stirbt: Sterbe-Animation, die Leiche bleibt kurz liegen. */
  zombieDie(id: number): void {
    this.units.get(id)?.die();
  }

  /** Schrei (Elite-Auftritt, Ausholen des Schlächters). */
  zombieScream(id: number): void {
    this.units.get(id)?.playOnce('scream', 1.0);
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
