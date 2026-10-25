/*
 * THE HONORS VERSION IS CHOSEN AND PROVEN IN PRE-FLIGHT, NOT AT CREATE.
 *
 * Production: a teacher finished Assignment Review for Algebra I M2 T2
 * Lesson 2 with an Honors class selected, pressed Create Assignment, and got
 *
 *   The audited CCMR enrichment did not pass MathMaster's assignment checks:
 *   Question 24 refers to a graph in its prompt, but the question contains none.
 *
 * Pre-Flight had said the lesson was ready. The Honors-only audited CCMR
 * Practice was sourced for the first time inside Create (one guess per
 * place, never validated until then), so a failing item could only fail the
 * publish. These tests run the real lesson, the real audited bank and the real
 * server selection code through the client's validated selection
 * (canonicalCcmrHydration.js), and pin what Create may now rely on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../src/platform/contract/assignmentSchemaV5.js';
import { getStoredAssignmentVariantMode } from '../../src/platform/contract/storedAssignmentV5.js';
import { assertFirestoreSafeAssignmentPayload, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { normalizeAssignmentQuestions } from '../../src/app/student/assignmentRuntimeHelpers.js';
import { buildDeterministicHonorsExtension } from '../../src/platform/rigor/honorsExtensionRecipes.js';
import { generatePathInstanceWithRetries, hasPathGenerator } from '../../functions/shared/pathQuestionGeneration.mjs';
import { promisingAGraph } from './helpers/ccmrGraphPromiseFixtures.mjs';
import {
  HONORS_CCMR_STATUS,
  applyCcmrHydrationToCanonicalAssignment,
  assignmentFingerprint,
  buildHonorsCcmrCandidate,
  ccmrSelectionKey,
  ccmrSourcingKey,
  composeHonorsCcmrCandidate,
  confirmHonorsCandidateForCreate,
  honorsCcmrRecord,
  selectHonorsCcmrItems,
} from '../../src/platform/assignments/canonicalCcmrHydration.js';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));

const PRODUCTION_LESSON = 'teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json';
const PRODUCTION_ITEM = 'mm_sat_A_3E_5_intercept-change_v21';
const LMR_LESSON = 'docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json';
const SYSTEMS_DAY1 = 'docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json';

const BANK_FILES = ['digitalSAT', 'act', 'tsia2'];
const bankDocuments = new Map();
for (const framework of BANK_FILES) {
  const payload = JSON.parse(read(`functions/seeds/pathQuestionBank/${framework}_pathQuestionBank_seed.json`));
  for (const document of payload.items || payload.documents || []) bankDocuments.set(document.id, document);
}
const auditedIntent = (id) => {
  const document = bankDocuments.get(id);
  assert.ok(document, `audited bank document ${id} exists`);
  return bank.bankDocumentToV5Intent(document);
};
// CT01 repaired the bank items that promised a graph they lack, so the items these
// tests need to fail are the ones as the bank worded them in production
// (helpers/ccmrGraphPromiseFixtures.mjs). The first is the one that failed Create.
const failingIntent = (id) => promisingAGraph(auditedIntent(id));

/** A lesson as Assignment Review holds it: imported, reviewed, Pre-Flight valid. */
const reviewedLesson = (relPath) => {
  const parsed = parseAssignmentBlueprintText(read(relPath));
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  assert.equal(model.isValid, true, `${relPath} passes Pre-Flight:\n${model.errors.join('\n')}`);
  return model.assignmentV5;
};

/** The callable's answer for an Honors destination, through JSON as it travels. */
const serverHydration = (assignmentV5, options = {}) => clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(assignmentV5), {
  ensurePracticeTarget: true,
  includeCandidates: true,
  ...options,
}));

const placeOf = (assignmentV5, flatNumber) => {
  let cursor = 0;
  for (let sectionIndex = 0; sectionIndex < assignmentV5.sections.length; sectionIndex += 1) {
    const { questions } = assignmentV5.sections[sectionIndex];
    if (flatNumber <= cursor + questions.length) return { sectionIndex, questionIndex: flatNumber - cursor - 1 };
    cursor += questions.length;
  }
  throw new Error(`no question ${flatNumber}`);
};

