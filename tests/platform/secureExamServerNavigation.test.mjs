import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { executableSource, region } from './helpers/sourceContract.mjs';

const require_ = createRequire(import.meta.url);
const navigation = require_('../../functions/lib/secureExamNavigation.js');
const secureExam = require_('../../functions/lib/secureExam.js');
const secureExamItems = require_('../../functions/lib/secureExamItems.js');
const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

/*
 * THE SERVER RULES OF SECURE TEST NAVIGATION (functions/lib/secureExamNavigation.js).
 *
 * Skip, flag, go back and change an answer until submit — with every item
 * still issued only when it is first reached, nothing graded before finalize,
 * and nothing about any item's content or correctness in what the browser
 * receives. The emulator suite (npm run test:secure-exam-navigation) runs the
 * same rules through the real callables.
 */

const session = (overrides = {}) => ({
  examSessionId: 's1',
  examType: 'act',
  status: 'in_progress',
  requiredQuestions: 5,
  responses: {},
  navigation: navigation.initialNavigation({ examType: 'act', requiredQuestions: 5 }),
  ...overrides,
});

const withItems = (base, entries) => {
  const nav = navigation.navigationOf(base);
  const items = {};
  entries.forEach((entry, position) => { items[entry.id] = { position, state: 'open', hasWork: false, flagged: false, slotId: null, assessmentDomainId: null, bankQuestionId: null, ...entry.fields }; });
  return { ...base, navigation: { ...nav, itemOrder: entries.map((entry) => entry.id), items } };
};

test('a student may reopen any issued question and open the NEXT one, but not jump ahead', () => {
  const s = withItems(session(), [{ id: 'a' }, { id: 'b' }]);
  assert.deepEqual(navigation.resolveTarget(s, { position: 0 }), { position: 0, issuing: false, closesThrough: null });
  assert.deepEqual(navigation.resolveTarget(s, { position: 2 }), { position: 2, issuing: true, closesThrough: null });
  assert.equal(navigation.resolveTarget(s, { position: 3 }).error, 'not_reached');
  assert.equal(navigation.resolveTarget(s, { position: 5 }).error, 'invalid');
  assert.equal(navigation.resolveTarget(s, { position: -1 }).error, 'invalid');
  assert.equal(navigation.resolveTarget(s, { position: 1.5 }).error, 'invalid');
});

test('the older linear call gets the first open question, else the next new one', () => {
  const s = withItems(session(), [{ id: 'a', fields: { state: 'recorded' } }, { id: 'b' }]);
  assert.equal(navigation.resolveTarget(s, {}).position, 1);
  const allRecorded = withItems(session({ requiredQuestions: 2 }), [{ id: 'a', fields: { state: 'recorded' } }, { id: 'b', fields: { state: 'recorded' } }]);
  assert.equal(navigation.resolveTarget(allRecorded, {}).error, 'complete');
});

test('a Digital SAT practice test closes module 1 only when the student says so', () => {
  const sat = session({ examType: 'digitalSAT', requiredQuestions: 4, navigation: navigation.initialNavigation({ examType: 'digitalSAT', requiredQuestions: 4 }) });
  const s = withItems(sat, [{ id: 'a' }, { id: 'b' }]);
  assert.equal(navigation.resolveTarget(s, { position: 2 }).error, 'module_end');
  assert.deepEqual(navigation.resolveTarget(s, { position: 2, closeModule: true }), { position: 2, issuing: true, closesThrough: 2 });
  const closed = { ...s, navigation: { ...s.navigation, closedThrough: 2 } };
  assert.equal(navigation.resolveTarget(closed, { position: 0 }).error, 'module_closed');
  assert.equal(navigation.positionClosed(closed.navigation, 1), true);
  assert.equal(navigation.positionClosed(closed.navigation, 2), false);
  // Only the Digital SAT has modules; other tests are one stretch.
  assert.equal(navigation.moduleLayoutFor('act', 45), null);
  assert.deepEqual(navigation.moduleLayoutFor('digitalSAT', 44).map((m) => [m.start, m.end]), [[0, 22], [22, 44]]);
  assert.deepEqual(navigation.moduleLayoutFor('digitalSAT', 5).map((m) => [m.start, m.end]), [[0, 3], [3, 5]]);
});

