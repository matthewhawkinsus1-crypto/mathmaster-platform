#!/usr/bin/env node
// Compatibility entry point.
//
// Algebra I and Algebra II shipping banks are now released from the certified
// per-standard Fidelity V2 packages by one cross-course builder:
//   drafts/fidelity-v2/algebra1/*.json
//   drafts/fidelity-v2/algebra2/*.json
//
// Keep this old command so documentation or muscle memory cannot invoke a
// stale compiler. It deliberately delegates to the certified builder rather
// than treating drafts/algebra1.json as an authoring source.

import { spawnSync } from 'node:child_process';

const args = [
  'scripts/build-algebra-fidelity-v2-production-seeds.mjs',
  ...process.argv.slice(2),
];

console.log(
  'Algebra I Fidelity V2 now uses the certified cross-course release builder. '
  + 'Delegating safely…',
);

const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
