import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BANK_PATH = 'seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json';

const list = (value) => (Array.isArray(value) ? value : []);
const unique = (values) => [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))];
const codeOf = (doc) => {
  const key = list(doc.alignmentKeys)[0] || doc.assessedConstruct || 'unknown';
  return String(key).includes(':') ? String(key).split(':').pop() : String(key);
};
const text = (value) => String(value ?? '');
const hasTemplateToken = (value) => /\{\{[^}]+\}\}/.test(text(value));

const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
const docs = list(bank.documents).filter((doc) => doc?.active !== false);
const byStandard = new Map();
for (const doc of docs) {
  const code = codeOf(doc);
  if (!byStandard.has(code)) byStandard.set(code, []);
  byStandard.get(code).push(doc);
}

const expectedStrings = (doc) => list(doc.responseFields).map((field) => text(field?.expected)).filter(Boolean);
const optionLikeValues = (doc) => [
  ...list(doc.options),
  ...list(doc.choices),
  ...list(doc.answerChoices),
].flatMap((entry) => {
  if (typeof entry === 'string') return [entry];
  if (!entry || typeof entry !== 'object') return [];
  return [entry.id, entry.value, entry.label, entry.text, entry.choiceId].filter(Boolean).map(text);
});

const standardRows = [...byStandard.entries()].map(([code, items]) => {
  const reps = unique(items.map((doc) => doc.representation));
  const tasks = unique(items.map((doc) => doc.taskType));
  const doks = unique(items.map((doc) => Number(doc.dok)).filter(Number.isFinite));
  const bands = unique(items.map((doc) => Number(doc.difficultyBand)).filter(Number.isFinite));
  const generated = items.filter((doc) => doc.generator && Object.keys(doc.generator).length).length;
  const promptTemplates = items.filter((doc) => hasTemplateToken(doc.prompt)).length;
  const reviews = items.filter((doc) => doc.solutionReview && Object.keys(doc.solutionReview).length).length;
  const genericFeedback = items.filter((doc) => list(doc.attemptFeedback).some((line) =>
    text(line) === 'Use the given information to identify the relationship before computing.'
  )).length;
  return {
    code,
    families: items.length,
    generated,
    promptTemplates,
    reps: reps.length,
    tasks: tasks.length,
    doks: doks.length,
    bands: bands.length,
    reviews,
    genericFeedback,
  };
});

const generatedDocs = docs.filter((doc) => doc.generator && Object.keys(doc.generator).length);
const staticDocs = docs.filter((doc) => !doc.generator || !Object.keys(doc.generator).length);
const generatedWithStaticExpected = generatedDocs.filter((doc) => {
  const expecteds = expectedStrings(doc);
  return hasTemplateToken(doc.prompt) && expecteds.length && expecteds.every((value) => !hasTemplateToken(value));
});
const generatedWithoutTemplatePrompt = generatedDocs.filter((doc) => !hasTemplateToken(doc.prompt));
const docsWithoutReview = docs.filter((doc) => !doc.solutionReview || !Object.keys(doc.solutionReview).length);
const docsWithoutFeedback = docs.filter((doc) => !list(doc.attemptFeedback).length);
const docsWithoutHints = docs.filter((doc) => !list(doc.supportHints).length);
const answerLeakingChoiceIds = docs.filter((doc) => optionLikeValues(doc).some((value) => /(^|[-_:])(correct|answer|key)([-_:]|$)/i.test(value)));
const suspiciousTaskDok = docs.filter((doc) => {
  const dok = Number(doc.dok);
  const task = text(doc.taskType);
  return (task === 'procedural' && dok >= 3) || (task === 'strategic' && dok <= 1);
});

const weakStandards = standardRows.filter((row) =>
  row.families < 5 || row.reps < 3 || row.tasks < 3 || row.doks < 2 || row.bands < 2
);
const staticHeavyStandards = standardRows.filter((row) => row.generated < Math.ceil(row.families * 0.8));
const genericFeedbackHeavy = standardRows.filter((row) => row.genericFeedback >= Math.ceil(row.families * 0.8));

const report = {
  bank: 'algebra1',
  activeFamilies: docs.length,
  standards: standardRows.length,
  generation: {
    generatedFamilies: generatedDocs.length,
    staticFamilies: staticDocs.length,
    generatedPercent: Number(((generatedDocs.length / Math.max(1, docs.length)) * 100).toFixed(1)),
    generatedWithStaticExpected: generatedWithStaticExpected.map((doc) => doc.id),
    generatedWithoutTemplatePrompt: generatedWithoutTemplatePrompt.map((doc) => doc.id),
  },
  structuralQuality: {
    weakStandards,
    docsWithoutReview: docsWithoutReview.map((doc) => doc.id),
    docsWithoutFeedback: docsWithoutFeedback.map((doc) => doc.id),
    docsWithoutHints: docsWithoutHints.map((doc) => doc.id),
    suspiciousTaskDok: suspiciousTaskDok.map((doc) => ({ id: doc.id, taskType: doc.taskType, dok: doc.dok })),
  },
  repeatSessionDurability: {
    staticHeavyStandards,
    genericFeedbackHeavy,
  },
  answerLeakage: {
    choiceIdsContainingCorrectAnswerOrKey: answerLeakingChoiceIds.map((doc) => doc.id),
  },
  perStandard: standardRows,
};

test('TEKS Fidelity V2 Algebra I baseline audit', () => {
  assert.equal(bank.courseId, 'algebra1');
  assert.ok(docs.length > 0, 'Algebra I bank should contain active families');
  assert.ok(standardRows.length > 0, 'Algebra I bank should cover standards');
  console.log(`TEKS_FIDELITY_V2_REPORT ${JSON.stringify(report)}`);
});
