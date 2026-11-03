import * as THREE from 'three';

/**
 * Detaillierte Waffen und Werkzeuge der Helden und Bosse: gedrechselte Griffe
 * mit Wicklung, gefaste Metallköpfe, Holzmaserung und Metallglanz. Jede Waffe
 * wird nur einmal gebaut; Figuren bekommen eine Kopie, die Geometrie und
 * Material teilt (spart Speicher und Zeichenaufrufe). Ein Objekt „tip“ markiert
 * die Schlagkante für die Bewegungsspur (WeaponTrail).
 *
 * Maße in Metern, die Hand hält bei y = 0, die Waffe zeigt nach +y.
 */
export type WeaponKind = 'hammer' | 'axe' | 'rollingpin' | 'staff' | 'harpoongun' | 'broom' | 'handbell' | 'cleaver' | 'scythe' | 'shovel' | 'hook' | 'sling';

export const WEAPON_KINDS: readonly WeaponKind[] = ['hammer', 'axe', 'rollingpin', 'staff', 'harpoongun', 'broom', 'handbell', 'cleaver', 'scythe', 'shovel', 'hook', 'sling'];

// ---------- Texturen (im Code erzeugt) ----------

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Holzmaserung: Längsfasern mit Astlöchern. */
function woodTexture(base: string, dark: string): THREE.Texture | null {
  return canvasTexture(64, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${dark},${0.15 + Math.random() * 0.35})`;
      g.lineWidth = 0.5 + Math.random() * 1.5;
      const x = Math.random() * 64;
      g.beginPath();
      g.moveTo(x, 0);
      for (let y = 0; y <= 256; y += 16) g.lineTo(x + Math.sin(y * 0.05 + i) * 2.5, y);
      g.stroke();
    }
    for (let k = 0; k < 2; k++) {
      g.fillStyle = `rgba(${dark},0.55)`;
      g.beginPath();
      g.ellipse(10 + Math.random() * 44, 40 + Math.random() * 180, 3, 7, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Gebürstetes Metall mit feinen Kratzern. */
function metalTexture(): THREE.Texture | null {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#b8bcc2';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) {
      const v = 150 + Math.floor(Math.random() * 90);
      g.strokeStyle = `rgba(${v},${v},${v + 6},0.35)`;
      g.lineWidth = 0.6;
      const y = Math.random() * 128;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(128, y + (Math.random() - 0.5) * 3);
      g.stroke();
    }
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = 'rgba(60,60,64,0.35)';
      g.beginPath();
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20);
      g.stroke();
    }
  });
}

/** Lederwicklung: diagonale Bänder. */
function wrapTexture(): THREE.Texture | null {
  return canvasTexture(64, 64, (g) => {
    g.fillStyle = '#4a2f1c';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(20,10,5,0.8)';
    g.lineWidth = 3;
    for (let i = -64; i < 128; i += 12) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 64, 64);
      g.stroke();
    }
    g.strokeStyle = 'rgba(140,100,60,0.35)';
    g.lineWidth = 1;
    for (let i = -60; i < 128; i += 12) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 64, 64);
      g.stroke();
    }
  });
}

// ---------- Materialien (geteilt) ----------

let envMap: THREE.Texture | null = null;
/**
 * Spiegel-Umgebung für Metall (vom Renderer einmal erzeugt, z. B. RoomEnvironment).
 * Ohne sie wirkt Metall in der Nacht fast schwarz.
 */
export function setWeaponEnvironment(env: THREE.Texture): void {
  envMap = env;
  if (!mats) return;
  for (const m of Object.values(mats)) {
    m.envMap = env;
    m.needsUpdate = true;
  }
}

let mats: Record<string, THREE.MeshStandardMaterial> | null = null;
function materials(): Record<string, THREE.MeshStandardMaterial> {
  if (mats) return mats;
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const wood = woodTexture('#7a5230', '40,22,10');
  const lightWood = woodTexture('#d2aa74', '120,80,40');
  const darkWood = woodTexture('#4e3420', '20,10,4');
  const metal = metalTexture();
  const wrap = wrapTexture();
  mats = {
    wood: std({ color: 0xffffff, map: wood, roughness: 0.75, metalness: 0 }),
    lightWood: std({ color: 0xffffff, map: lightWood, roughness: 0.7, metalness: 0 }),
    darkWood: std({ color: 0xffffff, map: darkWood, roughness: 0.8, metalness: 0 }),
    steel: std({ color: 0xd0d4da, map: metal, roughness: 0.32, metalness: 0.55 }),
    edge: std({ color: 0xf4f6fa, roughness: 0.18, metalness: 0.6 }),
    iron: std({ color: 0x55585e, map: metal, roughness: 0.55, metalness: 0.5 }),
    brass: std({ color: 0xd4a640, roughness: 0.3, metalness: 0.65 }),
    leather: std({ color: 0xffffff, map: wrap, roughness: 0.9, metalness: 0 }),
    rope: std({ color: 0xa48a5c, roughness: 1, metalness: 0 }),
    soot: std({ color: 0x1b1b1d, roughness: 1, metalness: 0 }),
    rubber: std({ color: 0x8a3a22, roughness: 0.8, metalness: 0 }),
    gem: std({ color: 0x9fe3ff, emissive: 0x3aa0ff, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.1 }),
    moon: std({ color: 0xfff4c8, emissive: 0xffd86a, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.2 }),
  };
  for (const m of Object.values(mats)) {
    m.envMap = envMap;
    m.envMapIntensity = m.metalness > 0.3 ? 1.1 : 0.4;
  }
  return mats;
}

// ---------- Formen ----------

/** Gedrechselter Körper aus einem Profil [Radius, Höhe] (Drehung um y). */
function lathe(profile: [number, number][], segments = 14): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** Flache Form mit Fase (Klingen, Axtblätter), Dicke entlang z, mittig. */
function extrude(shape: THREE.Shape, depth: number, bevel = 0.008): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Griff mit Knauf, Wicklung und leichter Verjüngung. */
function handle(length: number, r = 0.022): THREE.BufferGeometry {
  return lathe([
    [0, -0.04],
    [r * 1.5, -0.035],
    [r * 1.5, -0.015],
    [r, 0],
    [r * 0.92, length * 0.5],
    [r * 1.05, length * 0.97],
    [r * 1.1, length],
    [0, length],
  ]);
}

function add(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.userData.sharedGeometry = true;
  m.userData.sharedMaterial = true;
  g.add(m);
  return m;
}

function tip(g: THREE.Group, x: number, y: number, z = 0): void {
  const t = new THREE.Object3D();
  t.name = 'tip';
  t.position.set(x, y, z);
  g.add(t);
}

/** Lederwicklung als kurzer Zylinder über dem Griff. */
function wrap(g: THREE.Group, from: number, to: number, r: number): void {
  const m = add(g, new THREE.CylinderGeometry(r, r, to - from, 12, 1, true), materials().leather, 0, (from + to) / 2, 0);
  (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
}

function build(kind: WeaponKind): THREE.Group {
  const M = materials();
  const g = new THREE.Group();
  g.name = `weapon-${kind}`;
  switch (kind) {
    case 'hammer': {
      // Vorschlaghammer: langer Holzstiel mit Wicklung, eiserner Kopf mit Fasen und Bändern
      add(g, handle(1.05, 0.026), M.wood);
      wrap(g, 0.02, 0.28, 0.029);
      const head = new THREE.Shape();
      const w = 0.13;
      const h = 0.21;
      const c = 0.03;
      head.moveTo(-w + c, -h);
      head.lineTo(w - c, -h);
      head.lineTo(w, -h + c);
      head.lineTo(w, h - c);
      head.lineTo(w - c, h);
      head.lineTo(-w + c, h);
      head.lineTo(-w, h - c);
      head.lineTo(-w, -h + c);
      head.closePath();
      const hm = add(g, extrude(head, 0.2, 0.015), M.iron, 0, 0.98, 0);
      hm.rotation.z = Math.PI / 2;
      for (const y of [-0.15, 0.15]) add(g, new THREE.BoxGeometry(0.045, 0.235, 0.235), M.steel, y, 0.98, 0);
      for (const y of [-0.215, 0.215]) add(g, new THREE.BoxGeometry(0.015, 0.2, 0.2), M.edge, y, 0.98, 0);
      tip(g, 0, 1.05, 0);
      break;
    }
    case 'axe': {
      // Holzfälleraxt: geschwungener Stiel, bärtiges Blatt mit heller Schneide
      add(g, handle(0.78, 0.022), M.wood);
      wrap(g, 0.02, 0.2, 0.025);
      const blade = new THREE.Shape();
      blade.moveTo(0, 0.05);
      blade.quadraticCurveTo(0.1, 0.06, 0.2, 0.14);
      blade.quadraticCurveTo(0.24, 0.0, 0.2, -0.16);
      blade.quadraticCurveTo(0.1, -0.08, 0.02, -0.06);
      blade.lineTo(-0.05, -0.04);
      blade.lineTo(-0.05, 0.04);
      blade.closePath();
      const b = add(g, extrude(blade, 0.03, 0.006), M.steel, 0, 0.66, 0);
      b.rotation.y = -Math.PI / 2;
      b.scale.setScalar(1.35);
      const edge = new THREE.Shape();
      edge.moveTo(0.19, 0.135);
      edge.quadraticCurveTo(0.235, 0.0, 0.19, -0.155);
      edge.lineTo(0.205, -0.16);
      edge.quadraticCurveTo(0.25, 0.0, 0.205, 0.14);
      edge.closePath();
      const e = add(g, extrude(edge, 0.034, 0.002), M.edge, 0, 0.66, 0);
      e.rotation.y = -Math.PI / 2;
      e.scale.setScalar(1.35);
      add(g, new THREE.BoxGeometry(0.07, 0.09, 0.06), M.iron, 0, 0.66, -0.03);
      tip(g, 0, 0.66, 0.3);
      break;
    }
    case 'rollingpin': {
      // Nudelholz: gedrechselte Rolle mit zwei Griffen
      add(
        g,
        lathe([
          [0, -0.12],
          [0.018, -0.12],
          [0.022, -0.1],
          [0.016, -0.04],
          [0.014, 0.02],
          [0.038, 0.03],
          [0.04, 0.05],
          [0.04, 0.37],
          [0.038, 0.39],
          [0.014, 0.4],
          [0.016, 0.46],
          [0.022, 0.52],
          [0.018, 0.54],
          [0, 0.54],
        ], 18),
        M.lightWood,
        0,
        -0.02,
        0,
      );
      tip(g, 0, 0.36, 0);
      break;
    }
    case 'staff': {
      // Somnias Traumstab: gedrehtes Holz, Mondsichel und leuchtender Kristall
      const pts: [number, number][] = [[0, -0.4]];
      for (let i = 0; i <= 20; i++) pts.push([0.022 + Math.sin(i * 1.3) * 0.004 + (i === 4 || i === 15 ? 0.008 : 0), -0.4 + i * 0.075]);
      pts.push([0.03, 1.12], [0, 1.14]);
      add(g, lathe(pts, 10), M.darkWood);
      const moon = new THREE.Shape();
      moon.absarc(0, 0, 0.13, Math.PI * 0.15, Math.PI * 1.85, false);
      moon.absarc(0.05, 0, 0.1, Math.PI * 1.75, Math.PI * 0.25, true);
      add(g, extrude(moon, 0.025, 0.006), M.moon, 0, 1.25, 0);
      add(g, new THREE.OctahedronGeometry(0.06, 1), M.gem, -0.01, 1.25, 0);
      add(g, new THREE.TorusGeometry(0.03, 0.008, 6, 14), M.brass, 0, 1.12, 0).rotation.x = Math.PI / 2;
      tip(g, 0, 1.25, 0);
      break;
    }
    case 'harpoongun': {
      // Harpunengewehr: Holzschaft, Messingbeschläge, Lauf, Widerhaken-Spitze
      add(g, new THREE.BoxGeometry(0.05, 0.3, 0.08), M.wood, 0, 0.0, -0.02);
      add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.75, 12), M.iron, 0, 0.42, 0).updateMatrix();
      for (const y of [0.12, 0.45, 0.76]) add(g, new THREE.TorusGeometry(0.034, 0.008, 6, 14), M.brass, 0, y, 0).rotation.x = Math.PI / 2;
      add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6), M.steel, 0, 0.96, 0);
      add(g, lathe([[0, 1.28], [0.035, 1.2], [0.012, 1.19], [0, 1.19]], 8), M.edge, 0, 0, 0);
      for (const a of [0, Math.PI]) {
        const barb = add(g, new THREE.ConeGeometry(0.012, 0.07, 5), M.edge, Math.cos(a) * 0.03, 1.17, Math.sin(a) * 0.03);
        barb.rotation.z = Math.cos(a) * 2.6;
      }
      add(g, new THREE.TorusGeometry(0.04, 0.007, 5, 10, Math.PI), M.iron, 0, 0.08, 0.05);
      tip(g, 0, 1.26, 0);
      break;
    }
    case 'broom': {
      // Kaminbesen: geflochtenes Seil, Kugelgewicht, runde Rußbürste mit Borsten
      for (let i = 0; i < 7; i++) add(g, new THREE.TorusGeometry(0.014, 0.006, 5, 8), M.rope, 0, 0.02 + i * 0.05, 0).rotation.x = Math.PI / 2 + (i % 2) * 0.5;
      add(g, new THREE.SphereGeometry(0.05, 12, 10), M.iron, 0, -0.1, 0);
      add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6), M.iron, 0, 0.42, 0);
      // Borsten als Sternform rund um die Achse
      const bristles = new THREE.Group();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const b = add(bristles, new THREE.ConeGeometry(0.018, 0.16, 4), M.soot, Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07);
        b.rotation.z = -Math.cos(a) * Math.PI / 2;
        b.rotation.x = Math.sin(a) * Math.PI / 2;
      }
      bristles.position.y = 0.5;
      g.add(bristles);
      add(g, new THREE.SphereGeometry(0.06, 10, 8), M.soot, 0, 0.5, 0);
      tip(g, 0, 0.5, 0);
      break;
    }
    case 'handbell': {
      // Handglocke: gedrechselter Griff, geschwungener Messingmantel, Klöppel
      add(g, lathe([[0, 0], [0.014, 0], [0.02, 0.03], [0.016, 0.08], [0.024, 0.11], [0, 0.12]], 12), M.darkWood);
      add(
        g,
        lathe([[0.012, 0.12], [0.03, 0.13], [0.045, 0.17], [0.06, 0.22], [0.085, 0.26], [0.09, 0.27], [0.07, 0.268], [0, 0.26]], 20),
        M.brass,
      );
      add(g, new THREE.SphereGeometry(0.018, 8, 6), M.iron, 0, 0.27, 0);
      tip(g, 0, 0.26, 0);
      break;
    }
    case 'cleaver': {
      // Hackbeil: breite Klinge mit Loch, Holzgriff mit Nieten
      add(g, handle(0.2, 0.02), M.darkWood);
      const blade = new THREE.Shape();
      blade.moveTo(-0.02, 0.18);
      blade.lineTo(0.2, 0.2);
      blade.quadraticCurveTo(0.23, 0.32, 0.2, 0.44);
      blade.lineTo(-0.02, 0.44);
      blade.closePath();
      const hole = new THREE.Path();
      hole.absarc(0.16, 0.4, 0.018, 0, Math.PI * 2, true);
      blade.holes.push(hole);
      const b = add(g, extrude(blade, 0.018, 0.004), M.steel, 0, 0, 0);
      b.rotation.y = -Math.PI / 2;
      for (const y of [0.06, 0.13]) add(g, new THREE.SphereGeometry(0.008, 6, 4), M.brass, 0.02, y, 0);
      tip(g, 0, 0.32, 0.2);
      break;
    }
    case 'scythe': {
      // Sense: geschwungener Stiel mit zwei Griffen, lange gebogene Klinge
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0.04, 0.3, 0), new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(-0.05, 1.5, 0)]);
      add(g, new THREE.TubeGeometry(curve, 24, 0.022, 8), M.wood);
      for (const y of [0.2, 0.75]) add(g, new THREE.CylinderGeometry(0.014, 0.014, 0.16, 6), M.wood, 0.08, y, 0).rotation.z = Math.PI / 2;
      const blade = new THREE.Shape();
      blade.moveTo(0, 0);
      blade.quadraticCurveTo(0.35, 0.12, 0.7, -0.05);
      blade.quadraticCurveTo(0.38, 0.04, 0, -0.06);
      blade.closePath();
      const b = add(g, extrude(blade, 0.012, 0.003), M.steel, -0.05, 1.48, 0);
      b.rotation.y = -Math.PI / 2;
      tip(g, -0.05, 1.45, 0.55);
      break;
    }
    case 'shovel': {
      // Schaufel: Stiel mit D-Griff, gewölbtes Blatt mit Mittelgrat
      add(g, handle(1.0, 0.022), M.wood);
      add(g, new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), M.wood, 0, -0.04, 0).rotation.z = Math.PI;
      const blade = new THREE.Shape();
      blade.moveTo(-0.11, 0);
      blade.lineTo(0.11, 0);
      blade.lineTo(0.12, 0.2);
      blade.quadraticCurveTo(0, 0.34, -0.12, 0.2);
      blade.closePath();
      add(g, extrude(blade, 0.012, 0.004), M.iron, 0, 1.0, 0);
      add(g, new THREE.CylinderGeometry(0.03, 0.025, 0.1, 10), M.iron, 0, 1.0, 0);
      tip(g, 0, 1.25, 0);
      break;
    }
    case 'hook': {
      // Piratenhaken: Lederstulpe, Messingring, polierter Haken
      add(g, lathe([[0, -0.05], [0.06, -0.05], [0.055, 0.04], [0.04, 0.06], [0, 0.06]], 14), M.leather);
      add(g, new THREE.TorusGeometry(0.04, 0.01, 6, 14), M.brass, 0, 0.06, 0).rotation.x = Math.PI / 2;
      add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), M.steel, 0, 0.11, 0);
      const hook = add(g, new THREE.TorusGeometry(0.06, 0.012, 8, 16, Math.PI * 1.3), M.edge, 0.06, 0.16, 0);
      hook.rotation.z = Math.PI * 0.85;
      tip(g, 0.1, 0.2, 0);
      break;
    }
    case 'sling': {
      // Schleuder: Astgabel mit Gummiband und Lederschlaufe
      add(g, handle(0.12, 0.016), M.wood);
      for (const s of [-1, 1]) {
        const arm = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.11, 0), new THREE.Vector3(s * 0.03, 0.16, 0), new THREE.Vector3(s * 0.045, 0.22, 0)]);
        add(g, new THREE.TubeGeometry(arm, 8, 0.012, 6), M.wood);
      }
      add(g, new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4), M.rubber, 0, 0.22, 0).rotation.z = Math.PI / 2;
      add(g, new THREE.BoxGeometry(0.03, 0.02, 0.012), M.leather, 0, 0.22, 0.01);
      tip(g, 0, 0.22, 0);
      break;
    }
  }
  return g;
}

const cache = new Map<WeaponKind, THREE.Group>();

/** Waffe als Kopie (teilt Geometrie und Material mit allen anderen). */
export function weaponMesh(kind: WeaponKind): THREE.Group {
  let proto = cache.get(kind);
  if (!proto) {
    proto = build(kind);
    cache.set(kind, proto);
  }
  return proto.clone();
}

export function isWeapon(prop: string): prop is WeaponKind {
  return (WEAPON_KINDS as readonly string[]).includes(prop);
}

// ---------- Bewegungsspur ----------

const TRAIL_SAMPLES = 12;

/**
 * Leuchtender Bogen hinter der Waffe beim Zuschlagen: speichert die letzten
 * Positionen von Spitze und Mitte (Weltkoordinaten) und spannt daraus ein
 * Band, das zum Ende hin ausblendet (additiv, ohne Licht).
 */
export class WeaponTrail {
  readonly mesh: THREE.Mesh;
  private readonly tips: THREE.Vector3[] = [];
  private readonly bases: THREE.Vector3[] = [];
  private readonly positions = new Float32Array(TRAIL_SAMPLES * 2 * 3);
  private readonly colors = new Float32Array(TRAIL_SAMPLES * 2 * 3);
  private readonly color: THREE.Color;
  private fade = 0;

  constructor(color: THREE.ColorRepresentation, private readonly tip: THREE.Object3D, private readonly base: THREE.Object3D) {
    this.color = new THREE.Color(color);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_SAMPLES - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
  }

  /** Jedes Bild: active = gerade wird zugeschlagen. */
  update(active: boolean, dt: number): void {
    this.fade = active ? 1 : Math.max(0, this.fade - dt * 6);
    if (this.fade <= 0) {
      this.tips.length = 0;
      this.bases.length = 0;
      this.mesh.visible = false;
      return;
    }
    const t = this.tip.getWorldPosition(new THREE.Vector3());
    const b = this.base.getWorldPosition(new THREE.Vector3()).lerp(t, 0.45);
    this.tips.unshift(t);
    this.bases.unshift(b);
    if (this.tips.length > TRAIL_SAMPLES) {
      this.tips.length = TRAIL_SAMPLES;
      this.bases.length = TRAIL_SAMPLES;
    }
    const n = this.tips.length;
    for (let i = 0; i < TRAIL_SAMPLES; i++) {
      const k = Math.min(i, n - 1);
      this.tips[k].toArray(this.positions, i * 6);
      this.bases[k].toArray(this.positions, i * 6 + 3);
      const a = Math.max(0, 1 - i / (TRAIL_SAMPLES - 1)) * this.fade * 0.85;
      this.colors.set([this.color.r * a, this.color.g * a, this.color.b * a], i * 6);
      this.colors.set([this.color.r * a * 0.2, this.color.g * a * 0.2, this.color.b * a * 0.2], i * 6 + 3);
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    this.mesh.visible = n > 1;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
