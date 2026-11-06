/*
 * THE MATRICES WARM-UP'S RECOVERY SHOWS THE CHOICES THE LESSON NOW HAS.
 *
 * Algebra II Honors "Solving Systems with Matrices", Warm-Up 1 (l3m-wu-1),
 * asks whether Ms. Tanaka's two arrays give the same information as Mr.
 * Lopez's sentences. F-LONGEST-IS-RIGHT rewrote its two wrong choices (the
 * key was the longest by far, so it could be picked unread), but its Recovery
 * versions come from matrices.arrayRecordTotals, and version 1 still writes
 * the old two. A family edit ships as a new version (a Recovery binding and a
 * delivered pin name the version; questionFamilyHistoricalPins.test.mjs holds
 * every recorded version to what it produced, and now records both of these),
 * so version 2 writes the rewritten choices and declares that it replaces
 * version 1 for new Recovery bindings (`recovery.replaces`). What this holds:
 *
 *   - version 1 is frozen: an unpinned reference still means it, and it still
 *     writes the choices it shipped with;
 *   - version 2 is version 1 with only those two choices changed; no version
 *     2 question shows an old choice or gives its key away by length; every
 *     one is graded right with its own key, on the device and the server, and
 *     a wrong part is refused;
 *   - Recovery binds version 2 for the Warm-Up: at creation (Pre-Flight), on
 *     Prepare Recovery for a live copy, and when the rewritten lesson's import
 *     makes a version 1 binding stale; a missed Warm-Up's Practice and
 *     Recovery show only the new choices;
 *   - every other question keeps its binding: across every lesson file the
 *     planner binds nothing else differently, and a live copy's stored
 *     version 1 bindings are kept.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { lessonAssignmentForCoverage, recoveryCoverageLessonFiles } from '../../scripts/recovery-coverage-report.mjs';
import { allRegisteredQuestionFamilies, defaultFamilyVersion, getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { QuestionFamilyDefinitionError, defineQuestionFamily, resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence, evaluateFamilyCandidate } from '../../functions/shared/questionFamilyEngine.mjs';
import {
  flattenAssignmentQuestions,
  planAssignmentRecoveryContent,
  recoveryCandidateFamilies,
} from '../../functions/shared/recoveryContentPlan.mjs';
import { applyRecoveryBindings, recoverySourceQuestion, recoverySourceSignature } from '../../functions/shared/recoveryContent.mjs';
import { applyRecoveryUpgrade, buildRecoveryUpgradePreview } from '../../functions/shared/recoveryContentUpgrade.mjs';
import { recoveryKeyResponses, serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { lightRecoveryKeyCheck } from '../../functions/shared/recoveryLightKeyCheck.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeOrdinaryResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { RECOVERY_ACTION, RECOVERY_STATE, buildSectionRecoveryContext, nextRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { deliveredQuestionForGrading, runtimeRepairedQuestion } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const ID = 'matrices.arrayRecordTotals';
const V1 = getPlatformQuestionFamily(ID, 1);
const V2 = getPlatformQuestionFamily(ID, 2);
const VALUES = resolveFamilyConstraints(V1, {}).values;
const LESSON_FILE = 'teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json';
const LESSON = compileTeacherImport(readFileSync(new URL(`../../${LESSON_FILE}`, import.meta.url), 'utf8'));
const WARMUP_ONE = LESSON.questions.find((question) => question.questionId === 'l3m-wu-1');

const KEY = 'Yes — the same numbers, organized in rows and columns';
// The wrong choices the lesson had before F-LONGEST-IS-RIGHT, and version 1 still writes.
const OLD_WRONG = Object.freeze(['No — the arrays leave out the grocery cards', 'No — the arrays only show December']);
const NEW_WRONG = (count) => [`No — the arrays lose the card values, so ${count} could be any card`, 'No — the arrays show only December, so November is missing'];

const sameField = (question) => question.answerFields.find((field) => field.id === 'same');
/** A version as Recovery builds it: from a slot with the original's identity and none of its wording. */
const build = (family, instance) => buildFamilyQuestion({
  family,
  instance,
  constraintValues: VALUES,
  authored: recoverySourceQuestion(WARMUP_ONE, { questionFamily: { id: ID, version: family.version, constraints: {} } }),
  tool: 'multiAnswer',
});
const SAMPLE = Object.freeze((() => {
  const sequence = createFamilyInstanceSequence(V1, VALUES, 'array-record-versions');
  return Array.from({ length: 400 }, (_, index) => sequence.instanceAt(index));
})());
/** The same mathematics written by version 2. */
const asVersion2 = (instance) => {
  const evaluated = evaluateFamilyCandidate(V2, VALUES, instance.params);
  assert.equal(evaluated.valid, true, instance.fingerprint);
  return evaluated.instance;
};
/** Everything but the "same information?" choices and the version a question names. */
const withoutSameChoices = (question) => ({
  ...question,
  familyVersion: null,
  familyInstance: { ...question.familyInstance, familyVersion: null },
  answerFields: question.answerFields.map((field) => (field.id === 'same' ? { ...field, options: null } : field)),
});

