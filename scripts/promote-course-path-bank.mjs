#!/usr/bin/env node
// Safe in-place promotion for the current Algebra I Path bank.
//
//   node scripts/promote-course-path-bank.mjs algebra1 --check
//   node scripts/promote-course-path-bank.mjs algebra1
//
// The check mode writes nothing. Promotion allows ids already owned by the
// target Algebra I bank, rejects cross-bank collisions, runs generation/render
// and Fidelity V2 semantic gates, writes both seed mirrors, rebuilds the
// manifest, and rolls every changed file back if any post-write step fails.
// It never deploys Firebase or refreshes Firestore.

import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { getTexasStandard, normalizeTeksCode } from '../src/texasStandards.js';
import { isMathSegment, splitMathSegments } from '../src/components/common/mathSegments.js';
import { hasPathGenerator, samplePathInstances } from '../functions/shared/pathQuestionGeneration.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../functions/lib/mathPath.js');
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const primaryDir = join(root, 'seed', 'pathQuestionBank');
const mirrorDir = join(root, 'functions', 'seeds', 'pathQuestionBank');
const courseId = String(process.argv[2] || '').trim();
const checkOnly = process.argv.includes('--check');

if (courseId !== 'algebra1') {
  console.error('Usage: node scripts/promote-course-path-bank.mjs algebra1 [--check]');
  process.exit(2);
}

const draftPath = join(root, 'drafts', 'algebra1.json');
const seedName = 'algebra1_pathQuestionBank_seed.json';
const primarySeedPath = join(primaryDir, seedName);
const mirrorSeedPath = join(mirrorDir, seedName);
const primaryManifestPath = join(primaryDir, 'PATH_BANK_COVERAGE_MANIFEST.json');
const mirrorManifestPath = join(mirrorDir, 'PATH_BANK_COVERAGE_MANIFEST.json');
const documentsIn = (value) => Array.isArray(value) ? value : (value.documents || value.items || value.questions || []);
const active = (docs) => docs.filter((doc) => doc?.active !== false);
const texasCode = (value) => normalizeTeksCode(String(value || '').replace(/^texas:/i, ''));
const primaryCode = (doc) => texasCode((doc.alignmentKeys || [])[0] || doc.assessedConstruct || '');
const constructed = (field) => ['equation', 'expression', 'inequality'].includes(String(field?.inputProfile || ''));

const everyString = (node, found = []) => {
  if (typeof node === 'string') { found.push(node); return found; }
  if (Array.isArray(node)) { node.forEach((entry) => everyString(entry, found)); return found; }
  if (node && typeof node === 'object') Object.values(node).forEach((entry) => everyString(entry, found));
  return found;
};
const unbalancedMath = (text) => {
  const count = (String(text).match(/(?<!\\)\$/g) || []).length;
  return count > 1 && count % 2 === 1;
};
const rawLatexOutsideMath = (text) => splitMathSegments(text)
  .filter((segment) => !isMathSegment(segment))
  .some((segment) => /\\(?:frac|dfrac|sqrt|left|right|cdot|times|le|ge|infty|cup|begin|end)\b/.test(segment));

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
const correlation = (pairs) => {
  const mx = mean(pairs.map((pair) => pair[0]));
  const my = mean(pairs.map((pair) => pair[1]));
  const covariance = mean(pairs.map((pair) => (pair[0] - mx) * (pair[1] - my)));
  const sx = Math.sqrt(mean(pairs.map((pair) => (pair[0] - mx) ** 2)));
  const sy = Math.sqrt(mean(pairs.map((pair) => (pair[1] - my) ** 2)));
  return sx && sy ? covariance / (sx * sy) : 0;
};

