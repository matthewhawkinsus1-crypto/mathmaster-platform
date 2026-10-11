import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { TOOL_CATALOG } from '../../src/tools/toolCatalog.js';
import * as linearEquations from '../../src/platform/supports/families/linearEquations.js';
import * as systems from '../../src/platform/supports/families/systems.js';
import * as linesAndSlope from '../../src/platform/supports/families/linesAndSlope.js';
import * as fractions from '../../src/platform/supports/families/fractions.js';
import * as pointsAndIntervals from '../../src/platform/supports/families/pointsAndIntervals.js';
import * as functionFeatures from '../../src/platform/supports/families/functionFeatures.js';
import * as inverseComposition from '../../src/platform/supports/families/inverseComposition.js';
import * as transformations from '../../src/platform/supports/families/transformations.js';
import * as quadraticsAbsoluteValue from '../../src/platform/supports/families/quadraticsAbsoluteValue.js';
import * as dataAndModels from '../../src/platform/supports/families/dataAndModels.js';
import { effectivePathVariants, generatePathInstanceWithRetries, hasPathGenerator } from '../../functions/shared/pathQuestionGeneration.mjs';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';

const require = createRequire(import.meta.url);
const compiler = require('../../functions/lib/pathContentCompiler.js');
const { bankDocumentToV5Intent } = require('../../functions/lib/ccmrAssignmentBank.js');

/*
 * JOB K COMPLETENESS SWEEP — WHICH CLOSED QUESTIONS STILL SHOW ONLY THE ANSWER.
 *
 * Coordinator finding m9: a closed question whose "worked solution" is the
 * per-field answer list and nothing else. Every authored item in the banks is
 * run through the review panel's own model, buildClosedQuestionReview
 * (src/platform/supports/review/closedQuestionReview.js), exactly as
 * SolutionReviewPanel calls it, and classified:
 *
 *   STEPS        authored reasoning (the item's own solutionReview, or its
 *                family's workedSolution filling that shape) or a tool review
 *                with steps;
 *   ANSWER-ONLY  anything else: the legacy answer list, a tool review that
 *                only reads off values, or nothing at all.
 *
 * `legacyContent` is a stub that reports content whenever the question has
 * answer fields: it stands in for SolutionReview.jsx's per-field answer list
 * (node cannot import .jsx), and it is the case m9 is about.
 *
 * The sources, each the way its product builds the question:
 *   path      functions/seeds/pathQuestionBank/*.json, compiled by the Path
 *             content compiler and drawn by the production generator (the
 *             issue path's instance, before it is sanitized for the browser);
 *   ccmr-v5   the exam-style ACT / Digital SAT / TSIA2 families of the same
 *             banks as Assignments hydrate them (bankDocumentToV5Intent ->
 *             compileAuthoringIntentV5 -> generateQuestion);
 *   drafts    drafts/** Path documents NOT already in a seed bank (same id is
 *             the same family; the shipped copy is swept above), same path;
 *   v5        teacher-import-jsons/** through parseAssignmentBlueprintText
 *             (compileAuthoringIntentV5), each item resolved as seat 0 sees
 *             it; drafts/district-dol2, stored already compiled, every variant;
 *   secure    functions/seeds/secureAssessments/** variants;
 *   demo      src/demo/demoAssignmentBank.json through generateQuestion.
 *
 * Generated templates are SAMPLED: one seeded draw per variant row (logged).
 * The STEPS count is pinned from below, so a lane that loses steps goes red;
 * the ANSWER-ONLY groups are logged for the coordinator.
 */

const FAMILY_NAMES = new Map(Object.entries({
  linearEquations, systems, linesAndSlope, fractions, pointsAndIntervals, functionFeatures, inverseComposition, transformations, quadraticsAbsoluteValue, dataAndModels,
}).map(([name, module]) => [module, name]));

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const jsonFilesUnder = (dir) => readdirSync(new URL(dir, ROOT)).flatMap((name) => {
  const path = `${dir}/${name}`;
  if (statSync(new URL(path, ROOT)).isDirectory()) return jsonFilesUnder(path);
  return name.endsWith('.json') ? [path] : [];
}).sort();

