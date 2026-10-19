/*
 * RICH TOOLS ON A SECURE TEST CYCLE — END-TO-END CERTIFICATION.
 *
 * HOW TO RUN:  npm run test:challenge-finish   (every tests/integration suite)
 *         or:  firebase emulators:exec --only firestore --project mathmaster-rich-cert \
 *                --config tests/browser/emulator/firebase.json \
 *                "node --import ./tests/integration/support/emulatorTransactions.mjs \
 *                 --test tests/integration/testCycleRichToolCertification.test.mjs"
 *
 * A Test Cycle whose seven targets are each answered with a different real
 * MathMaster Rich Tool — Graphing, Function Investigation (coordinate plane),
 * Systems Workspace (inequality construction), Data Modeling Lab, the Step
 * Algebra workspace, the Number Line and the Mapping Diagram — built from the
 * REAL bank families and driven through the REAL Cloud Functions against the
 * emulator:
 *
 *   preflight    the blueprint's secure rendering contract passes; a family
 *                with an uncertified tool is refused by name
 *   Test         every issued item carries its tool under the Secure Test
 *                policy with no private and no assistance material; a draft
 *                carries the construction and the tool's own drafts and comes
 *                back on reload; unfinished work is refused without spending
 *                the item; submits never reveal correctness; finalizing
 *                records an autosaved construction
 *   release      the server's own grading of the constructions decides the
 *                score; released review returns the student's raw work
 *   Corrections  the missed skills come back on the SAME tool, in the
 *                Corrections policy, with a verdict, feedback and three tries
 *   Retest       fresh parallel items on the same tools, Secure Retest policy,
 *                no reused instance; the capped grade rule is unchanged
 *   preview      the teacher sees the same tool items and grades them with
 *                the real grader — and nothing is written
 *
 * Like the other certifications it never reads an answer key: every answer is
 * built from the public payload a browser receives
 * (tests/fixtures/secureRichToolAnswers.mjs).
 *
 * Ids are prefixed `richcert` and distinct from every other suite's, because
 * the integration suites share one emulator and run in parallel.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { BANK_FAMILY_BY_TOOL, RICH_TOOL_ANSWERS, loadBankFamilies } from '../fixtures/secureRichToolAnswers.mjs';
import { assistanceKeysIn } from '../../functions/shared/questionRuntimePolicy.mjs';
import {
  db, fns, readCorrectionPlan, readRecord, readSession, refusal, studentRequest, teacherRequest, TEACHER_EMAIL, OTHER_TEACHER_EMAIL,
} from './testCycleCertificationHarness.mjs';

const require = createRequire(import.meta.url);
const secureItems = require('../../functions/lib/secureItems.js');

const PREFIX = 'richcert_';
const CLASS_ID = 'richcert-class-1';
const ASSIGNMENT_ID = `${PREFIX}assignment`;
const UNCERTIFIED_ASSIGNMENT_ID = `${PREFIX}uncertified`;
const STUDENT = 'RICHCERT_STUDENT';
const TOOLS = Object.keys(BANK_FAMILY_BY_TOOL);

/**
 * The server-only document an open secure item and its draft live in (the
 * session's `items` subcollection, so every open item keeps its own draft) —
 * read here to check what was stored, never by a browser.
 */
const readOpenItem = async (examSessionId, questionInstanceId) => (
  (await db.collection('examSessions').doc(examSessionId).collection('items').doc(questionInstanceId).get()).data()
);

const PRIVATE_KEYS = new Set([
  'expected', 'accepted', 'acceptedAnswers', 'answer', 'answerKey', 'correctAnswer', 'solution',
  'privateGrading', 'generatorParameters', 'gradingDefinition', 'definition', 'expectedIntervals',
  'expectedNotation', 'expectedInequality', 'expectedModel', 'descriptor', 'regression',
  'solutionReview', 'supportHints', 'attemptFeedback', 'misconceptions', 'seedKey', 'issuancePlan',
]);
const privateKeysIn = (value, path = '', found = []) => {
  if (Array.isArray(value)) { value.forEach((child, index) => privateKeysIn(child, `${path}[${index}]`, found)); return found; }
  if (!value || typeof value !== 'object') return found;
  Object.entries(value).forEach(([key, child]) => {
    if (PRIVATE_KEYS.has(key)) found.push(`${path}.${key}`);
    privateKeysIn(child, `${path}.${key}`, found);
  });
  return found;
};

