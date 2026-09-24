import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASSIGNMENT_RUNTIME_REPAIR_VERSION } from '../src/platform/assignments/assignmentRuntimeRepair.js';

const viteBin = resolve('node_modules/vite/bin/vite.js');

const gitSha = (() => {
  const result = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' });
  if (result.status === 0 && String(result.stdout || '').trim()) return String(result.stdout).trim();
  return String(process.env.GITHUB_SHA || 'unknown').slice(0, 12) || 'unknown';
})();

// Provenance published beside the sha, so `npm run verify:deployed-build` and a
// teacher's build stamp can say not just which commit is live but where it came
// from. A branch name and a clean/dirty flag only — nothing secret.
const gitBranch = (() => {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
  const branch = result.status === 0 ? String(result.stdout || '').trim() : '';
  return branch && branch !== 'HEAD' ? branch : (process.env.GITHUB_REF_NAME || 'detached');
})();
const gitDirty = (() => {
  const result = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
  return result.status === 0 ? Boolean(String(result.stdout || '').trim()) : null;
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

if (result.status === 0) {
  const manifestPath = resolve('dist/mathmaster-build.json');
  writeFileSync(manifestPath, JSON.stringify({
    gitSha,
    gitBranch,
    gitDirty,
    builtAt,
    executionMode: env.VITE_MATHMASTER_EXECUTION_MODE,
    runtimeRepairVersion: ASSIGNMENT_RUNTIME_REPAIR_VERSION,
  }, null, 2) + '\n', 'utf8');
  console.log(`Wrote Firebase build manifest: ${manifestPath}`);
}

process.exit(result.status ?? 1);
