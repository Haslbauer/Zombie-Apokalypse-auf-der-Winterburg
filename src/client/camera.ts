import * as THREE from 'three';

/** Neigung der festen Schrägkamera gegen den Boden (LoL-artig, kein Drehen). */
const TILT_DEG = 55;
const DISTANCE = 34;

export class GameCamera {
  readonly camera: THREE.PerspectiveCamera;
  private offset: THREE.Vector3;
  private following = true;
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

  /** Übersicht über die ganze Karte (Entwicklermodus ?overview): weit weg, folgt nicht. */
  overview(x: number, y: number, distance: number): void {
    this.offset.setLength(distance);
    this.camera.far = distance * 3;
    this.camera.updateProjectionMatrix();
    this.following = false;
    this.lookAt(x, y);
  }

  /** Weich zum Ziel nachführen. */
  follow(x: number, y: number, dt: number): void {
    if (!this.following) return;
    const k = 1 - Math.exp(-8 * dt);
    this.lookAt(this.focus.x + (x - this.focus.x) * k, this.focus.z + (y - this.focus.z) * k);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