const REPRESENTATIONS = new Set(['symbolic', 'graph', 'table', 'verbal', 'numeric', 'multiple']);
let bankFamilies = [];
const familyDocs = () => TOOLS.map((toolId) => {
  const source = bankFamilies.find((entry) => entry.id === BANK_FAMILY_BY_TOOL[toolId]);
  const { id: _id, ...fields } = source;
  return { id: `${PREFIX}${toolId}`, fields: { ...fields, active: true } };
});

const blueprint = () => ({
  blueprintId: `${PREFIX}blueprint`,
  version: 1,
  title: 'Rich Tool Unit Test',
  courseId: 'algebra1',
  calculatorMode: 'questionSpecific',
  targets: familyDocs().map(({ id, fields }, index) => ({
    targetId: `t-${TOOLS[index]}`,
    alignmentKey: (fields.alignmentKeys || [])[0] || fields.alignmentKey,
    label: `${TOOLS[index]} skill`,
    dok: fields.dok,
    difficultyBand: fields.difficultyBand,
    representation: REPRESENTATIONS.has(fields.representation) ? fields.representation : 'multiple',
    // The tool is part of the blueprint: a target answered by graphing is
    // retested by graphing.
    toolId: TOOLS[index],
    anchor: index < 2,
    weight: 1,
    questionCount: 1,
    familyIds: [id],
  })),
});

const policy = () => ({
  mode: 'testCycle',
  passingScore: 70,
  review: { required: true },
  corrections: { requiredForRetest: true, strategy: 'performanceTargeted' },
  retest: { maxRecordedGrade: 70 },
});

const assignmentDoc = (id, overrides = {}) => ({
  id,
  schemaVersion: 5,
  title: `Rich ${id}`,
  courseId: 'algebra1',
  assignedClassIds: [CLASS_ID],
  dueAt: '2099-01-01T00:00:00.000Z',
  assignment: { title: `Rich ${id}`, courseId: 'algebra1' },
  assessmentPolicy: policy(),
  testBlueprint: blueprint(),
  sections: [{ id: 'review', role: 'review', title: 'Review', questions: [
    { questionId: `${PREFIX}review_1`, type: 'response', prompt: 'Review 1' },
  ] }],
  ...overrides,
});

const answerFor = (instance, { correct = true } = {}) => {
  const builder = RICH_TOOL_ANSWERS[instance.pathToolId];
  assert.ok(builder, `no student answer builder for ${instance.pathToolId}`);
  return (correct ? builder.answer : builder.wrong)({ tool: instance.tool });
};

const assertSecurePublic = (instance, mode) => {
  assert.ok(TOOLS.includes(instance.pathToolId), `the item carries its Rich Tool (got ${instance.pathToolId})`);
  assert.ok(instance.tool && typeof instance.tool === 'object');
  assert.equal(instance.runtimeMode, mode);
  assert.deepEqual(privateKeysIn(instance), [], 'no private material reaches the browser');
  assert.deepEqual(assistanceKeysIn(instance), [], 'no assistance material on a secure item');
  ['familyId', 'dok', 'difficultyBand', 'alignmentKey'].forEach((key) => assert.equal(key in instance, false, key));
};

