/**
 * Recent Electron versions no longer download their runtime during `npm install`, and the build
 * tooling refuses to launch without it. This runs before `npm start` / `npm run dev` and fetches
 * the runtime once; afterwards it is an instant no-op.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const electronDir = fileURLToPath(new URL('../node_modules/electron/', import.meta.url));
const installer = electronDir + 'install.js';

if (!existsSync(installer)) {
  console.error('Electron is not installed. Run "npm install" first.');
  process.exit(1);
}
if (!existsSync(electronDir + 'path.txt')) {
  console.log('Downloading the Electron runtime (first run only, about 120 MB)...');
}
const result = spawnSync(process.execPath, [installer], { stdio: 'inherit' });
if (result.status !== 0) {
  console.error('Could not download the Electron runtime. Check your internet connection and try again.');
}
process.exit(result.status ?? 1);
