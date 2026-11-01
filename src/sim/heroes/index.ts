import { grimm } from './grimm';
import { gaertnerin } from './gaertnerin';
import { imker } from './imker';
import { goldschmied } from './goldschmied';
import { lotte } from './lotte';
import { taucher } from './taucher';
import { gloecknerin } from './gloecknerin';
import { foerster } from './foerster';
import { schornsteinfeger } from './schornsteinfeger';
import { baeckerin } from './baeckerin';
import type { HeroKit } from './kit';
import { libero } from './libero';
import { pirat } from './pirat';
import { rotschopf } from './rotschopf';
import { schlaeferin } from './schlaeferin';

const KITS: Record<string, HeroKit> = { grimm, gaertnerin, pirat, libero, rotschopf, schlaeferin, imker, goldschmied, lotte, taucher, gloecknerin, foerster, schornsteinfeger, baeckerin };

/** Helden ohne eigenes Modul (z. B. in Tests) haben keine Fähigkeiten. */
const NONE: HeroKit = { cast: () => false };

export function kitOf(defId: string): HeroKit {
  return KITS[defId] ?? NONE;
}
