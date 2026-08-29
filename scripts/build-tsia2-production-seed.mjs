#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  compileTsia2ProductionSeed,
  tsia2ProductionSeedPaths,
} from './lib/tsia2-production-seed.mjs';

const args = new Set(process.argv.slice(2));
const writeMode = args.has('--write');
const checkMode = args.has('--check') || !writeMode;

if (args.has('--write') && args.has('--check')) {
  console.error('Choose either --check or --write, not both.');
  process.exit(2);
}

const atomicWriteJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
};

const validateCompiled = (compiled) => {
  const failures = [];
  if (compiled.framework !== 'tsia2') failures.push(`framework=${compiled.framework}`);
  if (compiled.items.length !== 200) failures.push(`items=${compiled.items.length}`);
  if (compiled.nativeSkills.length !== 25) failures.push(`nativeSkills=${compiled.nativeSkills.length}`);
  if (compiled.unroutedNativeSkills.length) failures.push(`unroutedNativeSkills=${compiled.unroutedNativeSkills.join(',')}`);
  if (compiled.crcAndDiagnosticFamilies !== 144) failures.push(`crcAndDiagnosticFamilies=${compiled.crcAndDiagnosticFamilies}`);
  if (compiled.diagnosticOnlyFamilies !== 56) failures.push(`diagnosticOnlyFamilies=${compiled.diagnosticOnlyFamilies}`);

  const ids = new Set(compiled.items.map((item) => item.id));
  if (ids.size !== compiled.items.length) failures.push('duplicate item ids');

  const direct = compiled.items.filter((item) => item.ccmrFamilyRole === 'direct').length;
  const challenge = compiled.items.filter((item) => item.ccmrFamilyRole === 'challenge').length;
  if (direct !== 125) failures.push(`direct=${direct}`);
  if (challenge !== 75) failures.push(`challenge=${challenge}`);

  for (const item of compiled.items) {
    if (!Array.isArray(item.alignmentKeys) || item.alignmentKeys.length === 0) failures.push(`${item.id}: no routing alignment`);
    if (item.assessmentContext?.framework !== 'tsia2') failures.push(`${item.id}: wrong framework`);
    if (item.assessmentContext?.examStyle !== true) failures.push(`${item.id}: examStyle must be true`);
    if (!['crcAndDiagnostic', 'diagnosticOnly'].includes(item.assessmentContext?.tsia2TestScope)) failures.push(`${item.id}: invalid scope`);
  }

  if (failures.length) {
    throw new Error(`TSIA2 production seed failed validation:\n- ${failures.slice(0, 30).join('\n- ')}${failures.length > 30 ? `\n- ... ${failures.length - 30} more` : ''}`);
  }

  return { direct, challenge };
};

const main = async () => {
  const compiled = await compileTsia2ProductionSeed();
  const counts = validateCompiled(compiled);

  const packageJson = {
    schemaVersion: 2,
    artifactType: 'pathQuestionBankSeed',
    framework: compiled.framework,
    releaseTarget: compiled.releaseTarget,
    sourceOfTruth: compiled.sourceOfTruth,
    generatedBy: 'scripts/build-tsia2-production-seed.mjs',
    nativeSkills: compiled.nativeSkills,
    documents: compiled.items,
  };

  if (writeMode) {
    atomicWriteJson(tsia2ProductionSeedPaths.root, packageJson);
    atomicWriteJson(tsia2ProductionSeedPaths.functions, packageJson);
  }

  const summary = {
    framework: compiled.framework,
    releaseTarget: compiled.releaseTarget,
    items: compiled.items.length,
    nativeSkills: compiled.nativeSkills.length,
    direct: counts.direct,
    challenge: counts.challenge,
    crcAndDiagnosticFamilies: compiled.crcAndDiagnosticFamilies,
    diagnosticOnlyFamilies: compiled.diagnosticOnlyFamilies,
    unroutedNativeSkills: compiled.unroutedNativeSkills.length,
    wroteFiles: writeMode,
    outputPaths: writeMode ? tsia2ProductionSeedPaths : null,
    mode: checkMode ? 'check' : 'write',
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