// The no-AI Honors extension a teacher adds in Pre-Flight (here the vetted
// Multiple Representations recipe): it gives the lesson the Honors depth its
// own questions lack, so the whole Honors contract can be judged end to end.
const lmrExtension = () => {
  const lmr = buildAssignmentV5PreflightModel(parseAssignmentBlueprintText(read(LMR_LESSON)).assignmentV5);
  const built = buildDeterministicHonorsExtension({ questions: lmr.questions, assignmentCourseId: 'algebra1' });
  assert.equal(built.status, 'ready');
  return built.question;
};

const readinessFor = (candidate) => summarizePreflightReadiness({
  blockers: collectReviewBlockers({
    draft: { title: 'Lesson', assignedClassIds: ['honors-1'], dueAt: '2099-01-01T12:00' },
    honorsSelected: true,
    honorsReport: candidate.honorsReport,
    honorsCcmr: { status: candidate.status, errors: candidate.errors },
  }),
  validationErrors: [],
  bundleIsValid: true,
});

const createOutcome = (candidate, reviewedAssignmentV5, honorsEnrichmentQuestion = null) => {
  try {
    return { ok: true, result: confirmHonorsCandidateForCreate({ honorsCandidate: candidate, reviewedAssignmentV5, honorsEnrichmentQuestion }) };
  } catch (error) {
    return { ok: false, message: error.message };
  }
};

test('the production failure, reproduced: the audited item that reached Create fails MathMaster’s checks at Question 24', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const place = placeOf(base, 24);
  assert.equal(base.sections[place.sectionIndex].role, 'practice', 'Question 24 is Practice, where the Honors target is sourced');
  const hydrated = clone(base);
  hydrated.sections[place.sectionIndex].questions[place.questionIndex] = failingIntent(PRODUCTION_ITEM);
  // Exactly the call Create used to make with the server's in-place choice.
  assert.throws(
    () => applyCcmrHydrationToCanonicalAssignment({ baseAssignmentV5: base, hydratedAssignment: hydrated }),
    (error) => error.message.startsWith("The audited CCMR enrichment did not pass MathMaster's assignment checks:\nQuestion 24 refers to a graph in its prompt, but the question contains none."),
  );
});

test('Pre-Flight catches it: the Honors version skips that item, keeps a validated audited alternative on the lesson’s TEKS, and Create accepts exactly that version', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const extension = lmrExtension();
  const hydration = serverHydration(base);
  const place = placeOf(base, 24);
  const slot = hydration.audit.plan.slots.find((entry) => entry.sectionIndex === place.sectionIndex && entry.questionIndex === place.questionIndex);
  assert.ok(slot, 'the server offers candidates for Question 24');
  const offeredNow = hydration.audit.plan.slots.flatMap((entry) => entry.candidates).find((intent) => intent.ccmrSource.documentId === PRODUCTION_ITEM);
  assert.ok(offeredNow, 'the production item is among the candidates the server offers');
  // The bank item is repaired; as it was worded in production it is the one that fails.
  const offered = promisingAGraph(offeredNow);
  // As in production, where the server chose it for Question 24: the
  // server's own conversion of that item first there, at the first place the
  // target uses.
  slot.candidates = [offered, ...slot.candidates.filter((intent) => intent.ccmrSource.documentId !== PRODUCTION_ITEM)];
  hydration.audit.plan.slots = [slot, ...hydration.audit.plan.slots.filter((entry) => entry !== slot)];

  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: extension });
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY);
  assert.equal(candidate.model.isValid, true, candidate.errors.join('\n'));
  assert.ok(!candidate.model.errors.some((message) => /refers to a graph/.test(message)));

  const skipped = candidate.skipped.find((entry) => entry.documentId === PRODUCTION_ITEM);
  assert.ok(skipped, 'the failing item is reported, not silently dropped');
  // The extension ends Classwork, so the Honors version numbers it 25.
  assert.equal(skipped.questionNumber, 25);
  assert.match(skipped.errors.join('\n'), /Question 25 refers to a graph in its prompt, but the question contains none/);
  assert.match(skipped.prompt, /The graph of \$y=\{\{m\}\}x/, 'with the actual question, so the teacher can see what failed');

  const filled = candidate.sourced.find((entry) => entry.sectionIndex === place.sectionIndex && entry.questionIndex === place.questionIndex);
  assert.ok(filled, 'the same place is filled by an audited item that passed');
  assert.notEqual(filled.documentId, PRODUCTION_ITEM);
  assert.ok(filled.teksCodes.includes('A.3E'), `on the lesson’s primary TEKS (got ${filled.teksCodes})`);
  const placed = candidate.assignmentV5.sections[place.sectionIndex].questions[place.questionIndex];
  assert.equal(placed.ccmrSource.source, 'auditedBank');
  assert.equal(placed.ccmrSource.documentId, filled.documentId);
  assert.equal(candidate.sourcedCount, candidate.targetCount);
  assert.equal(candidate.honorsReport.isHonorsReady, true, candidate.honorsReport.missing.join(', '));

  // Pre-Flight says ready, and Create accepts the very object it previewed.
  assert.equal(readinessFor(candidate).canCreate, true);
  const created = createOutcome(candidate, base, extension);
  assert.equal(created.ok, true, created.message);
  assert.deepEqual(created.result.assignmentV5, candidate.assignmentV5);
});