function semanticProblems(documents) {
  const problems = [];
  const docs = active(documents);
  const byCode = new Map();
  docs.forEach((doc) => {
    const code = primaryCode(doc);
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(doc);
  });

  docs.filter((doc) => doc.taskType === 'errorAnalysis').forEach((doc) => {
    const material = String(doc.prompt || '') + ' ' + JSON.stringify(doc.stimulus || null);
    if (!/\b(mistake|error|incorrect|wrong|forgets?|forgot|claim|claims|says|flaw)\b/i.test(material)) {
      problems.push(doc.id + ': errorAnalysis label has no erroneous work or claim to analyze');
    }
  });
  docs.filter((doc) => doc.representation === 'table').forEach((doc) => {
    if (!(doc.stimulus?.kind === 'table' && doc.stimulus?.table)) {
      problems.push(doc.id + ': table representation has no rendered table stimulus');
    }
  });

  const pairs = docs.map((doc) => [Number(doc.dok), Number(doc.difficultyBand)])
    .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
  const value = correlation(pairs);
  if (value > 0.80) problems.push('course: DOK/difficulty correlation ' + value.toFixed(3) + ' is too high');

  const writingMinimum = {
    'A.2B': 3, 'A.2C': 3, 'A.2D': 2, 'A.2E': 3, 'A.2F': 3, 'A.2G': 2,
    'A.2H': 3, 'A.2I': 3, 'A.4C': 3, 'A.6B': 3, 'A.6C': 3, 'A.8B': 3,
    'A.9C': 3, 'A.9E': 3, 'A.12D': 3,
  };
  Object.entries(writingMinimum).forEach(([code, minimum]) => {
    const items = byCode.get(code) || [];
    const count = items.filter((doc) => (doc.responseFields || []).some(constructed)).length;
    if (count < minimum) problems.push(code + ': only ' + count + '/' + items.length + ' families require the construction named by the TEKS; need ' + minimum);
  });

  const has = (code, predicate) => (byCode.get(code) || []).some(predicate);
  if (!has('A.3D', (doc) => doc.type === 'graphing2' && String(doc.mode || doc.graphMode || '') === 'linearInequality')) {
    problems.push('A.3D: missing server-graded two-variable inequality graph construction');
  }
  if (!has('A.3H', (doc) => doc.type === 'systemsWorkspace' && String(doc.mode || '') === 'inequalities')) {
    problems.push('A.3H: missing server-graded systems-of-inequalities graph construction');
  }
  ['A.4A', 'A.4C', 'A.8B', 'A.9E'].forEach((code) => {
    if (!has(code, (doc) => ['dataModeling', 'dataModelingLab'].includes(String(doc.type || '')))) {
      problems.push(code + ': missing server-graded data/modeling technology family');
    }
  });

  const a8a = (byCode.get('A.8A') || []).map((doc) => String(doc.familyId || '') + ' ' + String(doc.prompt || '')).join(' ');
  [
    ['factoring', /factor/i],
    ['square roots', /square\s*root|sqrt/i],
    ['completing the square', /complet(?:e|ing)\s+the\s+square/i],
    ['quadratic formula', /quadratic\s+formula/i],
  ].forEach(([name, pattern]) => {
    if (!pattern.test(a8a)) problems.push('A.8A: no family visibly assesses ' + name);
  });

  ['A.10A', 'A.10B', 'A.10C', 'A.10D', 'A.10E', 'A.10F', 'A.11B'].forEach((code) => {
    const items = byCode.get(code) || [];
    const count = items.filter((doc) => (doc.responseFields || []).some((field) => ['expression', 'equation'].includes(String(field.inputProfile || '')))).length;
    if (count < 3) problems.push(code + ': only ' + count + '/' + items.length + ' families require a full algebraic expression/equation; need 3');
  });

  if (!has('A.9D', (doc) => {
    const params = Object.values(doc.generator?.parameters || {});
    return params.some((param) => param?.type === 'choice' && Array.isArray(param.values)
      && param.values.some((item) => Number(item) > 0 && Number(item) < 1))
      || params.some((param) => ['float', 'number'].includes(String(param?.type || ''))
        && Number(param.min) > 0 && Number(param.max) < 1);
  })) {
    problems.push('A.9D: no generator visibly produces an exponential decay base between 0 and 1');
  }

  const a12a = byCode.get('A.12A') || [];
  const reps = new Set();
  a12a.forEach((doc) => {
    if (doc.type === 'relationMapping') reps.add('mapping');
    if (doc.stimulus?.kind === 'table' && doc.stimulus?.table) reps.add('table');
    if (['functionInvestigation', 'graphing2'].includes(String(doc.type || '')) || doc.stimulus?.kind === 'graph') reps.add('graph');
  });
  ['mapping', 'table', 'graph'].forEach((rep) => {
    if (!reps.has(rep)) problems.push('A.12A: missing authentic ' + rep + ' function-classification representation');
  });

  return problems;
}

const draft = JSON.parse(readFileSync(draftPath, 'utf8'));
const documents = documentsIn(draft);
const problems = [];
const seedFiles = readdirSync(primaryDir).filter((name) => name.endsWith('_pathQuestionBank_seed.json')).sort();

seedFiles.forEach((name) => {
  const left = readFileSync(join(primaryDir, name), 'utf8');
  const right = readFileSync(join(mirrorDir, name), 'utf8');
  if (left !== right) problems.push(name + ': seed mirrors already disagree');
});

const otherIds = new Set(seedFiles.filter((name) => name !== seedName)
  .flatMap((name) => documentsIn(JSON.parse(readFileSync(join(primaryDir, name), 'utf8')))
    .map((doc) => String(doc?.id || '')).filter(Boolean)));

const seen = new Set();
const byCode = new Map();

