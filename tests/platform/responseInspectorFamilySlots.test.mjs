/*
 * A QUESTION FAMILY ATTEMPT IS INSPECTED AGAINST THE INSTANCE THE STUDENT WAS SHOWN (#249, #554 item 8).
 *
 * A Question Family slot is a template: each student answers an instance the
 * family builds for them, and ingestion grades that instance, rebuilt from the
 * attempt's delivery pin, and stores its key's fingerprint with the grading
 * evidence (submissionIngestion.mjs). The inspector took the template itself
 * for the question graded. So on every family slot it replayed nothing, and it
 * compared the stored fingerprint with the template's: its first reason, on a
 * right answer as on a wrong one, was "The answer key changed after grading —
 * The key for xIntercept was removed", which hid every other reason and sent
 * the teacher to the Grading Actions, and the Expected column was empty. A
 * teacher overrides grades on what this screen says.
 *
 * Every family slot of three real Algebra I lessons is answered here, right and
 * wrong, with the work its own workspace reports (multi-answer boxes, Step
 * Algebra equations and inequalities, the Systems Workspace), ingested by the
 * real buildIngestedAttempt and inspected exactly as the callable inspects it
 * (functions/index.js inspectStudentResponse). What must hold: the right answer
 * reads `correct`; the wrong one a partial or incorrect answer; neither reads
 * `answer-key-changed`; the replay marks the instance the record's pin
 * rebuilds, with the very key ingestion stored; and Expected shows that
 * instance's key. A family attempt whose instance cannot be rebuilt claims no
 * key change and shows no key, the template's least of all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import {
  EXPECTED_UNAVAILABLE,
  authoritativeQuestionForInspection,
  buildInspectorModel,
  replayStoredResponse,
} from '../../functions/shared/responseInspector.mjs';
import { answerCandidatesForField } from '../../functions/shared/answerUtils.mjs';
import { normalizeDeliveryPin, planSeatAdditions, resolveGenerationAllocation, resolveLearnerSeat } from '../../functions/shared/questionGenerationIdentity.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { buildSubmissionEnvelope } from '../../functions/shared/submissionEnvelope.mjs';
import { buildIngestedAttempt, normalizeSubmissionEnvelope } from '../../functions/shared/submissionIngestion.mjs';
import { resolveGradingSurfaceId } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { relationWorkspaceWork, stepAlgebraWorkGrader } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { parseRelationSource, relationSolutionSummary } from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { correctWork, wrongWork } from './helpers/questionFamilyCases.mjs';

const require = createRequire(import.meta.url);
const { runtimeQuestionsFromAssignment } = require('../../functions/lib/assignmentRuntime.js');

const CLASS = 'class-p3';
const STUDENT = 'stu-ana';
const CLASSMATE = 'stu-ben';
const AT = Date.parse('2026-11-10T15:00:00Z');

/* ------------------------------------------------- a lesson, as a class has it */

const lessonAssignment = (file) => {
  const { model } = compileTeacherImport(readFileSync(new URL(`../../teacher-import-jsons/algebra1-module3/${file}`, import.meta.url), 'utf8'));
  const v5 = model.assignmentV5;
  const assignment = {
    id: `asg-${file.replace(/\.json$/, '')}`,
    schemaVersion: 5,
    title: v5.assignment.title,
    sections: v5.sections,
    variantPolicy: v5.variantPolicy,
    generationSeats: { version: 1, byClassId: {} },
  };
  assignment.generationSeats.byClassId[CLASS] = planSeatAdditions({ assignment, classId: CLASS, studentIds: [STUDENT, CLASSMATE] });
  return assignment;
};

// The section's own variant mode, as the server reads it (questionFamilyGrading.mjs):
// Warm-Up and Classwork deal every student the same instance, Practice and DOL their own.
const sectionMode = (assignment, role) => String(assignment.variantPolicy?.sectionModes?.[role] || assignment.variantPolicy?.mode || 'personalized');

