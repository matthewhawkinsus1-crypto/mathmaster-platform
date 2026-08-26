import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const viteBin = resolve('node_modules/vite/bin/vite.js');

const env = {
  ...process.env,
  VITE_MATHMASTER_EXECUTION_MODE: 'firebaseProduction',
};

console.log('Building Firebase Hosting with VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction');

const result = spawnSync(process.execPath, [viteBin, 'build'], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
