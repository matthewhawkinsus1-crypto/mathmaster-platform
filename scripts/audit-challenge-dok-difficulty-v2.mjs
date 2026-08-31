#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGET_ADAPTIVE_PAIRS = Object.freeze(['2:2', '2:3', '2:4', '3:3', '3:4']);

const numericSort = (a, b) => a.localeCompare(b, undefined, { numeric: true });

const effectiveRows = (doc) => {
  const variants = Array.isArray(doc?.variants) && doc.variants.length ? doc.variants : [null];
  return variants.map((variant) => ({
    dok: Number(variant?.dok ?? doc?.dok),
    difficultyBand: Number(variant?.difficultyBand ?? doc?.difficultyBand),
    taskType: String(variant?.taskType ?? doc?.taskType ?? 'unknown'),
    coverageKey: variant?.coverageKey ?? null,
  }));
};

export const auditStandardPackage = (payload, path = '') => {
  const pairs = new Set();
  const doks = new Set();
  const bands = new Set();
  const challengeTaskTypes = new Set();

  for (const doc of payload?.documents || []) {
    for (const row of effectiveRows(doc)) {
      if (!Number.isFinite(row.dok) || !Number.isFinite(row.difficultyBand)) continue;
      const pair = `${row.dok}:${row.difficultyBand}`;
      pairs.add(pair);
      doks.add(row.dok);
      bands.add(row.difficultyBand);
      if (pair === '3:4') challengeTaskTypes.add(row.taskType);
    }
  }

  const sortedPairs = [...pairs].sort(numericSort);
  const missingTargets = TARGET_ADAPTIVE_PAIRS.filter((pair) => !pairs.has(pair));
  const challengeReady = pairs.has('3:4');

  return {
    standard: String(payload?.standard || 'unknown'),
    path,
    familyCount: Array.isArray(payload?.documents) ? payload.documents.length : 0,
    doks: [...doks].sort((a, b) => a - b),
    difficultyBands: [...bands].sort((a, b) => a - b),
    pairs: sortedPairs,
    missingTargets,
    challengeReady,
    challengeTaskTypes: [...challengeTaskTypes].sort(),
    completeD2Axis: ['2:2', '2:3', '2:4'].every((pair) => pairs.has(pair)),
    completeD3Axis: ['3:3', '3:4'].every((pair) => pairs.has(pair)),
    fullPreferredTarget: missingTargets.length === 0,
  };
};

export const loadExceptions = (exceptionsPath) => {
  if (!exceptionsPath) return new Map();
  const absolute = resolve(exceptionsPath);
  if (!existsSync(absolute)) return new Map();
  const payload = JSON.parse(readFileSync(absolute, 'utf8'));
  const rows = Array.isArray(payload) ? payload : payload?.exceptions || [];
  return new Map(rows.map((row) => [
    String(row.standard),
    new Set((row.allowedMissingTargets || []).map(String)),
  ]));
};

export const auditCourseDirectory = (directory, { exceptions = new Map() } = {}) => {
  const absolute = resolve(directory);
  const files = readdirSync(absolute)
    .filter((name) => name.endsWith('.json'))
    .sort(numericSort);

  const standards = files.map((name) => {
    const path = resolve(absolute, name);
    const payload = JSON.parse(readFileSync(path, 'utf8'));
    const row = auditStandardPackage(payload, path);
    const allowed = exceptions.get(row.standard) || new Set();
    const undocumentedMissingTargets = row.missingTargets.filter((pair) => !allowed.has(pair));
    return {
      ...row,
      allowedMissingTargets: [...allowed].sort(numericSort),
      undocumentedMissingTargets,
    };
  }).sort((a, b) => numericSort(a.standard, b.standard));

  const countMissing = (pair) => standards.filter((row) => row.missingTargets.includes(pair)).length;

  return {
    directory,
    standardCount: standards.length,
    familyCount: standards.reduce((sum, row) => sum + row.familyCount, 0),
    challengeReadyCount: standards.filter((row) => row.challengeReady).length,
    challengeMissingCount: standards.filter((row) => !row.challengeReady).length,
    challengeMissing: standards.filter((row) => !row.challengeReady).map((row) => row.standard),
    fullPreferredTargetCount: standards.filter((row) => row.fullPreferredTarget).length,
    completeD2AxisCount: standards.filter((row) => row.completeD2Axis).length,
    completeD3AxisCount: standards.filter((row) => row.completeD3Axis).length,
    missingTargetCounts: Object.fromEntries(TARGET_ADAPTIVE_PAIRS.map((pair) => [pair, countMissing(pair)])),
    strictFailureCount: standards.filter((row) => row.undocumentedMissingTargets.length).length,
    standards,
  };
};

