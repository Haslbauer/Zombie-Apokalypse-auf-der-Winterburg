import { readdirSync, readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { describe, expect, it } from 'vitest';

/**
 * Jede animierte Figur braucht genau ein Skelett, und die Animationen müssen
 * dessen Knochen bewegen. Sonst bleiben Teile der Figur (Kleidung, Haare …)
 * in der Grundpose stehen, und die Figur „gleitet“ nur.
 */
// props.glb und garden.glb enthalten unbewegte Deko-Modelle (eigene Tests unten)
const files = readdirSync('public/models').filter((f) => f.endsWith('.glb') && f !== 'props.glb' && f !== 'garden.glb' && f !== 'houses.glb');

describe('Modelle', () => {
  for (const file of files) {
    it(`${file}: ein Skelett, Animationen treffen es`, async () => {
      const doc = await new NodeIO().read(`public/models/${file}`);
      const root = doc.getRoot();
      const skins = root.listSkins();
      expect(skins.length).toBeGreaterThan(0);
      const joints = new Set(skins[0].listJoints());
      for (const s of skins) for (const j of s.listJoints()) expect(joints.has(j)).toBe(true);
      const names = root.listNodes().filter((n) => joints.has(n)).map((n) => n.getName());
      expect(new Set(names).size).toBe(names.length); // keine doppelten Knochen
      // Erlaubt sind Knochen und ihre Vorfahren (Tiere bewegen auch den Armature-Knoten)
      const ancestors = new Set<unknown>();
      for (const j of joints) for (let p = j.getParentNode(); p; p = p.getParentNode()) ancestors.add(p);
      for (const a of root.listAnimations()) {
        const targets = a.listChannels().map((c) => c.getTargetNode());
        expect(targets.filter((t) => t && joints.has(t)).length).toBeGreaterThan(0);
        expect(targets.every((t) => t && (joints.has(t) || ancestors.has(t)))).toBe(true);
      }
    });
  }

  it('props.glb: ein Knoten je Deko-Modell, alle Looks in der Karte bekannt', async () => {
    const cfg = JSON.parse(readFileSync('assets/props/props.json', 'utf8'));
    const keys = Object.keys(cfg).filter((k) => k !== '//');
    const doc = await new NodeIO().read('public/models/props.glb');
    const names = new Set(doc.getRoot().listNodes().map((n) => n.getName()));
    for (const k of keys) expect(names.has(k), k).toBe(true);
    const { MODEL_PROPS } = await import('../../src/client/propmodels');
    expect([...MODEL_PROPS].sort()).toEqual([...keys].sort());
    const { PROP_LOOKS } = await import('../../src/sim/types');
    for (const k of keys) expect((PROP_LOOKS as readonly string[]).includes(k), k).toBe(true);
  });

  it('garden.glb (Blender): Bienenstock, Bäume aller Arten, Gemüse, Beete und Schuppen mit Vertex-Farben', async () => {
    const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/models/garden.glb');
    const meshes = new Map(doc.getRoot().listNodes().filter((n) => n.getMesh()).map((n) => [n.getName(), n.getMesh()!]));
    const { MODEL_SPECIES } = await import('../../src/client/gardenmodels');
    const plants = ['cabbage', 'lettuce', 'tomato', 'pumpkin', 'leek', 'carrot'].map((k) => `plant_${k}`);
    const arena = JSON.parse(readFileSync('data/map.json', 'utf8'));
    const beds = arena.objectives.filter((o: { kind?: string }) => o.kind === 'bed').map((o: { w: number; h: number }) => `bed_${Math.round(Math.max(o.w, o.h) * 100)}x${Math.round(Math.min(o.w, o.h) * 100)}`);
    const sheds = arena.obstacles.filter((o: { look?: string }) => o.look === 'shed').map((o: { w: number; h: number }) => `shed_${Math.round(o.w * 100)}x${Math.round(o.h * 100)}`);
    const species = [...new Set(arena.obstacles.filter((o: { species?: string; look?: string }) => o.look === 'tree' && o.species).map((o: { species: string }) => o.species))] as string[];
    for (const sp of species) expect(MODEL_SPECIES.includes(sp), sp).toBe(true);
    const { OBSTACLE_MODELS } = await import('../../src/client/gardenmodels');
    const { MODEL_PROP_LOOKS } = await import('../../src/client/nightdecor');
    const scenery = [...MODEL_PROP_LOOKS, 'forest_oak_a', 'forest_oak_b', 'forest_oak_c', 'forest_pine_a', 'forest_pine_b', 'bush_a', 'bush_b', 'bush_c', 'hedge_seg', 'firebarrel', 'lamp_post', ...Object.values(OBSTACLE_MODELS).flatMap((m) => m.names)];
    const names = ['beehive', 'oak_a', 'oak_b', 'oak_c', 'pine_a', 'pine_b', ...MODEL_SPECIES.map((k) => `tree_${k}`), ...plants, ...beds.flatMap((b: string) => [b + '_a', b + '_b']), ...sheds, ...scenery];
    for (const name of names) {
      const mesh = meshes.get(name);
      expect(mesh, name).toBeTruthy();
      for (const prim of mesh!.listPrimitives()) expect(prim.getAttribute('COLOR_0'), name).toBeTruthy();
    }
    const { treeVariant } = await import('../../src/client/gardenmodels');
    for (let i = 0; i < 40; i++) expect(meshes.has(treeVariant(i * 3.7, i * 1.9))).toBe(true);
  });

  it('houses.glb (Blender): Häuser mit leuchtenden Fenstern, Ruine, Hofmauern mit Tor', async () => {
    const { houseKey } = await import('../../src/client/gardenmodels');
    const arena = JSON.parse(readFileSync('data/map.json', 'utf8'));
    const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/models/houses.glb');
    const names = new Set(doc.getRoot().listNodes().map((n) => n.getName()));
    const houses = arena.obstacles.filter((o: { look?: string; kind: string; w: number; h: number }) => o.look === 'house' && o.kind === 'rect' && Math.min(o.w, o.h) > 1.2);
    expect(houses.length).toBeGreaterThan(0);
    for (const o of houses) {
      expect(names.has(houseKey(o)), houseKey(o)).toBe(true);
      expect(names.has(houseKey(o) + '_glow'), houseKey(o) + '_glow').toBe(true);
    }
    // Ruine und Hofmauern mit Tor (eine Textur je Modell)
    const { buildingKey } = await import('../../src/client/gardenmodels');
    const ruins = arena.obstacles.filter((o: { look?: string }) => o.look === 'ruin');
    for (const o of ruins) expect(names.has(buildingKey('ruin', o)), buildingKey('ruin', o)).toBe(true);
    expect(names.has('courtyard')).toBe(true);
    expect(doc.getRoot().listTextures().length).toBe(houses.length + ruins.length + 1);
  });
});