test('alternatives: a place keeps the first candidate that passes, every failure is recorded, and the authored question is never lost', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const hydration = serverHydration(base);
  const place = placeOf(base, 24);
  const authored = base.sections[place.sectionIndex].questions[place.questionIndex];
  const valid = 'mm_sat_A_3E_3_horizontal-shift-linear_v21';
  hydration.audit.plan.slots = [{
    kind: 'practiceTarget',
    ...place,
    questionId: authored.questionId,
    teksCodes: ['A.3E', 'A.3C'],
    // Two that fail MathMaster's checks (a graph promised, a malformed item),
    // then one that passes.
    candidates: [
      failingIntent(PRODUCTION_ITEM),
      { ...auditedIntent('mm_sat_A_3E_1_vertical-shift-intercept_v21'), studentActions: ['noSuchAction'], answerFields: [] },
      auditedIntent(valid),
    ],
  }];
  hydration.audit.plan.targetCount = 1;
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration });
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY);
  assert.deepEqual(candidate.sourced.map((entry) => entry.documentId), [valid]);
  assert.deepEqual(candidate.skipped.map((entry) => entry.documentId), [PRODUCTION_ITEM, 'mm_sat_A_3E_1_vertical-shift-intercept_v21']);
  candidate.skipped.forEach((entry) => assert.ok(entry.errors.length > 0, `${entry.documentId} says why`));
  // Everything else is the reviewed lesson, byte for byte.
  const before = flattenV5Sections(base);
  const after = flattenV5Sections(candidate.assignmentV5);
  const placeNumber = 24;
  before.forEach((question, index) => {
    if (index + 1 === placeNumber) return;
    assert.equal(after[index].questionId, question.questionId);
    assert.equal(after[index].prompt, question.prompt);
  });
});

test('a malformed audited item is refused with the reason, and never stops the rest of the selection', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const hydration = serverHydration(base);
  const target = hydration.audit.plan.slots[0];
  // A broken bank document: its id is its own, its question compiles to
  // nothing a student can answer.
  const broken = auditedIntent('mm_sat_A_3E_2_same-slope-different-intercept_v21');
  target.candidates = [
    { ...broken, ccmrSource: { ...broken.ccmrSource, documentId: 'mm_sat_malformed_fixture_v21' }, studentActions: [], answerFields: [], prompt: '' },
    ...target.candidates,
  ];
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration });
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY);
  assert.equal(candidate.model.isValid, true);
  const refused = candidate.skipped.find((entry) => entry.documentId === 'mm_sat_malformed_fixture_v21');
  assert.ok(refused, 'the malformed document is refused');
  assert.ok(refused.errors.length > 0 && refused.errors.every((message) => /^Question \d+/.test(message)), `with the reason, at its place: ${refused.errors.join(' | ')}`);
  assert.ok(!candidate.sourced.some((entry) => entry.documentId === 'mm_sat_malformed_fixture_v21'));
});