const compactCourse = (course) => ({
  standardCount: course.standardCount,
  familyCount: course.familyCount,
  challengeReadyCount: course.challengeReadyCount,
  challengeMissingCount: course.challengeMissingCount,
  challengeMissing: course.challengeMissing,
  fullPreferredTargetCount: course.fullPreferredTargetCount,
  completeD2AxisCount: course.completeD2AxisCount,
  completeD3AxisCount: course.completeD3AxisCount,
  missingTargetCounts: course.missingTargetCounts,
  strictFailureCount: course.strictFailureCount,
});

const printCourse = (label, course) => {
  console.log(`\n${label}`);
  console.log(`  standards: ${course.standardCount}`);
  console.log(`  families: ${course.familyCount}`);
  console.log(`  challenge ready: ${course.challengeReadyCount}/${course.standardCount}`);
  console.log(`  full preferred five-cell target: ${course.fullPreferredTargetCount}/${course.standardCount}`);
  console.log(`  complete DOK2 axis: ${course.completeD2AxisCount}/${course.standardCount}`);
  console.log(`  complete DOK3 axis: ${course.completeD3AxisCount}/${course.standardCount}`);
  console.log(`  missing cells: ${TARGET_ADAPTIVE_PAIRS.map((pair) => `${pair}=${course.missingTargetCounts[pair]}`).join(', ')}`);
  if (course.challengeMissing.length) console.log(`  challenge gaps: ${course.challengeMissing.join(', ')}`);

  console.log('\n  Per-standard gaps');
  for (const row of course.standards) {
    const missing = row.missingTargets.length ? row.missingTargets.join(',') : 'none';
    const challenge = row.challengeReady ? 'yes' : 'NO';
    console.log(`    ${row.standard}: challenge=${challenge}; missing=${missing}; pairs=${row.pairs.join(' ')}`);
  }
};

const parseArgs = (argv) => {
  const options = {
    json: false,
    strict: false,
    course: 'both',
    exceptionsPath: null,
  };
  for (const arg of argv) {
    if (arg === '--json') options.json = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg.startsWith('--course=')) options.course = arg.slice('--course='.length);
    else if (arg.startsWith('--exceptions=')) options.exceptionsPath = arg.slice('--exceptions='.length);
  }
  return options;
};

export const runAudit = ({
  root = process.cwd(),
  course = 'both',
  exceptionsPath = null,
} = {}) => {
  const exceptions = loadExceptions(exceptionsPath);
  const result = {};
  if (course === 'both' || course === 'algebra1') {
    result.algebra1 = auditCourseDirectory(
      resolve(root, 'drafts/fidelity-v2/algebra1'),
      { exceptions },
    );
  }
  if (course === 'both' || course === 'algebra2') {
    result.algebra2 = auditCourseDirectory(
      resolve(root, 'drafts/fidelity-v2/algebra2'),
      { exceptions },
    );
  }
  return result;
};

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parseArgs(process.argv.slice(2));
  const result = runAudit({
    course: options.course,
    exceptionsPath: options.exceptionsPath,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.algebra1) printCourse('Algebra I', result.algebra1);
    if (result.algebra2) printCourse('Algebra II', result.algebra2);
    console.log('\nCompact summary');
    console.log(JSON.stringify(Object.fromEntries(
      Object.entries(result).map(([key, value]) => [key, compactCourse(value)]),
    ), null, 2));
  }

  if (options.strict) {
    const failures = Object.values(result)
      .flatMap((courseResult) => courseResult.standards)
      .filter((row) => row.undocumentedMissingTargets.length);

    if (failures.length) {
      console.error('\nSTRICT FAILURE: preferred adaptive cells are still missing without an exception.');
      for (const row of failures) {
        console.error(`  ${row.standard}: ${row.undocumentedMissingTargets.join(', ')}`);
      }
      process.exitCode = 1;
    }
  }
}
