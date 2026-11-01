import * as THREE from 'three';

/**
 * Ego-Sicht: Hand und Waffe des eigenen Helden unten rechts im Bild (an der
 * Kamera befestigt). Einfache Formen je Held: Hammer, Pfote, Schleuder,
 * Volleyball, Haken, Sternenstab, Smoker, Goldbarren, Harpune.
 * Beim Angriff ein kurzer Schwung (Nahkampf) bzw. Rückstoß (Fernkampf),
 * beim Laufen schwingt sie leicht mit.
 */

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const SKIN = 0xd9a77f;

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

function cyl(r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, rz = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, 0, rz);
  return mesh;
}

function ball(r: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Hand mit Unterarm (Ärmel in der Farbe des Helden); Griffpunkt bei (0, 0, 0). */
function arm(sleeve: number, skin = SKIN, glove?: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.11, 0.1, 0.13, mat(glove ?? skin)));
  g.add(box(0.12, 0.12, 0.42, mat(sleeve), 0.0, -0.03, 0.27));
  return g;
}

type Build = (color: number) => { group: THREE.Group; melee: boolean };

const BUILDS: Record<string, Build> = {
  // Ragnar: Schmiedehammer
  rotschopf: (c) => {
    const g = arm(c);
    g.add(cyl(0.025, 0.5, mat(0x6b4a2a), 0, 0.2, 0));
    g.add(box(0.2, 0.12, 0.12, mat(0x5a5f66, { metalness: 0.6, roughness: 0.4 }), 0, 0.46, 0));
    return { group: g, melee: true };
  },
  // Grimm: Wolfspfote mit Krallen
  grimm: () => {
    const g = new THREE.Group();
    const fur = mat(0xe8e2d4, { roughness: 1 });
    g.add(box(0.16, 0.12, 0.5, fur, 0, -0.02, 0.22));
    g.add(ball(0.1, fur, 0, 0, -0.04));
    const claw = mat(0x2a2622);
    for (const x of [-0.06, -0.02, 0.02, 0.06]) g.add(new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.08, 6), claw).translateX(x).translateZ(-0.13).rotateX(-Math.PI / 2));
    return { group: g, melee: true };
  },
  // Hagedorn: Astgabel-Schleuder
  gaertnerin: (c) => {
    const g = arm(c);
    const wood = mat(0x7a5532);
    g.add(cyl(0.02, 0.2, wood, 0, 0.1, 0));
    g.add(cyl(0.016, 0.16, wood, -0.05, 0.25, 0, 0, 0.45));
    g.add(cyl(0.016, 0.16, wood, 0.05, 0.25, 0, 0, -0.45));
    g.add(box(0.13, 0.008, 0.008, mat(0x3a2a1a), 0, 0.31, 0.02));
    return { group: g, melee: false };
  },
  // Spike: Volleyball in der Hand
  libero: (c) => {
    const g = arm(c);
    g.add(ball(0.12, mat(0xf2f0e6), 0, 0.09, -0.02));
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.121, 0.008, 6, 20), mat(0x2f6fd6)).translateY(0.09).translateZ(-0.02));
    return { group: g, melee: false };
  },
  // Rauchbart: Enterhaken an der Kette
  pirat: (c) => {
    const g = arm(c, SKIN, 0x2a2420);
    const iron = mat(0x5c5c60, { metalness: 0.7, roughness: 0.35 });
    g.add(cyl(0.02, 0.18, iron, 0, 0.1, 0));
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 14, Math.PI * 1.3), iron).translateY(0.24).rotateZ(-0.6));
    return { group: g, melee: false };
  },
  // Somnia: Stab mit leuchtendem Stern
  schlaeferin: (c) => {
    const g = arm(c);
    g.add(cyl(0.02, 0.62, mat(0x3a2a5a), 0, 0.22, 0));
    g.add(ball(0.06, new THREE.MeshBasicMaterial({ color: 0x9fe3ff }), 0, 0.56, 0));
    return { group: g, melee: false };
  },
  // Imker: Smoker (Blechkanne mit Blasebalg)
  imker: (c) => {
    const g = arm(c, SKIN, 0xe6dcc0);
    const tin = mat(0xb8b8b0, { metalness: 0.6, roughness: 0.4 });
    g.add(cyl(0.07, 0.2, tin, 0, 0.12, -0.02));
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.09, 10), tin).translateY(0.26).translateZ(-0.02));
    g.add(box(0.1, 0.16, 0.03, mat(0x7a5532), 0, 0.1, 0.08));
    return { group: g, melee: false };
  },
  // Aurelius: Goldnugget in der Hand
  goldschmied: (c) => {
    const g = arm(c);
    g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.08), mat(0xffc83d, { metalness: 0.9, roughness: 0.25 })).translateY(0.08));
    return { group: g, melee: false };
  },
  // Lotte: Steinschleuder mit Band
  lotte: (c) => {
    const g = arm(c);
    const wood = mat(0xa0703a);
    g.add(cyl(0.02, 0.18, wood, 0, 0.09, 0));
    g.add(cyl(0.015, 0.14, wood, -0.045, 0.22, 0, 0, 0.4));
    g.add(cyl(0.015, 0.14, wood, 0.045, 0.22, 0, 0, -0.4));
    g.add(box(0.1, 0.01, 0.01, mat(0xd04a4a), 0, 0.28, 0.02));
    return { group: g, melee: false };
  },
  // Hedwig: Messing-Handglocke
  gloecknerin: (c) => {
    const g = arm(c);
    g.add(cyl(0.022, 0.16, mat(0x6b4a2b), 0, 0.08, 0));
    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 16, 1, true), mat(0xc9a24a, { metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }));
    bell.position.y = 0.24;
    g.add(bell, ball(0.025, mat(0x8a6a2a), 0, 0.16, 0));
    return { group: g, melee: false };
  },
  // Bruno: Holzfälleraxt
  foerster: (c) => {
    const g = arm(c, SKIN, 0x5a3a22);
    g.add(cyl(0.03, 0.62, mat(0x7a5532), 0, 0.25, 0));
    g.add(box(0.05, 0.16, 0.22, mat(0xa0a4a8, { metalness: 0.7, roughness: 0.35 }), 0, 0.5, -0.09));
    return { group: g, melee: true };
  },
  // Kasimir: Rußball in der Hand
  schornsteinfeger: (c) => {
    const g = arm(c, SKIN, 0x111114);
    g.add(ball(0.09, mat(0x1a1a1a, { roughness: 1 }), 0, 0.08, -0.01));
    return { group: g, melee: false };
  },
  // Frieda: Nudelholz
  baeckerin: (c) => {
    const g = arm(c);
    g.add(cyl(0.05, 0.46, mat(0xd8b080), 0, 0.3, 0));
    g.add(cyl(0.022, 0.12, mat(0xa07040), 0, 0.03, 0));
    return { group: g, melee: true };
  },
  // Kapitän Tiefe: Harpune (Messing und Holz)
  taucher: (c) => {
    const g = arm(c, SKIN, 0x3a3a34);
    const brass = mat(0xb8862f, { metalness: 0.7, roughness: 0.35 });
    g.add(cyl(0.035, 0.5, brass, 0, 0.02, -0.2, Math.PI / 2));
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 8), mat(0xc8c8c8, { metalness: 0.8 })).translateZ(-0.5).rotateX(-Math.PI / 2));
    g.add(box(0.05, 0.14, 0.08, mat(0x5a3a22), 0, -0.07, 0.02));
    return { group: g, melee: true };
  },
};

