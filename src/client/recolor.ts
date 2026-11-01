import * as THREE from 'three';

/**
 * Umfärben einer Figurentextur: Kleidung bekommt eine neue Farbe, Haut,
 * Augen und sehr helle bzw. dunkle Details bleiben. Die Helligkeit jedes
 * Pixels bleibt erhalten, damit Falten und Nähte sichtbar bleiben.
 */

/** Farbton (0–360), Sättigung und Helligkeit (0–1) eines RGB-Pixels (0–255). */
export function toHsv(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

/** Hautton? (rötlich-gelber Farbton, mittlere Sättigung, hell genug – dunkles Leder zählt nicht) */
export function isSkin(r: number, g: number, b: number): boolean {
  const [h, s, v] = toHsv(r, g, b);
  return h >= 8 && h <= 40 && s >= 0.15 && s <= 0.55 && v >= 0.5 && r > g && g >= b;
}

/** Wahrgenommene Helligkeit 0–1. */
export function luma(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Einen Pixel umfärben: Zielfarbe mit der Helligkeit des Pixels (Mittelwert
 * 0.5 → Zielfarbe), dann mit strength überblenden. Haut und sehr helle bzw.
 * sehr dunkle Pixel bleiben (keepSkin). flat (0–1) zieht die Helligkeit zur
 * Mitte, damit dunkle Stoffe die Zielfarbe annehmen (z. B. heller Anzug).
 */
export function recolorPixel(r: number, g: number, b: number, target: [number, number, number], strength = 0.85, keepSkin = true, flat = 0): [number, number, number] {
  const l = luma(r, g, b);
  if (keepSkin && (isSkin(r, g, b) || l > 0.93 || l < 0.04)) return [r, g, b];
  // Helligkeit: 0.5 = Zielfarbe, darunter dunkler, darüber heller; flat gleicht an (helle Anzüge)
  const k = (l * (1 - flat) + 0.5 * flat) * 2;
  const mix = (t: number) => (k <= 1 ? t * k : t + (255 - t) * (k - 1));
  const out: [number, number, number] = [mix(target[0]), mix(target[1]), mix(target[2])];
  return [
    Math.round(r + (out[0] - r) * strength),
    Math.round(g + (out[1] - g) * strength),
    Math.round(b + (out[2] - b) * strength),
  ];
}

const cache = new Map<string, THREE.Texture>();

/** Umgefärbte Kopie einer Textur (zwischengespeichert je Bild und Farbe). */
export function recolorTexture(map: THREE.Texture, color: number, strength = 0.85, keepSkin = true, flat = 0): THREE.Texture {
  const key = `${map.uuid}|${color}|${strength}|${keepSkin}|${flat}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const img = map.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || !img.width || typeof document === 'undefined') return map;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return map;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const c = new THREE.Color(color);
  const target: [number, number, number] = [c.r * 255, c.g * 255, c.b * 255];
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b] = recolorPixel(px[i], px[i + 1], px[i + 2], target, strength, keepSkin, flat);
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = map.flipY;
  tex.colorSpace = map.colorSpace;
  tex.wrapS = map.wrapS;
  tex.wrapT = map.wrapT;
  tex.channel = map.channel;
  cache.set(key, tex);
  return tex;
}