before(async () => {
  bankFamilies = await loadBankFamilies();
  await Promise.all(familyDocs().map(({ id, fields }) => db.collection('pathQuestionBank').doc(id).set(fields)));
  await db.collection('pathQuestionBank').doc(`${PREFIX}transformations`).set({
    active: true, type: 'transformationsLab', prompt: 'Reflect the triangle across the y-axis.', alignmentKeys: ['texas:A.7C'],
    generator: { parameters: { a: { type: 'int', min: 1, max: 5 } } },
  });
  await db.collection('classes').doc(CLASS_ID).set({
    name: 'Rich Period 1', course: 'algebra1', courseLevel: 'standard', period: 'Period 1', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await db.collection('grades').doc(STUDENT).set({
    displayName: STUDENT, classId: CLASS_ID, classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
  });
  await db.collection('assignments').doc(ASSIGNMENT_ID).set(assignmentDoc(ASSIGNMENT_ID));
  const uncertified = assignmentDoc(UNCERTIFIED_ASSIGNMENT_ID);
  uncertified.testBlueprint.targets[0].familyIds = [`${PREFIX}transformations`];
  uncertified.testBlueprint.targets[0].toolId = null;
  await db.collection('assignments').doc(UNCERTIFIED_ASSIGNMENT_ID).set(uncertified);
});

after(async () => {
  const sessions = await db.collection('examSessions').where('courseTest.assignmentId', 'in', [ASSIGNMENT_ID, UNCERTIFIED_ASSIGNMENT_ID]).get();
  await Promise.allSettled([
    ...familyDocs().map(({ id }) => db.collection('pathQuestionBank').doc(id).delete()),
    db.collection('pathQuestionBank').doc(`${PREFIX}transformations`).delete(),
    db.collection('assignments').doc(ASSIGNMENT_ID).delete(),
    db.collection('assignments').doc(UNCERTIFIED_ASSIGNMENT_ID).delete(),
    db.collection('classes').doc(CLASS_ID).delete(),
    db.collection('grades').doc(STUDENT).delete(),
    ...[ASSIGNMENT_ID, UNCERTIFIED_ASSIGNMENT_ID].flatMap((assignmentId) => [
      db.collection('testCycleRecords').doc(`${assignmentId}__${STUDENT}`).delete(),
      db.collection('testCycleCorrectionPlans').doc(`${assignmentId}__${STUDENT}`).delete(),
      db.collection('testCycleRetestPlans').doc(`${assignmentId}__${STUDENT}`).delete(),
    ]),
    ...sessions.docs.map((doc) => doc.ref.delete()),
  ]);
});

/* ---------------------------------------------------------------- preflight */

test('preflight: every secure question can render with its required MathMaster tool', async () => {
  const { preflight } = await fns.preflightTestCycleAssignment.run(teacherRequest({ assignmentId: ASSIGNMENT_ID }));
  assert.equal(preflight.blocked, false, preflight.errors.join('\n'));
  const check = preflight.checks.find((entry) => entry.id === 'secureRendering');
  assert.equal(check.passed, true);
  assert.equal(check.label, `All ${TOOLS.length} secure questions can render using their required MathMaster tools`);
  assert.deepEqual(preflight.secureRendering.map((entry) => entry.requiredToolLabel).filter(Boolean).length, TOOLS.length);
  preflight.secureRendering.forEach((entry) => {
    assert.deepEqual(entry.modes, { secureTest: true, secureRetest: true, corrections: true }, entry.targetId);
  });
});

test('preflight: a family whose tool is not certified is refused by name, and cannot be assigned', async () => {
  const { preflight } = await fns.preflightTestCycleAssignment.run(teacherRequest({ assignmentId: UNCERTIFIED_ASSIGNMENT_ID }));
  assert.equal(preflight.blocked, true);
  assert.ok(preflight.errors.some((error) => /TEST_CYCLE_TOOL_NOT_CERTIFIED: .*Transformations Lab family \(richcert_transformations\)/.test(error)), preflight.errors.join('\n'));
  const assigned = await refusal(fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: UNCERTIFIED_ASSIGNMENT_ID, classId: CLASS_ID })));
  assert.ok(assigned, 'a Test Cycle with an uncertified tool cannot reach a classroom');
});

/* --------------------------------------------------------------------- Test */

let testSessionId = null;
const missedTools = new Set();