test('an exhausted pool returns the failed questions to Pre-Flight, blocks Create, and offers a recorded choice instead of a rebuild', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const extension = lmrExtension();
  const hydration = serverHydration(base);
  // Every audited candidate on these TEKS is one MathMaster refuses.
  const failing = ['mm_sat_A_3E_5_intercept-change_v21', 'mm_sat_A_3E_1_vertical-shift-intercept_v21', 'mm_sat_A_3E_4_scale-output-slope_v21'];
  hydration.audit.plan.slots = hydration.audit.plan.slots.map((slot) => ({ ...slot, candidates: failing.map(failingIntent) }));

  const needsDecision = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: extension });
  assert.equal(needsDecision.status, HONORS_CCMR_STATUS.NEEDS_DECISION);
  assert.equal(needsDecision.sourcedCount, 0);
  assert.equal(needsDecision.model.isValid, true, 'the Honors version is still the valid authored lesson');
  assert.deepEqual(
    flattenV5Sections(needsDecision.assignmentV5).filter((question) => question.activityRole === 'practice').map((question) => question.questionId),
    flattenV5Sections(base).filter((question) => question.activityRole === 'practice').map((question) => question.questionId),
    'no authored Practice question was removed',
  );
  assert.deepEqual([...new Set(needsDecision.skipped.map((entry) => entry.documentId))].sort(), [...failing].sort());
  needsDecision.skipped.forEach((entry) => {
    assert.ok(entry.prompt, 'the actual failed question is returned');
    assert.match(entry.errors.join('\n'), /refers to a graph in its prompt/);
  });
  assert.match(needsDecision.explanation, /found none that pass/);
  assert.match(needsDecision.explanation, /3 audited candidates offered on this lesson’s TEKS failed MathMaster’s assignment checks/, 'it says how many were checked, not that the bank is empty');

  // Pre-Flight blocks, with the reason in the step that resolves it…
  const blocked = readinessFor(needsDecision);
  assert.equal(blocked.canCreate, false);
  assert.ok(blocked.all.some((entry) => entry.stepId === 'classes' && /no audited CCMR Practice item passed/.test(entry.message)));
  // …and Create refuses the same thing, before anything is written.
  const refused = createOutcome(needsDecision, base, extension);
  assert.equal(refused.ok, false);
  assert.match(refused.message, /Nothing was created/);

  // The teacher keeps the authored Practice: recorded, not silent.
  const kept = composeHonorsCcmrCandidate({
    baseAssignmentV5: base,
    selection: selectHonorsCcmrItems({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: extension }),
    honorsEnrichmentQuestion: extension,
    keepAuthored: true,
  });
  assert.equal(kept.status, HONORS_CCMR_STATUS.KEPT_AUTHORED);
  assert.equal(kept.ccmrTargetRequired, false);
  assert.equal(readinessFor(kept).canCreate, true);
  const created = createOutcome(kept, base, extension);
  assert.equal(created.ok, true, created.message);
  assert.deepEqual(created.result.record.teacherDecision, 'keepAuthoredPractice');
  assert.deepEqual([...created.result.record.skippedDocumentIds].sort(), [...failing].sort());
  assert.equal(created.result.honorsReport.isHonorsReady, true, 'every other Honors requirement still applied');
});

test('the decision to keep the authored Practice is offered only when no audited item passes', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const hydration = serverHydration(base);
  const candidate = composeHonorsCcmrCandidate({
    baseAssignmentV5: base,
    selection: selectHonorsCcmrItems({ baseAssignmentV5: base, hydration }),
    keepAuthored: true,
  });
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, 'a passing audited item wins over a stale choice to skip CCMR');
  assert.equal(candidate.ccmrTargetRequired, true);
});

test('“Use a different audited item”: asked again without it, the Honors version stays ready with another validated item', () => {
  // Found in the browser (teacherWorkflow/honorsCcmrJourneys.mjs): every
  // place was offered the same five items, three of which promise a graph, so
  // setting one aside left one passing item for a target of two.
  const base = reviewedLesson(PRODUCTION_LESSON);
  const extension = lmrExtension();
  let current = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration: serverHydration(base), honorsEnrichmentQuestion: extension });
  assert.equal(current.status, HONORS_CCMR_STATUS.READY);
  const setAside = [];
  // A teacher pressing it three times, each time on the item now first.
  for (let round = 1; round <= 3; round += 1) {
    setAside.push(current.sourced[0].documentId);
    current = buildHonorsCcmrCandidate({
      baseAssignmentV5: base,
      hydration: serverHydration(base, { excludeDocumentIds: setAside }),
      honorsEnrichmentQuestion: extension,
      excludedDocumentIds: setAside,
    });
    assert.equal(current.status, HONORS_CCMR_STATUS.READY, `round ${round}: ${current.explanation}`);
    assert.equal(current.sourcedCount, current.targetCount);
    assert.ok(!current.sourced.some((entry) => setAside.includes(entry.documentId)), `round ${round}: no set-aside item returns`);
    current.sourced.forEach((entry) => assert.ok(entry.teksCodes.some((code) => code === 'A.3E' || code === 'A.3C'), `${entry.documentId} is on the lesson’s TEKS`));
  }
});

