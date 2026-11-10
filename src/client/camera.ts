import * as THREE from 'three';

/** Neigung der festen Schrägkamera gegen den Boden (kein Drehen). */
const TILT_DEG = 55;
const DISTANCE = 34;
/** Grenzen für den Zoom mit dem Mausrad. */
const MIN_DISTANCE = 10;
const MAX_DISTANCE = 50;
/** So viele Meter südlich vom Helden liegt der Kamerafokus. */
const FOCUS_SOUTH = 2.5;
/** Ego-Sicht: Blickwinkel, Grenzen fürs Hoch-/Runterschauen, Dauer des Übergangs. */
const FP_FOV = 70;
const TOP_FOV = 40;
const PITCH_MIN = THREE.MathUtils.degToRad(-60);
const PITCH_MAX = THREE.MathUtils.degToRad(35);
const BLEND_TIME = 0.3;
/** Mausempfindlichkeit in der Ego-Sicht (Bogenmaß pro Pixel). */
export const LOOK_SENSITIVITY = 0.0025;

export class GameCamera {
  readonly camera: THREE.PerspectiveCamera;
  private offset: THREE.Vector3;
  private following = true;
  /** Zielabstand beim Zoomen; der tatsächliche Abstand gleitet weich dorthin. */
  private targetDistance = DISTANCE;
  private readonly focus = new THREE.Vector3();
  /** Ego-Sicht erlaubt (nicht in Übersicht und beim Zuschauen)? */
  allowFirstPerson = true;
  /** Ego-Sicht aktiv: Kamera auf Augenhöhe des eigenen Helden. */
  firstPerson = false;
  /** Blickrichtung in Spielkoordinaten (0 = Osten, π/2 = Süden) und Neigung (negativ = nach unten). */
  yaw = -Math.PI / 2;
  pitch = -0.12;
  /** Augenhöhe des Helden in Metern. */
  eyeHeight = 1.6;
  /** 0 = Schrägsicht, 1 = Ego-Sicht (gleitet beim Wechsel). */
  private blend = 0;
  private readonly topPos = new THREE.Vector3();
  private readonly topQuat = new THREE.Quaternion();
  private readonly eye = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 200);
    const tilt = THREE.MathUtils.degToRad(TILT_DEG);
    // Kamera steht südlich (+z) über dem Fokuspunkt und blickt nach Norden.
    this.offset = new THREE.Vector3(0, Math.sin(tilt) * DISTANCE, Math.cos(tilt) * DISTANCE);
    this.lookAt(0, 0);
  }

  /** Fokus auf einen Punkt am Boden (Spielkoordinaten x/y → Three x/z). */
  lookAt(x: number, y: number): void {
    this.focus.set(x, 0, y);
    this.camera.position.copy(this.focus).add(this.offset);
    this.camera.lookAt(this.focus);
  }

  /** Abstand der Kamera sofort setzen (Entwicklermodus ?zoom=…). */
  setDistance(distance: number): void {
    this.targetDistance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, distance));
    this.offset.setLength(this.targetDistance);
  }

  /** Mausrad: positive Werte zoomen heraus, negative hinein (stufenweise, ca. 12 % pro Raste). */
  zoom(deltaY: number): void {
    if (!this.following) return;
    // Ganz hineingezoomt und weiter hinein: Ego-Sicht; heraus: zurück zur Schrägsicht
    if (this.firstPerson) {
      if (deltaY > 0) {
        this.firstPerson = false;
        this.targetDistance = MIN_DISTANCE;
      }
      return;
    }
    if (deltaY < 0 && this.allowFirstPerson && this.targetDistance <= MIN_DISTANCE + 0.01) {
      this.firstPerson = true;
      return;
    }
    const factor = Math.exp(Math.sign(deltaY) * Math.min(3, Math.abs(deltaY) / 100) * 0.12);
    this.targetDistance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, this.targetDistance * factor));
  }

  /** Übersicht über die ganze Karte (Entwicklermodus ?overview): weit weg, folgt nicht. */
  overview(x: number, y: number, distance: number): void {
    this.offset.setLength(distance);
    this.camera.far = distance * 3;
    this.camera.updateProjectionMatrix();
    this.following = false;
    this.lookAt(x, y);
  }

  /** Aus der Übersicht zurück: wieder dem Helden folgen (Zuschauen). */
  resume(): void {
    this.following = true;
    this.offset.setLength(this.targetDistance);
    this.camera.far = 200;
    this.camera.updateProjectionMatrix();
  }

  /** Sofort auf einen Punkt springen (freie Kamera beim Ziehen), mit demselben Versatz wie follow. */
  jump(x: number, y: number): void {
    if (!this.following) return;
    this.lookAt(x, y + FOCUS_SOUTH * (this.offset.length() / DISTANCE));
  }

  /** Folgt die Kamera gerade (nicht Übersicht)? */
  get isFollowing(): boolean {
    return this.following;
  }

  /** Weich zum Ziel nachführen. Der Fokus liegt etwas südlich, weil unten die Heldenleiste sitzt. */
  /** Maus in der Ego-Sicht: drehen (dx) und hoch/runter schauen (dy), in Pixeln. */
  look(dx: number, dy: number): void {
    this.yaw = (this.yaw + dx * LOOK_SENSITIVITY) % (Math.PI * 2);
    this.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, this.pitch - dy * LOOK_SENSITIVITY));
  }

  /** Blickrichtung der Ego-Sicht in Three-Koordinaten (Spiel x/y → Three x/z). */
  viewDirection(out = new THREE.Vector3()): THREE.Vector3 {
    const c = Math.cos(this.pitch);
    return out.set(Math.cos(this.yaw) * c, Math.sin(this.pitch), Math.sin(this.yaw) * c);
  }

  follow(x: number, y: number, dt: number): void {
    if (!this.following) return;
    // Übergang zwischen Schräg- und Ego-Sicht
    const goal = this.firstPerson ? 1 : 0;
    if (this.blend !== goal) this.blend = goal > this.blend ? Math.min(1, this.blend + dt / BLEND_TIME) : Math.max(0, this.blend - dt / BLEND_TIME);
    const heroX = x;
    const heroY = y;
    // Zoom weich nachführen
    const current = this.offset.length();
    if (Math.abs(current - this.targetDistance) > 0.01) {
      this.offset.setLength(current + (this.targetDistance - current) * (1 - Math.exp(-10 * dt)));
    }
    y += FOCUS_SOUTH * (this.offset.length() / DISTANCE);
    const k = 1 - Math.exp(-8 * dt);
    this.lookAt(this.focus.x + (x - this.focus.x) * k, this.focus.z + (y - this.focus.z) * k);
    if (this.blend <= 0) {
      this.setFov(TOP_FOV, 0.5);
      return;
    }
    // Ego-Pose: auf Augenhöhe am Helden, Blick nach yaw/pitch; dazwischen weich überblenden
    const cam = this.camera;
    this.topPos.copy(cam.position);
    this.topQuat.copy(cam.quaternion);
    this.eye.set(heroX, this.eyeHeight, heroY);
    cam.position.copy(this.eye);
    cam.lookAt(this.eye.clone().add(this.viewDirection()));
    const b = this.blend * this.blend * (3 - 2 * this.blend);
    if (b < 1) {
      cam.position.lerpVectors(this.topPos, this.eye, b);
      cam.quaternion.slerpQuaternions(this.topQuat, cam.quaternion.clone(), b);
    }
    this.setFov(TOP_FOV + (FP_FOV - TOP_FOV) * b, 0.5 - 0.4 * b);
  }

  private setFov(fov: number, near: number): void {
    const cam = this.camera;
    if (Math.abs(cam.fov - fov) < 0.01 && Math.abs(cam.near - near) < 0.001) return;
    cam.fov = fov;
    cam.near = near;
    cam.updateProjectionMatrix();
  }

  /** Ist die Ego-Sicht (ganz oder im Übergang) zu sehen? */
  get inFirstPerson(): boolean {
    return this.blend > 0.5;
  }

  /** Aktueller Abstand der Kamera zum Fokus (für Nebel). */
  get distance(): number {
    return this.offset.length() * (1 - this.blend);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