// The lesson's rule for prose choices (proseChoiceLongestOption.test.mjs):
// options that average 25 characters, whose key is the unique longest by
// more than 20%, give the answer away.
const length = (text) => [...String(text)].length;
const keyStandsOut = (options, key) => {
  const others = options.filter((option) => option !== key).map(length);
  return length(key) > 1.2 * Math.max(...others);
};
const isProse = (options) => options.reduce((sum, option) => sum + length(option), 0) / options.length >= 25;

/** The planner's rule before version 2: each family at the first version that recognizes. */
const firstRecognizingVersions = () => {
  const recognizing = allRegisteredQuestionFamilies().filter((family) => typeof family.recognize === 'function' && family.recovery.eligible);
  return recognizing.filter((family) => !recognizing.some((other) => other.id === family.id && other.version < family.version));
};

/** The key, read from the arrays the question shows: never from the family. */
const keyFromArrays = (question) => {
  const cells = (name) => question.matrices[name].rows.map((row) => row.cells);
  const [november, december] = [cells('Nov'), cells('Dec')];
  const values = question.matrices.Nov.rowLabels.map((label) => Number(/^\$(\d+) cards$/.exec(label)[1]));
  const types = question.matrices.Nov.colLabels.map((label) => label.toLowerCase());
  const sold = (row, col) => november[row][col] + december[row][col];
  const total = (label) => {
    const [, value, type] = /^Total money collected selling \$(\d+) (gas|grocery) cards \(both months\), in dollars$/.exec(label);
    const row = values.indexOf(Number(value));
    return String(Number(value) * sold(row, types.indexOf(type)));
  };
  const counts = values.flatMap((value, row) => types.map((type, col) => ({ name: `$${value} ${type} cards`, count: sold(row, col) })));
  const fewest = counts.reduce((low, entry) => (entry.count < low.count ? entry : low));
  return Object.fromEntries(question.answerFields.map((field) => [
    field.id,
    field.id === 'same' ? KEY : field.id === 'least' ? fewest.name : total(field.label),
  ]));
};
const fieldsResponse = (values) => ({ kind: 'fields', type: 'multiAnswer', value: '', fields: Object.entries(values).map(([id, value]) => ({ id, value: String(value), isComplete: true })) });

/* ---------------------------------------------------------------------------
 * The two versions.
 * ------------------------------------------------------------------------- */

