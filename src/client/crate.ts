import * as THREE from 'three';
import type { GameState } from '../sim/types';

const NEUTRAL = new THREE.Color(0xd8d2c0);
const NORTH = new THREE.Color(0x4aa8ff);
const SOUTH = new THREE.Color(0xff6a4a);
const CONTESTED = new THREE.Color(0xffd166);

/**
 * PvP „Kiste erobern“: Postboten-Kiste in der Mitte mit Eroberungsring.
 * Der Ring färbt sich nach dem Team, das sie hält (blau Nord, rot Süd, gelb
 * umkämpft) und pulsiert, solange gesammelt wird.
 */
export class CrateView {
  readonly group = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly light = new THREE.PointLight(0xffd9a0, 6, 9, 1.6);

  constructor(radius: number) {
    // Kiste: Holzbretter mit Metallkanten und einem Paketband
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.85 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x6e6e72, metalness: 0.6, roughness: 0.4 });
    const tape = new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.6 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.8), wood);
    box.position.y = 0.4;
    box.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.82, 0.16), tape);
    band.position.y = 0.4;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.08, 0.86), metal);
    lid.position.y = 0.82;
    this.group.add(box, band, lid);
    for (const x of [-0.55, 0.55])
      for (const z of [-0.4, 0.4]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.82, 0.06), metal);
        edge.position.set(x, 0.41, z);
        this.group.add(edge);
      }
    this.ringMat = new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.18, radius, 64), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.04;
    this.light.position.y = 2.2;
    this.group.add(this.ring, this.light);
  }

  update(state: GameState, time: number): void {
    const crate = state.pvp?.crate;
    this.group.visible = !!crate;
    if (!crate) return;
    this.group.position.set(crate.pos.x, 0, crate.pos.y);
    const color = crate.contested ? CONTESTED : crate.holder === 0 ? NORTH : crate.holder === 1 ? SOUTH : NEUTRAL;
    this.ringMat.color.copy(color);
    this.light.color.copy(color);
    const active = crate.holder !== null || crate.contested;
    this.ringMat.opacity = active ? 0.55 + Math.sin(time * 6) * 0.25 : 0.4;
    this.ring.scale.setScalar(active ? 1 + Math.sin(time * 3) * 0.02 : 1);
  }
}
