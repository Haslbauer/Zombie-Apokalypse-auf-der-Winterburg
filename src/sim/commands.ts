import type { SimContext } from './context';
import type { Command } from './types';

/** Übernimmt die Befehle eines Ticks als neue Aufträge der Helden. */
export function applyCommands(ctx: SimContext, commands: readonly Command[]): void {
  const { state, grid } = ctx;
  for (const cmd of commands) {
    const h = state.heroes.find((x) => x.id === cmd.heroId);
    if (!h || !h.alive) continue;
    switch (cmd.type) {
      case 'moveTo':
        h.order = { type: 'move', target: { ...cmd.target } };
        h.path = grid.findPath(h.pos, cmd.target);
        break;
      case 'attackMove':
        h.order = { type: 'attackMove', target: { ...cmd.target } };
        h.path = grid.findPath(h.pos, cmd.target);
        break;
      case 'attack':
        if (state.zombies.some((z) => z.id === cmd.targetId && z.hp > 0)) {
          h.order = { type: 'attack', targetId: cmd.targetId };
          h.path = [];
          h.repathAt = 0;
        }
        break;
      case 'stop':
        h.order = { type: 'idle' };
        h.path = [];
        break;
    }
  }
}