test('the secure Test delivers each Rich Tool, persists its construction, refuses unfinished work, and never reveals correctness', async () => {
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: ASSIGNMENT_ID, classId: CLASS_ID }));
  await db.collection('grades').doc(STUDENT).set({ gradesByAssignment: { [ASSIGNMENT_ID]: { 0: { status: 'correct' } } } }, { merge: true });
  const record = await readRecord(ASSIGNMENT_ID, STUDENT);
  testSessionId = record.test.examSessionId;
  assert.ok(testSessionId);
  await fns.startSecureExamSession.run(studentRequest(STUDENT, { examSessionId: testSessionId }));

  const seenTools = [];
  for (let index = 0; index < TOOLS.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const issued = await fns.issueSecureExamQuestion.run(studentRequest(STUDENT, { examSessionId: testSessionId }));
    const instance = issued.questionInstance;
    assertSecurePublic(instance, 'secureTest');
    seenTools.push(instance.pathToolId);

    if (index === 0) {
      // AUTOSAVE: the construction and the tool's own drafts, then a reload.
      const draftKey = await secureItems.examItemDraftKey(testSessionId, instance.questionInstanceId);
      // eslint-disable-next-line no-await-in-loop
      await fns.saveSecureExamDraft.run(studentRequest(STUDENT, {
        examSessionId: testSessionId,
        questionInstanceId: instance.questionInstanceId,
        responsePayload: {
          responses: {},
          raw: { ...answerFor(instance), isCorrect: true },
          workspaceDrafts: [
            { key: `${draftKey}:work:tool`, savedAt: 1700000000000, value: { construction: 'mine', score: 1 } },
            { key: 'mathmaster:draft:v2:another-assignment', savedAt: 1700000000001, value: 'not this item' },
          ],
        },
        supportUsage: {},
      }));
      // eslint-disable-next-line no-await-in-loop
      const stored = (await readOpenItem(testSessionId, instance.questionInstanceId)).draftResponse.responsePayload;
      assert.equal(typeof stored.rawJson, 'string', 'the construction is stored as one canonical string');
      assert.doesNotMatch(stored.rawJson, /isCorrect/, 'a claimed verdict is stripped');
      assert.deepEqual(JSON.parse(stored.workspaceDraftsJson).map((entry) => entry.key), [`${draftKey}:work:tool`]);
      // eslint-disable-next-line no-await-in-loop
      const reloaded = await fns.issueSecureExamQuestion.run(studentRequest(STUDENT, { examSessionId: testSessionId }));
      assert.equal(reloaded.questionInstance.questionInstanceId, instance.questionInstanceId, 'a reload reopens the same item');
      assert.deepEqual(reloaded.draftResponse.responsePayload.raw, answerFor(instance));
      assert.equal(reloaded.draftResponse.responsePayload.workspaceDrafts[0].value.construction, 'mine');
      assert.equal('score' in reloaded.draftResponse.responsePayload.workspaceDrafts[0].value, false);

      // UNFINISHED work is an interface problem: refused, and the item stays open.
      // eslint-disable-next-line no-await-in-loop
      const unfinished = await refusal(fns.submitSecureExamResponse.run(studentRequest(STUDENT, {
        examSessionId: testSessionId,
        questionInstanceId: instance.questionInstanceId,
        responsePayload: { responses: {} },
        submissionId: `${PREFIX}unfinished`,
      })));
      assert.equal(unfinished?.code, 'invalid-argument');
      // eslint-disable-next-line no-await-in-loop
      const { navigation } = await readSession(testSessionId);
      assert.equal(navigation.items[instance.questionInstanceId].state, 'open', 'the refused item is not spent');
      assert.equal(navigation.itemOrder[navigation.cursor], instance.questionInstanceId, 'and is still the one in front of the student');
    }

    if (index === TOOLS.length - 1) {
      // The LAST item is autosaved, not submitted, and the Test is submitted:
      // finalizing grades the autosaved construction.
      // eslint-disable-next-line no-await-in-loop
      await fns.saveSecureExamDraft.run(studentRequest(STUDENT, {
        examSessionId: testSessionId,
        questionInstanceId: instance.questionInstanceId,
        responsePayload: { responses: {}, raw: answerFor(instance) },
        supportUsage: {},
      }));
      break;
    }

    const correct = index < 3;
    if (!correct) missedTools.add(instance.pathToolId);
    // eslint-disable-next-line no-await-in-loop
    const result = await fns.submitSecureExamResponse.run(studentRequest(STUDENT, {
      examSessionId: testSessionId,
      questionInstanceId: instance.questionInstanceId,
      responsePayload: { responses: {}, raw: answerFor(instance, { correct }) },
      submissionId: `${PREFIX}test-${index}`,
    }));
    assert.equal(result.correctnessReleased, false);
    assert.equal('isCorrect' in result, false, 'a submit never says whether the construction was right');
  }
  assert.deepEqual([...seenTools].sort(), [...TOOLS].sort(), 'every Rich Tool was delivered');

  const finalized = await fns.finalizeSecureExam.run(studentRequest(STUDENT, { examSessionId: testSessionId }));
  assert.ok(['submitted'].includes(finalized.session.status));
  const session = await readSession(testSessionId);
  const autosaved = Object.values(session.responses).find((response) => response.finalizedFromAutosave === true);
  assert.ok(autosaved, 'the autosaved construction was recorded at submit');
  assert.equal(autosaved.grading.isCorrect, true, 'and graded from the stored construction');
  Object.values(session.responses).forEach((response) => {
    assert.ok(TOOLS.includes(response.pathToolId), 'each recorded response names its tool');
    assert.equal(typeof response.responsePayload.rawJson, 'string');
    assert.equal('workspaceDraftsJson' in response.responsePayload, false, 'a recorded response keeps no workspace drafts');
  });
});

