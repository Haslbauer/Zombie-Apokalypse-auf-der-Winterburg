import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Trennung Simulation / Rendering', () => {
  it('src/sim importiert weder three noch Client-Code', () => {
    const dir = fileURLToPath(new URL('../../src/sim', import.meta.url));
    for (const file of readdirSync(dir)) {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src, file).not.toMatch(/from ['"]three['"]/);
      expect(src, file).not.toMatch(/from ['"]\.\.\/client/);
    }
  });
});
