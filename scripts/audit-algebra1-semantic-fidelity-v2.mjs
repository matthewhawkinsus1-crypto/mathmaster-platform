#!/usr/bin/env node
// Algebra I TEKS Fidelity V2 — semantic/course audit.
//
// Structural validity is necessary but not sufficient. This audit asks whether
// the compiled bank actually performs the action named by the TEKS and whether
// authored metadata describes what the student sees. It is read-only while the
// baseline is being repaired; once the rebuild standards are green, the
// high-confidence checks here should become release gates.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mathPath = require('../functions/lib/mathPath.js');

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const BANK = argOf('--bank', 'seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json');
const bank = JSON.parse(readFileSync(BANK, 'utf8'));
const docs = (bank.documents || []).filter((doc) => doc.active !== false);

const codeOf = (doc) => {
  const key = (doc.alignmentKeys || []).find((entry) => String(entry).startsWith('texas:')) || '';
  return String(key).replace(/^texas:/, '') || String(doc.assessedConstruct || '').toUpperCase();
};
const familyOf = (doc) => String(doc.familyId || doc.id || '').split(':').pop();
const lower = (value) => String(value || '').toLowerCase();
const promptText = (doc) => lower(`${doc.prompt || ''} ${doc.stimulus ? JSON.stringify(doc.stimulus) : ''}`);
const allText = (doc) => lower(JSON.stringify(doc));
const fields = (doc) => [...(doc.responseFields || []), ...(doc.answerFields || [])];
const profiles = (doc) => fields(doc).map((field) => String(field.inputProfile || field.profile || '').toLowerCase());
const hasProfile = (doc, wanted) => profiles(doc).some((profile) => wanted.includes(profile));
const hasStimulusKind = (doc, kind) => String(doc.stimulus?.kind || '').toLowerCase() === kind;

const byCode = new Map();
for (const doc of docs) {
  const code = codeOf(doc);
  if (!byCode.has(code)) byCode.set(code, []);
  byCode.get(code).push(doc);
}

const findings = [];
const add = (scope, code, message, detail = null) => findings.push({ scope, code, message, detail });

// -----------------------------------------------------------------------------
// Inventory: the shipping bank claim itself.
// -----------------------------------------------------------------------------
if (docs.length !== 245) add('course', 'inventory', `Expected 245 active Algebra I families; found ${docs.length}.`);
if (byCode.size !== 49) add('course', 'inventory', `Expected 49 Algebra I standards; found ${byCode.size}.`);
for (const [code, items] of byCode) {
  if (items.length !== 5) add('standard', code, `Expected exactly five production families; found ${items.length}.`);
}

// -----------------------------------------------------------------------------
// Metadata honesty.
// -----------------------------------------------------------------------------
const ERROR_CUES = ['student', 'mistake', 'error', 'incorrect', 'wrong', 'claims', 'says', 'which step', 'what went wrong'];
const errorAnalysis = docs.filter((doc) => doc.taskType === 'errorAnalysis');
const fakeErrorAnalysis = errorAnalysis.filter((doc) => !ERROR_CUES.some((cue) => promptText(doc).includes(cue)));
if (fakeErrorAnalysis.length) {
  add(
    'course',
    'task-label-honesty',
    `${fakeErrorAnalysis.length}/${errorAnalysis.length} errorAnalysis families contain no visible error/claim/student work in the student-facing task.`,
    fakeErrorAnalysis.map((doc) => `${codeOf(doc)}/${familyOf(doc)}`),
  );
}

const tableLabelled = docs.filter((doc) => String(doc.representation || '').toLowerCase() === 'table');
const fakeTables = tableLabelled.filter((doc) => !hasStimulusKind(doc, 'table') && doc.type !== 'multiAnswer');
if (fakeTables.length) {
  add(
    'course',
    'representation-honesty',
    `${fakeTables.length}/${tableLabelled.length} families labelled table do not carry a table stimulus.`,
    fakeTables.map((doc) => `${codeOf(doc)}/${familyOf(doc)}`),
  );
}

