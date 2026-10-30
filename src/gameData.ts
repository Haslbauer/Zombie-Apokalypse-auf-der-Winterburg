import arena from '../data/map.json';
import economy from '../data/economy.json';
import heroes from '../data/heroes.json';
import items from '../data/items.json';
import progression from '../data/progression.json';
import waves from '../data/waves.json';
import zombies from '../data/zombies.json';
import { parseGameData } from './sim/data';

/** Die geprüften Spieldaten aus data/*.json. */
export const gameData = parseGameData({ heroes, zombies, waves, arena, progression, items, economy });