for (const document of documents) {
  const id = String(document?.id || '').trim();
  if (!id) problems.push('(document): missing id');
  if (id && seen.has(id)) problems.push(id + ': duplicate id inside Algebra I draft');
  if (id && otherIds.has(id)) problems.push(id + ': id collides with another bank');
  if (id) seen.add(id);

  const keys = Array.isArray(document?.alignmentKeys) ? document.alignmentKeys : [];
  if (!keys.length) problems.push(id + ': no alignmentKeys');
  keys.forEach((key) => {
    const code = texasCode(key);
    if (!code || !getTexasStandard(code)) problems.push(id + ': unknown standard ' + key);
  });

  const code = primaryCode(document);
  const standard = getTexasStandard(code);
  if (!standard || standard.courseId !== 'algebra1') {
    problems.push(id + ': primary standard ' + (code || '(blank)') + ' is not Algebra I');
  } else {
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(document);
  }

  // eslint-disable-next-line no-await-in-loop
  const plan = await mathPath.buildTemplateIssuePlan(document, { samples: 10 });
  if (!plan.issuable) problems.push(id + ': not production-issuable (' + plan.reason + ')');

  const generated = hasPathGenerator(document)
    ? samplePathInstances(document, 8).map((entry) => entry.question).filter(Boolean)
    : [document];
  if (hasPathGenerator(document) && generated.length < 8) problems.push(id + ': generator failed sampled draws');

  const rendered = new Set();
  generated.forEach((instance) => {
    rendered.add(JSON.stringify({
      prompt: instance?.prompt || '',
      choices: (instance?.choices || []).map((choice) => choice?.label || ''),
      stimulus: instance?.stimulus || null,
    }));
    everyString(instance).forEach((value) => {
      if (unbalancedMath(value)) problems.push(id + ': unbalanced math delimiter');
      if (rawLatexOutsideMath(value)) problems.push(id + ': LaTeX command outside math');
      if (/\{\{/.test(value)) problems.push(id + ': unsubstituted generator placeholder');
    });
  });
  if (hasPathGenerator(document) && rendered.size < 4) problems.push(id + ': generator produced only ' + rendered.size + ' distinct instances in 8 draws');
}

if (byCode.size !== 49) problems.push('course: expected 49 standards, found ' + byCode.size);
for (const [code, items] of byCode) {
  const count = active(items).length;
  if (count < 5) problems.push(code + ': only ' + count + ' active families; need at least 5');
}
problems.push(...semanticProblems(documents));

const uniqueProblems = [...new Set(problems)];
console.log('# Algebra I Path-bank promotion check');
console.log('Documents: ' + documents.length);
console.log('Standards: ' + byCode.size);
console.log('Mode: ' + (checkOnly ? 'CHECK ONLY' : 'PROMOTE IF CLEAN'));
console.log('Problems: ' + uniqueProblems.length);
uniqueProblems.slice(0, 180).forEach((problem) => console.log('  - ' + problem));
if (uniqueProblems.length > 180) console.log('  ...and ' + (uniqueProblems.length - 180) + ' more');

if (uniqueProblems.length) {
  console.log('\nNothing was written.');
  process.exit(1);
}
if (checkOnly) {
  console.log('\nAll release gates passed. No files were written.');
  process.exit(0);
}

const snapshots = {
  primarySeed: readFileSync(primarySeedPath, 'utf8'),
  mirrorSeed: readFileSync(mirrorSeedPath, 'utf8'),
  primaryManifest: readFileSync(primaryManifestPath, 'utf8'),
  mirrorManifest: readFileSync(mirrorManifestPath, 'utf8'),
};
const payload = {
  ...draft,
  schemaVersion: 1,
  targetCollection: 'pathQuestionBank',
  courseId: 'algebra1',
  generatedBy: 'scripts/promote-course-path-bank.mjs from drafts/algebra1.json',
  documents,
};
const seedText = JSON.stringify(payload, null, 2) + '\n';

try {
  writeFileSync(primarySeedPath, seedText);
  writeFileSync(mirrorSeedPath, seedText);

  const rebuilt = spawnSync(process.execPath, [join(root, 'scripts', 'rebuild-path-manifest.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  if (rebuilt.status !== 0) throw new Error('manifest rebuild failed: ' + String(rebuilt.stderr || rebuilt.stdout || '').trim());

  const manifestText = readFileSync(primaryManifestPath, 'utf8');
  writeFileSync(mirrorManifestPath, manifestText);

  if (readFileSync(primarySeedPath, 'utf8') !== readFileSync(mirrorSeedPath, 'utf8')) {
    throw new Error('seed mirrors differ after promotion');
  }
  if (readFileSync(primaryManifestPath, 'utf8') !== readFileSync(mirrorManifestPath, 'utf8')) {
    throw new Error('manifest mirrors differ after promotion');
  }

  console.log('\nPromotion succeeded locally.');
  console.log('Both Algebra I seed mirrors and both manifest mirrors match.');
  console.log('Firestore was NOT changed. Merge/deploy remains a separate reviewed action.');
} catch (error) {
  writeFileSync(primarySeedPath, snapshots.primarySeed);
  writeFileSync(mirrorSeedPath, snapshots.mirrorSeed);
  writeFileSync(primaryManifestPath, snapshots.primaryManifest);
  writeFileSync(mirrorManifestPath, snapshots.mirrorManifest);
  console.error('\nPromotion failed; all changed seed/manifest files were restored.');
  console.error(error?.message || String(error));
  process.exit(1);
}