test('version 1 is frozen: an unpinned reference still means it, and it still writes the choices it shipped with', () => {
  assert.equal(defaultFamilyVersion(ID), 1);
  assert.equal(getPlatformQuestionFamily(ID), V1);
  assert.deepEqual([...V1.recovery.replaces], []);
  const recognized = V1.recognize(WARMUP_ONE);
  assert.ok(recognized, 'version 1 reads the lesson\'s Warm-Up 1');
  assert.deepEqual(V2.recognize(WARMUP_ONE), recognized, 'and version 2 reads it as the same instance');
  const one = evaluateFamilyCandidate(V1, VALUES, recognized.params).instance;
  const two = evaluateFamilyCandidate(V2, VALUES, recognized.params).instance;
  assert.deepEqual(sameField(build(V1, one)).options, [KEY, ...OLD_WRONG]);
  // On the lesson's own numbers, version 2 writes exactly the lesson's choices.
  assert.deepEqual(sameField(build(V2, two)).options, sameField(WARMUP_ONE).options);
  assert.deepEqual(sameField(WARMUP_ONE).options, [KEY, ...NEW_WRONG(230)]);
});

test('version 2 is version 1 with only the two wrong choices changed: the same draws, keys, fingerprints, prompt, arrays and labels', () => {
  SAMPLE.forEach((one) => {
    const two = asVersion2(one);
    assert.equal(two.fingerprint, one.fingerprint);
    assert.deepEqual(two.answer, one.answer);
    const [first, second] = [build(V1, one), build(V2, two)];
    assert.deepEqual([first.familyVersion, second.familyVersion, second.familyInstance.familyVersion], [1, 2, 2]);
    assert.deepEqual(withoutSameChoices(second), withoutSameChoices(first), one.fingerprint);
    // Its first wrong choice names the count Mr. Lopez's sentence quotes, as the lesson's names 230.
    const count = second.matrices.Nov.rows[0].cells[0];
    assert.match(sameField(second).label, new RegExp(`^Mr\\. Lopez wrote: “In November the team sold ${count} gas cards for \\$`));
    assert.deepEqual(sameField(second).options, [KEY, ...NEW_WRONG(count)]);
  });
  // The same problems the other way too (the order a slot deals them in is
  // each version's own, as for every family version).
  const sequence = createFamilyInstanceSequence(V2, VALUES, 'array-record-versions');
  for (let index = 0; index < 48; index += 1) {
    const two = sequence.instanceAt(index);
    const one = evaluateFamilyCandidate(V1, VALUES, two.params);
    assert.deepEqual([one.valid, one.instance.fingerprint, one.instance.answer], [true, two.fingerprint, two.answer]);
  }
});

test('no version 2 question shows an old wrong choice, and its key is never the longest choice by far', () => {
  SAMPLE.forEach((one) => {
    const question = build(V2, asVersion2(one));
    const text = JSON.stringify(question);
    OLD_WRONG.forEach((old) => assert.ok(!text.includes(old), `${one.fingerprint}: "${old}"`));
    const { options, answer } = sameField(question);
    assert.equal(isProse(options), true);
    assert.equal(keyStandsOut(options, answer), false, `${options.join(' | ')}`);
    assert.equal(options.filter((option) => option === answer).length, 1);
    assert.equal(new Set(options).size, options.length);
  });
  // (Version 1's key stood out: 53 characters against 43.)
  assert.equal(keyStandsOut([KEY, ...OLD_WRONG], KEY), true);
});

test('every version 2 question is valid, its key is what the arrays give, it is marked right on the device and the server, and a wrong part is refused', () => {
  SAMPLE.forEach((one) => {
    const instance = asVersion2(one);
    const question = build(V2, instance);
    assert.deepEqual(validateQuestionSemantics(question, { label: instance.fingerprint }).errors, [], instance.fingerprint);
    const key = keyFromArrays(question);
    assert.deepEqual(Object.fromEntries(question.answerFields.map((field) => [field.id, field.answer])), key, instance.fingerprint);
    assert.equal(gradeOrdinaryResponse({ question, response: fieldsResponse(key) }).isCorrect, true, 'on the device');
    assert.equal(gradeServerResponse({ question, response: fieldsResponse(key) }).isCorrect, true, 'on the server');
    question.answerFields.forEach((field) => {
      const wrong = field.type === 'choice' ? field.options.find((option) => option !== field.answer) : String(Number(field.answer) + 25);
      const response = fieldsResponse({ ...key, [field.id]: wrong });
      assert.notEqual(gradeServerResponse({ question, response }).isCorrect, true, `${instance.fingerprint}: a wrong ${field.id} on the server`);
      assert.notEqual(gradeOrdinaryResponse({ question, response }).isCorrect, true, `${instance.fingerprint}: a wrong ${field.id} on the device`);
    });
    assert.deepEqual(Object.values(serverRecoveryKeyCheck(question, instance)), [true, true, true]);
    assert.deepEqual(Object.values(lightRecoveryKeyCheck(question, instance)), [true, true, true], 'Pre-Flight\'s light check agrees');
    assert.ok(recoveryKeyResponses(question, instance));
    ['hints', 'steps', 'solution', 'workedSolution', 'solutionReview', 'answerKey'].forEach((name) => assert.equal(question[name], undefined));
  });
});