/* ------------------------------------------------------------------ release */

test('the server\'s grading of the constructions decides the score; released review returns the student\'s work', async () => {
  const before = await refusal(fns.getStudentSecureExamReview.run(studentRequest(STUDENT, { examSessionId: testSessionId })));
  assert.ok(before, 'nothing is released before the teacher releases it');
  await fns.proctorExamAction.run(teacherRequest({ examSessionId: testSessionId, action: 'releaseFeedback' }));
  const record = await readRecord(ASSIGNMENT_ID, STUDENT);
  // 3 submitted correctly + 1 autosaved correctly, of 7 equally weighted.
  assert.equal(record.test.rawScore, Math.round((4 / 7) * 100));
  assert.equal(record.corrections.required, true);

  const { review } = await fns.getStudentSecureExamReview.run(studentRequest(STUDENT, { examSessionId: testSessionId }));
  assert.equal(review.items.length, TOOLS.length);
  review.items.forEach((item) => {
    assert.ok(TOOLS.includes(item.pathToolId));
    assert.equal(typeof item.responsePayload.rawJson, 'string', 'the student can see what they built');
    assert.ok(item.questionSnapshot.pathToolId, 'and which tool they built it in');
    assert.deepEqual(privateKeysIn(item.questionSnapshot), []);
  });
  assert.equal(review.correctQuestions, 4);
});

/* -------------------------------------------------------------- Corrections */