const SEED = 'k-steps-inventory';

// "Has answer fields": what the legacy per-field answer list (or a workflow's
// answer entries) would print.
const present = (value) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && !value.length);
const hasAnswerFields = (question) => Boolean(
  ['responseFields', 'answerFields', 'acceptedAnswers', 'answer', 'expected', 'correctAnswer', 'solution', 'generatedAnswer', 'grading']
    .some((key) => present(question?.[key]))
  || Object.keys(question || {}).some((key) => /^correct[A-Z]/.test(key) && present(question[key])),
);
const legacyContent = (question) => ({ hasContent: hasAnswerFields(question) });

// QuestionEngine's isToolQuestion: the registry knows the toolId, or else the
// type (toolRegistry.js is React; its ids are TOOL_CATALOG's).
const toolIdOf = (question) => [question?.toolId, question?.type].find((id) => id && Object.hasOwn(TOOL_CATALOG, id)) || null;
const reviewOf = (question) => buildClosedQuestionReview({ question, isToolQuestion: Boolean(toolIdOf(question)), wasCorrect: false, legacyContent });

const hasStepsFrom = (review) => Boolean(review?.authored?.reasoning?.length || review?.tool?.steps?.length);

// Why an item has no steps: the first reason that holds, in the order a fix would be made.
const whyAnswerOnly = (question, review) => {
  if (!review?.hasContent) return 'nothing to show at all';
  if (toolIdOf(question)) {
    const model = buildToolSolutionReviewModel(question);
    if (!model) return 'tool has no review builder';
    return model.items?.length ? 'tool review reads values off (no steps)' : 'tool review builder produced nothing';
  }
  const family = familyFor(question);
  const authoredNoSteps = review?.authored && !review.authored.reasoning?.length ? 'authored review without steps; ' : '';
  if (!family) return `${authoredNoSteps}no family covers it`;
  const name = FAMILY_NAMES.get(family) || 'unknown family';
  if (typeof family.workedSolution !== 'function') return `${authoredNoSteps}family ${name} has no workedSolution`;
  return `${authoredNoSteps}family ${name} returns null for this shape`;
};

const kindOf = (question) => (toolIdOf(question) ? `tool:${toolIdOf(question)}` : `${question?.questionType || question?.type || 'unknown'}${question?.responseFields?.length ? `/${[...new Set(question.responseFields.map((field) => field.inputProfile || field.type || 'text'))].join('+')}` : ''}`);

const inventory = { STEPS: 0, ANSWER_ONLY: 0, bySource: {}, groups: new Map(), sampled: {} };
const record = (source, question, where) => {
  const review = reviewOf(question);
  const bucket = (inventory.bySource[source] ||= { steps: 0, answerOnly: 0, fromFamily: 0 });
  if (hasStepsFrom(review)) {
    inventory.STEPS += 1;
    bucket.steps += 1;
    if (review.fromFamily) bucket.fromFamily += 1;
    return;
  }
  inventory.ANSWER_ONLY += 1;
  bucket.answerOnly += 1;
  const why = whyAnswerOnly(question, review);
  const key = `${source} | ${kindOf(question)} | ${why}`;
  const group = inventory.groups.get(key) || { source, kind: kindOf(question), why, count: 0, example: '', where };
  group.count += 1;
  if (!group.example) group.example = String(question?.prompt || question?.question || question?.title || '').replace(/\s+/g, ' ').slice(0, 160);
  inventory.groups.set(key, group);
};