test('the navigator a browser receives holds states only — no slot, family, bank or domain', () => {
  const s = withItems(session(), [
    { id: 'a', fields: { hasWork: true, slotId: 'slot-1', bankQuestionId: 'bank-1', assessmentDomainId: 'algebra' } },
    { id: 'b', fields: { flagged: true } },
  ]);
  const published = secureExam.publicSession(s);
  assert.deepEqual(published.navigation.items, [
    { position: 0, questionInstanceId: 'a', status: 'answered', flagged: false, closed: false },
    { position: 1, questionInstanceId: 'b', status: 'unanswered', flagged: true, closed: false },
  ]);
  assert.doesNotMatch(JSON.stringify(published), /slot-1|bank-1|algebra|bankQuestionId|slotId|assessmentDomainId/);
  assert.equal(published.answeredQuestions, 1);
  assert.equal(published.integrityLockThreshold, 3);
  assert.equal(published.hasOpenQuestion, true);
});

test('answered counts drafts with work and recorded answers that were not blank', () => {
  const s = withItems(session(), [
    { id: 'a', fields: { hasWork: true } },
    { id: 'b', fields: { hasWork: false } },
    { id: 'c', fields: { state: 'recorded', hasWork: true } },
    { id: 'd', fields: { state: 'recorded' } },
  ]);
  s.responses = { c: { questionInstanceId: 'c', grading: { score: 1 } }, d: { questionInstanceId: 'd', unanswered: true, grading: { score: 0 } } };
  assert.equal(navigation.answeredCount(s), 2);
});

test('a session written by the linear runtime upgrades: recorded answers stay locked, the open item stays open', () => {
  const legacy = {
    examType: 'digitalSAT',
    requiredQuestions: 4,
    responses: {
      q2: { questionInstanceId: 'q2', submittedAt: 20, slotId: 's2', grading: { score: 1 } },
      q1: { questionInstanceId: 'q1', submittedAt: 10, slotId: 's1', grading: { score: 0 } },
    },
    currentQuestion: { questionInstanceId: 'q3', slotId: 's3', bankQuestionId: 'b3' },
  };
  const upgraded = navigation.navigationOf(legacy);
  assert.deepEqual(upgraded.itemOrder, ['q1', 'q2', 'q3']);
  assert.equal(upgraded.items.q1.state, 'recorded');
  assert.equal(upgraded.items.q3.state, 'open');
  // A session already under way gets no module wall behind answered questions.
  assert.equal(upgraded.modules, null);
  assert.equal(upgraded.upgradedFromLinear, true);
  assert.deepEqual(navigation.issuedSlotIds(legacy), ['s1', 's2', 's3']);
  // A never-started legacy session does get the Digital SAT modules.
  assert.ok(navigation.navigationOf({ examType: 'digitalSAT', requiredQuestions: 4 }).modules);
});

test('a skipped course-test slot is never issued twice: the plan reads every ISSUED slot', () => {
  const s = withItems(session({ examType: 'courseTest' }), [{ id: 'a', fields: { slotId: 'slot-1' } }, { id: 'b', fields: { slotId: 'slot-2' } }]);
  assert.deepEqual(navigation.issuedSlotIds(s), ['slot-1', 'slot-2']);
  // And a simulation's domain balance counts skipped questions too.
  const sim = withItems(session({ examType: 'asvab' }), [{ id: 'a', fields: { assessmentDomainId: 'arithmeticReasoning' } }]);
  assert.equal(secureExam.nextDomainId(sim), 'mathematicsKnowledge');
});

test('the simulation draw is random across sessions and reproducible within one', () => {
  const bank = Array.from({ length: 30 }, (_, index) => ({ id: `item-${String(index).padStart(2, '0')}` }));
  const first = navigation.seededOrder('session-a|0', bank).map((item) => item.id);
  assert.deepEqual(navigation.seededOrder('session-a|0', bank).map((item) => item.id), first, 'a retry draws the same item');
  const leads = new Set(['session-a|0', 'session-b|0', 'session-c|0', 'session-d|0', 'session-e|0'].map((seed) => navigation.seededOrder(seed, bank)[0].id));
  assert.ok(leads.size >= 3, `five sessions should not all open on the same item (${[...leads]})`);
  assert.notDeepEqual(first, bank.map((item) => item.id), 'not the bank order');
  // Wired: the simulation path draws through it, seeded by session and position.
  const simulation = region(functionsIndex, 'async function buildSimulationExamItem(', 'exports.issueSecureExamQuestion = onCall(', 'simulation draw');
  assert.match(simulation, /secureExamNavigation\.seededOrder\(`\$\{examSessionId\}\|\$\{position\}`, candidates,/);
  assert.doesNotMatch(executableSource(simulation), /localeCompare|completedQuestions \|\| 0\) % candidates\.length/);
});