test('no same-TEKS construct match (the 3×3 systems gate) is a decision for the teacher, not a substitution', () => {
  const base = reviewedLesson(SYSTEMS_DAY1);
  const hydration = serverHydration(base);
  // Strip the plan to the construct gap the #359 gate reports.
  hydration.audit.plan.slots = hydration.audit.plan.slots.map((slot) => ({
    ...slot,
    reason: 'no_semantically_compatible_audited_item',
    candidates: [],
  }));
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration });
  assert.equal(candidate.status, HONORS_CCMR_STATUS.NEEDS_DECISION);
  assert.match(candidate.explanation, /none that match the question’s construct/);
  assert.equal(candidate.sourcedCount, 0);
});

test('a short Practice section needs no audited CCMR, and the Honors-only extension is still in the version Create publishes', () => {
  const base = reviewedLesson(LMR_LESSON);
  const extension = lmrExtension();
  const hydration = serverHydration(base);
  assert.equal(hydration.audit.targetCount, 0);
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: extension });
  assert.equal(candidate.status, HONORS_CCMR_STATUS.NOT_REQUIRED);
  assert.equal(candidate.ccmrTargetRequired, false);
  const { sectionIndex, questionIndex } = candidate.extensionLocation;
  const previewed = candidate.model.sections[sectionIndex].questions[questionIndex];
  assert.equal(previewed.type, extension.type);
  assert.equal(previewed.honorsEnrichment.recipeId, extension.honorsEnrichment.recipeId);
  const created = createOutcome(candidate, base, extension);
  assert.equal(created.ok, true, created.message);
  assert.equal(flattenV5Sections(created.result.assignmentV5).length, flattenV5Sections(base).length + 1);
});

test('mixed Standard and Honors destinations: the Standard version is the reviewed lesson, and the Honors version differs only where Pre-Flight said', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration: serverHydration(base) });
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY);
  const standard = flattenV5Sections(base);
  const honors = flattenV5Sections(candidate.assignmentV5);
  assert.equal(honors.length, standard.length, 'sourcing replaces, never appends');
  const changed = honors.flatMap((question, index) => (JSON.stringify(question) === JSON.stringify(standard[index]) ? [] : [index + 1]));
  assert.deepEqual(changed.sort((a, b) => a - b), candidate.sourced.map((entry) => entry.questionNumber).sort((a, b) => a - b));
  assert.deepEqual(base, reviewedLesson(PRODUCTION_LESSON), 'building the Honors version never mutates the reviewed lesson');
});

test('the same object is previewed, validated and created — and a stale one is refused', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const extension = lmrExtension();
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration: serverHydration(base), honorsEnrichmentQuestion: extension });
  // Preview reads candidate.model.sections; Create flattens candidate.assignmentV5.
  assert.deepEqual(
    candidate.model.sections.flatMap((section) => section.questions.map((question) => question.questionId)),
    flattenV5Sections(candidate.assignmentV5).map((question) => question.questionId),
  );
  const first = createOutcome(candidate, base, extension);
  const again = createOutcome(candidate, base, extension);
  assert.equal(first.ok, true, first.message);
  assert.deepEqual(again.result.assignmentV5, first.result.assignmentV5, 'a repeated publish attempt publishes the same thing');

  const retitled = { ...base, assignment: { ...base.assignment, title: `${base.assignment.title} (edited)` } };
  assert.match(createOutcome(candidate, retitled, extension).message, /prepared for an earlier copy/);
  assert.match(createOutcome(candidate, base, null).message, /Honors extension changed/);
  assert.match(createOutcome(null, base, extension).message, /has not been prepared yet/);
});

