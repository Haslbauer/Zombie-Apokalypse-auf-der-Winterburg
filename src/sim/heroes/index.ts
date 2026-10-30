import { chupa } from './chupa';
import { gaertnerin } from './gaertnerin';
import type { HeroKit } from './kit';
import { libero } from './libero';
import { pirat } from './pirat';
import { rotschopf } from './rotschopf';
import { schlaeferin } from './schlaeferin';

const KITS: Record<string, HeroKit> = { chupa, gaertnerin, pirat, libero, rotschopf, schlaeferin };

/** Helden ohne eigenes Modul (z. B. in Tests) haben keine Fähigkeiten. */
const NONE: HeroKit = { cast: () => false };

export function kitOf(defId: string): HeroKit {
  return KITS[defId] ?? NONE;
}
