/*
 * P-7, EVERYWHERE: A FAMILY SLOT'S TRIES ARE COUNTED ON THE QUESTION IT DEALT,
 * ALSO WHERE NO SCREEN HAS SHOWN IT.
 *
 * Algebra I M3 T1 L3 Warm-Up 2 (and its Honors twin) is a Question Family slot
 * stored with no answer fields (three tries) and dealt as four choices (one
 * try). familyChoiceOnlyTries.test.mjs holds the screen and the server. Three
 * counts were still made on the stored slot:
 *
 *   - the question list after a reload, until the student opened the slot
 *     again on that device: a Warm-Up 2 closed after its one try read
 *     "2 tries left";
 *   - the teacher's case review (attemptAnalysis.js): "Not yet correct ·
 *     attempts remain", one try "of 3";
 *   - a live correction's repair retry (liveQuestionCorrection.js), which
 *     read no section's policy either, so on an exit ticket it left two tries
 *     used of one.
 *
 * Each now counts through shownFamilyQuestion.js countedQuestion, handed the
 * question the slot's pin dealt (dealtFamilyQuestion.js), as App.jsx does.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../src/platform/contract/assignmentSchemaV5.js';
import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import { countedQuestion } from '../../src/platform/generation/shownFamilyQuestion.js';
import { dealtFamilyQuestion } from '../../src/platform/generation/dealtFamilyQuestion.js';
import { readLocalDeliveryPin } from '../../src/platform/generation/familyDeliveryPins.js';
import { QUESTION_STATUS, describeNavigatorQuestion } from '../../src/platform/student/assignmentNavigator.js';
import { QUESTION_OUTCOME, analyzeAssignmentQuestions } from '../../src/platform/caseReview/attemptAnalysis.js';
import {
  repairQuestionRecordForCurrentGrader,
  repairQuestionRecordForLiveCorrection,
} from '../../src/platform/assignment/liveQuestionCorrection.js';
import { SYSTEMS_WORKSPACE_UPGRADE_REPAIR_KIND } from '../../functions/shared/liveResponseRepairPolicy.mjs';
import { familySlotKey } from '../../functions/shared/questionFamilySlot.mjs';
import { getAttemptsRemaining, isChoiceOnlyQuestion, resolveQuestionMaximumAttempts } from '../../functions/shared/attemptPolicy.mjs';
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  CLASS_ID,
  DAY,
  at,
  createDevice,
  gradeDocumentFor,
  ingestLikeServer,
  openQuestion,
  questionsOf,
  recordOf,
  submitFields,
} from './helpers/warmupServerLifecycle.mjs';

const LESSON = new URL('../../teacher-import-jsons/algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities.json', import.meta.url);
const STUDENT = 'p7-everywhere-student';
const WARMUP = getEffectiveActivityPolicy('warmup');
const DOL = getEffectiveActivityPolicy('dol');

/** The lesson through the teacher's import + publish chain, seated for one class (as familyChoiceOnlyTries.test.mjs). */
const publishedL3 = (() => {
  let published = null;
  return () => {
    if (published) return published;
    const parsed = parseAssignmentBlueprintText(readFileSync(LESSON, 'utf8'));
    const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}), {});
    assert.equal(model.isValid, true, 'the lesson passes Pre-Flight');
    const questions = validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
    const base = {
      id: 'a1-m3-t1-l3-everywhere',
      title: 'Modeling and Solving Linear Inequalities',
      schemaVersion: 5,
      variantPolicy: model.assignmentV5?.variantPolicy || { mode: 'personalized' },
      sections: rebuildV5SectionsFromQuestions(model.assignmentV5, questions),
      releaseAt: `${DAY}T00:00:00`,
      dueAt: `${DAY}T23:59:00`,
      lateDueAt: '2026-10-09T23:59:00',
      assignedClassIds: [CLASS_ID],
      warmup: { enabled: true, minutesBeforeStart: 7, closeMinutesAfterStart: 10, instructionDatesByClassId: { [CLASS_ID]: DAY } },
    };
    const seats = planSeatAdditions({ assignment: base, assignmentId: base.id, classId: CLASS_ID, studentIds: [STUDENT] });
    published = { ...base, generationSeats: { version: 1, byClassId: { [CLASS_ID]: seats } } };
    return published;
  };
})();