test('revalidation: the plan follows the questions, the selection follows what the checks read, and an edit invalidates a stale choice', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const retitled = { ...base, assignment: { ...base.assignment, title: 'A new title', folder: 'Elsewhere' } };
  assert.equal(ccmrSourcingKey(retitled), ccmrSourcingKey(base), 'retitling does not ask the bank again');
  assert.equal(ccmrSelectionKey(retitled), ccmrSelectionKey(base), 'or re-prove the items');
  const practiceMode = base.variantPolicy.sectionModes.practice;
  const modes = { ...base, variantPolicy: { ...base.variantPolicy, sectionModes: { ...base.variantPolicy.sectionModes, practice: practiceMode === 'shared' ? 'personalized' : 'shared' } } };
  assert.notEqual(ccmrSelectionKey(modes), ccmrSelectionKey(base), 'a delivery change the checks read re-proves them');

  const selection = selectHonorsCcmrItems({ baseAssignmentV5: base, hydration: serverHydration(base) });
  const [placement] = selection.placements;
  const edited = clone(base);
  edited.sections[placement.sectionIndex].questions[placement.questionIndex].questionId = 'repaired-question';
  assert.notEqual(ccmrSourcingKey(edited), ccmrSourcingKey(base), 'an edited question asks the bank again');
  const stale = composeHonorsCcmrCandidate({ baseAssignmentV5: edited, selection });
  assert.equal(stale.status, HONORS_CCMR_STATUS.INVALID, 'a choice made for a question that changed is never applied');
  assert.ok(stale.errors.some((message) => /earlier copy/.test(message)));
});

test('an audited item that would remove the lesson’s only Honors depth is kept out of that place', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const practice = base.sections.findIndex((section) => section.role === 'practice');
  const dok3 = base.sections[practice].questions.findIndex((question) => Number(question.dok) >= 3);
  // Make that DOK 3 question the lesson's only one.
  const lowered = clone(base);
  lowered.sections.forEach((section, sectionIndex) => section.questions.forEach((question, questionIndex) => {
    if (!(sectionIndex === practice && questionIndex === dok3) && Number(question.dok) >= 3) question.dok = 2;
  }));
  const loweredModel = buildAssignmentV5PreflightModel(lowered);
  assert.equal(loweredModel.isValid, true, loweredModel.errors.join('\n'));
  const hydration = serverHydration(loweredModel.assignmentV5);
  const onlyDepthPlace = { kind: 'practiceTarget', sectionIndex: practice, questionIndex: dok3, questionId: loweredModel.assignmentV5.sections[practice].questions[dok3].questionId, candidates: [auditedIntent('mm_sat_A_3E_3_horizontal-shift-linear_v21')] };
  hydration.audit.plan.slots = [onlyDepthPlace, ...hydration.audit.plan.slots.filter((slot) => !(slot.sectionIndex === practice && slot.questionIndex === dok3))];
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: loweredModel.assignmentV5, hydration });
  assert.ok(candidate.skipped.some((entry) => entry.depthOnly && /DOK 3\+ reasoning/.test(entry.errors[0])));
  assert.equal(candidate.assignmentV5.sections[practice].questions[dok3].questionId, onlyDepthPlace.questionId, 'the DOK 3 question stays');
  assert.equal(candidate.honorsReport.checks.higherOrderReasoning, true);
});

test('across the real lessons, Pre-Flight’s readiness and Create’s acceptance are the same answer', () => {
  const lessons = [
    'teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json',
    'teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json',
    'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json',
    'teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json',
    'teacher-import-jsons/algebra2-honors-module1/L3_Inverse_Linear_Functions.json',
    'teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json',
    SYSTEMS_DAY1,
    LMR_LESSON,
  ];
  for (const lesson of lessons) {
    const base = reviewedLesson(lesson);
    const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration: serverHydration(base) });
    assert.ok([HONORS_CCMR_STATUS.READY, HONORS_CCMR_STATUS.NOT_REQUIRED, HONORS_CCMR_STATUS.NEEDS_DECISION].includes(candidate.status), `${lesson}: ${candidate.status} ${candidate.errors.join('; ')}`);
    assert.equal(candidate.model.isValid, true, `${lesson}: the Honors version passes Pre-Flight`);
    assert.ok(!candidate.model.errors.some((message) => /refers to a (graph|table)/.test(message)));
    const canCreate = readinessFor(candidate).canCreate;
    const created = createOutcome(candidate, base);
    assert.equal(created.ok, canCreate, `${lesson}: Pre-Flight ${canCreate ? 'allows' : 'blocks'} Create, and Create ${created.ok ? 'accepts' : `refuses (${created.message})`}`);
    if (!created.ok) continue;
    // …and every step Create then runs on that version before writing it
    // (TeacherWorkspace handleCreateAssignment) succeeds: nothing left to
    // fail after the teacher presses Create.
    const variantMode = getStoredAssignmentVariantMode(base);
    const questions = normalizeAssignmentQuestions(validateAssignmentQuestions(flattenV5Sections(created.result.assignmentV5), { variantMode, allowFixed: variantMode === 'shared' }));
    assert.doesNotThrow(() => assertFirestoreSafeAssignmentPayload({
      schemaVersion: 5,
      sections: rebuildV5SectionsFromQuestions(created.result.assignmentV5, questions),
      honorsCcmr: created.result.record,
    }), lesson);
  }
});

