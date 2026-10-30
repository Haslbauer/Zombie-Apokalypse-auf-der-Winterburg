import * as THREE from 'three';
import type { AbilityDef } from '../sim/types';
import type { Vec2 } from '../sim/vec';

/**
 * Vorschau beim Halten einer Fähigkeitstaste: Reichweite um den Helden und
 * die Wirkfläche am Zielpunkt (Kreis, Kegel, Linie).
 */
export class AbilityPreview {
  private readonly group = new THREE.Group();
  private readonly rangeRing: THREE.Mesh;
  private shape: THREE.Mesh | null = null;
  private current: AbilityDef | null = null;
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x7fd1ff, transparent: true, opacity: 0.28, depthWrite: false });

  constructor(scene: THREE.Scene) {
    this.rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7fd1ff, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    this.group.add(this.rangeRing);
    this.group.visible = false;
    this.group.renderOrder = 2;
    scene.add(this.group);
  }

  hide(): void {
    this.group.visible = false;
    this.current = null;
  }

  show(ability: AbilityDef, hero: Vec2, heroRadius: number, aim: Vec2, ballPos?: Vec2): void {
    if (this.current !== ability) this.build(ability, heroRadius);
    this.group.visible = true;
    this.group.position.set(hero.x, 0.06, hero.y);
    this.rangeRing.visible = ability.range > 0;
    this.rangeRing.scale.setScalar(Math.max(0.01, ability.range + heroRadius));

    const dx = aim.x - hero.x;
    const dy = aim.y - hero.y;
    const d = Math.hypot(dx, dy);
    const facing = Math.atan2(dy, dx);
    const reach = Math.min(d, ability.range);
    if (!this.shape) return;
    if (ability.shape === 'circle' || ability.shape === 'dash' || ability.shape === 'target') {
      // Ziel am Mauszeiger (begrenzt), Schmetterball am Ball
      const at = ballPos && ability.range === 0 ? { x: ballPos.x - hero.x, y: ballPos.y - hero.y } : { x: (dx / (d || 1)) * reach, y: (dy / (d || 1)) * reach };
      this.shape.position.set(at.x, 0, at.y);
      this.shape.rotation.y = 0;
    } else {
      this.shape.position.set(0, 0, 0);
      this.shape.rotation.y = -facing;
    }
  }

  private build(ability: AbilityDef, heroRadius: number): void {
    if (this.shape) {
      this.group.remove(this.shape);
      this.shape.geometry.dispose();
    }
    this.current = ability;
    let geometry: THREE.BufferGeometry;
    switch (ability.shape) {
      case 'cone': {
        const arc = ((ability.arc ?? 60) * Math.PI) / 180;
        geometry = new THREE.RingGeometry(heroRadius, heroRadius + ability.range, 32, 1, -arc / 2, arc);
        break;
      }
      case 'line': {
        const w = ability.width ?? 0.6;
        geometry = new THREE.PlaneGeometry(ability.range, w).translate(heroRadius + ability.range / 2, 0, 0);
        break;
      }
      case 'circle':
        geometry = new THREE.CircleGeometry(ability.radius ?? 1, 40);
        break;
      case 'self':
        geometry = new THREE.CircleGeometry(ability.radius ?? heroRadius + 0.6, 40);
        break;
      default:
        geometry = new THREE.RingGeometry(0.5, 0.7, 24);
    }
    geometry.rotateX(-Math.PI / 2);
    this.shape = new THREE.Mesh(geometry, this.material);
    this.group.add(this.shape);
  }
}
