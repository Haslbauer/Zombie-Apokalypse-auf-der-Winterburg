import type { GameData, Hero, ItemCategory, ItemDef } from '../sim/types';

const CATEGORIES: { id: ItemCategory; label: string }[] = [
  { id: 'meleeWeapon', label: 'Nahkampfwaffen' },
  { id: 'rangedWeapon', label: 'Fernkampfwaffen' },
  { id: 'armor', label: 'Rüstung' },
  { id: 'stat', label: 'Werte' },
  { id: 'consumable', label: 'Verbrauch (R/T)' },
];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
};

/** Shop-Fenster: rechts am Rand, das Spiel läuft weiter. Kaufen per Klick. */
export class ShopView {
  private readonly root = el('div', 'shop');
  private readonly gold = el('span', 'shop-gold');
  private readonly cards = new Map<string, { card: HTMLElement; note: HTMLElement; item: ItemDef }>();
  onBuy: (itemId: string) => void = () => {};
  onClose: () => void = () => {};

  constructor(parent: HTMLElement, data: GameData) {
    const head = el('div', 'shop-head');
    const close = el('button', 'shop-close', '×');
    close.addEventListener('click', () => this.onClose());
    head.append(el('strong', '', 'Shop'), this.gold, close);
    this.root.append(head);
    for (const cat of CATEGORIES) {
      const items = data.items.filter((i) => i.category === cat.id);
      if (items.length === 0) continue;
      this.root.append(el('div', 'shop-cat', cat.label));
      const grid = el('div', 'shop-grid');
      for (const item of items) {
        const card = el('button', 'shop-card');
        card.dataset.item = item.id;
        const note = el('span', 'shop-note');
        card.append(el('strong', '', item.name), el('span', 'shop-price', `${item.price} Gold`), el('span', 'shop-desc', item.description), note);
        card.addEventListener('click', () => this.onBuy(item.id));
        grid.append(card);
        this.cards.set(item.id, { card, note, item });
      }
      this.root.append(grid);
    }
    this.root.append(el('div', 'shop-foot', 'Rechtsklick auf ein Item im Inventar verkauft es (70 % des Preises). B oder Esc schließt.'));
    this.root.style.display = 'none';
    parent.append(this.root);
  }

  get open(): boolean {
    return this.root.style.display !== 'none';
  }

  show(): void {
    this.root.style.display = '';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  /** Preise gegen Gold und Platz prüfen, Fehlklasse markieren. */
  update(h: Hero, attackType: 'melee' | 'ranged'): void {
    if (!this.open) return;
    this.gold.textContent = `${h.gold} Gold`;
    const invFull = h.inventory.every((s) => s !== null);
    for (const { card, note, item } of this.cards.values()) {
      let blocked = h.gold < item.price;
      let text = '';
      if (item.category === 'consumable') {
        const stackable = h.consumables.some((c) => c === null || (c.itemId === item.id && c.count < (item.maxStack ?? 1)));
        if (!stackable) {
          blocked = true;
          text = 'R/T voll';
        }
      } else if (invFull) {
        blocked = true;
        text = 'Inventar voll';
      }
      const wrongClass =
        (item.category === 'meleeWeapon' && attackType !== 'melee') || (item.category === 'rangedWeapon' && attackType !== 'ranged');
      if (!text && wrongClass) text = 'wirkt nur halb';
      note.textContent = text;
      card.classList.toggle('blocked', blocked);
      card.classList.toggle('half', wrongClass);
    }
  }
}
