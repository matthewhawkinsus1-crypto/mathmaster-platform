/*
 * MANY ATTEMPTS ARE NOT FIRST-TRY MASTERY.
 *
 * In an assignment that declares unlimited attempts
 * (gradingPolicy.attemptPolicy "unlimited") a student can reach the right
 * answer on a 6th try, or on a choice-only question by trying each option.
 * The GRADE counts that as correct, as a correct 2nd or 3rd attempt always
 * was. MASTERY does not count it as an independent success: an attempt past
 * the number of tries the section's role gives everywhere else is supported
 * evidence (0.75 of its credit, never an "independent success"), in both
 * places mastery is worked out — the server's profile, from the attempt's
 * evidence event (masteryScoring.mjs), and the assignment record
 * (masteryEngine.js).
 *
 * Attempts within the role's own number are untouched, and so is every
 * attempt of an assignment that does not declare unlimited attempts: its
 * evidence events keep exactly the shape they had.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { getQuestionCredit } from '../../src/attemptPolicy.js';
import { attemptIsBeyondRolePolicy } from '../../src/platform/policies/activityPolicies.js';
import { buildAttemptEvidenceEvent } from '../../functions/shared/attemptEvidenceEvent.mjs';
import { SUPPORTED_CREDIT, masteryEventFacts } from '../../functions/shared/masteryScoring.mjs';
import { classifyAttemptEvidence } from '../../src/platform/mastery/evidenceClassification.js';
import { collectStudentEvidence, SUPPORTED_CREDIT as RECORD_SUPPORTED_CREDIT } from '../../src/masteryEngine.js';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';

const require = createRequire(import.meta.url);
// The helpers the mastery trigger hands masteryEventFacts (mathPathFunctions.js).
const mathPath = require('../../functions/lib/mathPath.js');

const UNLIMITED = { gradingPolicy: { attemptPolicy: 'unlimited', scoring: 'platformDefault' } };
const STUDENT = 'synthetic-student-1';

// A lesson from the library through the teacher's import and publish chain,
// stored with and without the declaration. Read here, never written.
const LESSON = new URL('../../teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations.json', import.meta.url);
const storeLesson = (patch = {}) => {
  const parsed = parseAssignmentBlueprintText(JSON.stringify({ ...JSON.parse(readFileSync(LESSON, 'utf8')), ...patch }));
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}), {});
  assert.equal(model.isValid, true, model.errors.join('\n'));
  return JSON.parse(JSON.stringify({ id: 'stored-lesson', title: 'Stored lesson', ...canonicalV5PersistencePatch(model.assignmentV5) }));
};
const unlimitedLesson = storeLesson(UNLIMITED);
const plainLesson = storeLesson();
const questionsOf = (assignment) => getStoredAssignmentQuestions(assignment);
const firstOf = (assignment, role, pick = () => true) => {
  const questions = questionsOf(assignment);
  const index = questions.findIndex((question) => question.activityRole === role && pick(question));
  assert.ok(index >= 0, `the lesson has a ${role} question`);
  return { question: questions[index], index };
};

const choiceQuestion = { questionId: 'choice-1', type: 'multiAnswer', activityRole: 'classwork', answerFields: [{ id: 'family', type: 'choice', options: ['linear', 'quadratic', 'exponential'], answer: 'linear' }] };
const typedQuestion = { questionId: 'typed-1', type: 'multiAnswer', activityRole: 'classwork', answerFields: [{ id: 'x', answer: '4' }] };

test('an attempt is beyond the role policy only past the role\'s own tries, and only in an unlimited assignment', () => {
  const beyond = (assignment, question, attemptCount, activityRole = question.activityRole) => attemptIsBeyondRolePolicy({
    assignment, question, activityRole, record: { status: 'correct', attemptCount, totalAttempts: attemptCount },
  });
  // Classwork gives three tries: the 4th is the first one past them.
  [1, 2, 3].forEach((count) => assert.equal(beyond(UNLIMITED, typedQuestion, count), false, `attempt ${count}`));
  [4, 5, 20].forEach((count) => assert.equal(beyond(UNLIMITED, typedQuestion, count), true, `attempt ${count}`));
  // A choice-only question gives one: the 2nd is past it.
  assert.equal(beyond(UNLIMITED, choiceQuestion, 1), false);
  assert.equal(beyond(UNLIMITED, choiceQuestion, 2), true);
  // Warm-Up and Practice are the other unlimited roles.
  assert.equal(beyond(UNLIMITED, typedQuestion, 4, 'warmup'), true);
  assert.equal(beyond(UNLIMITED, typedQuestion, 4, 'practice'), true);
  // Never without the declaration, whatever the record says, and never on a
  // role the declaration does not reach.
  [null, undefined, {}, { gradingPolicy: { attemptPolicy: 'rolePolicy' } }, { ...UNLIMITED, assessmentPolicy: { mode: 'testCycle' } }].forEach((assignment) => {
    [1, 3, 4, 24].forEach((count) => {
      assert.equal(beyond(assignment, typedQuestion, count), false);
      assert.equal(beyond(assignment, choiceQuestion, count), false);
    });
  });
  ['dol', 'quiz', 'test', 'review', 'corrections'].forEach((role) => {
    assert.equal(beyond(UNLIMITED, typedQuestion, 24, role), false, role);
  });
  assert.equal(attemptIsBeyondRolePolicy(), false);
});

const eventFor = ({ assignment, role = 'classwork', attemptCount, isCorrect = true, supportUsage = {}, question: given = null, index: givenIndex = 0 }) => {
  const { question, index } = given ? { question: given, index: givenIndex } : firstOf(assignment, role);
  return buildAttemptEvidenceEvent({
    studentId: STUDENT,
    assignment,
    question,
    questionIndex: index,
    activityRole: role,
    attemptRecord: { status: isCorrect ? 'correct' : 'attempted', attemptCount, totalAttempts: attemptCount, variantIndex: 0, partialCredit: isCorrect ? 100 : 0 },
    attemptResult: { isCorrect, status: isCorrect ? 'correct' : 'attempted', partialCredit: isCorrect ? 100 : 0 },
    supportUsage,
    occurredAt: Date.parse('2026-11-23T15:00:00.000Z'),
  });
};

test('the server\'s mastery profile: correct on a 6th attempt is supported evidence, on a 3rd it is independent', () => {
  const third = masteryEventFacts(eventFor({ assignment: unlimitedLesson, attemptCount: 3 }), mathPath);
  assert.ok(third.codes.length > 0, 'the lesson question is aligned, so the event moves a skill');
  assert.equal(third.independent, true);
  assert.equal(third.creditedScore, 1, 'a correct third attempt counts as it always has');
  assert.equal(third.attemptNumber, 3);

  const sixth = masteryEventFacts(eventFor({ assignment: unlimitedLesson, attemptCount: 6 }), mathPath);
  assert.equal(sixth.isCorrect, true);
  assert.equal(sixth.independent, false, 'never an independent success');
  assert.equal(sixth.creditedScore, SUPPORTED_CREDIT, 'worth what a supported success is worth');
  assert.equal(sixth.creditedScore, 0.75);
  assert.equal(sixth.weight, third.weight, 'still evidence, at the role\'s weight');
  assert.equal(sixth.attemptNumber, 6, 'and the attempt number is on the record');

  // A hint used within the role's tries is supported exactly as before.
  const hinted = masteryEventFacts(eventFor({ assignment: unlimitedLesson, attemptCount: 2, supportUsage: { hintUsed: true } }), mathPath);
  assert.equal(hinted.independent, false);
  assert.equal(hinted.creditedScore, SUPPORTED_CREDIT);
});

test('the evidence event says why: a flag on the attempts past the role policy, and on no other event', () => {
  [1, 2, 3].forEach((attemptCount) => {
    const event = eventFor({ assignment: unlimitedLesson, attemptCount });
    assert.equal('attemptBeyondRolePolicy' in event.performance, false, `attempt ${attemptCount}`);
    assert.equal(event.performance.isMathematicallyIndependent, true);
    assert.equal(event.supportUsage.isMathematicallyIndependent, true);
  });
  [4, 5, 6].forEach((attemptCount) => {
    const event = eventFor({ assignment: unlimitedLesson, attemptCount });
    assert.equal(event.performance.attemptBeyondRolePolicy, true, `attempt ${attemptCount}`);
    assert.equal(event.performance.isMathematicallyIndependent, false);
    assert.equal(event.supportUsage.isMathematicallyIndependent, false);
    assert.equal(event.performance.attemptNumber, attemptCount);
    // No support is invented: the flags a teacher reads as "used a hint" stay as they were.
    assert.equal(event.supportUsage.hintUsed, false);
    assert.equal(event.supportUsage.workedExampleUsed, false);
    assert.deepEqual(event.supportTelemetry, []);
    assert.equal(classifyAttemptEvidence(event).key, 'supported');
  });
  assert.equal(classifyAttemptEvidence(eventFor({ assignment: unlimitedLesson, attemptCount: 1 })).key, 'independentFirstAttempt');
  assert.equal(classifyAttemptEvidence(eventFor({ assignment: unlimitedLesson, attemptCount: 3 })).key, 'independentRetry');
  // A choice-only question's own number of tries is one.
  assert.equal(eventFor({ assignment: UNLIMITED, question: choiceQuestion, attemptCount: 1 }).performance.isMathematicallyIndependent, true);
  assert.equal(eventFor({ assignment: UNLIMITED, question: choiceQuestion, attemptCount: 2 }).performance.attemptBeyondRolePolicy, true);
  // A DOL in the same assignment is never flagged.
  const dol = eventFor({ assignment: unlimitedLesson, role: 'dol', attemptCount: 5 });
  assert.equal('attemptBeyondRolePolicy' in dol.performance, false);
  assert.equal(dol.performance.isMathematicallyIndependent, true);
});

test('an assignment that does not declare unlimited attempts writes the event it always wrote', () => {
  // The same lesson stored without the field: every event, at any attempt
  // number a record can hold, is field for field the event of an assignment
  // object that carries no grading policy at all (what the builder saw before
  // it read one).
  const bare = { id: plainLesson.id, title: plainLesson.title, evidencePolicy: plainLesson.evidencePolicy };
  ['warmup', 'classwork', 'practice', 'dol'].forEach((role) => {
    const { question, index } = firstOf(plainLesson, role);
    [1, 2, 3, 4, 9].forEach((attemptCount) => {
      [true, false].forEach((isCorrect) => {
        const event = eventFor({ assignment: plainLesson, role, attemptCount, isCorrect });
        assert.deepEqual(event, eventFor({ assignment: bare, role, attemptCount, isCorrect, question, index }), `${role} · attempt ${attemptCount}`);
        assert.equal('attemptBeyondRolePolicy' in event.performance, false);
        assert.equal(event.performance.isMathematicallyIndependent, true);
        const facts = masteryEventFacts(event, mathPath);
        assert.equal(facts.independent, true);
        assert.equal(facts.creditedScore, isCorrect ? 1 : 0);
      });
    });
  });
});

const evidenceRowsFor = (assignment, attemptCount, { supportUsage = undefined } = {}) => {
  const { question, index } = firstOf(assignment, 'classwork');
  const student = { id: STUDENT, gradesByAssignment: { [assignment.id]: { [index]: { status: 'correct', attemptCount, totalAttempts: attemptCount, lastAttemptAt: '2026-11-23T15:00:00.000Z', ...(supportUsage ? { supportUsage } : {}) } } } };
  const rows = collectStudentEvidence({ student, assignments: [{ ...assignment, questions: questionsOf(assignment) }] });
  assert.ok(rows.length > 0, `the question is aligned, so the record is evidence (${question.questionId})`);
  return rows;
};

test('the assignment record\'s mastery: the same rule, and the grade does not move', () => {
  assert.equal(RECORD_SUPPORTED_CREDIT, SUPPORTED_CREDIT);
  evidenceRowsFor(unlimitedLesson, 3).forEach((row) => {
    assert.equal(row.supported, false);
    assert.equal(row.credit, 1);
    assert.equal(row.independentSuccess, true);
    assert.equal(row.isMathematicallyIndependent, true);
  });
  evidenceRowsFor(unlimitedLesson, 6).forEach((row) => {
    assert.equal(row.supported, true, 'a correct 6th attempt is supported evidence');
    assert.equal(row.credit, SUPPORTED_CREDIT);
    assert.equal(row.independentSuccess, false);
    assert.equal(row.isMathematicallyIndependent, false);
    assert.equal(row.totalAttempts, 6, 'the attempts are on the evidence row');
    assert.equal(row.firstAttemptCorrect, false);
    assert.equal(row.eventuallyCorrect, true);
    assert.equal(row.percentCredit, 100, 'the question itself is still 100% for the grade');
    assert.equal(row.hintUsed, false, 'no support is invented');
  });
  assert.equal(getQuestionCredit({ status: 'correct', attemptCount: 6, totalAttempts: 6 }), 1);

  // Without the declaration nothing reads the attempt count: a record that
  // somehow holds six attempts is evidence exactly as one holding three.
  const strip = (rows) => rows.map(({ totalAttempts: _total, firstAttemptCorrect: _first, ...rest }) => rest);
  assert.deepEqual(strip(evidenceRowsFor(plainLesson, 6)), strip(evidenceRowsFor(plainLesson, 3)));
  evidenceRowsFor(plainLesson, 6).forEach((row) => {
    assert.equal(row.supported, false);
    assert.equal(row.credit, 1);
    assert.equal(row.independentSuccess, true);
  });
  // A hint is supported with or without the declaration, as before.
  [unlimitedLesson, plainLesson].forEach((assignment) => {
    evidenceRowsFor(assignment, 2, { supportUsage: { hintUsed: true } }).forEach((row) => {
      assert.equal(row.supported, true);
      assert.equal(row.credit, SUPPORTED_CREDIT);
      assert.equal(row.isMathematicallyIndependent, false);
    });
  });
});
