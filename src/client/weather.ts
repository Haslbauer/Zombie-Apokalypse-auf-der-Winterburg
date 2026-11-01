import * as THREE from 'three';
import type { WaveEventKind } from '../sim/types';

/**
 * Wetter der Wellen-Ereignisse: Nebelnacht (dichter Nebel), Blutmond (rotes
 * Licht und roter Himmel), Regen (fallende Tropfen um den Helden). Übergänge
 * werden weich überblendet, damit der Wechsel zu Wellenbeginn nicht springt.
 */
export class Weather {
  private readonly rain: THREE.LineSegments;
  private readonly drops: Float32Array;
  private readonly baseSky: THREE.Color;
  private readonly baseHemi: THREE.Color;
  private readonly baseSun: THREE.Color;
  private readonly red = new THREE.Color(0x5a0c0c);
  private readonly redLight = new THREE.Color(0xff3a2a);
  private readonly mist = new THREE.Color(0x586274);
  /** Überblendung 0..1 je Wirkung. */
  private fogMix = 0;
  private bloodMix = 0;
  private rainMix = 0;
  private static readonly COUNT = 900;
  private static readonly SIZE = 30;

  constructor(
    scene: THREE.Scene,
    private readonly fog: THREE.Fog,
    private readonly hemi: THREE.HemisphereLight,
    private readonly sun: THREE.DirectionalLight,
  ) {
    this.baseSky = (scene.background as THREE.Color).clone();
    this.baseHemi = hemi.color.clone();
    this.baseSun = sun.color.clone();
    this.sky = scene.background as THREE.Color;
    // Regen als kurze, schräge Striche (zwei Punkte je Tropfen)
    const n = Weather.COUNT;
    this.drops = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * Weather.SIZE;
      this.drops[i * 3 + 1] = Math.random() * 14;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * Weather.SIZE;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
  }

  private readonly sky: THREE.Color;

  /** Jedes Bild: Ereignis der laufenden Welle, Mittelpunkt (Held/Kamera) und Zeitschritt. */
  update(kind: WaveEventKind | null | undefined, cx: number, cz: number, dt: number): void {
    const k = Math.min(1, dt * 0.8);
    this.fogMix += ((kind === 'nebel' ? 1 : 0) - this.fogMix) * k;
    this.bloodMix += ((kind === 'blutmond' ? 1 : 0) - this.bloodMix) * k;
    this.rainMix += ((kind === 'regen' ? 1 : 0) - this.rainMix) * k;

    this.sky.copy(this.baseSky).lerp(this.red, this.bloodMix * 0.8).lerp(this.mist, this.fogMix * 0.9);
    this.fog.color.copy(this.sky);
    this.hemi.color.copy(this.baseHemi).lerp(this.redLight, this.bloodMix * 0.75);
    this.sun.color.copy(this.baseSun).lerp(this.redLight, this.bloodMix * 0.9);
    this.sun.intensity = 1.15 * (1 - this.rainMix * 0.3 - this.fogMix * 0.25);

    const mat = this.rain.material as THREE.LineBasicMaterial;
    mat.opacity = this.rainMix * 0.55;
    this.rain.visible = this.rainMix > 0.02;
    if (!this.rain.visible) return;
    const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const out = pos.array as Float32Array;
    const half = Weather.SIZE / 2;
    for (let i = 0; i < Weather.COUNT; i++) {
      const d = this.drops;
      d[i * 3 + 1] -= dt * 16;
      d[i * 3] -= dt * 2;
      if (d[i * 3 + 1] < 0) {
        d[i * 3 + 1] += 14;
        d[i * 3] = (Math.random() - 0.5) * Weather.SIZE;
        d[i * 3 + 2] = (Math.random() - 0.5) * Weather.SIZE;
      }
      if (d[i * 3] < -half) d[i * 3] += Weather.SIZE;
      const x = cx + d[i * 3];
      const y = d[i * 3 + 1];
      const z = cz + d[i * 3 + 2];
      out.set([x, y, z, x + 0.12, y + 0.7, z], i * 6);
    }
    pos.needsUpdate = true;
  }

  /** Nebel-Faktor für renderer.render: 0 = normal, 1 = volle Nebelnacht. */
  get fogAmount(): number {
    return this.fogMix;
  }
}
