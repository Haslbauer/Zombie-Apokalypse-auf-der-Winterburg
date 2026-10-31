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

  /**
   * Hochbeet: Kasten aus drei Lagen Brettern mit Eckpfosten und Abschlussbrett,
   * krümelige Erde und je nach Beet andere Pflanzen (Kohl, Salat, Tomaten an
   * Stäben, Kürbisse, Lauch). Die Pflanzen schrumpfen mit dem Leben des Beets.
   */
  private buildBed(): THREE.Object3D {
    const g = new THREE.Group();
    const w = this.def.w ?? 2;
    const h = this.def.h ?? 1;
    const along = w >= h;
    const length = along ? w : h;
    const depth = along ? h : w;
    let seed = [...this.def.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 9973;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const inner = new THREE.Group();
    if (!along) inner.rotation.y = Math.PI / 2;
    g.add(inner);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      m.receiveShadow = true;
      inner.add(m);
      return m;
    };
    // Bretter (3 Lagen, leicht unterschiedliche Holztöne, dunkle Fugen)
    const woods = [0x7a5634, 0x6e4c2e, 0x85603a].map((c) => this.lambert(c));
    for (let layer = 0; layer < 3; layer++) {
      const y = 0.1 + layer * 0.2;
      const mat = woods[(layer + Math.floor(rnd() * 3)) % 3];
      for (const side of [-1, 1]) {
        add(new THREE.BoxGeometry(length, 0.18, 0.06), mat, 0, y, side * (depth / 2 - 0.03));
        add(new THREE.BoxGeometry(0.06, 0.18, depth - 0.12), mat, side * (length / 2 - 0.03), y, 0);
      }
    }
    // Eckpfosten und Abschlussbrett
    const post = this.lambert(0x5a3c22);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.1, 0.72, 0.1), post, sx * (length / 2 - 0.05), 0.36, sz * (depth / 2 - 0.05));
    for (const side of [-1, 1]) add(new THREE.BoxGeometry(length + 0.08, 0.04, 0.14), post, 0, 0.66, side * (depth / 2 - 0.03), false);
    // Erde mit Krümeln
    const soilMat = this.lambert(0x3a2818);
    add(new THREE.BoxGeometry(length - 0.12, 0.04, depth - 0.12), soilMat, 0, 0.6, 0, false);
    const crumb = new THREE.DodecahedronGeometry(0.05, 0);
    const crumbMat = this.lambert(0x4a3322);
    for (let i = 0; i < length * 6; i++) add(crumb, crumbMat, (rnd() - 0.5) * (length - 0.3), 0.62, (rnd() - 0.5) * (depth - 0.3), false);

    // Pflanzen: Art nach Beet
    const plants = new THREE.Group();
    plants.name = 'plants';
    inner.add(plants);
    const kind = ['cabbage', 'lettuce', 'tomato', 'pumpkin', 'leek', 'cabbage'][Math.abs(seed) % 5];
    // Pflanzen wachsen vom Erdboden aus (Gruppe auf Erdhöhe, damit das Schrumpfen nicht im Kasten versinkt)
    plants.position.y = 0.62;
    const plantMats = new Map<number, THREE.MeshLambertMaterial>();
    const P = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
      if (!plantMats.has(color)) plantMats.set(color, this.lambert(color));
      const m = new THREE.Mesh(geo, plantMats.get(color)!);
      m.position.set(x, y - 0.62, z);
      m.castShadow = true;
      plants.add(m);
      return m;
    };
    const rows = depth > 1.2 ? [-depth / 4, depth / 4] : [0];
    for (const z of rows) {
      for (let x = -length / 2 + 0.45; x < length / 2 - 0.3; x += kind === 'pumpkin' ? 1.4 : kind === 'leek' ? 0.35 : 0.7) {
        const jx = x + (rnd() - 0.5) * 0.12;
        switch (kind) {
          case 'cabbage':
            P(new THREE.IcosahedronGeometry(0.2, 1), 0x6fa84a, jx, 0.78, z).scale.set(1, 0.85, 1);
            for (let i = 0; i < 4; i++) {
              const leaf = P(new THREE.SphereGeometry(0.17, 6, 4), 0x4f8a36, jx + Math.cos(i * 1.6) * 0.14, 0.7, z + Math.sin(i * 1.6) * 0.14);
              leaf.scale.set(1, 0.35, 1);
            }
            break;
          case 'lettuce':
            for (let i = 0; i < 5; i++) {
              const leaf = P(new THREE.SphereGeometry(0.13, 6, 4), i % 2 ? 0x8fcf5a : 0x7aba48, jx + (rnd() - 0.5) * 0.15, 0.72, z + (rnd() - 0.5) * 0.15);
              leaf.scale.set(1, 0.55, 1);
            }
            break;
          case 'tomato': {
            P(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 4), 0x8a6a45, jx, 1.15, z);
            P(new THREE.IcosahedronGeometry(0.22, 0), 0x3f7a30, jx, 1.0, z).scale.set(0.8, 1.6, 0.8);
            for (let i = 0; i < 3; i++) P(new THREE.SphereGeometry(0.06, 6, 4), 0xd8302a, jx + (rnd() - 0.5) * 0.25, 0.85 + rnd() * 0.4, z + (rnd() - 0.5) * 0.25);
            break;
          }
          case 'pumpkin': {
            const pk = P(new THREE.SphereGeometry(0.3, 10, 7), 0xe07a1f, jx, 0.82, z);
            pk.scale.set(1.15, 0.8, 1.15);
            P(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 5), 0x4a6a2a, jx, 1.08, z);
            for (let i = 0; i < 3; i++) {
              const leaf = P(new THREE.CircleGeometry(0.2, 6).rotateX(-Math.PI / 2), 0x4f8a36, jx + (rnd() - 0.5) * 0.9, 0.66, z + (rnd() - 0.5) * 0.4);
              leaf.rotation.y = rnd() * 3;
            }
            break;
          }
          default:
            P(new THREE.CylinderGeometry(0.035, 0.04, 0.5, 5), 0xd8e0c0, jx, 0.85, z);
            for (let i = 0; i < 3; i++) {
              const blade = P(new THREE.BoxGeometry(0.03, 0.45, 0.07), 0x5a8a3a, jx, 1.2, z);
              blade.rotation.set((rnd() - 0.5) * 0.6, i, (rnd() - 0.5) * 0.6);
            }
        }
      }
    }
    // Kleinkram: Schildchen am Kopfende, manchmal Gießkanne oder Harke
    const sign = add(new THREE.BoxGeometry(0.28, 0.16, 0.02), this.lambert(0xd8c8a0), -length / 2 + 0.25, 0.95, depth / 2 - 0.15, false);
    sign.rotation.x = -0.3;
    add(new THREE.BoxGeometry(0.02, 0.35, 0.02), post, -length / 2 + 0.25, 0.78, depth / 2 - 0.15, false);
    if (rnd() < 0.5) {
      const can = new THREE.Group();
      can.add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.28, 10), this.lambert(0x4f7a8a)));
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.35, 5), this.lambert(0x4f7a8a));
      spout.position.set(0.18, 0.08, 0);
      spout.rotation.z = -0.9;
      can.add(spout);
      can.position.set(length / 2 + 0.3, 0.14, depth / 2 - 0.1);
      inner.add(can);
    } else {
      const rake = add(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), post, length / 2 + 0.15, 0.7, 0, false);
      rake.rotation.z = 0.35;
    }

    // Zerstört: verdorrte, braune Stängel (ohne Bienenstock wachsen sie nicht nach)
    const withered = new THREE.Group();
    withered.name = 'withered';
    withered.visible = false;
    const stalk = new THREE.ConeGeometry(0.05, 0.6, 4);
    const dry = this.lambert(0x6b5332);
    for (let t = 0.4; t < length - 0.2; t += 0.55) {
      const s = new THREE.Mesh(stalk, dry);
      const o = -length / 2 + t;
      const side = ((t * 7) % 1) - 0.5;
      s.position.set(along ? o : side * (h - 0.4), 0.85, along ? side * (h - 0.4) : o);
      s.rotation.set(Math.sin(t * 5) * 0.6, 0, Math.cos(t * 3) * 0.6);
      withered.add(s);
    }
    g.add(withered);
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
  update(obj: Objective, time: number, angry: boolean, camera: THREE.Camera, dt: number, beds: { x: number; y: number }[] = []): void {
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
        // Jede dritte Biene pendelt (wenn nicht wütend) zu einem Beet und zurück
        if (!angry && beds.length > 0 && i % 3 === 0) {
          const bed = beds[(i / 3) % beds.length | 0];
          const t = (time * 0.12 + i * 0.37) % 1;
          const k = t < 0.5 ? t * 2 : 2 - t * 2; // hin und zurück
          const dx = bed.x - this.def.x;
          const dz = bed.y - this.def.y;
          bee.position.set(dx * k + Math.sin(time * 3 + i) * 0.3, 1.4 + Math.sin(k * Math.PI) * 1.2, dz * k + Math.cos(time * 2.5 + i) * 0.3);
          return;
        }
        // Ohne Beete: träge, hungrige Bienen
        const slow = beds.length === 0 ? 0.4 : 1;
        const a = time * speed * slow * (1 + (i % 3) * 0.25) + (i * Math.PI * 2) / BEE_COUNT;
        const r = radius + Math.sin(time * 2 + i) * 0.4;
        bee.position.set(Math.cos(a) * r, 1 + ((i * 0.37) % 1) + Math.sin(time * 3 + i) * 0.2, Math.sin(a) * r);
      });
    } else if (this.def.kind === 'bed') {
      // Pflanzen schrumpfen mit dem Leben; zerstört: nur noch Erde
      const plants = this.core.getObjectByName('plants')!;
      plants.visible = !obj.destroyed;
      this.core.getObjectByName('withered')!.visible = obj.destroyed;
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