const graphLabelled = docs.filter((doc) => String(doc.representation || '').toLowerCase() === 'graph');
const graphTools = new Set(['functionInvestigation', 'systemsWorkspace', 'graphing2', 'dataModelingLab']);
const fakeGraphs = graphLabelled.filter((doc) => !hasStimulusKind(doc, 'graph') && !graphTools.has(String(doc.type || '')));
if (fakeGraphs.length) {
  add(
    'course',
    'representation-honesty',
    `${fakeGraphs.length}/${graphLabelled.length} families labelled graph do not carry a graph stimulus or graph-capable tool.`,
    fakeGraphs.map((doc) => `${codeOf(doc)}/${familyOf(doc)}`),
  );
}

// Pearson correlation between authored DOK and difficulty band. They are
// different constructs. A high value is not automatically invalid, but a bank
// produced from one repeated metadata ladder should be reviewed.
const pairs = docs
  .map((doc) => [Number(doc.dok), Number(doc.difficultyBand)])
  .filter(([dok, band]) => Number.isFinite(dok) && Number.isFinite(band));
const correlation = (values) => {
  if (values.length < 2) return null;
  const xs = values.map(([x]) => x);
  const ys = values.map(([, y]) => y);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0; let dx = 0; let dy = 0;
  values.forEach(([x, y]) => {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  });
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
};
const dokBandR = correlation(pairs);
if (dokBandR !== null && Math.abs(dokBandR) >= 0.75) {
  add('course', 'dok-difficulty-coupling', `DOK/difficulty correlation is ${dokBandR.toFixed(3)}; audit whether one metadata ladder is standing in for two constructs.`);
}

// Author choice IDs may follow a stable convention inside the private bank. The
// security question is whether those IDs survive into the PUBLIC issued
// question, where a student could inspect them in devtools/network traffic.
const choiceDocs = docs.filter((doc) => fields(doc).some((field) => String(field.inputProfile || '').toLowerCase() === 'choice'));
const authoredExpectedIds = new Map();
const choiceIdLeaks = [];
choiceDocs.forEach((doc, index) => {
  fields(doc).filter((field) => String(field.inputProfile || '').toLowerCase() === 'choice').forEach((field) => {
    const expected = String(field.expected || '');
    authoredExpectedIds.set(expected, (authoredExpectedIds.get(expected) || 0) + 1);
  });

  const issued = mathPath.buildSanitizedQuestion(doc, {
    questionInstanceId: `audit-choice-${index}`,
    attemptsAllowed: 3,
  });
  const publicIds = [
    ...(issued.choices || []).map((choice) => String(choice.id)),
    ...(issued.responseFields || []).flatMap((field) => (field.choices || []).map((choice) => String(choice.id))),
  ];
  const privateIds = fields(doc)
    .filter((field) => String(field.inputProfile || '').toLowerCase() === 'choice')
    .flatMap((field) => [field.expected, ...(field.accepted || [])])
    .filter((value) => value !== undefined && value !== null)
    .map(String);
  if (publicIds.some((id) => privateIds.includes(id)) || publicIds.some((id) => /^opt-\d+$/i.test(id))) {
    choiceIdLeaks.push(`${codeOf(doc)}/${familyOf(doc)}`);
  }
});
if (choiceIdLeaks.length) {
  add(
    'course',
    'choice-id-public-leak',
    `${choiceIdLeaks.length}/${choiceDocs.length} multiple-choice families expose an author/private choice id in the issued browser payload.`,
    choiceIdLeaks,
  );
}

// -----------------------------------------------------------------------------
// TEKS-action checks. These deliberately cover only high-confidence verbs. The
// point is to catch a bank that is on-topic but does not ask the student to do
// the standard.
// -----------------------------------------------------------------------------
const requireCount = (code, predicate, min, message) => {
  const items = byCode.get(code) || [];
  const count = items.filter(predicate).length;
  if (count < min) add('standard', code, `${message} Found ${count}/${items.length}; expected at least ${min}.`);
};

const MODEL_WRITING_MODES = new Set(['linearFitPrediction', 'quadraticFitPrediction', 'exponentialFitPrediction']);
const writesEquation = (doc) => (
  hasProfile(doc, ['equation', 'expression'])
  || (String(doc.type || '') === 'dataModelingLab' && MODEL_WRITING_MODES.has(String(doc.mode || '')))
);
const writesInequality = (doc) => hasProfile(doc, ['inequality']);
const fullExpression = (doc) => hasProfile(doc, ['expression', 'equation']);
const usesGraphTool = (doc) => ['functionInvestigation', 'systemsWorkspace', 'graphing2'].includes(String(doc.type || ''));

