import * as THREE from 'three';

/** Neigung der festen Schrägkamera gegen den Boden (LoL-artig, kein Drehen). */
const TILT_DEG = 55;
const DISTANCE = 34;
/** Grenzen für den Zoom mit dem Mausrad. */
const MIN_DISTANCE = 10;
const MAX_DISTANCE = 50;
/** So viele Meter südlich vom Helden liegt der Kamerafokus. */
const FOCUS_SOUTH = 2.5;

export class GameCamera {
  readonly camera: THREE.PerspectiveCamera;
  private offset: THREE.Vector3;
  private following = true;
  /** Zielabstand beim Zoomen; der tatsächliche Abstand gleitet weich dorthin. */
  private targetDistance = DISTANCE;
  private readonly focus = new THREE.Vector3();

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

  /** Weich zum Ziel nachführen. Der Fokus liegt etwas südlich, weil unten die Heldenleiste sitzt. */
  follow(x: number, y: number, dt: number): void {
    if (!this.following) return;
    // Zoom weich nachführen
    const current = this.offset.length();
    if (Math.abs(current - this.targetDistance) > 0.01) {
      this.offset.setLength(current + (this.targetDistance - current) * (1 - Math.exp(-10 * dt)));
    }
    y += FOCUS_SOUTH * (this.offset.length() / DISTANCE);
    const k = 1 - Math.exp(-8 * dt);
    this.lookAt(this.focus.x + (x - this.focus.x) * k, this.focus.z + (y - this.focus.z) * k);
  }

  /** Aktueller Abstand der Kamera zum Fokus (für Nebel). */
  get distance(): number {
    return this.offset.length();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
