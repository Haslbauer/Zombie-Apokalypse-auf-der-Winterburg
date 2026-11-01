import { describe, expect, it } from 'vitest';
import { emitCount, StatusFx } from '../../src/client/statusfx';

describe('Zustands-Effekte', () => {
  it('Ausstoß nach Rate, Rest wird mitgeführt', () => {
    let carry = 0;
    let total = 0;
    for (let i = 0; i < 60; i++) {
      const r = emitCount(6, 1 / 60, carry);
      carry = r.carry;
      total += r.n;
    }
    expect(total).toBe(5); // 6 pro Sekunde, Rest 0.999… bleibt im Übertrag
    expect(carry).toBeGreaterThan(0.9);
  });

  it('Seuche erzeugt Partikel, ohne Wirkung verschwinden sie; höchstens 18', () => {
    const fx = new StatusFx(1.8, 0.45);
    for (let i = 0; i < 60; i++) fx.update(1 / 30, i / 30, { plague: 1 });
    expect(fx.count).toBeGreaterThan(3);
    expect(fx.count).toBeLessThanOrEqual(18);
    for (let i = 0; i < 120; i++) fx.update(1 / 30, 2 + i / 30, {});
    expect(fx.count).toBe(0);
    fx.burst('heal', 40);
    expect(fx.count).toBe(18);
  });

  it('Betäubung zeigt Sterne über dem Kopf', () => {
    const fx = new StatusFx(1.8, 0.45);
    fx.update(0.1, 0, { stun: 1 });
    const stars = fx.group.children.find((c) => c.type === 'Group');
    expect(stars?.visible).toBe(true);
    fx.update(0.1, 0.1, {});
    expect(stars?.visible).toBe(false);
  });
});