test('Corrections bring each missed skill back on the same Rich Tool, with feedback, hints and three tries — grade untouched', async () => {
  const recordedBefore = (await readRecord(ASSIGNMENT_ID, STUDENT)).recordedGrade ?? null;
  const card = await fns.getStudentTestCycle.run(studentRequest(STUDENT, { assignmentId: ASSIGNMENT_ID }));
  assert.equal(card.stage, 'corrections');
  assert.equal(card.corrections.targets.length, missedTools.size);
  let sawWrongPath = false;
  for (const target of card.corrections.targets) {
    let complete = false;
    for (let round = 0; round < 6 && !complete; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      const issued = await fns.issueTestCycleCorrectionQuestion.run(studentRequest(STUDENT, { assignmentId: ASSIGNMENT_ID, correctionId: target.correctionId }));
      const instance = issued.questionInstance;
      assert.equal(instance.runtimeMode, 'corrections');
      assert.ok(missedTools.has(instance.pathToolId), `the correction for a missed ${instance.pathToolId} skill uses that tool`);
      assert.deepEqual(privateKeysIn(instance), []);
      const submit = (raw) => fns.submitTestCycleCorrectionResponse.run(studentRequest(STUDENT, {
        assignmentId: ASSIGNMENT_ID, correctionId: target.correctionId, questionInstanceId: instance.questionInstanceId, responsePayload: { responses: {}, raw },
      }));
      if (!sawWrongPath) {
        // Unfinished work spends no try.
        // eslint-disable-next-line no-await-in-loop
        const refused = await refusal(submit(null));
        assert.equal(refused?.code, 'invalid-argument');
        // eslint-disable-next-line no-await-in-loop
        const open = (await readCorrectionPlan(ASSIGNMENT_ID, STUDENT)).activeQuestions[target.correctionId];
        assert.equal(Number(open.attemptsUsed || 0), 0);
        // A wrong construction: an immediate verdict and the item's feedback.
        // eslint-disable-next-line no-await-in-loop
        const wrong = await submit(answerFor(instance, { correct: false }));
        assert.equal(wrong.isCorrect, false);
        assert.equal(wrong.attemptsRemaining, 2);
        assert.equal(typeof wrong.feedbackMessage, 'string');
        assert.equal(wrong.solutionReview, null, 'no worked review while the item is open');
        sawWrongPath = true;
      }
      // eslint-disable-next-line no-await-in-loop
      const right = await submit(answerFor(instance));
      assert.equal(right.isCorrect, true, `a correct ${instance.pathToolId} construction is accepted in Corrections`);
      // eslint-disable-next-line no-await-in-loop
      const plan = (await readCorrectionPlan(ASSIGNMENT_ID, STUDENT)).plan;
      complete = plan.targets.find((entry) => entry.correctionId === target.correctionId).complete === true;
    }
    assert.equal(complete, true, `correction ${target.correctionId} completed`);
  }
  const after = await readRecord(ASSIGNMENT_ID, STUDENT);
  assert.equal(after.corrections.complete, true);
  assert.equal(after.recordedGrade ?? null, recordedBefore, 'Corrections never move the recorded grade');
  assert.ok(after.retest.examSessionId, 'finishing Corrections opens the Retest');
});

/* ------------------------------------------------------------------- Retest */

test('the Retest asks fresh parallel items on the same tools, under the Secure Retest policy, and the cap still holds', async () => {
  const testSession = await readSession(testSessionId);
  const testInstanceIds = new Set(Object.keys(testSession.responses));
  const testPrompts = new Set(Object.values(testSession.responses).map((response) => JSON.stringify(response.questionSnapshot?.tool || {})));
  const { retest } = await readRecord(ASSIGNMENT_ID, STUDENT);
  const retestSessionId = retest.examSessionId;
  await fns.startSecureExamSession.run(studentRequest(STUDENT, { examSessionId: retestSessionId }));
  const total = Number((await readSession(retestSessionId)).requiredQuestions);
  assert.ok(total >= missedTools.size);
  for (let index = 0; index < total; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const issued = await fns.issueSecureExamQuestion.run(studentRequest(STUDENT, { examSessionId: retestSessionId }));
    const instance = issued.questionInstance;
    assertSecurePublic(instance, 'secureRetest');
    assert.equal(testInstanceIds.has(instance.questionInstanceId), false, 'no Test instance is reused');
    assert.equal(testPrompts.has(JSON.stringify(instance.tool)), false, 'a fresh instance, not the Test item again');
    // eslint-disable-next-line no-await-in-loop
    await fns.submitSecureExamResponse.run(studentRequest(STUDENT, {
      examSessionId: retestSessionId,
      questionInstanceId: instance.questionInstanceId,
      responsePayload: { responses: {}, raw: answerFor(instance) },
      submissionId: `${PREFIX}retest-${index}`,
    }));
  }
  // Every weak skill is retested with the tool it was missed with.
  const retestTools = new Set(Object.values((await readSession(retestSessionId)).responses).map((response) => response.pathToolId));
  missedTools.forEach((toolId) => assert.ok(retestTools.has(toolId), `${toolId} retested on its own tool`));

  await fns.proctorExamAction.run(teacherRequest({ examSessionId: retestSessionId, action: 'releaseFeedback' }));
  const record = await readRecord(ASSIGNMENT_ID, STUDENT);
  assert.equal(record.retest.rawScore, 100, 'every retest construction graded correct by the server');
  assert.equal(record.recordedGrade, 70, 'max(57, min(100, 70)): the capped rule is unchanged');
});