test('a shortened practice test keeps the real pace; extended time multiplies it', () => {
  const sat = secureExam.policyFor('digitalSAT');
  assert.equal(navigation.proportionalTimeLimitSeconds(sat, 44), 70 * 60);
  assert.equal(navigation.proportionalTimeLimitSeconds(sat, 10), 16 * 60);
  assert.equal(navigation.proportionalTimeLimitSeconds(sat, 1), 2 * 60);
  assert.equal(navigation.proportionalTimeLimitSeconds(secureExam.policyFor('tsia2'), 5), null, 'untimed stays untimed');
  assert.equal(navigation.accommodatedTimeLimitSeconds(16 * 60, 1.5), 24 * 60);
  assert.equal(navigation.accommodatedTimeLimitSeconds(16 * 60, 9), 64 * 60, 'capped at 4x');
  assert.equal(navigation.accommodatedTimeLimitSeconds(null, 2), null);
  const create = region(functionsIndex, 'exports.createSecureExamSession = onCall(', 'exports.startSecureExamSession', 'create');
  assert.match(create, /timeLimitSeconds: secureExamNavigation\.proportionalTimeLimitSeconds\(policy, requiredQuestions\)/);
  const start = region(functionsIndex, 'exports.startSecureExamSession = onCall(', 'exports.listStudentSecureExamSessions', 'start');
  assert.match(start, /secureExamTimeMultiplier\(db, studentId\)/);
  assert.match(start, /accommodatedTimeLimitSeconds\(baseLimit, timeMultiplier\)/);
});

test('a practice test is scored over every PLANNED question, like a course Test', () => {
  const answered5of44 = {
    examType: 'digitalSAT',
    requiredQuestions: 44,
    responses: Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`q${index}`, { questionInstanceId: `q${index}`, grading: { score: 1, isCorrect: true } }])),
  };
  assert.equal(secureExam.sessionScorePercent(answered5of44), 11, 'five right of 44 planned is 11%, not 100%');
});

test('the released review — answers and worked solutions — exists only after release', () => {
  const base = {
    examType: 'act',
    requiredQuestions: 2,
    status: 'submitted',
    responses: {
      q1: {
        questionInstanceId: 'q1', grading: { score: 1, isCorrect: true }, responsePayload: { responses: { answer: '4' } },
        questionSnapshot: { prompt: 'p', privateGrading: { fields: [{ expected: '4' }] } },
        releasedSolution: { answers: [{ fieldId: 'answer', label: 'x', display: '4' }], review: { headline: 'Divide', reasoning: ['2x=8', 'x=4'], answerSummary: 'x = 4' } },
      },
      q2: { questionInstanceId: 'q2', unanswered: true, grading: { score: 0, isCorrect: false }, responsePayload: { responses: {} }, questionSnapshot: { prompt: 'p2' } },
    },
  };
  assert.equal(secureExam.publicReview({ ...base, feedbackReleased: false }), null);
  assert.equal(secureExam.publicReview({ ...base, status: 'in_progress', feedbackReleased: true }), null);
  assert.doesNotMatch(JSON.stringify(secureExam.publicSession({ ...base, feedbackReleased: true })), /releasedSolution|x = 4|Divide/);
  const review = secureExam.publicReview({ ...base, feedbackReleased: true });
  assert.deepEqual(review.items[0].solution.answers, [{ fieldId: 'answer', label: 'x', display: '4' }]);
  assert.deepEqual(review.items[0].solution.review.reasoning, ['2x=8', 'x=4']);
  assert.equal(review.items[1].unanswered, true);
  assert.equal(review.items[1].solution, null);
  assert.doesNotMatch(JSON.stringify(review), /privateGrading|"expected"/, 'the stored key itself never travels');
  assert.equal(review.answeredQuestions, 1);
  assert.equal(review.scorePercent, 50);
  assert.equal(review.earnedPoints, 1);
  assert.equal(review.possiblePoints, 2);
  assert.equal(review.scoreBasis, 'planned');
});

