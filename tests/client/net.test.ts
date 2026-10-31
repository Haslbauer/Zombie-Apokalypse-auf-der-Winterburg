import { describe, expect, it } from 'vitest';
import { Prediction } from '../../src/client/prediction';
import { RENDER_DELAY, SnapshotBuffer } from '../../src/client/snapshots';
import { gameData } from '../../src/gameData';
import { Simulation } from '../../src/sim/game';
import { DT, type GameState } from '../../src/sim/types';

/** Server-Simulation mit einem Spieler (ohne Wellen). */
function server(heroId = 'rotschopf') {
  const data = structuredClone(gameData);
  data.waves.firstPauseDuration = 1e9;
  return new Simulation(data, { seed: 1, heroes: [heroId] });
}
const clone = (s: GameState): GameState => structuredClone(s);

describe('Vorhersage der eigenen Bewegung', () => {
  it('sagt Eingaben sofort voraus und trifft nach dem Abgleich die Server-Position', () => {
    const sim = server();
    const pred = new Prediction(gameData);
    const h = sim.state.heroes[0];
    pred.reconcile(clone(sim.state), structuredClone(h), 0);
    const start = { ...h.pos };
    const move = { x: 1, y: 0 };
    // Client: 5 Eingaben vorhergesagt, bevor der Server antwortet
    for (let seq = 1; seq <= 5; seq++) pred.apply(seq, move);
    const predicted = pred.display(0)!;
    expect(predicted.x).toBeGreaterThan(start.x + 0.5);
    // Server wendet dieselben Eingaben an
    for (let seq = 1; seq <= 5; seq++) sim.step([{ heroId: h.id, type: 'input', move, aim: { x: 99, y: start.y }, attack: false }]);
    expect(predicted.x).toBeCloseTo(h.pos.x, 5);
    // Abgleich mit Bestätigung bis 3: Eingaben 4 und 5 werden auf die Position nach Tick 3 erneut angewendet
    const after3 = server();
    const h3 = after3.state.heroes[0];
    for (let seq = 1; seq <= 3; seq++) after3.step([{ heroId: h3.id, type: 'input', move, aim: { x: 99, y: start.y }, attack: false }]);
    pred.reconcile(clone(after3.state), structuredClone(h3), 3);
    expect(pred.display(1)!.x).toBeCloseTo(h.pos.x, 5);
  });

  it('weicht der Server ab (z. B. weggeschoben), wird weich bzw. bei großem Sprung sofort korrigiert', () => {
    const sim = server();
    const pred = new Prediction(gameData);
    const h = structuredClone(sim.state.heroes[0]);
    pred.reconcile(clone(sim.state), h, 0);
    pred.apply(1, { x: 0, y: 0 });
    // kleine Abweichung: Darstellung gleitet hin
    const moved = { ...h, pos: { x: h.pos.x + 0.5, y: h.pos.y } };
    pred.reconcile(clone(sim.state), moved, 1);
    const first = pred.display(0.016)!;
    expect(first.x).toBeLessThan(moved.pos.x);
    expect(pred.display(2)!.x).toBeCloseTo(moved.pos.x, 3);
    // großer Sprung (Respawn): sofort
    const far = { ...h, pos: { x: h.pos.x + 10, y: h.pos.y } };
    pred.reconcile(clone(sim.state), far, 1);
    expect(pred.display(0)!.x).toBeCloseTo(far.pos.x, 5);
  });

  it('läuft bei 60 Bildern/s gleichmäßig (überblendet zwischen den 50-ms-Schritten)', () => {
    const sim = server();
    const pred = new Prediction(gameData);
    const h = structuredClone(sim.state.heroes[0]);
    h.pos = { x: 20, y: 50 }; // freie Fläche im Garten
    pred.reconcile(clone(sim.state), h, 0);
    const frame = 1 / 60;
    let since = 0;
    let seq = 0;
    const xs: number[] = [];
    for (let i = 0; i < 60; i++) {
      since += frame;
      while (since >= DT) {
        since -= DT;
        pred.apply(++seq, { x: 1, y: 0 });
      }
      xs.push(pred.display(frame, since / DT)!.x);
    }
    // Ab dem ersten Schritt (vorher steht der Held noch)
    const steps = xs.slice(4).map((x, i) => x - xs[i + 3]);
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    expect(mean).toBeGreaterThan(0);
    for (const d of steps) {
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(mean * 1.5);
    }
  });

  it('keine Vorhersage im Sprung, betäubt oder gefallen: dann gilt die Server-Position', () => {
    const sim = server();
    const pred = new Prediction(gameData);
    const h = structuredClone(sim.state.heroes[0]);
    pred.reconcile(clone(sim.state), { ...h, alive: false }, 0);
    pred.apply(1, { x: 1, y: 0 });
    expect(pred.display(0)).toBeNull();
    pred.reconcile(clone(sim.state), { ...h, buffs: [{ kind: 'stunned', value: 1, until: 99, source: 'x' }] } as never, 1);
    expect(pred.display(0)).toBeNull();
  });
});

describe('Jitter-Puffer', () => {
  const snap = (tick: number, events: GameState['events'] = []) => ({ ...clone(server().state), tick, time: tick * DT, events });

  it('zeigt 2 Ticks hinter dem neuesten Zustand und gibt jedes Ereignis genau einmal ab', () => {
    const buf = new SnapshotBuffer();
    const played: number[] = [];
    for (let t = 1; t <= 5; t++) buf.push(snap(t, [{ type: 'waveStart', number: t }]));
    const frame = buf.advance(0, (s) => played.push(s.tick))!;
    expect(buf.renderTick).toBe(5 - RENDER_DELAY);
    expect(frame.from.tick).toBe(3);
    expect(frame.to.tick).toBe(4);
    // Neue Zustände kommen ungleichmäßig an (Ruckler), doppelte und verspätete werden ignoriert
    buf.push(snap(6));
    buf.push(snap(6));
    buf.push(snap(4));
    buf.push(snap(7));
    buf.push(snap(8));
    for (let i = 0; i < 6; i++) buf.advance(DT, (s) => played.push(s.tick));
    expect(played).toEqual([1, 2, 3, 4, 5, 6, 7, 8].slice(0, played.length));
    expect(new Set(played).size).toBe(played.length);
    expect(played.length).toBeGreaterThanOrEqual(6);
  });

  it('interpoliert zwischen den Zuständen um die Darstellungszeit und holt Rückstand auf', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(10));
    buf.push(snap(11));
    buf.push(snap(12));
    buf.advance(0, () => {});
    const half = buf.advance(DT / 2, () => {})!;
    expect(half.from.tick).toBe(10);
    expect(half.alpha).toBeGreaterThan(0.3);
    expect(half.alpha).toBeLessThan(0.7);
    // Großer Rückstand (Tab war im Hintergrund): springt direkt heran
    buf.push(snap(40));
    buf.advance(DT, () => {});
    expect(buf.renderTick).toBe(40 - RENDER_DELAY);
  });

  it('Neustart der Partie (Ticks beginnen von vorn) leert den Puffer', () => {
    const buf = new SnapshotBuffer();
    for (let t = 100; t <= 103; t++) buf.push(snap(t));
    buf.advance(0, () => {});
    buf.push(snap(1));
    buf.push(snap(2));
    buf.push(snap(3));
    const frame = buf.advance(0, () => {})!;
    expect(frame.to.tick).toBeLessThan(10);
  });
});
