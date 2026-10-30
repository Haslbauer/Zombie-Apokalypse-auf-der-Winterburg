/** Alle belegbaren Aktionen in der Reihenfolge des Menüs. */
export const ACTIONS = [
  { id: 'up', label: 'Hoch laufen' },
  { id: 'down', label: 'Runter laufen' },
  { id: 'left', label: 'Links laufen' },
  { id: 'right', label: 'Rechts laufen' },
  { id: 'attack', label: 'Angriff' },
  { id: 'ability1', label: 'Fähigkeit 1' },
  { id: 'ability2', label: 'Fähigkeit 2' },
  { id: 'ability3', label: 'Fähigkeit 3' },
  { id: 'ability4', label: 'Fähigkeit 4' },
  { id: 'ability5', label: 'Fähigkeit 5' },
  { id: 'ability6', label: 'Fähigkeit 6' },
] as const;

export type Action = (typeof ACTIONS)[number]['id'];

/**
 * Tasten als KeyboardEvent.code (gleiche Position auf QWERTZ und QWERTY),
 * Maustasten als "Mouse0" (links), "Mouse1" (Mitte), "Mouse2" (rechts).
 */
const DEFAULTS: Record<Action, string> = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  attack: 'Mouse0',
  ability1: 'Digit1',
  ability2: 'Digit2',
  ability3: 'Digit3',
  ability4: 'Digit4',
  ability5: 'KeyR',
  ability6: 'KeyT',
};

const STORAGE_KEY = 'winterburg.keybindings';

/** Esc öffnet immer das Menü und ist nicht belegbar. */
export const MENU_KEY = 'Escape';

export class Keybindings {
  private map: Record<Action, string> = { ...DEFAULTS };

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      for (const { id } of ACTIONS) if (typeof saved[id] === 'string') this.map[id] = saved[id];
    } catch {
      // Ohne Speicher (privates Fenster o. Ä.) gilt einfach die Standardbelegung.
    }
  }

  get(action: Action): string {
    return this.map[action];
  }

  /** Neue Taste setzen. War sie schon belegt, tauschen die beiden Aktionen. */
  set(action: Action, code: string): void {
    const other = ACTIONS.find(({ id }) => id !== action && this.map[id] === code);
    if (other) this.map[other.id] = this.map[action];
    this.map[action] = code;
    this.save();
  }

  reset(): void {
    this.map = { ...DEFAULTS };
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.map));
    } catch {
      // Nicht speicherbar: Belegung gilt bis zum Neuladen.
    }
  }
}

const NAMES: Record<string, string> = {
  Mouse0: 'Linksklick',
  Mouse1: 'Mittelklick',
  Mouse2: 'Rechtsklick',
  Mouse3: 'Maus 4',
  Mouse4: 'Maus 5',
  Space: 'Leertaste',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift rechts',
  ControlLeft: 'Strg',
  ControlRight: 'Strg rechts',
  AltLeft: 'Alt',
  Tab: 'Tab',
  CapsLock: 'Feststell',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** Lesbarer Name einer Taste, z. B. "KeyW" → "W". */
export function keyName(code: string): string {
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}