test('the Honors record a published version keeps names its audited items honestly', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration: serverHydration(base) });
  const record = honorsCcmrRecord(candidate);
  assert.equal(record.status, 'ready');
  assert.equal(record.releaseTarget, 'ccmr-fidelity-v2.1-authentic-language');
  assert.equal(record.sourced.length, candidate.sourcedCount);
  record.sourced.forEach((entry) => {
    assert.ok(bankDocuments.has(entry.documentId), `${entry.documentId} is a real audited document`);
    assert.ok(entry.replacedQuestionId, 'and names the authored question it stands in for');
  });
  assert.equal(record.teacherDecision, undefined);
  assert.doesNotThrow(() => JSON.stringify(record));
  assert.ok(!JSON.stringify(record).includes('[['), 'Firestore-safe: no array directly inside an array');
});

test('a server that predates the plan still has its choices proven in Pre-Flight', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const place = placeOf(base, 24);
  const legacy = { assignment: clone(base), audit: { targetCount: 2, replaced: 0, autoSourced: 1, misses: [] } };
  legacy.assignment.sections[place.sectionIndex].questions[place.questionIndex] = failingIntent(PRODUCTION_ITEM);
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration: legacy });
  assert.equal(candidate.status, HONORS_CCMR_STATUS.NEEDS_DECISION, 'its one guess failed, so the teacher is told now');
  assert.equal(candidate.skipped[0].documentId, PRODUCTION_ITEM);
  assert.equal(createOutcome(candidate, base).ok, false);
});

test('compiled audited items keep their audited provenance and the value written for the place', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration: serverHydration(base) });
  for (const entry of candidate.sourced) {
    const question = candidate.assignmentV5.sections[entry.sectionIndex].questions[entry.questionIndex];
    assert.equal(question.ccmrSource.source, 'auditedBank');
    assert.equal(question.ccmrSource.releaseTarget, 'ccmr-fidelity-v2.1-authentic-language');
    assert.equal(question.ccmrAuthenticLanguage.authored, true);
    assert.equal(question.activityRole, 'practice');
    // Compiling alone gives the same renderer contract as compiling in place.
    const alone = compileAuthoringIntentV5({
      schemaVersion: 5,
      assignment: base.assignment,
      sections: [{ id: base.sections[entry.sectionIndex].id, role: 'practice', title: 'Practice', questions: [auditedIntent(entry.documentId)] }],
    }).package.sections[0].questions[0];
    assert.equal(question.type, alone.type);
    assert.deepEqual(question.answerFields, alone.answerFields);
  }
  assert.equal(typeof assignmentFingerprint(candidate.assignmentV5), 'string');
});

test('every audited item Review shows can be drawn the way a student’s copy is, so the teacher reads an instance, not placeholders', () => {
  const base = reviewedLesson(PRODUCTION_LESSON);
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration: serverHydration(base), honorsEnrichmentQuestion: lmrExtension() });
  const shown = [
    ...candidate.sourced.map((entry) => candidate.assignmentV5.sections[entry.sectionIndex].questions[entry.questionIndex]),
    ...candidate.skipped.map((entry) => entry.question).filter(Boolean),
  ];
  assert.ok(shown.length >= 2);
  for (const question of shown) {
    assert.match(question.prompt, /\{\{/, `${question.ccmrSource.documentId} is a template`);
    assert.equal(hasPathGenerator(question), true);
    const drawn = generatePathInstanceWithRetries(question, 'preflight-honors-example');
    assert.ok(drawn.question, `${question.ccmrSource.documentId} draws: ${drawn.reason}`);
    assert.doesNotMatch(drawn.question.prompt, /\{\{|\}\}/, `${question.ccmrSource.documentId}: ${drawn.question.prompt}`);
  }
});
