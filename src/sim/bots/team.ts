import type { BotsDef, TeamRole } from '../types';

const ROLES: TeamRole[] = ['tank', 'dmg', 'support'];

/**
 * Ausgewogenes Team zum Helden des Spielers: zuerst die Rollen, die noch
 * fehlen (Tank, Schaden, Support), dann mit übrigen Helden auffüllen.
 * Ohne Tank, Schaden und Support ist das Spiel kaum zu gewinnen.
 */
export function defaultTeam(bots: BotsDef, playerHeroId: string | null): string[] {
  const ids = Object.keys(bots.heroes).filter((id) => id !== playerHeroId);
  const size = playerHeroId ? 3 : 4;
  return fillTeam(bots, playerHeroId ? [playerHeroId] : [], ids, size + (playerHeroId ? 1 : 0)).filter((id) => id !== playerHeroId);
}

/**
 * Team auffüllen: taken sind schon vergeben, pool sind die freien Helden in
 * Wunsch-Reihenfolge. Fehlende Rollen kommen zuerst, dann der Rest.
 */
export function fillTeam(bots: BotsDef, taken: readonly string[], pool: readonly string[], size: number): string[] {
  const team = [...taken];
  const free = pool.filter((id, i) => !team.includes(id) && pool.indexOf(id) === i);
  for (const role of ROLES) {
    if (team.length >= size) break;
    if (team.some((id) => bots.heroes[id]?.teamRole === role)) continue;
    const pick = free.find((id) => bots.heroes[id]?.teamRole === role && !team.includes(id));
    if (pick) team.push(pick);
  }
  for (const id of free) if (team.length < size && !team.includes(id)) team.push(id);
  return team.slice(0, Math.max(size, taken.length));
}
