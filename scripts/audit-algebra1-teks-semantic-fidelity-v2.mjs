#!/usr/bin/env node
// Algebra I TEKS Fidelity V2 — semantic honesty audit.
//
// This is deliberately different from the production build gate. The existing
// gate answers "can this family issue and grade?" This audit asks whether the
// metadata and the ACT the student performs are honest about the TEKS.
//
// Read-only. Pass --strict to exit 1 when any red-flag category is present.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mathPath = require('../functions/lib/mathPath.js');

const BANK = 'seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json';
const SOURCE_MODULES = [
  'algebra1LinearWriting.mjs',
  'algebra1LinearGraphing.mjs',
  'algebra1SystemsAndData.mjs',
  'algebra1Quadratics.mjs',
  'algebra1Exponentials.mjs',
  'algebra1PolynomialsAndFunctions.mjs',
  'algebra1Functions.mjs',
].map((name) => `seed/pathQuestionBank/authoring/${name}`);

const bank = JSON.parse(readFileSync(BANK, 'utf8'));
const docs = (bank.documents || []).filter((doc) => doc.active !== false);
const strict = process.argv.includes('--strict');

const codeOf = (doc) => String(
  (doc.alignmentKeys || []).find((entry) => String(entry).startsWith('texas:'))
  || doc.assessedConstruct
  || '',
).replace(/^texas:/, '');

