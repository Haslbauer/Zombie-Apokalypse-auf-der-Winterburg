import { readdirSync, readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';

/**
 * Jede animierte Figur braucht genau ein Skelett, und die Animationen müssen
 * dessen Knochen bewegen. Sonst bleiben Teile der Figur (Kleidung, Haare …)
 * in der Grundpose stehen, und die Figur „gleitet“ nur.
 */
// props.glb und garden.glb enthalten unbewegte Deko-Modelle (eigene Tests unten)
const files = readdirSync('public/models').filter((f) => f.endsWith('.glb') && f !== 'props.glb' && f !== 'garden.glb');

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

  it('garden.glb (Blender): Bienenstock und alle Baumformen mit Vertex-Farben', async () => {
    const doc = await new NodeIO().read('public/models/garden.glb');
    const meshes = new Map(doc.getRoot().listNodes().filter((n) => n.getMesh()).map((n) => [n.getName(), n.getMesh()!]));
    for (const name of ['beehive', 'oak_a', 'oak_b', 'oak_c', 'pine_a', 'pine_b']) {
      const mesh = meshes.get(name);
      expect(mesh, name).toBeTruthy();
      for (const prim of mesh!.listPrimitives()) expect(prim.getAttribute('COLOR_0'), name).toBeTruthy();
    }
    const { treeVariant } = await import('../../src/client/gardenmodels');
    for (let i = 0; i < 40; i++) expect(meshes.has(treeVariant(i * 3.7, i * 1.9))).toBe(true);
  });
});
