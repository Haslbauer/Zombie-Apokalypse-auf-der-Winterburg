import { describe, expect, it } from 'vitest';
import { isSkin, luma, recolorPixel } from '../../src/client/recolor';

const GREEN: [number, number, number] = [60, 120, 50];

describe('Figuren umfärben', () => {
  it('erkennt helle Hauttöne, aber kein dunkles Leder und kein Grau', () => {
    expect(isSkin(224, 172, 140)).toBe(true); // helle Haut
    expect(isSkin(190, 130, 95)).toBe(true); // gebräunt
    expect(isSkin(90, 55, 30)).toBe(false); // dunkles Leder
    expect(isSkin(128, 128, 128)).toBe(false); // grauer Stoff
  });

  it('Haut bleibt, Stoff nimmt die Zielfarbe an', () => {
    expect(recolorPixel(224, 172, 140, GREEN)).toEqual([224, 172, 140]);
    const [r, g, b] = recolorPixel(128, 128, 128, GREEN, 1);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    // ohne keepSkin wird auch Haut umgefärbt
    expect(recolorPixel(224, 172, 140, GREEN, 1, false)).not.toEqual([224, 172, 140]);
  });

  it('Helligkeitsreihenfolge bleibt (Falten sichtbar), flat gleicht an', () => {
    const dark = recolorPixel(60, 60, 60, GREEN, 1);
    const light = recolorPixel(180, 180, 180, GREEN, 1);
    expect(luma(...light)).toBeGreaterThan(luma(...dark));
    const darkFlat = recolorPixel(60, 60, 60, GREEN, 1, true, 0.8);
    expect(luma(...darkFlat)).toBeGreaterThan(luma(...dark));
    expect(luma(...recolorPixel(180, 180, 180, GREEN, 1, true, 0.8))).toBeGreaterThan(luma(...darkFlat));
  });
});
