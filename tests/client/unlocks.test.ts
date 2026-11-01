import { describe, expect, it } from 'vitest';
import { chosenLantern, chosenTitle, DEFAULT_LANTERN, earned, loadUnlocks, recordResult, saveUnlocks, type GameResult } from '../../src/client/unlocks';
import type { FinalHeroStats } from '../../src/sim/types';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

const row = (heroId: number, mvp: number, bosses = 0, healing = 0): FinalHeroStats => ({
  heroId,
  defId: 'rotschopf',
  bot: false,
  level: 10,
  mvp,
  score: { kills: 0, bosses, assists: 0, gold: 0 },
  stats: { damage: 0, damageTaken: 0, healing, deaths: 0, streak: 0, bestStreak: 0, killsPerWave: [], casts: 0, goldSpent: 0 },
});

const result = (o: Partial<GameResult>): GameResult => ({ victory: false, pvp: false, level: 'normal', wave: 1, stats: [row(1, 5), row(2, 3)], heroId: 1, ...o });

describe('Freischaltbares', () => {
  it('Erfolge nach Spielende: Wellen, Sieg, Albtraum, Bosse, Heilung, MVP, PvP', () => {
    expect(earned(result({ wave: 4, stats: [row(2, 9), row(1, 1)] }))).toEqual([]);
    expect(earned(result({ wave: 12 }))).toEqual(['welle5', 'welle10', 'mvp']);
    expect(earned(result({ wave: 20, victory: true, level: 'albtraum', stats: [row(1, 9, 6, 5000), row(2, 1)] }))).toEqual(['welle5', 'welle10', 'sieg', 'albtraum', 'bosse', 'heiler', 'mvp']);
    expect(earned(result({ pvp: true, victory: true, wave: 1, stats: [row(2, 9), row(1, 1)] }))).toEqual(['pvp']);
    expect(earned(result({ heroId: -1, wave: 20, victory: true }))).toEqual([]);
  });

  it('nur neue Erfolge zählen; Titel und Laterne nur, wenn freigeschaltet', () => {
    const store = memory();
    expect(recordResult(result({ wave: 6, stats: [row(2, 9), row(1, 1)] }), store).map((a) => a.id)).toEqual(['welle5']);
    expect(recordResult(result({ wave: 7, stats: [row(2, 9), row(1, 1)] }), store)).toEqual([]);
    let s = loadUnlocks(store);
    expect(Object.keys(s.done)).toEqual(['welle5']);
    // gesperrte Auswahl wird beim Laden verworfen
    saveUnlocks({ ...s, title: 'albtraum', lantern: 'sieg' }, store);
    s = loadUnlocks(store);
    expect(s.title).toBeNull();
    expect(chosenLantern(s)).toBe(DEFAULT_LANTERN);
    saveUnlocks({ ...s, title: 'welle5' }, store);
    expect(chosenTitle(loadUnlocks(store))).toBe('Nachtwache');
    recordResult(result({ wave: 20, victory: true, stats: [row(2, 9), row(1, 1)] }), store);
    saveUnlocks({ ...loadUnlocks(store), lantern: 'sieg' }, store);
    expect(chosenLantern(loadUnlocks(store))).toBe(0xffd166);
  });
});
