import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ASSIGNMENT_RUNTIME_REPAIR_VERSION } from '../src/platform/assignments/assignmentRuntimeRepair.js';

const viteBin = resolve('node_modules/vite/bin/vite.js');

const gitSha = (() => {
  const result = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' });
  if (result.status === 0 && String(result.stdout || '').trim()) return String(result.stdout).trim();
  return String(process.env.GITHUB_SHA || 'unknown').slice(0, 12) || 'unknown';
})();

const builtAt = new Date().toISOString();
const env = {
  ...process.env,
  VITE_MATHMASTER_EXECUTION_MODE: 'firebaseProduction',
  VITE_MATHMASTER_GIT_SHA: gitSha,
  VITE_MATHMASTER_BUILT_AT: builtAt,
  VITE_MATHMASTER_RUNTIME_REPAIR_VERSION: String(ASSIGNMENT_RUNTIME_REPAIR_VERSION),
};

console.log(
  `Building Firebase Hosting with VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction `
  + `sha=${gitSha} runtimeRepair=${ASSIGNMENT_RUNTIME_REPAIR_VERSION}`,
);

const result = spawnSync(process.execPath, [viteBin, 'build'], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
