import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(root, 'dist'), { recursive: true });
for (const name of ['unravel', 'pinball-pit', 'gridlock']) {
  cpSync(resolve(root, name), resolve(root, 'dist', name), { recursive: true });
  console.log(`copied ${name} -> dist/${name}`);
}