const triesOn = (question, policy = WARMUP) => resolveQuestionMaximumAttempts({ question, maximumAttempts: policy.attempts, activityPolicy: policy });
const fieldsOf = (question) => (question?.answerFields || []).map((field) => [field.id, field.answer]);

/**
 * Warm-Up 2 opened on a Chromebook and missed once; the server ingests the
 * miss. What every count below starts from.
 */
const missedWarmUp2 = (() => {
  let missed = null;
  return async () => {
    if (missed) return missed;
    const assignment = publishedL3();
    const questionIndex = questionsOf(assignment).findIndex((question) => question.questionId === 'm3l3-wu-2');
    assert.ok(questionIndex >= 0, 'L3 Warm-Up 2 is in the lesson');
    const chromebook = createDevice(STUDENT);
    const opened = await openQuestion(chromebook, { assignment, questionIndex, nowMs: at(DAY, '08:01') });
    const first = opened.processed.answerFields[0];
    const right = Object.fromEntries(opened.processed.answerFields.map((field) => [field.id, field.answer]));
    const wrong = { ...right, [first.id]: first.options.find((option) => option !== first.answer) };
    const miss = await submitFields(chromebook, opened, { responses: wrong, capturedAt: at(DAY, '08:02') });
    const ingested = ingestLikeServer({ envelope: miss.envelope, assignment, gradeDocument: gradeDocumentFor(STUDENT), now: at(DAY, '08:02', 2) });
    const canonical = recordOf(ingested.gradeDocument, assignment.id, questionIndex);
    missed = { assignment, questionIndex, chromebook, opened, miss, gradeDocument: ingested.gradeDocument, canonical, stored: questionsOf(assignment)[questionIndex] };
    return missed;
  };
})();

/** App.jsx countedQuestionFor's deal, for one device (a Chromebook's own pins). */
const appDeal = ({ device, assignment, questionIndex, record, cache = null }) => ({ slot, variant, storedQuestion }) => dealtFamilyQuestion({
  assignment,
  question: storedQuestion,
  questionIndex,
  record,
  devicePin: device ? readLocalDeliveryPin({ studentId: device.studentId, slotKey: slot, variant, store: device.storage }) : null,
  studentId: STUDENT,
  classId: CLASS_ID,
  cache,
});

test('the server closes Warm-Up 2 after its one try, and its record keeps the pin', async () => {
  const { canonical, opened } = await missedWarmUp2();
  assert.equal(canonical.status, 'expired');
  assert.equal(canonical.attemptCount, 1);
  assert.equal(canonical.familyDelivery?.fingerprint, opened.processed.familyDelivery.fingerprint);
  assert.equal(isChoiceOnlyQuestion(opened.processed), true);
  assert.equal(triesOn(opened.question), WARMUP.attempts, 'the stored slot has three tries');
});

