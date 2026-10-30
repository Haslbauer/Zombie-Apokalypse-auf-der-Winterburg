import type { BotRole, BotsDef } from '../types';

const ROLES: BotRole[] = ['melee', 'ranged', 'control'];

/**
 * Ausgewogenes Bot-Team zum Helden des Spielers: je ein Nahkämpfer, ein
 * Fernkämpfer und eine Kontrolle, ohne den Helden des Spielers.
 */
export function defaultTeam(bots: BotsDef, playerHeroId: string | null): string[] {
  const ids = Object.keys(bots.heroes).filter((id) => id !== playerHeroId);
  const team: string[] = [];
  for (const role of ROLES) {
    const pick = ids.find((id) => bots.heroes[id].role === role && !team.includes(id));
    if (pick) team.push(pick);
  }
  // Ohne Spieler (nur Bots) oder falls eine Rolle fehlt: mit übrigen Helden auffüllen.
  const size = playerHeroId ? 3 : 4;
  for (const id of ids) if (team.length < size && !team.includes(id)) team.push(id);
  return team.slice(0, size);
}