export class ViewModel {
  readonly group = new THREE.Group();
  private hero = '';
  private melee = true;
  private kickTime = Infinity;
  private kickLength = 0.3;
  private sway = 0;

  /** Rechts unten vor der Kamera. */
  private static readonly REST = new THREE.Vector3(0.36, -0.24, -0.62);

  constructor(camera: THREE.Camera) {
    camera.add(this.group);
    this.group.visible = false;
  }

  /** Modell für den Helden defId (Ärmel in seiner Farbe) aufbauen. */
  setHero(defId: string, color: string): void {
    if (this.hero === defId) return;
    this.hero = defId;
    this.group.clear();
    const build = BUILDS[defId] ?? BUILDS.rotschopf;
    const { group, melee } = build(new THREE.Color(color).getHex());
    this.melee = melee;
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        // immer vor der Welt zeichnen (keine Clipping-Probleme an Wänden)
        o.renderOrder = 10;
        (o.material as THREE.Material).depthTest = false;
      }
    });
    group.scale.setScalar(0.5);
    this.group.add(group);
  }

  /** Angriff: kurzer Schwung (Nahkampf) bzw. Rückstoß (Fernkampf), Dauer in s. */
  kick(duration = 0.3): void {
    this.kickTime = 0;
    this.kickLength = Math.max(0.15, Math.min(0.5, duration));
  }

  /** Jedes Bild: sichtbar?, Laufphase (Kopfwippen) und Tempoanteil 0..1. */
  update(visible: boolean, dt: number, bobPhase: number, moving: number): void {
    this.group.visible = visible && this.hero !== '';
    if (!this.group.visible) return;
    this.kickTime += dt;
    this.sway += (moving - this.sway) * Math.min(1, dt * 8);
    const t = Math.min(1, this.kickTime / this.kickLength);
    const k = t < 1 ? Math.sin(t * Math.PI) : 0;
    const p = ViewModel.REST;
    const swingX = Math.sin(bobPhase) * 0.02 * this.sway;
    const swingY = Math.abs(Math.cos(bobPhase)) * 0.018 * this.sway;
    this.group.position.set(p.x + swingX, p.y - swingY - (this.melee ? 0.04 : 0) * k, p.z + (this.melee ? -0.12 : 0.08) * k);
    // Nahkampf: nach vorne unten schlagen; Fernkampf: kurz hochreißen
    this.group.rotation.set(this.melee ? -1.1 * k + 0.25 : 0.35 * k + 0.15, -0.25, this.melee ? 0.5 * k : 0);
  }
}