test('a slot\'s pin rebuilds the question it dealt, as the server counts it', async () => {
  const { assignment, questionIndex, stored, canonical, opened, chromebook, miss } = await missedWarmUp2();
  const deal = (overrides = {}) => dealtFamilyQuestion({ assignment, question: stored, questionIndex, record: canonical, studentId: STUDENT, classId: CLASS_ID, ...overrides });
  // From the record's pin alone (any device), the four choices dealt.
  const dealt = deal();
  assert.deepEqual(fieldsOf(dealt), fieldsOf(opened.processed));
  assert.equal(triesOn(dealt), 1);
  // Before the server answers, the device's own pin says the same.
  const slotKey = familySlotKey({ assignmentId: assignment.id, question: stored, storageIndex: questionIndex });
  const devicePin = readLocalDeliveryPin({ studentId: STUDENT, slotKey, variant: 0, store: chromebook.storage });
  assert.ok(devicePin, 'the Chromebook pinned what it showed');
  assert.deepEqual(fieldsOf(deal({ record: miss.sessionRecord, devicePin })), fieldsOf(opened.processed));
  // Nothing dealt yet, or a pin for another variant: nothing to rebuild.
  assert.equal(deal({ record: null }), null);
  assert.equal(deal({ record: { ...canonical, variantIndex: 1 } }), null);
  // A question that is not a family slot deals nothing.
  assert.equal(deal({ question: { questionId: 'plain', type: 'literal', prompt: 'Solve 2x = 6.', answer: '3' } }), null);
  // Rebuilt once per copy of the assignment and per pin.
  const cache = new WeakMap();
  const once = deal({ cache });
  assert.equal(deal({ cache }), once);
  assert.notEqual(deal({ cache, assignment: { ...assignment } }), once);
});

test('after a reload the question list says the closed Warm-Up 2 is closed, on any device', async () => {
  const { assignment, questionIndex, stored, canonical, chromebook } = await missedWarmUp2();
  const navigatorFor = (count) => describeNavigatorQuestion({ record: canonical, maximumAttempts: triesOn(count) });
  // App.jsx entryMaximumAttempts after a reload: nothing shown on this page yet.
  const afterReload = (device) => countedQuestion({
    shown: new Map(),
    deal: appDeal({ device, assignment, questionIndex, record: canonical }),
    assignmentId: assignment.id,
    storedQuestion: stored,
    questionIndex,
    record: canonical,
    fallback: stored,
  });
  for (const [label, device] of [['the same Chromebook', chromebook], ['another Chromebook', createDevice(STUDENT)]]) {
    const shown = navigatorFor(afterReload(device));
    assert.equal(shown.status, QUESTION_STATUS.CLOSED, label);
    // Three of the four statements were right.
    assert.equal(shown.label, 'Closed · 75% credit', label);
    assert.equal(shown.triesLeft, 0, label);
  }
  // What it read before: the stored slot's three tries.
  const before = navigatorFor(countedQuestion({ shown: new Map(), assignmentId: assignment.id, storedQuestion: stored, questionIndex, record: canonical, fallback: stored }));
  assert.equal(before.status, QUESTION_STATUS.TRY_AGAIN);
  assert.equal(before.label, '75% so far · 2 tries left');
});

