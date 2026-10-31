import type { GameData, Hero, ItemCategory, ItemDef } from '../sim/types';

/** Reihenfolge innerhalb einer Stufe. */
const CATEGORY_ORDER: ItemCategory[] = ['meleeWeapon', 'rangedWeapon', 'armor', 'stat', 'consumable'];

type Tier = 'consumable' | 'basic' | 'mid' | 'final';
const TIERS: { id: Tier; label: string }[] = [
  { id: 'consumable', label: 'Verbrauch (R/T)' },
  { id: 'basic', label: 'Grundteile' },
  { id: 'mid', label: 'Aufbau' },
  { id: 'final', label: 'Fertige Items' },
];

/** Stufe wie in LoL: Grundteil ohne Rezept, Aufbau-Item steckt in weiteren Rezepten, sonst fertig. */
function tierOf(item: ItemDef, items: ItemDef[]): Tier {
  if (item.category === 'consumable') return 'consumable';
  if (!item.from) return 'basic';
  return items.some((i) => i.from?.includes(item.id)) ? 'mid' : 'final';
}

interface Card {
  card: HTMLElement;
  price: HTMLElement;
  note: HTMLElement;
  parts: { id: string; el: HTMLElement }[];
  item: ItemDef;
}

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
  private readonly cards = new Map<string, Card>();
  onBuy: (itemId: string) => void = () => {};
  onClose: () => void = () => {};

  constructor(parent: HTMLElement, data: GameData) {
    const head = el('div', 'shop-head');
    const close = el('button', 'shop-close', '×');
    close.addEventListener('click', () => this.onClose());
    head.append(el('strong', '', 'Shop'), this.gold, close);
    this.root.append(head);
    const name = (id: string) => data.items.find((i) => i.id === id)?.name ?? id;
    for (const tier of TIERS) {
      const items = data.items
        .filter((i) => tierOf(i, data.items) === tier.id)
        .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.price - b.price);
      if (items.length === 0) continue;
      this.root.append(el('div', 'shop-cat', tier.label));
      const grid = el('div', 'shop-grid');
      for (const item of items) {
        const card = el('button', 'shop-card');
        card.dataset.item = item.id;
        const price = el('span', 'shop-price');
        const note = el('span', 'shop-note');
        card.append(el('strong', '', item.name), price, el('span', 'shop-desc', item.description));
        // Rezept: Bauteile (vorhandene grün) plus Aufpreis; bei Grundteilen, wozu sie gehören
        const parts: Card['parts'] = [];
        if (item.from) {
          const recipe = el('span', 'shop-recipe', 'Aus: ');
          const extra = item.price - item.from.reduce((n, id) => n + (data.items.find((i) => i.id === id)?.price ?? 0), 0);
          item.from.forEach((id) => {
            const part = el('span', 'shop-part', name(id));
            parts.push({ id, el: part });
            recipe.append(part, ' + ');
          });
          recipe.append(`${extra} Gold`);
          card.append(recipe);
        }
        const into = data.items.filter((i) => i.from?.includes(item.id));
        if (into.length > 0) card.append(el('span', 'shop-into', `Wird zu: ${into.map((i) => i.name).join(', ')}`));
        card.append(note);
        card.addEventListener('click', () => this.onBuy(item.id));
        // Verwandte Items hervorheben (Bauteile und was daraus wird)
        const related = [...(item.from ?? []), ...into.map((i) => i.id)];
        card.addEventListener('mouseenter', () => related.forEach((id) => this.cards.get(id)?.card.classList.add('related')));
        card.addEventListener('mouseleave', () => related.forEach((id) => this.cards.get(id)?.card.classList.remove('related')));
        grid.append(card);
        this.cards.set(item.id, { card, price, note, parts, item });
      }
      this.root.append(grid);
    }
    this.root.append(el('div', 'shop-foot', 'Rezepte wie in LoL: Bauteile im Inventar werden verbraucht und angerechnet. Maus über ein Item zeigt Bauteile und Weiterentwicklungen. Rechtsklick im Inventar verkauft (70 %). B oder Esc schließt.'));
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

  /**
   * Preise gegen Gold und Platz prüfen, Fehlklasse markieren. plan liefert für
   * Rezepte den Restpreis und die verbrauchten Inventarplätze (sim/items buildPlan).
   */
  update(h: Hero, attackType: 'melee' | 'ranged', plan: (itemId: string) => { cost: number; consumed: number[] }): void {
    if (!this.open) return;
    this.gold.textContent = `${h.gold} Gold`;
    const invFull = h.inventory.every((s) => s !== null);
    for (const { card, price, note, parts, item } of this.cards.values()) {
      const p = item.category === 'consumable' ? { cost: item.price, consumed: [] } : plan(item.id);
      price.textContent = p.cost < item.price ? `noch ${p.cost} Gold (${item.price})` : `${item.price} Gold`;
      for (const part of parts) part.el.classList.toggle('owned', h.inventory.includes(part.id));
      let blocked = h.gold < p.cost;
      let text = '';
      if (item.category === 'consumable') {
        const stackable = h.consumables.some((c) => c === null || (c.itemId === item.id && c.count < (item.maxStack ?? 1)));
        if (!stackable) {
          blocked = true;
          text = 'R/T voll';
        }
      } else if (invFull && p.consumed.length === 0) {
        blocked = true;
        text = 'Inventar voll';
      }
      const wrongClass =
        (item.category === 'meleeWeapon' && attackType !== 'melee') || (item.category === 'rangedWeapon' && attackType !== 'ranged');
      if (!text && wrongClass) text = 'wirkt nur halb';
      note.textContent = text;
      card.classList.toggle('blocked', blocked);
      card.classList.toggle('half', wrongClass);
      card.classList.toggle('combine', p.consumed.length > 0);
    }
  }
}