test('`recovery.replaces` names only earlier versions, of a version that can recognize', () => {
  const spec = (overrides) => ({
    id: 'test.replacing',
    version: 2,
    title: 'A replacing version',
    skill: { objective: 'Test the contract.', alignments: ['A2.3B'] },
    difficulty: { band: 1, dok: 1 },
    parameters: () => ({}),
    derive: () => ({}),
    rules: () => [],
    fingerprint: () => 'x',
    answer: () => ({ kind: 'number', value: 1, display: '1' }),
    tools: { multiAnswer: () => ({ type: 'multiAnswer' }) },
    recognize: () => null,
    ...overrides,
  });
  assert.deepEqual([...defineQuestionFamily(spec({ recovery: { replaces: [1] } })).recovery.replaces], [1]);
  assert.deepEqual([...defineQuestionFamily(spec({})).recovery.replaces], []);
  assert.throws(() => defineQuestionFamily(spec({ recovery: { replaces: [2] } })), QuestionFamilyDefinitionError, 'not itself');
  assert.throws(() => defineQuestionFamily(spec({ recovery: { replaces: [3] } })), QuestionFamilyDefinitionError, 'not a later one');
  assert.throws(() => defineQuestionFamily(spec({ recovery: { replaces: 1 } })), QuestionFamilyDefinitionError, 'a list');
  assert.throws(() => defineQuestionFamily(spec({ recognize: undefined, recovery: { replaces: [1] } })), QuestionFamilyDefinitionError, 'only a recognizing version is ever bound');
});

/* ---------------------------------------------------------------------------
 * Recovery binds version 2 for the Warm-Up, and nothing else moves.
 * ------------------------------------------------------------------------- */

test('Recovery takes this family at version 2, and every other family at the version it took before', () => {
  const before = new Map(firstRecognizingVersions().map((family) => [family.id, family.version]));
  const after = new Map(recoveryCandidateFamilies().map((family) => [family.id, family.version]));
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'the same families are candidates');
  assert.deepEqual([...after].filter(([id, version]) => before.get(id) !== version), [[ID, 2]]);
  assert.deepEqual([...V2.recovery.replaces], [1]);
  assert.deepEqual(
    allRegisteredQuestionFamilies().filter((family) => family.recovery.replaces.length).map((family) => `${family.id}@${family.version}`),
    [`${ID}@2`],
    'no other version replaces one',
  );
});