const byCode = new Map();
for (const doc of docs) {
  const code = codeOf(doc);
  if (!byCode.has(code)) byCode.set(code, []);
  byCode.get(code).push(doc);
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
const pairs = docs.map((doc) => [Number(doc.dok), Number(doc.difficultyBand)]);
const meanDok = mean(pairs.map(([dok]) => dok));
const meanBand = mean(pairs.map(([, band]) => band));
const covariance = mean(pairs.map(([dok, band]) => (dok - meanDok) * (band - meanBand)));
const sdDok = Math.sqrt(mean(pairs.map(([dok]) => (dok - meanDok) ** 2)));
const sdBand = Math.sqrt(mean(pairs.map(([, band]) => (band - meanBand) ** 2)));
const dokBandCorrelation = sdDok && sdBand ? covariance / (sdDok * sdBand) : 0;

const taskPattern = (items) => items
  .map((doc) => `${doc.taskType}:D${doc.dok}B${doc.difficultyBand}`)
  .join('|');
const patterns = new Map();
for (const [code, items] of byCode) {
  const pattern = taskPattern(items);
  if (!patterns.has(pattern)) patterns.set(pattern, []);
  patterns.get(pattern).push(code);
}

const errorAnalysis = docs.filter((doc) => doc.taskType === 'errorAnalysis');
const actualErrorAnalysis = errorAnalysis.filter((doc) => (
  /\b(mistake|error|incorrect|wrong|forgets?|forgot|claim|claims|says|headline|flaw)\b/i
    .test(String(doc.prompt || ''))
));

const tableClaims = docs.filter((doc) => doc.representation === 'table');
const actualTables = tableClaims.filter((doc) => Boolean(doc.stimulus?.table));

const choiceDocs = docs.filter((doc) => (
  (doc.responseFields || []).some((field) => field.inputProfile === 'choice')
));
const correctChoiceIds = new Map();
const publicChoiceIdLeaks = [];
choiceDocs.forEach((doc, index) => {
  const choiceFields = (doc.responseFields || []).filter((field) => field.inputProfile === 'choice');
  choiceFields.forEach((field) => {
    correctChoiceIds.set(field.expected, (correctChoiceIds.get(field.expected) || 0) + 1);
  });
  const issued = mathPath.buildSanitizedQuestion(doc, {
    questionInstanceId: `teks-choice-audit-${index}`,
    attemptsAllowed: 3,
  });
  const publicIds = [
    ...(issued.choices || []).map((choice) => String(choice.id)),
    ...(issued.responseFields || []).flatMap((field) => (field.choices || []).map((choice) => String(choice.id))),
  ];
  const privateIds = choiceFields.flatMap((field) => [field.expected, ...(field.accepted || [])]).filter(Boolean).map(String);
  if (publicIds.some((id) => privateIds.includes(id)) || publicIds.some((id) => /^opt-\d+$/i.test(id))) {
    publicChoiceIdLeaks.push(`${codeOf(doc)}/${doc.id || doc.familyId || 'unknown'}`);
  }
});

const sourceText = SOURCE_MODULES.map((path) => readFileSync(path, 'utf8')).join('\n');
const sourcePairs = [...sourceText.matchAll(/code:\s*'([^']+)'[\s\S]{0,240}?slug:\s*'([^']+)'/g)]
  .map((match) => `${match[1].toUpperCase()}|${match[2]}`);
const shippingPairs = docs.map((doc) => (
  `${String(doc.assessedConstruct || codeOf(doc)).toUpperCase()}|${String(doc.familyId || '').split(':').pop()}`
));
const sourceSet = new Set(sourcePairs);
const shippingSet = new Set(shippingPairs);
const sourceShippingOverlap = [...sourceSet].filter((pair) => shippingSet.has(pair));

// Standards whose TEKS action explicitly requires writing/model construction.
const WRITING_STANDARDS = new Set([
  'A.2B', 'A.2C', 'A.2D', 'A.2E', 'A.2F', 'A.2H', 'A.2I',
  'A.4C', 'A.6B', 'A.6C', 'A.8B', 'A.9C', 'A.9E', 'A.12D',
]);
const constructedProfiles = new Set(['equation', 'expression', 'inequality']);
const writingCoverage = [...WRITING_STANDARDS].map((code) => {
  const items = byCode.get(code) || [];
  const constructed = items.filter((doc) => (
    (doc.responseFields || []).some((field) => constructedProfiles.has(field.inputProfile))
  )).length;
  return { code, constructed, total: items.length };
});

// Standards whose named action is a graph/technology act rather than a typed
// proxy. These are the most consequential representation mismatches found.
const interactionFindings = [];
const hasType = (code, type) => (byCode.get(code) || []).some((doc) => doc.type === type);

if (hasType('A.3D', 'intervalNumberLine')) {
  interactionFindings.push('A.3D uses intervalNumberLine even though the TEKS requires graphing a two-variable linear inequality.');
}
if (!hasType('A.3H', 'systemsWorkspace') && !(byCode.get('A.3H') || []).some((doc) => doc.type === 'functionInvestigation')) {
  interactionFindings.push('A.3H has no graph workspace even though the TEKS requires graphing a system of two linear inequalities.');
}
for (const code of ['A.4A', 'A.4C', 'A.8B', 'A.9E']) {
  const items = byCode.get(code) || [];
  if (!items.some((doc) => /data|regression|model/i.test(String(doc.type || '')))) {
    interactionFindings.push(`${code} has no Path technology/data-modeling interaction despite technology/model-fitting language in the TEKS.`);
  }
}

const allFive = [...byCode.values()].every((items) => items.length === 5);
const allGenerated = docs.every((doc) => Boolean(doc.generator));
const familyVersions = [...new Set(docs.map((doc) => doc.familyVersion))];

console.log('# Algebra I TEKS Fidelity V2 — semantic honesty audit\n');
console.log(`Shipping generator label: ${bank.generatedBy}`);
console.log(`Active families: ${docs.length}`);
console.log(`Standards: ${byCode.size}`);
console.log(`Exactly five families per standard: ${allFive ? 'yes' : 'NO'}`);
console.log(`Every family generative: ${allGenerated ? 'yes' : 'NO'}`);
console.log(`Family versions present: ${familyVersions.join(', ')}\n`);

console.log('## 1. Metadata honesty\n');
console.log(`DOK/difficulty correlation: ${dokBandCorrelation.toFixed(3)}`);
console.log(`Error-analysis labels: ${errorAnalysis.length}; prompts that actually present an error/claim/mistake: ${actualErrorAnalysis.length}`);
console.log(`Table representation labels: ${tableClaims.length}; families that actually carry a table stimulus: ${actualTables.length}`);
console.log(`Distinct task/DOK/band patterns across 49 standards: ${patterns.size}`);
[...patterns.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([pattern, codes]) => console.log(`  ${codes.length} standards: ${pattern}`));

console.log('\n## 2. Public choice-id security\n');
console.log(`Multiple-choice families: ${choiceDocs.length}`);
console.log('Private author/grading ids: '
  + [...correctChoiceIds.entries()].map(([id, count]) => `${id}=${count}`).join(', '));
console.log(`Issued questions leaking a private/predictable id: ${publicChoiceIdLeaks.length}`);
console.log('Stable author ids are allowed inside the private bank; issued browser choices must use opaque runtime ids that are independent of correctness.');

console.log('\n## 3. Canonical-source drift\n');
console.log(`Old authored-module families parsed: ${sourceSet.size}`);
console.log(`Shipping families: ${shippingSet.size}`);
console.log(`Matching code+family slugs between the two sources: ${sourceShippingOverlap.length}`);
console.log('A build/import path must have one declared source of truth before Fidelity V2 authoring begins.');

console.log('\n## 4. Writing-action coverage\n');
writingCoverage.forEach(({ code, constructed, total }) => {
  console.log(`  ${code}: ${constructed}/${total} families require an equation/expression/inequality response`);
});

console.log('\n## 5. Interaction/technology mismatches\n');
interactionFindings.forEach((finding) => console.log(`  - ${finding}`));

const redFlags = [
  dokBandCorrelation > 0.8,
  actualErrorAnalysis.length < Math.ceil(errorAnalysis.length / 2),
  actualTables.length < Math.ceil(tableClaims.length / 2),
  publicChoiceIdLeaks.length > 0,
  sourceShippingOverlap.length === 0,
  interactionFindings.length > 0,
].filter(Boolean).length;

console.log(`\nRed-flag categories: ${redFlags}`);
if (strict && redFlags) process.exitCode = 1;
