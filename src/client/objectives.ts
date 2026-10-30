import * as THREE from 'three';
import type { ObjectiveDef, Objective } from '../sim/types';

const BEE_COUNT = 14;

/** Darstellung eines Ziels: Lebensmittelvorrat, Bienenstock (Kästen mit Bienen) oder Hochbeet. */
export class ObjectiveView {
  readonly group = new THREE.Group();
  private readonly bar = new THREE.Group();
  private readonly barFill: THREE.Mesh;
  private readonly core: THREE.Object3D;
  private readonly bees: THREE.Mesh[] = [];
  private readonly beeMaterial = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  private flash = 0;
  private readonly materials: THREE.MeshLambertMaterial[] = [];

  constructor(readonly def: ObjectiveDef) {
    this.group.position.set(def.x, 0, def.y);
    this.core = def.kind === 'hive' ? this.buildHive() : def.kind === 'bed' ? this.buildBed() : this.buildFood();
    this.group.add(this.core);

    const bed = def.kind === 'bed';
    const w = bed ? 1.6 : 3;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, 0.32), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    this.barFill = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 0.22).translate(w / 2, 0, 0),
      new THREE.MeshBasicMaterial({ color: def.kind === 'hive' ? 0xffc93c : def.kind === 'bed' ? 0x7bd36a : 0xff8c42 }),
    );
    this.barFill.position.set(-w / 2, 0, 0.01);
    this.bar.add(bg, this.barFill);
    this.bar.position.y = bed ? 1.6 : 3.6;
    if (bed) this.bar.visible = false;
    this.group.add(this.bar);
  }

  private lambert(color: number, emissive = 0x000000): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color, emissive });
    this.materials.push(material);
    return material;
  }

  /** Lebensmittelvorrat: Fässer, Kisten, Säcke und ein Korb Äpfel. */
  private buildFood(): THREE.Object3D {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, ry = 0) => {
      const m = new THREE.Mesh(geo, this.lambert(color));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const crate = new THREE.BoxGeometry(0.7, 0.6, 0.7);
    add(crate, 0xa0743f, -0.55, 0.3, -0.3, 0.2).name = 'wobble';
    add(crate, 0x8f6534, 0.2, 0.3, -0.55, -0.3).name = 'wobble';
    add(crate, 0xa0743f, -0.25, 0.9, -0.4, 0.5).name = 'wobble';
    const barrel = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 12);
    add(barrel, 0x7a5232, 0.65, 0.4, 0.25);
    add(barrel, 0x6b4a2b, 0.05, 0.4, 0.5);
    const sack = new THREE.SphereGeometry(0.32, 10, 8);
    add(sack, 0xd8c79a, -0.7, 0.28, 0.45).scale.set(1, 0.85, 1);
    add(sack, 0xcdbb8a, -0.35, 0.28, 0.75).scale.set(1, 0.85, 1);
    add(new THREE.CylinderGeometry(0.3, 0.22, 0.25, 12), 0x8a6a45, 0.75, 0.9, -0.3);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(new THREE.SphereGeometry(0.08, 6, 5), i % 2 ? 0xd9442b : 0x7fbf3f, 0.75 + Math.cos(a) * 0.12, 1.06, -0.3 + Math.sin(a) * 0.12);
    }
    return g;
  }

  /** Hochbeet: Holzkasten mit Erde, Pflanzen wachsen bzw. schrumpfen mit dem Leben. */
  private buildBed(): THREE.Object3D {
    const g = new THREE.Group();
    const w = this.def.w ?? 2;
    const h = this.def.h ?? 1;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, h), this.lambert(0x7a5634));
    box.position.y = 0.3;
    box.castShadow = box.receiveShadow = true;
    const soil = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, h - 0.3).rotateX(-Math.PI / 2), this.lambert(0x4a3322));
    soil.position.y = 0.61;
    g.add(box, soil);
    const plants = new THREE.Group();
    plants.name = 'plants';
    const along = w >= h;
    const length = along ? w : h;
    const leaf = this.lambert(0x5fa83f);
    for (let t = 0.6; t < length - 0.3; t += 1.1) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), leaf);
      const o = -length / 2 + t;
      p.position.set(along ? o : 0, 0.8, along ? 0 : o);
      p.castShadow = true;
      plants.add(p);
    }
    g.add(plants);
    return g;
  }

  private buildHive(): THREE.Object3D {
    const g = new THREE.Group();
    const box = (x: number, z: number, y: number, color: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.95), this.lambert(color));
      b.position.set(x, y + 0.375, z);
      b.castShadow = b.receiveShadow = true;
      g.add(b);
    };
    box(-0.55, 0, 0, 0xf2e3b3);
    box(0.55, 0, 0, 0xe8c66a);
    box(0, 0, 0.75, 0xf0d58c);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 1.15), this.lambert(0x8a6a45));
    lid.position.set(0, 1.56, 0);
    lid.castShadow = true;
    g.add(lid);
    const geometry = new THREE.SphereGeometry(0.08, 6, 4);
    for (let i = 0; i < BEE_COUNT; i++) {
      const bee = new THREE.Mesh(geometry, this.beeMaterial);
      this.bees.push(bee);
      this.group.add(bee);
    }
    return g;
  }

  /** Bienen und Kristall animieren, Lebensbalken nachführen. */
  update(obj: Objective, time: number, angry: boolean, camera: THREE.Camera, dt: number): void {
    this.bar.quaternion.copy(camera.quaternion);
    this.barFill.scale.x = Math.max(0.001, obj.hp / obj.maxHp);
    this.bar.visible = !obj.destroyed;

    this.flash = Math.max(0, this.flash - dt * 5);
    for (const material of this.materials) material.emissiveIntensity = 1 + this.flash * 2;

    if (this.def.kind === 'hive') {
      this.core.rotation.z = obj.destroyed ? 0.35 : 0;
      this.core.position.y = obj.destroyed ? -0.3 : 0;
      this.beeMaterial.color.set(angry ? 0xff3b30 : 0xffd23f);
      const speed = angry ? 3.2 : 1.2;
      const radius = angry ? 3 : 1.7;
      this.bees.forEach((bee, i) => {
        bee.visible = !obj.destroyed;
        const a = time * speed * (1 + (i % 3) * 0.25) + (i * Math.PI * 2) / BEE_COUNT;
        const r = radius + Math.sin(time * 2 + i) * 0.4;
        bee.position.set(Math.cos(a) * r, 1 + ((i * 0.37) % 1) + Math.sin(time * 3 + i) * 0.2, Math.sin(a) * r);
      });
    } else if (this.def.kind === 'bed') {
      // Pflanzen schrumpfen mit dem Leben; zerstört: nur noch Erde
      const plants = this.core.getObjectByName('plants')!;
      plants.visible = !obj.destroyed;
      const k = 0.25 + 0.75 * (obj.hp / obj.maxHp);
      plants.scale.set(k, k, k);
      this.bar.visible = !obj.destroyed && obj.hp < obj.maxHp;
    } else {
      // Vorrat: Kisten wackeln kurz, wenn geplündert wird
      for (const c of this.core.children) if (c.name === 'wobble') c.rotation.z = Math.sin(time * 40) * 0.08 * this.flash;
      this.core.visible = !obj.destroyed;
    }
  }

  hit(): void {
    this.flash = 1;
  }
}