/* ------------------------------------------------------------------ preview */

test('teacher preview renders the same Rich Tool items, grades them with the real grader, and writes nothing', async () => {
  const countSessions = async () => (await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENT_ID).get()).size;
  const sessionsBefore = await countSessions();
  const preview = await fns.previewTestCycleSecureItems.run(teacherRequest({ assignmentId: ASSIGNMENT_ID, draw: 2, stage: 'test' }));
  assert.equal(preview.writes, 'none');
  assert.equal(preview.items.length, TOOLS.length);
  for (const item of preview.items) {
    assertSecurePublic(item.questionInstance, 'secureTest');
    assert.equal(item.slot.toolId, item.questionInstance.pathToolId);
    assert.equal(item.slot.secureCompatible, true);
    // eslint-disable-next-line no-await-in-loop
    const graded = await fns.gradeTestCyclePreviewItem.run(teacherRequest({ previewItemId: item.previewItemId, responsePayload: { responses: {}, raw: answerFor(item.questionInstance) } }));
    assert.equal(graded.isCorrect, true, `${item.questionInstance.pathToolId} graded correct in preview`);
    // eslint-disable-next-line no-await-in-loop
    const unfinished = await fns.gradeTestCyclePreviewItem.run(teacherRequest({ previewItemId: item.previewItemId, responsePayload: { responses: {} } }));
    assert.equal(unfinished.incomplete, true);
  }
  const retestPreview = await fns.previewTestCycleSecureItems.run(teacherRequest({ assignmentId: ASSIGNMENT_ID, draw: 3, stage: 'retest' }));
  retestPreview.items.forEach((item) => assert.equal(item.questionInstance.runtimeMode, 'secureRetest'));
  const correctionsPreview = await fns.previewTestCycleSecureItems.run(teacherRequest({ assignmentId: ASSIGNMENT_ID, draw: 4, stage: 'corrections' }));
  correctionsPreview.items.forEach((item) => assert.equal(item.questionInstance.runtimeMode, 'corrections'));
  assert.equal(await countSessions(), sessionsBefore, 'preview created no session');
});