test('across every lesson file, every Warm-Up and DOL question is planned exactly as before but the matrices Warm-Up 1, now on version 2', () => {
  const earlier = firstRecognizingVersions();
  const rowsOf = (plan) => plan.rows.map((row) => `${row.questionId} ${row.status} ${row.familyId}@${row.familyVersion}`);
  const moved = [];
  let planned = 0;
  recoveryCoverageLessonFiles().forEach((file) => {
    const assignment = { ...lessonAssignmentForCoverage(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')), id: 'recovery-binding-versions' };
    const before = rowsOf(planAssignmentRecoveryContent({ assignment, gradeSample: serverRecoveryKeyCheck, families: earlier }));
    const after = rowsOf(planAssignmentRecoveryContent({ assignment, gradeSample: serverRecoveryKeyCheck }));
    assert.equal(after.length, before.length, file);
    after.forEach((entry, index) => {
      planned += 1;
      if (entry !== before[index]) moved.push(`${file.split('/').pop()}: ${before[index]} → ${entry}`);
    });
  });
  assert.ok(planned > 250, `${planned} Warm-Up and DOL questions planned`);
  assert.deepEqual(moved, [`T2_L3_Solving_Systems_with_Matrices.json: l3m-wu-1 add ${ID}@1 → l3m-wu-1 add ${ID}@2`]);
});

const AT = '2026-11-06T15:00:00.000Z';
const liveCopy = (id, change = (question) => question) => {
  const assignment = structuredClone(LESSON.model.assignmentV5);
  return {
    ...assignment,
    sections: assignment.sections.map((section) => ({ ...section, questions: section.questions.map(change) })),
    id,
    title: assignment.assignment.title,
    courseId: 'algebra2',
    assignedClassIds: ['class-1'],
    assignmentRevision: 2,
  };
};
// The lesson as classes imported it before F-LONGEST-IS-RIGHT: only these two choices differ.
const withOldChoices = (question) => (question.questionId === 'l3m-wu-1'
  ? { ...question, answerFields: question.answerFields.map((field) => (field.id === 'same' ? { ...field, options: [KEY, ...OLD_WRONG] } : field)) }
  : question);
const versionsOf = (plan) => Object.fromEntries(plan.rows.map((row) => [row.questionId, `${row.status} ${row.familyId}@${row.familyVersion}`]));

test('at creation (Pre-Flight) and on Prepare Recovery for a live copy, Warm-Up 1 is bound to version 2 and the other five as before', () => {
  const created = planAssignmentRecoveryContent({ assignment: liveCopy('created-matrices'), gradeSample: lightRecoveryKeyCheck, origin: 'preflight' });
  assert.deepEqual(versionsOf(created), {
    'l3m-wu-1': `add ${ID}@2`,
    'l3m-wu-2': 'add matrices.addition@1',
    'l3m-wu-3': 'add numbers.multiplicativeInverse@1',
    'l3m-dol-1': 'add matrices.multiplication@1',
    'l3m-dol-2': 'add matrices.solveSystem3x3@1',
    'l3m-dol-3': 'add matrices.singularSystem3x3@1',
  });
  assert.equal(created.bindingsToApply['l3m-wu-1'].questionFamily.version, 2, 'the binding stores version 2');
  const { report } = buildRecoveryUpgradePreview({ assignment: liveCopy('live-matrices'), manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: AT });
  assert.deepEqual(report.changes.map((change) => `${change.label} ${change.action} ${change.family.id}@${change.family.version}`), [
    `Warm-Up Q1 add ${ID}@2`,
    'Warm-Up Q2 add matrices.addition@1',
    'Warm-Up Q3 add numbers.multiplicativeInverse@1',
    'DOL Q1 add matrices.multiplication@1',
    'DOL Q2 add matrices.solveSystem3x3@1',
    'DOL Q3 add matrices.singularSystem3x3@1',
  ]);
  assert.ok(report.changes[0].freshVersions >= 12);
});

test('a live copy prepared on version 1 keeps all six bindings; the rewritten lesson\'s import makes only Warm-Up 1\'s stale, and Prepare Recovery replaces it with version 2', () => {
  const old = liveCopy('live-matrices-before', withOldChoices);
  const preparedBefore = planAssignmentRecoveryContent({ assignment: old, gradeSample: serverRecoveryKeyCheck, families: firstRecognizingVersions() });
  assert.equal(preparedBefore.bindingsToApply['l3m-wu-1'].questionFamily.version, 1, 'before version 2, Warm-Up 1 was bound to version 1');
  const stored = { ...old, recoveryContent: applyRecoveryBindings({ bindings: preparedBefore.bindingsToApply, at: AT, actorUid: 'teacher-uid' }).content };
  // Nothing changed: every binding is kept as it was stored, version 1 included.
  const kept = planAssignmentRecoveryContent({ assignment: stored, gradeSample: serverRecoveryKeyCheck });
  assert.deepEqual(versionsOf(kept), {
    'l3m-wu-1': `kept ${ID}@1`,
    'l3m-wu-2': 'kept matrices.addition@1',
    'l3m-wu-3': 'kept numbers.multiplicativeInverse@1',
    'l3m-dol-1': 'kept matrices.multiplication@1',
    'l3m-dol-2': 'kept matrices.solveSystem3x3@1',
    'l3m-dol-3': 'kept matrices.singularSystem3x3@1',
  });
  assert.equal(kept.changed, false);
  // The teacher imports the rewritten lesson: Warm-Up 1's choices change, so its binding is stale.
  const reimported = {
    ...stored,
    sections: stored.sections.map((section) => ({ ...section, questions: section.questions.map((question) => (question.questionId === 'l3m-wu-1' ? structuredClone(LESSON.model.assignmentV5.sections[0].questions[0]) : question)) })),
  };
  assert.notEqual(recoverySourceSignature(flattenAssignmentQuestions(reimported)[0]), recoverySourceSignature(flattenAssignmentQuestions(stored)[0]));
  const refreshed = planAssignmentRecoveryContent({ assignment: reimported, gradeSample: serverRecoveryKeyCheck });
  assert.deepEqual(versionsOf(refreshed), {
    'l3m-wu-1': `replace ${ID}@2`,
    'l3m-wu-2': 'kept matrices.addition@1',
    'l3m-wu-3': 'kept numbers.multiplicativeInverse@1',
    'l3m-dol-1': 'kept matrices.multiplication@1',
    'l3m-dol-2': 'kept matrices.solveSystem3x3@1',
    'l3m-dol-3': 'kept matrices.singularSystem3x3@1',
  });
  assert.deepEqual(Object.keys(refreshed.bindingsToApply), ['l3m-wu-1']);
  const applied = applyRecoveryBindings({ content: reimported.recoveryContent, bindings: refreshed.bindingsToApply, at: AT, actorUid: 'teacher-uid' });
  assert.deepEqual([applied.added, applied.replaced], [[], ['l3m-wu-1']]);
  ['l3m-wu-2', 'l3m-wu-3', 'l3m-dol-1', 'l3m-dol-2', 'l3m-dol-3'].forEach((questionId) => {
    assert.deepEqual(applied.content.bindings[questionId], stored.recoveryContent.bindings[questionId], `${questionId} keeps its binding`);
  });
});

/* ---------------------------------------------------------------------------
 * A student who missed the Warm-Up, after the teacher prepared Recovery.
 * ------------------------------------------------------------------------- */

const T0 = Date.parse('2026-11-04T16:00:00Z');
const T1 = Date.parse('2026-11-06T15:00:00Z');
const BEFORE = {
  ...liveCopy('live-matrices-journey'),
  courseProfile: { course: 'algebra2', courseLevel: 'honors' },
  dueAt: '2026-11-05T05:59:00.000Z',
  lateDueAt: '2026-11-20T23:59:00.000Z',
  warmup: { instructionDate: '2026-11-04' },
  dol: { instructionDate: '2026-11-04' },
};
const PREPARED = (() => {
  const planned = buildRecoveryUpgradePreview({ assignment: BEFORE, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: new Date(T0).toISOString() });
  const applied = applyRecoveryUpgrade({ assignment: BEFORE, plan: planned.plan, planHash: planned.planHash, at: new Date(T0).toISOString(), actorUid: 'teacher-uid' });
  return { ...BEFORE, recoveryContent: applied.recoveryContent };
})();
const QUESTIONS = getStoredAssignmentQuestions(PREPARED);
const WARMUP = QUESTIONS.map((question, index) => (question.activityRole === 'warmup' ? index : null)).filter((index) => index !== null);
const MISSED = Object.fromEntries(WARMUP.map((index) => [index, { status: 'expired', attemptCount: 1, totalAttempts: 1, gradedBy: 'server', lastAttemptAt: new Date(T0 - 3_600_000).toISOString(), supportUsage: {} }]));

const contextFor = ({ records = {}, studentId = 'student-missed-warmup' } = {}) => {
  const original = splitGradesBySection({ tracker: MISSED, assignment: PREPARED }).warmup;
  return buildSectionRecoveryContext({
    assignment: PREPARED,
    section: 'warmup',
    sectionEntries: QUESTIONS.map((question, storageIndex) => ({ storageIndex, question })).filter((entry) => entry.question.activityRole === 'warmup'),
    questions: QUESTIONS,
    tracker: MISSED,
    sectionOriginal: { score: original.total ? original.score : null, attempted: original.attempted, total: original.total },
    record: records.warmup || null,
    studentId,
    classId: 'class-1',
    classPeriod: 'Period 1',
    schedule: null,
    supportEvents: [],
    overrides: null,
    sectionModeFor: () => 'shared',
    nowValue: T1,
  });
};
const reproduce = (context, item) => {
  const reproduced = reproduceFamilyQuestionFromPin({
    question: runtimeRepairedQuestion(context.questionsByIndex[item.storageIndex]),
    assignmentId: context.assignmentId,
    storageIndex: item.storageIndex,
    pin: item.pin,
  });
  assert.ok(!reproduced.error, reproduced.error);
  return { ...reproduced, question: deliveredQuestionForGrading(reproduced.question) };
};

test('the missed Warm-Up: every Practice and Recovery version of Warm-Up 1 shows the new choices, never the old ones, and the server grades it', () => {
  assert.equal(PREPARED.recoveryContent.bindings['l3m-wu-1'].questionFamily.version, 2);
  const original = WARMUP[0];
  let shown = 0;
  const showsNewChoices = (question, label) => {
    const { options } = sameField(question);
    assert.deepEqual(options, [KEY, ...NEW_WRONG(question.matrices.Nov.rows[0].cells[0])], label);
    assert.ok(!OLD_WRONG.some((old) => JSON.stringify(question).includes(old)), label);
    shown += 1;
  };
  ['student-missed-warmup', 'student-two', 'student-three'].forEach((studentId) => {
    let context = contextFor({ studentId });
    assert.equal(context.eligibility.state, RECOVERY_STATE.LOCKED, studentId);
    for (let step = 0; step < 12 && context.eligibility.state === RECOVERY_STATE.LOCKED; step += 1) {
      const item = nextRecoveryPracticeItem(context);
      assert.ok(item);
      const { question, instance } = reproduce(context, item);
      if (item.storageIndex === original) showsNewChoices(question, `${studentId} Practice ${step + 1}`);
      const outcome = runSectionRecoveryAction({
        context,
        action: RECOVERY_ACTION.PRACTICE,
        payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: recoveryKeyResponses(question, instance).right },
        at: T1 + step * 60_000,
      });
      assert.equal(outcome.response.isCorrect, true);
      context = contextFor({ studentId, records: { warmup: outcome.record } });
    }
    assert.equal(context.eligibility.state, RECOVERY_STATE.UNLOCKED, studentId);
    const started = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.START, at: T1 + 3_600_000 });
    const running = contextFor({ studentId, records: { warmup: started.record } });
    const responses = {};
    started.record.plan.items.forEach((item) => {
      const { question, instance } = reproduce(running, item);
      if (item.storageIndex === original) showsNewChoices(question, `${studentId} Recovery`);
      responses[item.itemId] = recoveryKeyResponses(question, instance).right;
    });
    const submitted = runSectionRecoveryAction({ context: running, action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: T1 + 7_200_000 });
    assert.equal(submitted.record.status, 'completed');
    assert.equal(submitted.record.rawScore, 100);
  });
  assert.ok(shown >= 3, `${shown} versions of Warm-Up 1 shown`);
});