requireCount('A.2C', writesEquation, 3, 'A.2C is a write-linear-equations standard; production evidence must require writing complete equations from representations.');
requireCount('A.2H', writesInequality, 3, 'A.2H is a write-linear-inequalities-in-two-variables standard; production evidence must require writing inequalities.');
requireCount('A.2I', writesEquation, 3, 'A.2I is a write-systems standard; production evidence must require constructing equations, not merely solving/interpreting them.');

// A.3D/A.3H need a coordinate-plane region interaction. intervalNumberLine is
// explicitly a one-dimensional representation and cannot satisfy this act.
requireCount('A.3D', (doc) => usesGraphTool(doc) && doc.type !== 'intervalNumberLine', 2, 'A.3D requires coordinate-plane graphing of a two-variable inequality solution set.');
requireCount('A.3H', (doc) => usesGraphTool(doc) && doc.type !== 'intervalNumberLine', 2, 'A.3H requires coordinate-plane graphing of the overlap of two linear inequalities.');

// Model-fitting standards should produce/write a model, not only evaluate a
// supplied formula. Technology implementation may use a future data tool; the
// response evidence still needs a model/equation in the production set.
requireCount('A.4C', writesEquation, 2, 'A.4C requires writing a linear function that reasonably fits data.');
requireCount('A.8B', writesEquation, 2, 'A.8B requires writing a quadratic function that reasonably fits data using technology.');
requireCount('A.9E', writesEquation, 2, 'A.9E requires writing an exponential function that reasonably fits data using technology.');

// A.8A explicitly names four solution methods.
const a8aText = (byCode.get('A.8A') || []).map(allText).join(' ');
for (const [label, cues] of [
  ['factoring', ['factor']],
  ['square roots', ['square root', '\\sqrt']],
  ['completing the square', ['complete the square', 'completing the square']],
  ['quadratic formula', ['quadratic formula']],
]) {
  if (!cues.some((cue) => a8aText.includes(cue))) add('standard', 'A.8A', `Required solution method is absent from the production family set: ${label}.`);
}

requireCount('A.9C', writesEquation, 3, 'A.9C is a write-exponential-functions standard; component questions cannot dominate mastery evidence.');

for (const code of ['A.10A', 'A.10B', 'A.10C', 'A.10D', 'A.10E', 'A.10F']) {
  requireCount(code, fullExpression, 3, `${code} names a full polynomial operation/rewrite; production evidence should require the resulting expression/factorization/quotient, not only one coefficient or root.`);
}

const a11bText = (byCode.get('A.11B') || []).map(allText).join(' ');
if (!/(rational exponent|\^\{?1\/|\^\{?\d+\/\d+)/.test(a11bText)) {
  add('standard', 'A.11B', 'A.11B includes rational exponents, but no rational-exponent evidence was detected in the production family text.');
}

requireCount('A.12A', (doc) => (
  doc.type === 'relationMapping'
  || fields(doc).some((field) => ['function', 'not a function'].includes(lower(field.expected)))
), 3, 'A.12A mastery evidence should directly determine whether relations are functions across representations.');

requireCount('A.12D', writesEquation, 3, 'A.12D requires writing an nth-term formula from several terms; production evidence must actually write the formula.');

// -----------------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------------
console.log('# Algebra I semantic-fidelity audit\n');
console.log(`Bank: ${BANK}`);
console.log(`Generated by: ${bank.generatedBy || 'unknown'}`);
console.log(`Active families: ${docs.length}`);
console.log(`Standards: ${byCode.size}`);
console.log(`DOK/difficulty r: ${dokBandR === null ? 'n/a' : dokBandR.toFixed(3)}`);
console.log(`Findings: ${findings.length}\n`);

for (const finding of findings) {
  console.log(`- [${finding.scope}] ${finding.code}: ${finding.message}`);
  if (Array.isArray(finding.detail) && finding.detail.length) {
    finding.detail.slice(0, 12).forEach((item) => console.log(`    ${item}`));
    if (finding.detail.length > 12) console.log(`    … ${finding.detail.length - 12} more`);
  }
}

console.log('\nThis is a baseline audit, so findings do not yet set process.exitCode. Promote high-confidence checks to release blockers as each affected standard is repaired.');
