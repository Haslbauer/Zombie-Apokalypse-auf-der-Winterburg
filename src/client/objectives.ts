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
    const kind = ['cabbage', 'lettuce', 'tomato', 'pumpkin', 'leek', 'carrot'][Math.abs(seed) % 6];
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
    // Gerippter Kürbis (einmal gebaut): Kugel mit 8 Rippen, oben und unten eingedellt
    const pumpkinGeo = (() => {
      const geo = new THREE.SphereGeometry(0.3, 24, 12);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        const phi = Math.atan2(v.z, v.x);
        const rib = 1 + 0.07 * Math.cos(phi * 8);
        const pole = 1 - 0.25 * Math.pow(Math.abs(v.y) / 0.3, 3);
        p.setXYZ(i, v.x * rib, v.y * pole, v.z * rib);
      }
      geo.computeVertexNormals();
      geo.scale(1.15, 0.78, 1.15);
      return geo;
    })();
    // Großes, gelapptes Blatt (Kürbis, Kohl)
    const lobedLeaf = (r: number) => {
      const shape = new THREE.Shape();
      for (let i = 0; i <= 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const rr = r * (0.75 + 0.25 * Math.abs(Math.sin(a * 2.5)));
        if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    };
    const rows = depth > 1.2 ? [-depth / 4, depth / 4] : [0];
    for (const z of rows) {
      for (let x = -length / 2 + 0.45; x < length / 2 - 0.3; x += kind === 'pumpkin' ? 1.4 : kind === 'leek' || kind === 'carrot' ? 0.32 : 0.7) {
        const jx = x + (rnd() - 0.5) * 0.12;
        switch (kind) {
          case 'cabbage': {
            // Kohlkopf: fester Kopf, darum offene, bläulich-grüne Außenblätter mit Adern
            P(new THREE.IcosahedronGeometry(0.17, 2), 0x9ac46a, jx, 0.8, z).scale.set(1, 0.9, 1);
            for (let i = 0; i < 6; i++) {
              const a = i * 1.05 + rnd() * 0.3;
              const leaf = P(lobedLeaf(0.18), i % 2 ? 0x5a8a5a : 0x6a9a62, jx + Math.cos(a) * 0.16, 0.72 + (i % 2) * 0.03, z + Math.sin(a) * 0.16);
              leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
            }
            break;
          }
          case 'lettuce':
            // Salat: krause, hellgrüne Blätter in Rosetten
            for (let i = 0; i < 7; i++) {
              const a = i * 0.9;
              const leaf = P(lobedLeaf(0.11), i % 2 ? 0x9ad86a : 0x7aba48, jx + Math.cos(a) * 0.08, 0.7 + rnd() * 0.06, z + Math.sin(a) * 0.08);
              leaf.rotation.set(Math.sin(a) * 0.9, a, -Math.cos(a) * 0.9);
            }
            break;
          case 'tomato': {
            // Tomaten: Stab, Pflanze, Rispen mit roten und noch grünen Früchten, gelbe Blüten
            P(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 4), 0x8a6a45, jx, 1.2, z);
            for (let k = 0; k < 3; k++) P(new THREE.IcosahedronGeometry(0.14, 1), 0x3f7a30, jx + (rnd() - 0.5) * 0.12, 0.85 + k * 0.25, z + (rnd() - 0.5) * 0.12).scale.set(1, 0.8, 1);
            for (let i = 0; i < 6; i++) P(new THREE.SphereGeometry(0.055, 8, 6), rnd() < 0.7 ? 0xd8302a : 0x8ab83a, jx + (rnd() - 0.5) * 0.28, 0.8 + rnd() * 0.5, z + (rnd() - 0.5) * 0.28);
            for (let i = 0; i < 3; i++) P(new THREE.IcosahedronGeometry(0.025, 0), 0xf2d040, jx + (rnd() - 0.5) * 0.25, 1.1 + rnd() * 0.25, z + (rnd() - 0.5) * 0.25);
            break;
          }
          case 'pumpkin': {
            // Kürbis: gerippt, mit gekrümmtem Stiel, Ranke und großen gelappten Blättern
            const shade = rnd() < 0.3 ? 0xd06a14 : 0xe8821e;
            const pk = P(pumpkinGeo, shade, jx, 0.84, z);
            pk.rotation.y = rnd() * 3;
            const st = P(new THREE.CylinderGeometry(0.025, 0.04, 0.14, 6), 0x5a6a2a, jx + 0.02, 1.08, z);
            st.rotation.z = 0.35;
            const vine = new THREE.CatmullRomCurve3([new THREE.Vector3(jx, 0.66, z), new THREE.Vector3(jx + 0.3, 0.68, z + 0.15), new THREE.Vector3(jx + 0.55, 0.66, z - 0.1)]);
            const v = new THREE.Mesh(new THREE.TubeGeometry(vine, 8, 0.015, 4), plantMats.get(0x4a7a2a) ?? this.lambert(0x4a7a2a));
            v.position.y = -0.62;
            plants.add(v);
            for (let i = 0; i < 4; i++) {
              const leaf = P(lobedLeaf(0.24), i % 2 ? 0x3f7a30 : 0x4f8a36, jx + (rnd() - 0.5) * 1.0, 0.68 + rnd() * 0.08, z + (rnd() - 0.5) * 0.45);
              leaf.rotation.set((rnd() - 0.5) * 0.4, rnd() * 3, (rnd() - 0.5) * 0.4);
            }
            break;
          }
          case 'carrot': {
            // Möhren: orange Schultern schauen aus der Erde, darüber fedriges Kraut
            P(new THREE.ConeGeometry(0.035, 0.08, 6).rotateX(Math.PI), 0xe8782a, jx, 0.64, z);
            for (let i = 0; i < 4; i++) {
              const frond = P(new THREE.ConeGeometry(0.035, 0.3, 4), 0x5aa63a, jx, 0.8, z);
              frond.rotation.set((rnd() - 0.5) * 0.7, i, (rnd() - 0.5) * 0.7);
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
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // Bienenbock: zwei Balken auf Ziegelsteinen
    const brick = this.lambert(0x8a4a38);
    const wood = this.lambert(0x6a4a2c);
    for (const x of [-0.9, 0.9]) for (const z of [-0.35, 0.35]) add(new THREE.BoxGeometry(0.22, 0.22, 0.12), brick, x, 0.11, z);
    for (const z of [-0.35, 0.35]) add(new THREE.BoxGeometry(2.3, 0.1, 0.12), wood, 0, 0.27, z);
    // Zwei Beuten aus gestapelten Zargen (unterschiedlich bemalt), Blechdeckel, Flugbrett mit Flugloch
    const hive = (x: number, colors: number[]) => {
      let y = 0.32;
      add(new THREE.BoxGeometry(0.78, 0.06, 0.78), this.lambert(0x5a3e24), x, y + 0.03, 0);
      y += 0.06;
      for (const c of colors) {
        const h = 0.3;
        add(new THREE.BoxGeometry(0.72, h, 0.72), this.lambert(c), x, y + h / 2, 0);
        // Griffleisten
        for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.2, 0.04, 0.04), wood, x + s * 0.38, y + h * 0.6, 0, false);
        y += h + 0.01;
      }
      // Blechdeckel mit Überstand und flachem Giebel
      add(new THREE.BoxGeometry(0.86, 0.06, 0.86), this.lambert(0x9aa0a6), x, y + 0.03, 0);
      const roof = add(new THREE.CylinderGeometry(0.5, 0.5, 0.86, 3, 1).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), this.lambert(0x8a9096), x, y + 0.12, 0);
      roof.scale.set(1, 0.28, 1);
      // Flugbrett und dunkles Flugloch vorne (Süden)
      const board = add(new THREE.BoxGeometry(0.6, 0.03, 0.22), this.lambert(0x8a6a45), x, 0.42, 0.45);
      board.rotation.x = 0.25;
      add(new THREE.BoxGeometry(0.42, 0.05, 0.02), this.lambert(0x111111), x, 0.43, 0.365, false);
    };
    hive(-0.55, [0xf2e3b3, 0xe8c66a, 0xf2e3b3]);
    hive(0.55, [0x9ec4d8, 0xf0f0e8]);
    // Ein paar Bienen auf den Flugbrettern und eine Wabe am Boden
    const dot = new THREE.SphereGeometry(0.03, 5, 4);
    for (let i = 0; i < 8; i++) add(dot, this.lambert(0xffc93c), (i % 2 ? 0.55 : -0.55) + (Math.sin(i * 7) * 0.2), 0.45, 0.45 + Math.cos(i * 3) * 0.06, false);
    const comb = add(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 6), this.lambert(0xe0a83a), 1.0, 0.02, 0.6, false);
    comb.rotation.y = 0.4;
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
