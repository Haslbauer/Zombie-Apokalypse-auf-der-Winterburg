import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Trennung Simulation / Rendering', () => {
  it('src/sim importiert weder three noch Client-Code', () => {
    const dir = fileURLToPath(new URL('../../src/sim', import.meta.url));
    const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((f) => f.isFile());
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = readFileSync(join(f.parentPath, f.name), 'utf8');
      expect(src, f.name).not.toMatch(/from ['"]three['"]/);
      expect(src, f.name).not.toMatch(/from ['"](\.\.\/)+client/);
    }
  });
});
