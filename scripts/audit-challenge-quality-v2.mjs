#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STRONG_DEPTH_TYPES = new Set([
  'errorAnalysis',
  'reverseReasoning',
  'modeling',
  'comparison',
  'transfer',
  'conceptual',
]);

const SUPPORTING_DEPTH_TYPES = new Set([
  'application',
  'interpretation',
  'representationTranslation',
]);

const DEPTH_LANGUAGE = /diagnos|justify|compare|explain|verify|repair|model|interpret|reason|decid|judg|analy|error|consisten|plausib|construct|critique|evaluate|why|evidence|determine whether|defend|validate/i;

const effectiveRows = (doc) => {
  const variants = Array.isArray(doc?.variants) && doc.variants.length ? doc.variants : [null];
  return variants.map((variant) => ({
    id: doc?.id || null,
    familyId: doc?.familyId || null,
    variant: variant?.coverageKey ?? null,
    dok: Number(variant?.dok ?? doc?.dok),
    difficultyBand: Number(variant?.difficultyBand ?? doc?.difficultyBand),
    taskType: String(variant?.taskType ?? doc?.taskType ?? 'unknown'),
    representation: String(variant?.representation ?? doc?.representation ?? 'unknown'),
    type: String(variant?.type ?? doc?.type ?? 'response'),
    prompt: String(variant?.prompt ?? doc?.prompt ?? ''),
    responseFields: Array.isArray(variant?.responseFields)
      ? variant.responseFields
      : (Array.isArray(doc?.responseFields) ? doc.responseFields : []),
  }));
};

const qualityForRow = (row) => {
  if (row.dok !== 3 || row.difficultyBand !== 4) {
    return { qualifies: false, reason: 'not-challenge-cell' };
  }
  if (row.taskType === 'procedural') {
    return { qualifies: false, reason: 'procedural-only' };
  }

  const structuredTool = row.type && row.type !== 'response';
  const responseCount = row.responseFields.length;
  const languageDepth = DEPTH_LANGUAGE.test(row.prompt);

  if (STRONG_DEPTH_TYPES.has(row.taskType)) {
    return { qualifies: true, reason: 'strong-depth-task-type' };
  }
  if (structuredTool) {
    return { qualifies: true, reason: 'structured-tool' };
  }
  if (SUPPORTING_DEPTH_TYPES.has(row.taskType) && responseCount >= 2) {
    return { qualifies: true, reason: 'multi-part-supporting-depth-task' };
  }
  if (SUPPORTING_DEPTH_TYPES.has(row.taskType) && languageDepth) {
    return { qualifies: true, reason: 'reasoning-language-supporting-task' };
  }

  return {
    qualifies: false,
    reason: 'insufficient-depth-evidence',
  };
};

export const auditChallengeQualityPackage = (payload, path = '') => {
  const challengeRows = [];
  for (const doc of payload?.documents || []) {
    for (const row of effectiveRows(doc)) {
      if (row.dok !== 3 || row.difficultyBand !== 4) continue;
      challengeRows.push({ ...row, ...qualityForRow(row) });
    }
  }

  const qualifying = challengeRows.filter((row) => row.qualifies);
  return {
    standard: String(payload?.standard || 'unknown'),
    path,
    challengeCount: challengeRows.length,
    qualifyingCount: qualifying.length,
    qualityReady: qualifying.length > 0,
    challengeRows,
  };
};

export const auditChallengeQualityDirectory = (directory) => {
  const absolute = resolve(directory);
  const files = readdirSync(absolute)
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const standards = files.map((name) => {
    const path = resolve(absolute, name);
    return auditChallengeQualityPackage(JSON.parse(readFileSync(path, 'utf8')), path);
  });

  return {
    directory,
    standardCount: standards.length,
    qualityReadyCount: standards.filter((row) => row.qualityReady).length,
    qualityMissing: standards.filter((row) => !row.qualityReady).map((row) => row.standard),
    proceduralChallengeRows: standards.flatMap((row) => (
      row.challengeRows
        .filter((challenge) => challenge.taskType === 'procedural')
        .map((challenge) => ({ standard: row.standard, ...challenge }))
    )),
    standards,
  };
};

export const runChallengeQualityAudit = ({ root = process.cwd() } = {}) => ({
  algebra1: auditChallengeQualityDirectory(resolve(root, 'drafts/fidelity-v2/algebra1')),
  algebra2: auditChallengeQualityDirectory(resolve(root, 'drafts/fidelity-v2/algebra2')),
});

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runChallengeQualityAudit();
  for (const [label, course] of [['Algebra I', result.algebra1], ['Algebra II', result.algebra2]]) {
    console.log('\n' + label);
    console.log('  standards: ' + course.standardCount);
    console.log('  authentic Challenge ready: ' + course.qualityReadyCount + '/' + course.standardCount);
    console.log('  missing qualitative Challenge: ' + (course.qualityMissing.join(', ') || 'NONE'));
    console.log('  procedural 3:4 rows retained as alternates: ' + course.proceduralChallengeRows.length);
  }

  console.log('\nCompact JSON');
  console.log(JSON.stringify({
    algebra1: {
      standardCount: result.algebra1.standardCount,
      qualityReadyCount: result.algebra1.qualityReadyCount,
      qualityMissing: result.algebra1.qualityMissing,
      proceduralChallengeRowCount: result.algebra1.proceduralChallengeRows.length,
    },
    algebra2: {
      standardCount: result.algebra2.standardCount,
      qualityReadyCount: result.algebra2.qualityReadyCount,
      qualityMissing: result.algebra2.qualityMissing,
      proceduralChallengeRowCount: result.algebra2.proceduralChallengeRows.length,
    },
  }, null, 2));

  if (process.argv.includes('--strict')) {
    const missing = [...result.algebra1.qualityMissing, ...result.algebra2.qualityMissing];
    if (missing.length) {
      console.error('\nSTRICT FAILURE: standards without a qualitatively authentic DOK3/Band4 Challenge option:');
      for (const standard of missing) console.error('  ' + standard);
      process.exitCode = 1;
    }
  }
}
