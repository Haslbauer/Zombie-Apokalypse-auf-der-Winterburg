import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ViewModel } from '../../src/client/viewmodel';
import { testData } from '../sim/helpers';

describe('Ego-Sicht: Waffe im Bild', () => {
  it('jeder Held bekommt ein Modell; Angriff schwingt es, danach Ruhelage', () => {
    for (const h of testData().heroes) {
      const cam = new THREE.PerspectiveCamera();
      const vm = new ViewModel(cam);
      vm.setHero(h.id, h.color);
      vm.update(true, 0.016, 0, 0);
      expect(vm.group.visible).toBe(true);
      expect(vm.group.children[0].children.length).toBeGreaterThan(1);
      const rest = vm.group.rotation.x;
      vm.kick(0.3);
      vm.update(true, 0.15, 0, 0);
      expect(vm.group.rotation.x).not.toBeCloseTo(rest, 2);
      vm.update(true, 0.5, 0, 0);
      expect(vm.group.rotation.x).toBeCloseTo(rest, 5);
      vm.update(false, 0.016, 0, 0);
      expect(vm.group.visible).toBe(false);
    }
  });
});
