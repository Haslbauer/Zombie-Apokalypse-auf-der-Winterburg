import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stats, statsPage, summarize } from '../../server/stats';

const day = new Date('2026-11-02T12:00:00Z');

describe('Spielzähler', () => {
  it('zählt Starts je Art und Tag, Siege und Niederlagen', async () => {
    const s = new Stats({ now: () => day });
    s.record('solo', 'start');
    s.record('solo', 'start');
    s.record('solo', 'win');
    s.record('koop', 'start');
    s.record('koop', 'loss');
    s.record('pvp', 'end');
    // Unbekanntes wird ignoriert
    s.record('hack' as never, 'start');
    s.record('solo', 'boom' as never);
    const data = await s.snapshot();
    expect(data).toEqual({ 'start:solo': 2, 'win:solo': 1, 'start:koop': 1, 'loss:koop': 1, 'end:pvp': 1, 'day:2026-11-02': 3 });
    const sum = summarize(data, 14, day);
    expect(sum.total).toBe(3);
    expect(sum.perDay.at(-1)).toEqual({ day: '2026-11-02', starts: 3 });
    expect(statsPage(data, 'speicher', day)).toContain('>3<');
  });

  it('speichert in einer Datei und liest sie beim Neustart', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'stats-')), 'sub', 'stats.json');
    const a = new Stats({ file, now: () => day });
    a.record('daily', 'start');
    a.flush();
    expect(JSON.parse(readFileSync(file, 'utf8'))['start:daily']).toBe(1);
    const b = new Stats({ file, now: () => day });
    b.record('daily', 'start');
    b.flush();
    expect(JSON.parse(readFileSync(file, 'utf8'))['start:daily']).toBe(2);
  });

  it('schickt bei Upstash HINCRBY und liest mit HGETALL', async () => {
    const calls: unknown[] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      const cmd = JSON.parse(String(init.body));
      calls.push(cmd);
      const result = cmd[0] === 'HGETALL' ? ['start:koop', '5', 'win:koop', '2'] : 1;
      return new Response(JSON.stringify({ result }), { status: 200 });
    }) as typeof fetch;
    const s = new Stats({ redis: { url: 'https://example.upstash.io', token: 't' }, fetch: fake, now: () => day });
    s.record('koop', 'start');
    expect(calls).toContainEqual(['HINCRBY', 'winterburg:stats', 'start:koop', 1]);
    expect(calls).toContainEqual(['HINCRBY', 'winterburg:stats', 'day:2026-11-02', 1]);
    expect(await s.snapshot()).toEqual({ 'start:koop': 5, 'win:koop': 2 });
  });
});
