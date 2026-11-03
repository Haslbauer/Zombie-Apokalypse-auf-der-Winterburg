import { describe, expect, it } from 'vitest';
import { UnitView } from '../../src/client/units';

/** Figur 1 s lang mit Geschwindigkeit (vx, vz) bewegen (20 Bilder). */
function move(view: UnitView, vx: number, vz: number): void {
  for (let i = 0; i < 20; i++) {
    view.group.position.x += vx * 0.05;
    view.group.position.z += vz * 0.05;
    view.measureSpeed(0.05);
  }
}

describe('Rückwärtslaufen', () => {
  it('erkennt Bewegung gegen die Blickrichtung, nicht vorwärts oder seitlich', () => {
    const v = new UnitView(0.45, '#fff', 0x00ff00, 1.8, 'human');
    move(v, -5, 0); // läuft nach -x
    expect(v.movingBackward(0)).toBe(true); // blickt nach +x
    expect(v.movingBackward(Math.PI)).toBe(false); // blickt nach -x: vorwärts
    expect(v.movingBackward(Math.PI / 2)).toBe(false); // seitlich
    const still = new UnitView(0.45, '#fff', 0x00ff00, 1.8, 'human');
    move(still, 0, 0);
    expect(still.movingBackward(0)).toBe(false);
  });

  it('Seitschritt: links und rechts relativ zur Blickrichtung', () => {
    const v = new UnitView(0.45, '#fff', 0x00ff00, 1.8, 'human');
    move(v, 0, 5); // läuft nach +z (Süden)
    expect(v.moveDirection(0)).toBe('right'); // blickt nach Osten: Süden ist rechts
    expect(v.moveDirection(Math.PI)).toBe('left'); // blickt nach Westen: Süden ist links
    expect(v.moveDirection(Math.PI / 2)).toBe('forward');
    expect(v.moveDirection(-Math.PI / 2)).toBe('back');
  });
});