/** What `studentId`'s device shows for the slot at storage index `index`. */
const shownTo = (assignment, question, index, studentId) => resolveFamilyQuestionInstance({
  question,
  assignmentId: assignment.id,
  storageIndex: index,
  allocation: resolveGenerationAllocation({
    sectionMode: sectionMode(assignment, question.activityRole),
    seatInfo: resolveLearnerSeat({ assignment, studentId, classId: CLASS }),
    variant: 0,
  }),
});

/* ------------------------------------------- the work each workspace reports */

const keyText = (field) => {
  const key = answerCandidatesForField(field)[0];
  return Array.isArray(key) ? `(${key.join(', ')})` : String(key ?? '');
};
const inequalityWork = (question, boundary) => {
  const variable = question.variable || 'x';
  const state = parseRelationSource(`${variable} ${question.solutionKey.relation} ${boundary}`, variable);
  return relationWorkspaceWork({
    relationState: state,
    representation: question.representSolution === false ? null : { intervals: relationSolutionSummary(state).intervals, notation: '', inequality: '' },
  });
};

/** `{ right, wrong }`: the response a right answer and a wrong one send, for the instance shown. */
const answersFor = (instance) => {
  const surface = resolveGradingSurfaceId(instance);
  if (surface === 'multiAnswer') {
    const fields = (instance.answerFields || []).filter((field) => field?.id);
    const typed = (wrong) => ({
      kind: 'fields',
      type: 'multiAnswer',
      value: '',
      fields: fields.map((field, index) => ({ id: field.id, value: wrong && index === 0 ? '987654' : keyText(field), isComplete: true })),
    });
    return { surface, right: typed(false), wrong: typed(true) };
  }
  if (surface === 'stepAlgebra') {
    const key = instance.solutionKey;
    const [right, wrong] = key?.outcome === 'inequality'
      ? [inequalityWork(instance, key.value), inequalityWork(instance, String(Number(key.value) + 1))]
      : [correctWork(instance), wrongWork(instance)];
    const respond = (work) => gradeToolCheck(stepAlgebraWorkGrader, instance, work).toolResponse;
    return { surface, right: respond(right), wrong: respond(wrong) };
  }
  if (surface === 'systemsWorkspace') {
    const respond = (work) => gradeToolWork({ toolId: 'systemsWorkspace', question: instance, work }).toolResponse;
    return { surface, right: respond(correctWork(instance)), wrong: respond(wrongWork(instance)) };
  }
  throw new Error(`no answer builder for a ${surface} family instance`);
};

/* ------------------------------------------ ingested, then inspected as the callable does */

let submissions = 0;
const ingest = ({ assignment, question, index, response, delivery, studentId = STUDENT }) => {
  submissions += 1;
  const envelope = Object.assign(normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: `act-${index}-${submissions}`,
    kind: 'ordinarySubmission',
    studentId,
    assignmentId: assignment.id,
    questionIndex: index,
    questionId: question.questionId,
    activityRole: question.activityRole,
    capturedAt: AT,
    previousTotalAttempts: 0,
    record: { status: 'unattempted' },
    response,
    familyDelivery: normalizeDeliveryPin(delivery),
  })), { studentId });
  return buildIngestedAttempt({ envelope, assignment, question, canonicalRecord: {}, gradeDocument: { classId: CLASS }, ingestedAt: AT + 1000 });
};

const inspect = ({ assignment, question, index, record, gradingEvidence, studentId = STUDENT }) => buildInspectorModel({
  assignment,
  question,
  questionIndex: index,
  section: assignment.sections.find((section) => section.questions.some((entry) => entry?.questionId === question.questionId)) || null,
  student: { id: studentId, classId: CLASS },
  record,
  gradingEvidence,
});

const codes = (model) => model.diagnosis.reasons.map((reason) => reason.code);

/* ================================================================= the lessons */

const LESSONS = [
  'T1_L1_Solving_Linear_Equations.json',
  'T2_L2_Solving_Systems_by_Substitution.json',
  'T1_L3_Modeling_and_Solving_Linear_Inequalities.json',
];
const surfacesSeen = new Set();
let slotsSeen = 0;
let placeholderPrompts = 0;