/* --------------------------------------------------------------- Path -- */
const PATH_BANKS = ['grade6', 'grade7', 'grade8', 'algebra1', 'algebra2', 'act', 'asvab', 'digitalSAT', 'tsia2'];
const seedDocuments = new Map();
const sweepPathDocuments = (source, documents) => {
  const compiled = compiler.compilePathQuestionPackage(documents, { defaults: { builtInPathSeed: 'mathmaster-built-in-path-bank' } });
  inventory.sampled[`${source} compile errors`] = (inventory.sampled[`${source} compile errors`] || 0) + compiled.errors.length;
  for (const { document } of compiled.documents) {
    if (document.active === false) continue;
    for (const row of effectivePathVariants(document)) {
      const generated = hasPathGenerator(row.template);
      const instance = generated ? generatePathInstanceWithRetries(row.template, SEED, 4) : { question: row.template };
      if (generated) inventory.sampled[`${source} generated rows (1 draw each)`] = (inventory.sampled[`${source} generated rows (1 draw each)`] || 0) + 1;
      if (!instance?.question) continue;
      record(source, instance.question, `${document.id}#${row.variantIndex ?? 'base'}`);
    }
  }
};

const started = Date.now();
for (const bank of PATH_BANKS) {
  const parsed = readJson(`functions/seeds/pathQuestionBank/${bank}_pathQuestionBank_seed.json`);
  const documents = Array.isArray(parsed) ? parsed : (parsed.documents || []);
  documents.forEach((document) => seedDocuments.set(document.id, bank));
  sweepPathDocuments(`path:${bank}`, documents);
}
inventory.sampled.pathMs = Date.now() - started;

/* ------------------------------------------- CCMR as Assignments use it -- */
for (const framework of ['act', 'digitalSAT', 'tsia2']) {
  const documents = readJson(`functions/seeds/pathQuestionBank/${framework}_pathQuestionBank_seed.json`).documents.filter((item) => item.active !== false
    && item.assessmentContext?.examStyle === true
    && item.assessmentContext?.framework === framework
    && item.ccmrAuthenticLanguage?.authored === true);
  if (!documents.length) continue;
  const templates = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: `K inventory ${framework}`, courseId: 'algebra1', instructionalPurpose: 'review', gradingPurpose: 'practice' },
    sections: [{ role: 'practice', title: 'Practice', questions: documents.map((item) => bankDocumentToV5Intent(item)) }],
  }).package.sections[0].questions;
  templates.forEach((template, index) => record(`ccmr-v5:${framework}`, generateQuestion(template, `${SEED}|${documents[index].id}`), documents[index].id));
}

/* ------------------------------------------------------------- drafts -- */
const draftPathFiles = jsonFilesUnder('drafts').filter((path) => !path.startsWith('drafts/district-dol2/'));
let draftDuplicates = 0;
for (const path of draftPathFiles) {
  let parsed;
  try { parsed = readJson(path); } catch { continue; }
  const documents = Array.isArray(parsed?.documents) ? parsed.documents : [];
  const fresh = documents.filter((document) => document?.id && !seedDocuments.has(document.id));
  draftDuplicates += documents.length - fresh.length;
  if (fresh.length) sweepPathDocuments('drafts', fresh);
}
inventory.sampled['drafts documents already in a seed bank (skipped)'] = draftDuplicates;

/* ----------------------------------------------------- V5 assignments -- */
const V5_FILES = jsonFilesUnder('teacher-import-jsons');
for (const path of V5_FILES) {
  const questions = parseAssignmentBlueprintText(read(path)).questions;
  questions.forEach((template, index) => {
    let question = template;
    try {
      question = resolveFamilyQuestionInstance({ question: template, assignmentId: SEED, storageIndex: index, allocation: { seat: 0 } }).question || template;
    } catch { /* not a family template: the item is served as authored */ }
    record(`v5:${path.split('/').slice(-2).join('/')}`, question, `${path}#${index}`);
  });
}

// DOL2 review is stored compiled (runtime-shaped tasks, 48 variants each): every variant.
for (const task of readJson('drafts/district-dol2/assignment.json').sections.flatMap((section) => section.questions)) {
  const variants = Array.isArray(task.variants) && task.variants.length ? task.variants : [{}];
  variants.forEach((variant, index) => record('v5:district-dol2/assignment.json', { ...task, ...variant }, `${task.questionId}#${index}`));
}