test('an UNSAVED Test Cycle previews the same Rich Tool items from the review screen, graded inside its own blueprint, writing nothing', async () => {
  // The review screen has no assignment id: the teacher is still deciding
  // whether to publish, and while preflight blocks it they could not save it.
  const countSessions = async () => (await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENT_ID).get()).size;
  const sessionsBefore = await countSessions();
  const { id: _unsaved, ...candidate } = assignmentDoc(`${PREFIX}unsaved`);
  const answer = (item) => ({ responses: {}, raw: answerFor(item.questionInstance) });

  const preview = await fns.previewTestCycleSecureItems.run(teacherRequest({ assignment: candidate, draw: 1, stage: 'test' }));
  assert.equal(preview.writes, 'none');
  assert.equal(preview.candidate, true);
  assert.equal(preview.assignmentId, null, 'an unsaved cycle has no id, and is given none');
  assert.equal(preview.items.length, TOOLS.length);
  for (const item of preview.items) {
    assertSecurePublic(item.questionInstance, 'secureTest');
    // eslint-disable-next-line no-await-in-loop
    const graded = await fns.gradeTestCyclePreviewItem.run(teacherRequest({ previewItemId: item.previewItemId, assignment: candidate, responsePayload: answer(item) }));
    assert.equal(graded.isCorrect, true, `${item.questionInstance.pathToolId} graded correct in the unsaved preview`);
  }
  const retest = await fns.previewTestCycleSecureItems.run(teacherRequest({ assignment: candidate, draw: 2, stage: 'retest' }));
  retest.items.forEach((item) => assert.equal(item.questionInstance.runtimeMode, 'secureRetest'));
  const corrections = await fns.previewTestCycleSecureItems.run(teacherRequest({ assignment: candidate, draw: 3, stage: 'corrections' }));
  corrections.items.forEach((item) => assert.equal(item.questionInstance.runtimeMode, 'corrections'));

  // The grading boundary is the saved preview's: the family must be in the
  // candidate's own blueprint, the seed this teacher's, and never a student.
  const [first] = preview.items;
  const narrowed = { ...candidate, testBlueprint: { ...candidate.testBlueprint, targets: candidate.testBlueprint.targets.filter((target) => !target.familyIds.includes(first.slot.familyId)) } };
  const outside = await refusal(fns.gradeTestCyclePreviewItem.run(teacherRequest({ previewItemId: first.previewItemId, assignment: narrowed, responsePayload: answer(first) })));
  assert.equal(outside?.code, 'permission-denied', 'a family outside the candidate blueprint is not graded');
  const otherTeacher = await refusal(fns.gradeTestCyclePreviewItem.run(teacherRequest({ previewItemId: first.previewItemId, assignment: candidate, responsePayload: answer(first) }, OTHER_TEACHER_EMAIL)));
  assert.equal(otherTeacher?.code, 'permission-denied', 'another teacher cannot use this preview as an oracle');
  const student = await refusal(fns.previewTestCycleSecureItems.run(studentRequest(STUDENT, { assignment: candidate })));
  assert.equal(student?.code, 'permission-denied', 'a student cannot preview an unsaved cycle');
  const studentGrade = await refusal(fns.gradeTestCyclePreviewItem.run(studentRequest(STUDENT, { previewItemId: first.previewItemId, assignment: candidate, responsePayload: answer(first) })));
  assert.equal(studentGrade?.code, 'permission-denied');

  // A blueprint naming a family that was never imported: the preview shows the
  // rest and names the empty slot; preflight names the family and the fix.
  const missing = { ...candidate, testBlueprint: { ...candidate.testBlueprint, targets: [...candidate.testBlueprint.targets, {
    targetId: 't-not-imported', alignmentKey: 'texas:A2.3F', label: 'Graph a system of inequalities', dok: 2, difficultyBand: 3,
    representation: 'graph', toolId: 'systemsWorkspace', anchor: true, weight: 1, questionCount: 1, familyIds: [`${PREFIX}never_imported`],
  }] } };
  const partial = await fns.previewTestCycleSecureItems.run(teacherRequest({ assignment: missing }));
  assert.equal(partial.items.length, TOOLS.length);
  assert.equal(partial.unfilledSlots, 1);
  assert.deepEqual(partial.unfilledTargetIds, ['t-not-imported']);
  const { preflight } = await fns.preflightTestCycleCandidate.run(teacherRequest({ assignment: missing }));
  assert.equal(preflight.blocked, true);
  assert.deepEqual(preflight.unavailableFamilies.map((row) => [row.familyId, row.status]), [[`${PREFIX}never_imported`, 'unregistered']]);
  assert.ok(preflight.errors.some((error) => error.includes(`Not in the secure question bank: ${PREFIX}never_imported`)), preflight.errors.join('\n'));

  assert.equal(await countSessions(), sessionsBefore, 'the unsaved preview created no session');
  const candidateSessions = await db.collection('examSessions').where('courseTest.assignmentId', '>=', 'candidate-').where('courseTest.assignmentId', '<', 'candidate.').get();
  assert.equal(candidateSessions.size, 0, 'and none under a candidate id either');
});
