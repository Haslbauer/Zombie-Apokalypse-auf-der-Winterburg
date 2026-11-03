import { PostFx } from './post';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { setWeaponEnvironment } from './weapons';
import * as THREE from 'three';
import { buffRings } from './buffrings';
import { arenaBounds, brushAt } from '../sim/grid';
import { hasBuff, shieldAmount } from '../sim/status';
import { type AbilityDef, type AttackDef, type GameData, type GameState, type Hero, type Zombie } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { GameCamera } from './camera';
import { isResting } from '../sim/hero';
import type { DataContext } from '../sim/context';
import type { QualityLevel } from './quality';
import { buildMap, type MapAnimation } from './map';
import { ObjectiveView } from './objectives';
import { AbilityPreview } from './preview';
import type { RiggedModel } from './models';
import { ATTACK_ANIM, heroView, minionView, UnitView, zombieView } from './units';

/** So lange bleibt ein toter Zombie liegen (s), die letzte Sekunde versinkt er. */
const CORPSE_TIME = 2.5;
import { WorldView } from './world';
import { Weather } from './weather';
import { CrateView } from './crate';
import { ViewModel } from './viewmodel';

/** So nah muss ein Held einem Zombie im Gebüsch sein, damit man ihn sieht (m). */
const BRUSH_REVEAL = 3;

/** Ist der Zombie für die Spieler sichtbar? Im Gebüsch nur, wenn ein Held im selben Gebüsch oder nah dran ist. */
export function zombieRevealed(data: GameData, state: GameState, z: Zombie): boolean {
  if (!data.arena.brush?.length) return true;
  const brush = brushAt(data.arena, z.pos);
  if (brush < 0) return true;
  return state.heroes.some((h) => h.alive && (h.brush === brush || Math.hypot(h.pos.x - z.pos.x, h.pos.y - z.pos.y) <= BRUSH_REVEAL));
}

