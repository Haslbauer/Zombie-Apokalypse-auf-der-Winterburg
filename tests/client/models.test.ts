import { readdirSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';

/**
 * Jede animierte Figur braucht genau ein Skelett, und die Animationen müssen
 * dessen Knochen bewegen. Sonst bleiben Teile der Figur (Kleidung, Haare …)
 * in der Grundpose stehen, und die Figur „gleitet“ nur.
 */
const files = readdirSync('public/models').filter((f) => f.endsWith('.glb'));

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
});