for (const file of LESSONS) {
  test(`${file}: every Question Family slot reads as it was graded — a right answer correct, a wrong one partial or incorrect, never "the key changed"`, () => {
    const assignment = lessonAssignment(file);
    const questions = runtimeQuestionsFromAssignment(assignment);
    const slots = questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => question?.questionFamily?.id && !question.generator);
    assert.ok(slots.length >= 8, `${file}: ${slots.length} family slots`);
    for (const { question, index } of slots) {
      const label = `${file} Q${index + 1} (${question.questionFamily.id})`;
      const shown = shownTo(assignment, question, index, STUDENT);
      assert.equal(shown.error, null, `${label}: an instance is dealt`);
      const { surface, right, wrong } = answersFor(shown.question);
      surfacesSeen.add(surface);
      slotsSeen += 1;
      if (/\{\{/.test(question.prompt || '')) placeholderPrompts += 1;
      for (const [answer, response] of [['right', right], ['wrong', wrong]]) {
        const built = ingest({ assignment, question, index, response, delivery: shown.delivery });
        assert.equal(built.blocked, false, `${label} ${answer}: ingested (${built.reason})`);
        assert.equal(built.record.gradedBy, 'server', `${label} ${answer}: graded by the server, against the pinned instance`);
        assert.equal(built.record.status === 'correct', answer === 'right', `${label} ${answer}: graded ${built.record.status}`);

        const model = inspect({ assignment, question, index, record: built.record, gradingEvidence: built.gradingEvidence });
        const reasons = codes(model);
        assert.ok(!reasons.includes('answer-key-changed'), `${label} ${answer}: ${reasons.join(', ')}`);
        if (answer === 'right') {
          assert.deepEqual(reasons, ['correct'], `${label}: a right answer`);
        } else {
          assert.ok(['multipart-partial', 'genuinely-incorrect'].includes(reasons[0]), `${label} wrong: ${reasons.join(', ')}`);
        }
        // The replay marked the instance the record's pin rebuilds: the one
        // ingestion graded, with the very key it stored, to the same verdict.
        assert.equal(model.replay.available, true, `${label} ${answer}: ${model.replay.reason}`);
        assert.equal(model.replay.questionSource, 'family-delivery-pin', label);
        assert.equal(model.replay.discrepancy, false, `${label} ${answer}: the replay agrees with the record`);
        assert.deepEqual(model.replay.answerKey, built.gradingEvidence.answerKeyFingerprint, `${label} ${answer}: the key ingestion stored`);
        // Expected is the instance's key, box by box — never empty, never the template's.
        assert.equal(model.expectedAvailable, true, label);
        if (surface === 'multiAnswer') {
          const keys = Object.fromEntries(shown.question.answerFields.map((field) => [String(field.id), answerCandidatesForField(field).map(String)]));
          assert.deepEqual(Object.keys(model.expected), Object.keys(keys), `${label}: every box of the instance`);
          model.view.rows.forEach((row) => {
            assert.ok(row.expected && !row.expected.unavailable && row.expected.text, `${label} ${row.id}: the Expected cell shows a key`);
          });
          assert.deepEqual(model.view.rows.map((row) => row.id), Object.keys(keys), `${label}: one row per box of the instance`);
        }
        // The Response Summary's prompt is the one the student was shown.
        assert.equal(model.question.prompt, shown.question.prompt, `${label}: the instance's prompt`);
      }
    }
  });
}

test('the lessons above cover all three family workspaces', () => {
  assert.ok(slotsSeen >= 30, `${slotsSeen} family slots answered`);
  assert.ok(placeholderPrompts >= 10, `${placeholderPrompts} templates whose prompt has placeholders`);
  assert.deepEqual([...surfacesSeen].sort(), ['multiAnswer', 'stepAlgebra', 'systemsWorkspace']);
});

/* ====================================== when the instance cannot be rebuilt */

const INTERCEPTS = { questionId: 'q2-intercepts', type: 'multiAnswer', prompt: 'Find both intercepts.', activityRole: 'practice', questionFamily: { id: 'functions.identifyIntercepts' } };
const interceptsAssignment = () => {
  const assignment = {
    id: 'asg-intercepts',
    schemaVersion: 5,
    title: 'Intercepts',
    generationSeats: { version: 1, byClassId: {} },
    sections: [{ id: 's-pr', role: 'practice', title: 'Practice', questions: [INTERCEPTS] }],
  };
  assignment.generationSeats.byClassId[CLASS] = planSeatAdditions({ assignment, classId: CLASS, studentIds: [STUDENT, CLASSMATE] });
  return assignment;
};

test('a family template is never the question an attempt was graded against: it needs the delivered instance', () => {
  const authority = authoritativeQuestionForInspection({ question: INTERCEPTS, evidence: {} });
  assert.equal(authority.authoritative, false);
  assert.equal(authority.reason, EXPECTED_UNAVAILABLE);
  // A stored delivered instance is still the authority it always was.
  const assignment = interceptsAssignment();
  const instance = shownTo(assignment, INTERCEPTS, 0, STUDENT).question;
  const stored = authoritativeQuestionForInspection({ question: INTERCEPTS, evidence: { deliveredInstanceAuthority: { authoritative: true, question: instance } } });
  assert.equal(stored.authoritative, true);
  assert.equal(stored.source, 'stored-delivered-instance');
});

test('a family attempt whose instance cannot be rebuilt claims no key change and shows no key', () => {
  const assignment = interceptsAssignment();
  const shown = shownTo(assignment, INTERCEPTS, 0, STUDENT);
  const { right } = answersFor(shown.question);
  const built = ingest({ assignment, question: INTERCEPTS, index: 0, response: right, delivery: shown.delivery });
  assert.equal(built.record.status, 'correct');
  const theirs = shownTo(assignment, INTERCEPTS, 0, CLASSMATE);
  assert.notEqual(theirs.delivery.fingerprint, shown.delivery.fingerprint, 'the classmate was dealt other numbers');

  const unrebuilt = {
    // A record with no pin (written before pins, or by a client path).
    'no pin': { ...built.record, familyDelivery: null },
    // A pin this student was never allocated: a classmate's.
    "a classmate's pin": { ...built.record, familyDelivery: theirs.delivery },
    // A pin that cannot even be read: never a thrown error on the teacher's screen.
    'an unreadable pin': { ...built.record, familyDelivery: { ...shown.delivery, familyId: { toString: null } } },
  };
  for (const [why, record] of Object.entries(unrebuilt)) {
    const model = inspect({ assignment, question: INTERCEPTS, index: 0, record, gradingEvidence: built.gradingEvidence });
    assert.deepEqual(codes(model), ['correct'], `${why}: the recorded verdict, with no key change claimed`);
    assert.equal(model.replay.available, false, why);
    assert.equal(model.expectedAvailable, false, why);
    assert.equal(model.expectedUnavailableReason, EXPECTED_UNAVAILABLE, why);
    assert.equal(model.question.prompt, INTERCEPTS.prompt, `${why}: no instance is known, so the slot's own prompt`);
    model.view.rows.forEach((row) => assert.equal(row.expected?.unavailable, true, `${why} ${row.id}: no key is shown`));
  }

  // Inspected with the record as ingestion wrote it, the same attempt replays.
  const model = inspect({ assignment, question: INTERCEPTS, index: 0, record: built.record, gradingEvidence: built.gradingEvidence });
  assert.deepEqual(codes(model), ['correct']);
  assert.equal(model.replay.questionSource, 'family-delivery-pin');
  assert.equal(model.question.prompt, shown.question.prompt);
  assert.notEqual(shown.question.prompt, INTERCEPTS.prompt, 'the instance names its line');
  assert.deepEqual(model.view.rows.map((row) => row.expected?.text), shown.question.answerFields.map((field) => keyText(field)));
  // Apply Corrected Grade replays it the same way (overrideStudentResponseGrade).
  const corrected = replayStoredResponse({ question: INTERCEPTS, record: built.record, gradingEvidence: built.gradingEvidence, assignment, questionIndex: 0, studentId: STUDENT, classId: CLASS });
  assert.equal(corrected.available, true, corrected.reason);
  assert.equal(corrected.currentScore, 100);
});