/** Position und Blickrichtung eines Objekts im vorherigen Tick (für Interpolation). */
export interface Snapshot {
  x: number;
  y: number;
  facing: number;
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  /** Bildnachbearbeitung (Bloom, Farbgebung, Vignette); auf „niedrig“ aus. */
  private post: PostFx | null = null;
  readonly scene = new THREE.Scene();
  readonly cam: GameCamera;
  private readonly units = new Map<number, UnitView>();
  private readonly world: WorldView;
  /** Wind in Gras und Büschen, Rauch aus den Schornsteinen. */
  private readonly mapAnimation: MapAnimation;
  private readonly fog: THREE.Fog;
  private readonly sun: THREE.DirectionalLight;
  private readonly weather: Weather;
  /** PvP „Kiste erobern“: Kiste mit Eroberungsring (nur in diesem Modus). */
  private crate: CrateView | null = null;
  /** Ego-Sicht: Hand und Waffe im Bild, Kopfwippen beim Laufen (abschaltbar). */
  private readonly viewModel: ViewModel;
  headBob = true;
  private bobPhase = 0;
  private moving = 0;
  private readonly lastMine = new THREE.Vector2(NaN, NaN);
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private readonly cullSphere = new THREE.Sphere(new THREE.Vector3(), 2.5);
  private readonly lantern = new THREE.PointLight(0xffb866, 16, 12, 1.6);
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
  /** Ego-Sicht: eigenen Helden ausblenden (die Kamera sitzt in seinem Kopf). */
  hideOwn = false;
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
    // Nacht: kühles Mondlicht von schräg oben, dunkelblauer Himmel, Nebel in
    // der Ferne (folgt dem Kameraabstand, siehe render). Warme Lichtinseln
    // kommen von Fenstern, Laternen, Feuerfässern und der Laterne des Helden.
    const night = 0x0c1222;
    this.scene.background = new THREE.Color(night);
    this.fog = new THREE.Fog(night, 40, 95);
    this.scene.fog = this.fog;
    // Spiegel-Umgebung für Metall an Waffen und Werkzeugen (einmal erzeugt)
    setWeaponEnvironment(new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture);
    const hemi = new THREE.HemisphereLight(0x7d8fc4, 0x1a2018, 0.8);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xaebfff, 1.15);
    const b = arenaBounds(data.arena);
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.y0 + b.y1) / 2;
    sun.position.set(cx - 32, 26, cz + 22);
    sun.target.position.set(cx, 0, cz);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    const s = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.72;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 130 });
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.weather = new Weather(this.scene, this.fog, hemi, sun);
    // Kamera in die Szene, damit das an ihr hängende Waffenmodell gezeichnet wird
    this.scene.add(this.cam.camera);
    this.viewModel = new ViewModel(this.cam.camera);

    this.mapAnimation = buildMap(this.scene, data.arena);
    // Laterne des eigenen Helden: warmes Licht, das mitläuft
    this.lantern.position.y = 2.6;
    this.scene.add(this.lantern);
    this.world = new WorldView(this.scene);
    this.preview = new AbilityPreview(this.scene);
    for (const def of data.arena.objectives) {
      const view = new ObjectiveView(def);
      this.objectives.set(def.id, view);
      this.scene.add(view.group);
    }

    window.addEventListener('resize', () => {
      this.renderer.setSize(container.clientWidth, container.clientHeight);
      this.post?.setSize(container.clientWidth, container.clientHeight);
      this.cam.resize(container.clientWidth / container.clientHeight);
    });
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Farbe der Laterne des eigenen Helden (Freischaltbares). */
  setLanternColor(color: number): void {
    this.lantern.color.set(color);
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
    if (this.crate) this.crate.group.visible = false;
  }

  /** Szene an den Spielzustand angleichen, zwischen den Ticks interpoliert. */
  sync(state: GameState, prev: Map<number, Snapshot>, alpha: number, dt: number, time: number): void {
    const camera = this.cam.camera;
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
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

    // Grimm wittert verwundete Zombies (unter revealBelow) auch hinter Wänden.
    const grimm = state.heroes.find((h) => h.alive && h.defId === 'grimm');
    const revealBelow = grimm ? (this.data.heroes.find((d) => d.id === 'grimm')?.passive.values.revealBelow ?? 0) : 0;

    for (const h of state.heroes) {
      // Gefallene Helden mit Modell liegen bis zum Respawn am Boden, sonst verschwinden sie.
      if (!h.alive && !this.units.get(h.id)?.isAnimated) continue;
      const def = this.data.heroes.find((d) => d.id === h.defId)!;
      const lift = h.dash ? Math.sin((h.dash.elapsed / h.dash.duration) * Math.PI) * h.dash.height : 0;
      if (h.benched) continue;
      const myTeam = state.heroes.find((x) => x.id === this.playerId)?.team;
      const enemy = !!state.pvp && myTeam !== undefined && h.team !== myTeam;
      const role = this.data.bots.heroes[h.defId]?.teamRole;
      const roleDef = role ? this.data.economy.roles?.[role] : undefined;
      const roleIcon = roleDef ? { icon: roleDef.icon, color: role === 'tank' ? '#9fdcff' : role === 'dmg' ? '#ffa092' : '#a9eb98' } : undefined;
      const view = upsert(h, () => heroView(h, def, h.id === this.playerId, this.models, enemy, roleIcon), lift);
      const speed = h.alive ? view.measureSpeed(dt) : 0;
      // Niederlage: alle Helden des verlierenden Teams fallen um und bleiben liegen
      const lost = heroLost(state, h);
      if (!h.alive || lost) {
        // Menschen liegen (down), Grimm spielt seine Sterbe-Animation und bleibt liegen
        if (view.hasClip('down')) view.animate(dt, 0, false, 'down');
        else {
          view.die();
          view.animate(dt, 0, false);
        }
        view.bar.visible = false;
        view.ring.visible = false;
        view.showBuffs([], time, h.radius);
        // Wiederbeleben: Ring zeigt den Fortschritt, solange er am Boden liegt
        view.showRevive(!lost && (h.downUntil ?? 0) > state.time ? (h.reviveProgress ?? 0) : null);
        continue;
      }
      view.revive();
      // Rückruf zur Basis: blauer Ring füllt sich
      const rc = h.recall;
      view.showRevive(rc ? Math.min(1, (state.time - rc.start) / Math.max(0.1, rc.until - rc.start)) : null, 0x6fb7ff);
      view.ring.visible = true;
      const hidden = (h.brush ?? -1) >= 0 && state.time >= (h.revealedUntil ?? 0);
      view.showHero(h, shieldAmount(h), hasBuff(h, 'invisible') ? 0.3 : hidden ? 0.55 : 1);
      view.group.visible = !(this.hideOwn && h.id === this.playerId);
      // Aktive Buffs als drehende, farbige Ringe um den Helden
      view.showBuffs(hidden ? [] : buffRings(h, state.time), time, h.radius);
      if (h.defId === 'imker') view.orbitBees(time);
      // Zustands-Effekte: Heilung, Seuche, Verlangsamung, Betäubung; harte Treffer lassen zusammenzucken
      const dHp = view.hpDelta(h.hp);
      if (dHp >= Math.max(12, h.maxHp * 0.02)) view.burstFx('heal', Math.min(6, 2 + Math.round((dHp / h.maxHp) * 20)));
      if (-dHp >= h.maxHp * 0.08) view.flinch();
      const now = state.time;
      const stunned = h.buffs.some((b) => b.kind === 'stunned' && b.until > now);
      if (stunned && !view.wasStunned) view.flinch();
      view.wasStunned = stunned;
      view.updateFx(dt, time, {
        heal: h.buffs.some((b) => b.kind === 'heal' && b.value > 0 && b.until > now) ? 0.5 : h.hp < h.maxHp && isResting({ state, data: this.data } as DataContext, h) ? 0.8 : 0,
        plague: h.plague && h.plague.until > now ? Math.min(1, 0.3 + h.plague.stacks / 6) : 0,
        slow: h.buffs.some((b) => b.kind === 'haste' && b.value < 0 && b.until > now) ? 1 : 0,
        stun: stunned ? 1 : 0,
      });
      const hold = h.channel?.tag === 'nap' ? 'ability3' : undefined;
      // Sieg: stehen bleiben (Ruhe-Animation) statt mitten im Schritt einzufrieren
      if (state.gameOver) view.animate(dt, 0, false);
      else view.animate(dt, speed, false, hold, view.moveDirection(h.facing));
    }
    // Lottes Trolle (Verbündete)
    for (const m of state.minions ?? []) {
      const view = upsert(m as unknown as Zombie, () => minionView(m, this.models));
      view.animate(dt, view.measureSpeed(dt), state.gameOver);
    }
    for (const z of state.zombies) {
      const def = this.data.zombies.find((d) => d.id === z.defId)!;
      // Dämon im Sprung: Bogen über dem Boden
      const leap = z.leap && z.leap.windup <= 0 ? Math.sin(Math.min(1, 1 - z.leap.flight / z.leap.total) * Math.PI) * 3 : 0;
      const view = upsert(z, () => zombieView(z, def, this.models), leap);
      // Im Gebüsch verborgen, bis ein Held dort steht oder nah dran ist (wie in LoL)
      view.group.visible = zombieRevealed(this.data, state, z);
      view.showStatus(z, state.time, z.hp / z.maxHp < revealBelow);
      if (z.courier) view.markCourier();
      const speed = view.measureSpeed(dt);
      // Sparmodus: außerhalb des Bildes nicht animieren, weit weg nur jedes zweite Bild
      const gp = view.group.position;
      this.cullSphere.center.set(gp.x, 1, gp.z);
      const onScreen = view.group.visible && this.frustum.intersectsSphere(this.cullSphere);
      const far = this.cam.distance > 0 && Math.hypot(gp.x - camera.position.x, gp.z - camera.position.z) > 38;
      const lod = view.isDying ? 0 : !onScreen ? 2 : far ? 1 : 0;
      view.animateLod(dt, speed, state.time < z.st.sleepUntil || state.time < z.st.stunUntil || state.gameOver, lod);
      // Brand und Verlangsamung als Partikel (nur nah und im Bild, spart Rechenzeit bei vielen Zombies)
      if (lod === 0) view.updateFx(dt, time, { burn: state.time < (z.st.burnUntil ?? 0) ? 0.8 : 0, slow: state.time < z.st.slowUntil ? 0.6 : 0 });
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

    // Bienen fliegen zu den intakten Beeten (Bestäubung)
    const beds = state.objectives.filter((o) => o.kind === 'bed' && !o.destroyed).map((o) => o.pos);
    for (const obj of state.objectives) {
      this.objectives.get(obj.id)?.update(obj, state.time, state.time < obj.aggroUntil, camera, dt, beds);
    }
    this.world.sync(state, prev, alpha, time);
    this.mapAnimation.update(time, state.heroes.filter((h) => h.alive).map((h) => h.pos));
    // Laterne folgt dem eigenen Helden (Zuschauer: aus)
    const mine = this.playerId !== null ? this.units.get(this.playerId) : undefined;
    // Laterne nicht aus- und einblenden (die Lichtzahl ändern übersetzt alle Shader neu), nur dunkel stellen
    this.lantern.intensity = mine ? 16 : 0;
    if (mine) this.lantern.position.set(mine.group.position.x, 2.6, mine.group.position.z);
    // Wetter der Wellen-Ereignisse (Nebel, Blutmond, Regen) um den Helden bzw. die Kamera
    const wx = mine ? mine.group.position.x : camera.position.x;
    const wz = mine ? mine.group.position.z : camera.position.z;
    this.weather.update(state.wave.phase === 'wave' ? state.wave.event : null, wx, wz, dt);
    if (state.pvp?.crate && !this.crate) {
      this.crate = new CrateView(this.data.economy.pvp?.crate?.radius ?? 3);
      this.scene.add(this.crate.group);
    }
    this.crate?.update(state, time);
    // Ego-Sicht: Laufphase aus der Bewegung des eigenen Helden
    const me = this.playerId !== null ? state.heroes.find((h) => h.id === this.playerId) : undefined;
    if (mine && me) {
      const p = mine.group.position;
      const speed = Number.isNaN(this.lastMine.x) || dt <= 0 ? 0 : Math.hypot(p.x - this.lastMine.x, p.z - this.lastMine.y) / dt;
      this.lastMine.set(p.x, p.z);
      const target = Math.min(1, speed / 4);
      this.moving += (target - this.moving) * Math.min(1, dt * 10);
      this.bobPhase += dt * Math.min(speed, 8) * 2.1;
      const def = this.data.heroes.find((d) => d.id === me.defId);
      if (def) this.viewModel.setHero(def.id, def.color);
    }
    this.viewModel.update(this.cam.inFirstPerson && !!me?.alive, dt, this.bobPhase, this.moving);
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
  /** Baumodus: Vorschau der Verteidigung an der Maus. */
  buildGhost(kind: 'stacheldraht' | 'barrikade' | 'feuerfass' | null, pos: Vec2 | null, rot: number): void {
    this.world.showGhost(kind, pos, rot);
  }

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
  zombieAttack(id: number, cooldown = ATTACK_ANIM): void {
    this.units.get(id)?.playAttack(cooldown, true);
  }

  /** Heldenanimation: Standardangriff (duration = Angriffstakt), Fähigkeit (slot) oder Trank benutzen. */
  heroAction(id: number, action: 'attack' | 'ability' | 'use', value = 0): void {
    const view = this.units.get(id);
    if (!view) return;
    if (id === this.playerId && action !== 'use') this.viewModel.kick(action === 'attack' ? value || 0.3 : 0.4);
    if (action === 'attack') view.playAttack(value);
    else if (action === 'ability') view.playAbility(value);
    else view.playOnce('use', 0.9);
  }

  /** Zombie stirbt: Sterbe-Animation, die Leiche bleibt kurz liegen. */
  zombieDie(id: number): void {
    this.units.get(id)?.die();
  }

  /** Bossfähigkeit: Ausholen mit passender Bewegung (siehe UnitView.playCast). */
  zombieCast(id: number, kind: string, duration: number): void {
    this.units.get(id)?.playCast(kind, duration);
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
  /** Laufende Dauer-Animation einer Einheit (Debug). */
  /** Nebel an (normal) bzw. aus (Übersicht über die ganze Karte). */
  setFogEnabled(on: boolean): void {
    this.scene.fog = on ? this.fog : null;
  }

  unitLoop(id: number): string {
    return this.units.get(id)?.loopName ?? '';
  }

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

  /**
   * Grafikqualität: Pixeldichte, Schattenauflösung (bei Niedrig keine
   * Schatten) und Bodennebel/Feuer-Details.
   */
  applyQuality(level: QualityLevel): void {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(level === 'hoch' ? Math.min(dpr, 2) : level === 'mittel' ? Math.min(dpr, 1.5) : 1);
    // Nachbearbeitung nur auf „hoch“ und „mittel“ (Bloom auf „mittel“ schwächer)
    if (level !== 'niedrig') {
      this.post ??= new PostFx(this.renderer, this.scene, this.cam.camera);
      this.post.enabled = true;
      this.post.setBloom(level === 'hoch' ? 0.7 : 0.5);
      const size = this.renderer.getSize(new THREE.Vector2());
      this.post.setSize(size.x, size.y);
    } else if (this.post) this.post.enabled = false;
    // Schatten bleiben an (nur kleiner): Ein- und Ausschalten zwingt die Grafikkarte, alle
    // Shader neu zu übersetzen; bei automatischer Qualität ruckelte es dabei immer wieder.
    const size = level === 'hoch' ? 2048 : level === 'mittel' ? 1024 : 512;
    this.sun.castShadow = true;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.mapAnimation.setDetail(level !== 'niedrig');
  }

  render(): void {
    // Nebel beginnt ein Stück hinter dem Fokus, sonst wäre die Übersicht nur grau
    const d = this.cam.distance;
    // Ego-Sicht: näherer Nebel, stimmungsvoll und schneller
    const near = this.cam.inFirstPerson ? 6 : d + 10;
    const far = this.cam.inFirstPerson ? 40 : d * 1.6 + 50;
    // Nebelnacht: Sicht deutlich kürzer (weich überblendet)
    const f = this.weather.fogAmount;
    this.fog.near = near + (Math.min(near, this.cam.inFirstPerson ? 2 : d * 0.55) - near) * f;
    this.fog.far = far + (Math.min(far, this.cam.inFirstPerson ? 16 : d + 16) - far) * f;
    // Kopfwippen: auf und ab, leicht seitlich (nur in der Ego-Sicht, beim Laufen)
    if (this.cam.inFirstPerson && this.headBob && this.moving > 0.01) {
      const c = this.cam.camera;
      const up = Math.sin(this.bobPhase * 2) * 0.045 * this.moving;
      const side = Math.sin(this.bobPhase) * 0.03 * this.moving;
      c.position.y += up;
      c.position.x += -Math.sin(this.cam.yaw) * side;
      c.position.z += Math.cos(this.cam.yaw) * side;
    }
    if (this.post) this.post.render(this.scene, this.cam.camera);
    else this.renderer.render(this.scene, this.cam.camera);
  }
}

/**
 * Hat dieser Held verloren (Spiel vorbei, Niederlage)? Koop: alle Helden bei
 * einer Niederlage. PvP: die Helden des Teams, das nicht gewonnen hat.
 */
export function heroLost(state: Pick<GameState, 'gameOver' | 'victory' | 'pvp'>, h: Pick<Hero, 'team'>): boolean {
  if (!state.gameOver) return false;
  if (state.pvp) return state.pvp.winner !== undefined && (h.team ?? 0) !== state.pvp.winner;
  return !state.victory;
}