test('the correct answer is shown as the choice the student would recognise, never a replayable choice id', () => {
  const item = { privateGrading: { fields: [{ id: 'answer', expected: 'c_x9' }] } };
  const snapshot = { choices: [{ id: 'c_a1', label: '$2$' }, { id: 'c_x9', label: '$4$' }], responseFields: [{ id: 'answer', label: 'Answer' }] };
  assert.deepEqual(secureExamItems.correctAnswerDisplay(item, snapshot), [{ fieldId: 'answer', label: 'Answer', display: '$4$' }]);
  assert.deepEqual(secureExamItems.correctAnswerDisplay({ privateGrading: { fields: [{ id: 'answer', expected: '3/4' }] } }, {}), [{ fieldId: 'answer', label: null, display: '3/4' }]);
  // A Rich Tool item has no typed key; its worked solution says what the answer is.
  assert.deepEqual(secureExamItems.correctAnswerDisplay({ privateGrading: { pathToolId: 'graphing' } }, {}), []);
});

test('finalize, the timer and a proctor force-submit end a session the same way', () => {
  const finalize = region(functionsIndex, 'exports.finalizeSecureExam = onCall(', '/** Teacher-only live monitor summaries.', 'finalize');
  assert.match(finalize, /await finalizeSecureSessionInTransaction\(transaction, ref, session, \{/);
  const proctor = region(functionsIndex, 'exports.proctorExamAction = onCall(', '// --- Test Cycle', 'proctor');
  assert.match(proctor, /if \(action === "forceSubmit"\) updated = \{ \.\.\.\(await finalizeSecureSessionInTransaction\(transaction, ref, updated, \{ status: "force_submitted", now \}\)\)/);
  // The new client never records-and-locks; only the legacy call grades early.
  assert.doesNotMatch(executableSource(region(functionsIndex, 'exports.saveSecureExamDraft = onCall(', 'async function autoReleaseSecureSession(', 'save')), /gradeIssuedItem|buildResponseRecord/);
});

test('only a practice test releases itself, never a course Test', () => {
  const release = region(functionsIndex, 'async function autoReleaseSecureSession(', 'exports.submitSecureExamResponse = onCall(', 'auto release');
  assert.match(release, /session\.releasePolicy !== "automatic" \|\| secureExam\.isCourseTestSession\(session\)\) return session;/);
  const evidence = region(functionsIndex, 'function releaseSessionFeedbackInTransaction(', '/** Authenticated proctor controls', 'release');
  // A blank question is zero in the score but not evidence about the skill.
  assert.match(evidence, /if \(response\?\.unanswered === true\) return;/);
});

test('the open items subcollection is closed to every client', () => {
  assert.match(rules, /match \/examSessions\/\{docId\}\/items\/\{itemId\} \{ allow read, write: if false; \}/);
});

test('a draft save that arrives late from the same page is not written; a new page or an old client still is', () => {
  const stamp = secureExamItems.draftStampOf({ draftWriter: 'page_0123abcd', draftRevision: 4 });
  assert.deepEqual(stamp, { draftWriter: 'page_0123abcd', draftRevision: 4 });
  // Same page: an older or equal revision is late; a newer one is not.
  assert.equal(secureExamItems.staleDraftWrite({ draftWriter: 'page_0123abcd', draftRevision: 5 }, stamp), true);
  assert.equal(secureExamItems.staleDraftWrite({ draftWriter: 'page_0123abcd', draftRevision: 4 }, stamp), true);
  assert.equal(secureExamItems.staleDraftWrite({ draftWriter: 'page_0123abcd', draftRevision: 3 }, stamp), false);
  // Another page (a reload, another device), no stored draft, or an unstamped save: written.
  assert.equal(secureExamItems.staleDraftWrite({ draftWriter: 'page_ffffffff', draftRevision: 99 }, stamp), false);
  assert.equal(secureExamItems.staleDraftWrite(null, stamp), false);
  assert.equal(secureExamItems.staleDraftWrite({ draftWriter: 'page_0123abcd', draftRevision: 5 }, null), false);
  // Only a well-formed stamp counts.
  assert.equal(secureExamItems.draftStampOf({ draftWriter: 'x', draftRevision: 4 }), null);
  assert.equal(secureExamItems.draftStampOf({ draftWriter: 'page_0123abcd', draftRevision: 0 }), null);
  assert.equal(secureExamItems.draftStampOf({ draftWriter: 'page_0123abcd', draftRevision: '4' }), null);

  // The callable checks inside its transaction, before any write, and stores the stamp with the draft.
  const save = region(functionsIndex, 'exports.saveSecureExamDraft = onCall(', '\n});', 'saveSecureExamDraft');
  assert.match(save, /const stamp = draft \? secureExamItems\.draftStampOf\(request\.data\) : null;/);
  const guardAt = save.indexOf('if (draft && secureExamItems.staleDraftWrite(itemData?.draftResponse, stamp)) {');
  assert.ok(guardAt > save.indexOf('await readWritableExamItem(transaction'), 'checked against the stored draft read in the transaction');
  assert.ok(guardAt < save.indexOf('transaction.set('), 'before anything is written');
  assert.match(save, /return \{ next: upgrade\.session, stale: true, answeredChanged: false \};/);
  assert.match(save, /draftResponse: \{ \.\.\.draft, \.\.\.\(stamp \|\| \{\}\) \}/);
});

test('a released course review stays closed while another attempt of the cycle is open', () => {
  const record = (test, retest) => ({ test, retest });
  const blocked = (rec, session) => secureExam.courseReviewBlockedBy(rec, session);
  // A teacher reset the Test: the new attempt assigned, then under way.
  for (const state of ['assigned', 'inProgress']) {
    assert.equal(blocked(record({ state, examSessionId: 'test-2' }, { state: 'none' }), { examSessionId: 'test-1', cycleStage: 'test' })?.reason, 'attempt_open');
  }
  // A teacher reset the Retest: Retest 1's review while Retest 2 is open.
  assert.equal(blocked(record({ state: 'released', examSessionId: 'test-1' }, { state: 'inProgress', examSessionId: 'retest-2' }), { examSessionId: 'retest-1', cycleStage: 'retest' })?.reason, 'attempt_open');
  // The Retest open: the Test's review, in the words the card uses.
  const retestOpen = blocked(record({ state: 'released', examSessionId: 'test-1' }, { state: 'assigned', examSessionId: 'retest-1' }), { examSessionId: 'test-1', cycleStage: 'test' });
  assert.deepEqual(retestOpen, { reason: 'retest_open', message: 'Your Test review opens again when you finish your Retest.' });
  // Nothing open: submitted or released attempts, or only this session itself.
  assert.equal(blocked(record({ state: 'released', examSessionId: 'test-1' }, { state: 'submitted', examSessionId: 'retest-1' }), { examSessionId: 'test-1', cycleStage: 'test' }), null);
  assert.equal(blocked(record({ state: 'inProgress', examSessionId: 'test-1' }, { state: 'none' }), { examSessionId: 'test-1', cycleStage: 'test' }), null);
  assert.equal(blocked(record({ state: 'released', examSessionId: 'test-1' }, { state: 'released', examSessionId: 'retest-1' }), { examSessionId: 'retest-1', cycleStage: 'retest' }), null);
  // The callable asks it for EVERY course session — a Retest's review too.
  const review = region(functionsIndex, 'exports.getStudentSecureExamReview = onCall(', '\n});', 'review');
  assert.match(review, /if \(secureExam\.isCourseTestSession\(session\) && session\.courseTest\?\.assignmentId\) \{/);
  assert.doesNotMatch(executableSource(review), /cycleStage \|\| ""\) !== "retest"/);
  assert.match(review, /const blocked = secureExam\.courseReviewBlockedBy\(record, \{ examSessionId, cycleStage: session\.courseTest\.cycleStage \}\);/);
});

test('a course review can hold back the correct answers and worked solutions, and says so', () => {
  const session = {
    status: 'submitted', feedbackReleased: true, examType: 'act', requiredQuestions: 1,
    responses: { q1: {
      questionInstanceId: 'q1', grading: { score: 1, isCorrect: true },
      responsePayload: { responses: { answer: '5' } },
      releasedSolution: { answers: [{ display: '5' }], review: { headline: 'Subtract 3' } },
    } },
  };
  const open = secureExam.publicReview(session);
  assert.equal(open.items[0].solution.answers[0].display, '5');
  assert.equal('solutionsHeld' in open, false);
  const held = secureExam.publicReview(session, { withSolutions: false });
  assert.equal(held.items[0].solution, null, 'no correct answer or worked solution');
  assert.equal(held.solutionsHeld, true, 'and the review says they are held');
  assert.deepEqual(held.items[0].grading, { score: 1, isCorrect: true }, 'the score and right/wrong still release');
  assert.deepEqual(held.items[0].responsePayload, { responses: { answer: '5' } }, "and the student's own answer");
  // The callable holds them for a course session until the class is done or the teacher releases them.
  const review = region(functionsIndex, 'exports.getStudentSecureExamReview = onCall(', '\n});', 'review');
  assert.match(review, /withSolutions = \(await courseAnswersRelease\(getFirestore\(\), shared, session\.courseTest\.assignmentId, stage, \{ cacheRoster: true \}\)\)\.released;/);
  // Fail closed: an error holds the answers rather than failing or opening the review.
  assert.match(review, /\} catch \(error\) \{[\s\S]*?withSolutions = false;\s*\}/);
  assert.match(review, /const review = secureExam\.publicReview\(session, \{ withSolutions \}\);/);
  // Everyone who can still sit the stage: the whole roster and every record holder
  // (tests/integration/secureExamNavigation.test.mjs drives the cases).
  const release = region(functionsIndex, 'async function courseAnswersRelease(', '\n}', 'answers release');
  assert.match(release, /if \(!rosterIds && known\.cacheRoster\) \{/);
  assert.match(release, /if \(!rosterIds\) rosterIds = await testCycleRosterIds\(db, assignment\);/);
  // A cached roster only holds: released is recomputed from a fresh roster.
  assert.match(release, /if \(rosterFromCache && heldFor\.length === 0\) \{\s*\/\/[^\n]*\n\s*const fresh = await cachedTestCycleRosterIds\(db, assignment, id, \{ fresh: true \}\);/);
  assert.match(release, /const everyone = \[\.\.\.new Set\(\[\.\.\.rosterIds, \.\.\.records\.keys\(\)\]\)\]\.filter\(Boolean\);/);
  // An explicit release covers only the students, at the attempts, it named.
  assert.match(release, /const heldFor = stillTestingRecords\.filter\(\(record\) => !covered\.has\(answerCoverageKey\(record\)\)\)\.map\(\(record\) => record\.studentId\);/);
  assert.match(functionsIndex, /return `\$\{record\.studentId\}#\$\{record\.test\.attempt\}\.\$\{record\.retest\.attempt\}`;/);
  assert.match(release, /return \{ released: heldFor\.length === 0,/);
  const action = region(functionsIndex, 'exports.releaseTestCycleAnswers = onCall(', '\n});', 'release answers');
  assert.match(action, /await assertTeacherMayManageAssignment\(request, assignmentSnapshot\);/);
  assert.match(action, /\[stage\]: \{ releasedAt: Date\.now\(\), releasedBy: teacherUid, coveredKeys: stillTestingKeys \},/);
});

test('a paused, archived or replaced course Test takes no edit, recorded answer or Submit: the gate runs inside each write (coordinator re-check, PR #461)', () => {
  // Inside the transaction, its reads are the transaction's: a pause written
  // while a save is in flight either lands first and is seen, or retries the
  // save. Nothing is written after it.
  for (const [name, end] of [
    ['exports.saveSecureExamDraft = onCall(', '\n});'],
    ['exports.submitSecureExamResponse = onCall(', '\n});'],
    ['exports.finalizeSecureExam = onCall(', '\n});'],
  ]) {
    const callable = region(functionsIndex, name, end, name);
    const inside = callable.slice(callable.indexOf('db.runTransaction(async (transaction) => {'));
    assert.ok(callable.includes('db.runTransaction(async (transaction) => {'), `${name} writes in a transaction`);
    assert.match(inside, /await assertCourseTestEntryAllowed\(db, session, studentId, \{ transaction \}\);/, `${name}: the gate reads through the transaction`);
    assert.doesNotMatch(callable.slice(0, callable.indexOf('db.runTransaction(')), /assertCourseTestEntryAllowed\(/, `${name}: and not before it`);
  }
  const gate = region(functionsIndex, 'async function assertCourseTestEntryAllowed(', '\n}', 'gate');
  assert.match(gate, /const read = \(ref\) => \(transaction \? transaction\.get\(ref\) : ref\.get\(\)\);/);
  assert.match(gate, /await read\(db\.collection\("assignments"\)\.doc\(String\(courseTest\.assignmentId\)\)\)/);
  assert.match(gate, /read\(db\.collection\("grades"\)\.doc\(studentId\)\),\s+read\(db\.collection\(TEST_CYCLE_RECORDS\)\.doc\(testCycleRecordKey\(courseTest\.assignmentId, studentId\)\)\),/);
});