/* ------------------------------------------------------------- secure -- */
for (const path of jsonFilesUnder('functions/seeds/secureAssessments')) {
  for (const family of readJson(path).documents || []) {
    const variants = Array.isArray(family.variants) && family.variants.length ? family.variants : [{}];
    variants.forEach((variant, index) => record(`secure:${path.split('/').pop()}`, { ...family, ...variant }, `${family.id}#${index}`));
  }
}

/* --------------------------------------------------------------- demo -- */
for (const assignment of readJson('src/demo/demoAssignmentBank.json')) {
  for (const authored of assignment.questions) record('demo', generateQuestion(authored, `${SEED}|${authored.questionId}`), authored.questionId);
}
inventory.sampled.totalMs = Date.now() - started;

const groupsBySize = () => [...inventory.groups.values()].sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));

// The STEPS count per source on this tree (one draw per generated row, seed
// above), and how many of them a support family's workedSolution supplied.
// A floor, not an equality: more steps is progress; fewer is a regression.
const STEPS_FLOOR = Object.freeze({
  'path:grade6': 237, 'path:grade7': 212, 'path:grade8': 227, 'path:algebra1': 369, 'path:algebra2': 350,
  'path:act': 136, 'path:asvab': 1176, 'path:digitalSAT': 648, 'path:tsia2': 200,
  'ccmr-v5:act': 136, 'ccmr-v5:digitalSAT': 648, 'ccmr-v5:tsia2': 200,
  drafts: 3295,
  'v5:algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json': 25,
  'v5:algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json': 13,
  'v5:algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json': 17,
  'v5:algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json': 16,
  'v5:algebra2-honors-module1/L2_Day1_Parent_Functions_Key_Attributes.json': 19,
  'v5:algebra2-honors-module1/L2_Day2_Transformations.json': 10,
  'v5:algebra2-honors-module1/L3_Inverse_Linear_Functions.json': 19,
  'v5:algebra2-honors-module1/L4_Operations_on_Functions_Composition.json': 20,
  demo: 26,
});
const STEPS_TOTAL_FLOOR = 7999;
const FROM_FAMILY_FLOOR = 119;

test('inventory: every authored item is classified STEPS or ANSWER-ONLY (the answer-only groups are logged)', (t) => {
  t.diagnostic(`sampled: ${JSON.stringify(inventory.sampled)}`);
  t.diagnostic(`by source: ${JSON.stringify(inventory.bySource)}`);
  t.diagnostic(`STEPS ${inventory.STEPS}  ANSWER-ONLY ${inventory.ANSWER_ONLY}`);
  for (const group of groupsBySize()) t.diagnostic(`ANSWER-ONLY ${group.count} × ${group.source} | ${group.kind} | ${group.why} | e.g. ${group.where}: ${group.example}`);
  const answerOnlyInGroups = groupsBySize().reduce((sum, group) => sum + group.count, 0);
  assert.equal(answerOnlyInGroups, inventory.ANSWER_ONLY, 'every answer-only item is in a logged group');
  assert.ok(inventory.sampled.totalMs < 60000, `the sweep stays under a minute (${inventory.sampled.totalMs} ms)`);
});

test('the STEPS count does not fall, per source and in total', () => {
  const fell = Object.entries(STEPS_FLOOR)
    .filter(([source, floor]) => (inventory.bySource[source]?.steps ?? 0) < floor)
    .map(([source, floor]) => `${source}: ${inventory.bySource[source]?.steps ?? 0} < ${floor}`);
  assert.deepEqual(fell, []);
  assert.ok(inventory.STEPS >= STEPS_TOTAL_FLOOR, `STEPS ${inventory.STEPS} < ${STEPS_TOTAL_FLOOR}`);
});

test('the support families still write the steps they write today (closed review only)', () => {
  const fromFamily = Object.values(inventory.bySource).reduce((sum, bucket) => sum + bucket.fromFamily, 0);
  assert.ok(fromFamily >= FROM_FAMILY_FLOOR, `family worked solutions ${fromFamily} < ${FROM_FAMILY_FLOOR}`);
});