test('App.jsx hands every count the question the pin dealt where nothing was shown', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  const counted = region(app, 'const countedQuestionFor = ', '});', 'countedQuestionFor');
  assert.match(counted, /countedQuestion\(\{\s*shown: familyDeliveriesRef\.current,\s*deal: familyDelivery && user\?\.role === 'student' && user\?\.id\s*\? \(\{ slot, variant, storedQuestion \}\) => familyDelivery\.dealtFamilyQuestion\(\{/);
  const dealt = region(counted, 'familyDelivery.dealtFamilyQuestion({', ': null,', 'the deal');
  assert.match(dealt, /\bquestion: storedQuestion,/);
  assert.match(dealt, /\bquestionIndex,/);
  assert.match(dealt, /\brecord,/);
  assert.match(dealt, /devicePin: readLocalDeliveryPin\(\{ studentId: user\.id, slotKey: slot, variant \}\),/);
  assert.match(dealt, /studentId: user\.id,/);
  assert.match(dealt, /cache: dealtFamilyQuestionsRef\.current,/);
  assert.match(app, /const dealtFamilyQuestionsRef = useRef\(new WeakMap\(\)\);/);
  // The rebuild comes with the family engine App loads, never the first load.
  const engine = readFileSync(new URL('../../src/platform/generation/familyDelivery.js', import.meta.url), 'utf8');
  assert.match(executableSource(engine), /export \{ dealtFamilyQuestion \} from '\.\/dealtFamilyQuestion\.js';/);
  const helper = executableSource(readFileSync(new URL('../../src/platform/generation/shownFamilyQuestion.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(helper, /dealtFamilyQuestion|questionFamilyGrading|questionFamilyInstance/);
});

test('the teacher\'s case review counts Warm-Up 2 on the question dealt', async () => {
  const { assignment, gradeDocument, canonical } = await missedWarmUp2();
  const student = { id: STUDENT, classId: CLASS_ID, gradesByAssignment: gradeDocument.gradesByAssignment };
  const rowOf = (result) => result.questions.find((row) => row.questionId === 'm3l3-wu-2');
  for (const closedForStudent of [false, true]) {
    const row = rowOf(analyzeAssignmentQuestions({ assignment, student, closedForStudent }));
    assert.equal(row.maxAttempts, 1, `closed ${closedForStudent}`);
    assert.equal(row.attemptsRemaining, 0);
    assert.equal(row.outcome, QUESTION_OUTCOME.EXHAUSTED);
    assert.equal(row.outcomeLabel, 'Not correct after all available attempts');
  }
  // A record that names nothing dealt (no pin) is counted on the stored slot, as before.
  const index = String(questionsOf(assignment).findIndex((question) => question.questionId === 'm3l3-wu-2'));
  const { familyDelivery: _pin, ...unpinned } = canonical;
  const legacy = { ...student, gradesByAssignment: { [assignment.id]: { ...gradeDocument.gradesByAssignment[assignment.id], [index]: unpinned } } };
  const legacyRow = rowOf(analyzeAssignmentQuestions({ assignment, student: legacy }));
  assert.equal(legacyRow.maxAttempts, WARMUP.attempts);
  assert.equal(legacyRow.outcome, QUESTION_OUTCOME.OPEN_INCORRECT);
});

// The fixtures liveQuestionCorrection.test.mjs repairs, on an exit ticket.
const exitTicketMixed = {
  questionId: 'q-live-dol',
  activityRole: 'dol',
  type: 'multiAnswer',
  prompt: 'State the domain in words and using an inequality.',
  answerFields: [
    { id: 'domainInequality', label: 'Domain using inequalities', acceptedAnswers: ['0 ≤ x ≤ 4', '0<=x<=4'], inputProfile: 'inequality' },
    {
      id: 'domainWords',
      label: 'Domain in words',
      type: 'choice',
      inputProfile: 'choice',
      options: ['all real numbers from 0 through 4', 'only the integers 0, 1, 2, 3, and 4', 'all real numbers less than or equal to 4'],
      answer: 'all real numbers from 0 through 4',
    },
  ],
};
const exhaustedOnExitTicket = {
  status: 'expired',
  attemptCount: 1,
  totalAttempts: 1,
  partialCredit: 0,
  bestPartialCredit: 0,
  partGrades: [
    { id: 'domainInequality', isComplete: true, isCorrect: false, response: '0<x<4' },
    { id: 'domainWords', isComplete: true, isCorrect: false, response: '0 to 4 inclusive' },
  ],
};
const exitTicketGraph = {
  questionId: 'q-linear-ray-dol',
  activityRole: 'dol',
  type: 'graphAnalysis',
  functionSpec: { type: 'linear', m: -1, b: 2, domain: { min: -2, minInclusive: true } },
  analysisRequests: [
    { id: 'domain', kind: 'domain', notation: 'inequality' },
    { id: 'range', kind: 'range', notation: 'inequality' },
  ],
};

test('a live correction gives one try back under the exit ticket\'s one try, as the screen counts it', () => {
  const repaired = repairQuestionRecordForLiveCorrection({
    record: exhaustedOnExitTicket,
    question: exitTicketMixed,
    affectedFieldIds: ['domainWords'],
    correctedAt: '2026-11-08T12:00:00.000Z',
  });
  assert.equal(repaired.status, 'attempted');
  assert.equal(repaired.attemptCount, 0, 'no try used of one');
  assert.equal(repaired.totalAttempts, 1);
  assert.equal(getAttemptsRemaining(repaired, triesOn(exitTicketMixed, DOL)), 1, '"1 try left" on the screen');
  assert.equal(repaired.liveCorrectionHistory.at(-1).grantedRepairRetry, true);
  // A teacher's extra exit-ticket try is counted too: still exactly one back.
  const granted = repairQuestionRecordForLiveCorrection({
    record: { ...exhaustedOnExitTicket, attemptCount: 2, totalAttempts: 2 },
    question: exitTicketMixed,
    affectedFieldIds: ['domainWords'],
    assignment: { id: 'les-dol', dol: { attemptGrantsByClassId: { [CLASS_ID]: 1 } } },
    studentId: STUDENT,
    classId: CLASS_ID,
  });
  assert.equal(granted.attemptCount, 1, 'one of two used');
  // Classwork keeps its three tries: two used, one back, as before.
  const classwork = repairQuestionRecordForLiveCorrection({
    record: { ...exhaustedOnExitTicket, attemptCount: 3, totalAttempts: 3 },
    question: { ...exitTicketMixed, activityRole: 'classwork' },
    affectedFieldIds: ['domainWords'],
  });
  assert.equal(classwork.attemptCount, 2);
  // The current grader's repair counts the same way.
  const regraded = repairQuestionRecordForCurrentGrader({
    record: {
      ...exhaustedOnExitTicket,
      partGrades: [
        { id: 'domain', isComplete: true, isCorrect: false, response: 'x>-2' },
        { id: 'range', isComplete: true, isCorrect: false, response: '4≥y' },
      ],
    },
    question: exitTicketGraph,
  });
  assert.equal(regraded.partGrades[1].isCorrect, true, 'the range is recognised');
  assert.equal(regraded.status, 'attempted');
  assert.equal(regraded.attemptCount, 0);
});

test('a live correction\'s retry on a family slot is counted on the question its pin dealt', async () => {
  const { assignment, questionIndex, stored, canonical } = await missedWarmUp2();
  const repaired = repairQuestionRecordForLiveCorrection({
    record: canonical,
    question: stored,
    repairKind: SYSTEMS_WORKSPACE_UPGRADE_REPAIR_KIND,
    assignment,
    questionIndex,
    studentId: STUDENT,
    classId: CLASS_ID,
  });
  assert.equal(repaired.status, 'attempted');
  assert.equal(repaired.attemptCount, 0, 'one try back of the one the four choices have');
  // Without the student's pin (an older caller) the stored slot's three stand.
  const unplaced = repairQuestionRecordForLiveCorrection({ record: canonical, question: stored, repairKind: SYSTEMS_WORKSPACE_UPGRADE_REPAIR_KIND });
  assert.equal(unplaced.attemptCount, WARMUP.attempts - 1);
});

test('the live correction and the grader repair are told whose record they repair', () => {
  const workspace = executableSource(readFileSync(new URL('../../src/app/teacher/TeacherWorkspace.jsx', import.meta.url), 'utf8'));
  const live = region(workspace, 'nextTracker = repairAssignmentTrackerForLiveCorrections({', '});', 'the live correction');
  assert.match(live, /assignment: liveAssignment,\s*studentId: student\.id,\s*classId: studentData\.classId \|\| student\.classId \|\| null,/);
  assert.match(workspace, /gradeEntries\.forEach\(\(\{ student, studentRef, snapshot \}\) => \{/);
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  const repairOne = region(app, 'const repairGradesByAssignmentWithCurrentGrader = (', 'const persistCurrentGraderCreditRepairs', 'one roster repair');
  assert.match(repairOne, /repairAssignmentTrackerForCurrentGrader\(\{\s*assignmentTracker: gradesByAssignment\[assignment\.id\],\s*questions,\s*correctedAt,\s*assignment,\s*studentId,\s*classId,\s*\}\);/);
  const persist = region(app, 'const persistCurrentGraderCreditRepairs = async', 'if (!repairs.length) return 0;', 'the grader repair');
  assert.match(persist, /studentId: student\?\.id \|\| null,\s*classId: student\?\.classId \|\| null,/);
});
