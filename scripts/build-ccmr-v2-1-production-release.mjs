#!/usr/bin/env node
import {
  compileCcmrV21ProductionRelease,
  compareCommittedProductionMirrors,
  writeCcmrV21ProductionRelease,
} from './lib/ccmr-v2-1-production-release.mjs';

const args = new Set(process.argv.slice(2));
const writeMode = args.has('--write');
const checkModeExplicit = args.has('--check');
const unknown = [...args].filter((arg) => !['--check', '--write'].includes(arg));

if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(', ')}`);
  process.exit(2);
}
if (writeMode && checkModeExplicit) {
  console.error('Choose either --check or --write, not both.');
  process.exit(2);
}
if (!writeMode && !checkModeExplicit) {
  console.error('Choose one mode: --check or --write.');
  process.exit(2);
}

try {
  const release = await compileCcmrV21ProductionRelease();

  if (writeMode) {
    const writeSummary = writeCcmrV21ProductionRelease(release.packages);
    const mirrorReport = compareCommittedProductionMirrors(release.packages);
    const output = {
      mode: 'write',
      release: release.summary,
      writeSummary,
      mirrorStatus: mirrorReport.statusByFramework,
      failures: mirrorReport.failures,
    };
    console.log(JSON.stringify(output, null, 2));
    if (mirrorReport.failures.length) process.exitCode = 1;
  } else {
    const mirrorReport = compareCommittedProductionMirrors(release.packages);
    const output = {
      mode: 'check',
      release: release.summary,
      mirrorStatus: mirrorReport.statusByFramework,
      failures: mirrorReport.failures,
    };
    console.log(JSON.stringify(output, null, 2));
    if (mirrorReport.failures.length) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
}
