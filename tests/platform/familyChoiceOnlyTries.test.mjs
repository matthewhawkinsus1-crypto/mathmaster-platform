/*
 * P-7: A FAMILY SLOT DEALT AS ALL CHOICES GETS ONE TRY, ON THE SCREEN AND ON
 * THE SERVER.
 *
 * Algebra I M3 T1 L3 Warm-Up 2 (and its Honors twin) is a Question Family
 * slot stored with no answer fields (`inequalities.translatePhrase`). It is
 * dealt as four statements, each a choice, and a question that is all choices
 * gets one try (attemptPolicy.mjs isChoiceOnlyQuestion). QuestionEngine and
 * the server counted tries on the dealt question; App.jsx counted them on the
 * stored slot, three. The student walkthrough of 2026-11-06 (P-7): after one
 * statement turned round, "Not quite. You have 0 tries left." with Submit
 * still on, and the next Submit said "Correct! This question is complete."
 * for an attempt the server refuses, so the teacher never saw it.
 *
 * App.jsx now counts every try on the question shown
 * (src/platform/generation/shownFamilyQuestion.js). This runs the real lesson
 * through the teacher's import chain, deals the slot as the student player
 * does, records the attempt as App.jsx does, sends it to the server's
 * ingestion, and renders the real QuestionEngine with the record that results.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../src/platform/contract/assignmentSchemaV5.js';
import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import { countedQuestion, shownDeliveryKey } from '../../src/platform/generation/shownFamilyQuestion.js';
import { isChoiceOnlyQuestion, recordQuestionAttempt, resolveQuestionMaximumAttempts } from '../../functions/shared/attemptPolicy.mjs';
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { SUBMISSION_DISPOSITION } from '../../functions/shared/studentSubmissionDisposition.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { submitButton } from './helpers/actionBarRender.mjs';
import {
  CLASS_ID,
  DAY,
  at,
  closeRenderer,
  createDevice,
  gradeDocumentFor,
  ingestLikeServer,
  loadRenderer,
  openQuestion,
  questionsOf,
  recordOf,
  renderQuestion,
  submitFields,
} from './helpers/warmupServerLifecycle.mjs';

const LESSON = new URL('../../teacher-import-jsons/algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities.json', import.meta.url);
const STUDENT = 'p7-student';
const WARMUP = getEffectiveActivityPolicy('warmup');

/** The lesson through the teacher's import + publish chain (App.jsx handleCreateAssignment), seated for one class. */
const publishedL3 = (() => {
  let published = null;
  return () => {
    if (published) return published;
    const parsed = parseAssignmentBlueprintText(readFileSync(LESSON, 'utf8'));
    const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}), {});
    assert.equal(model.isValid, true, 'the lesson passes Pre-Flight');
    const questions = validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
    const base = {
      id: 'a1-m3-t1-l3',
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

const warmUp2 = () => {
  const assignment = publishedL3();
  const questionIndex = questionsOf(assignment).findIndex((question) => question.questionId === 'm3l3-wu-2');
  assert.ok(questionIndex >= 0, 'L3 Warm-Up 2 is in the lesson');
  return { assignment, questionIndex };
};

const triesOn = (question) => resolveQuestionMaximumAttempts({ question, maximumAttempts: WARMUP.attempts, activityPolicy: WARMUP });

/** Every statement keyed, and the same with the first one turned round. */
const answersFor = (processed) => {
  const right = Object.fromEntries(processed.answerFields.map((field) => [field.id, field.answer]));
  const first = processed.answerFields[0];
  const turned = first.options.find((option) => option !== first.answer);
  return { right, wrong: { ...right, [first.id]: turned } };
};

before(async () => { await loadRenderer(); });
after(async () => { await closeRenderer(); });

test('L3 Warm-Up 2 is stored with no answer fields and dealt as four choices: one try', async () => {
  const { assignment, questionIndex } = warmUp2();
  const opened = await openQuestion(createDevice(STUDENT), { assignment, questionIndex, nowMs: at(DAY, '08:01') });
  assert.equal(opened.question.questionFamily?.id, 'inequalities.translatePhrase');
  assert.equal(isChoiceOnlyQuestion(opened.question), false, 'the stored slot has no fields');
  assert.equal(triesOn(opened.question), WARMUP.attempts);
  assert.equal(opened.processed.answerFields.length, 4);
  assert.ok(opened.processed.answerFields.every((field) => field.options?.length > 1));
  assert.equal(isChoiceOnlyQuestion(opened.processed), true);
  assert.equal(triesOn(opened.processed), 1);
});

test('App.jsx counts on the question QuestionEngine showed for the slot and variant', async () => {
  const { assignment, questionIndex } = warmUp2();
  const opened = await openQuestion(createDevice(STUDENT), { assignment, questionIndex, nowMs: at(DAY, '08:01') });
  const delivery = opened.processed.familyDelivery;
  // App.jsx handleFamilyDelivery: what QuestionEngine reported, by its key.
  const shown = new Map([[shownDeliveryKey(delivery), { delivery, question: opened.processed }]]);
  const count = (overrides = {}) => countedQuestion({
    shown,
    assignmentId: assignment.id,
    storedQuestion: opened.question,
    questionIndex,
    record: undefined,
    fallback: opened.question,
    ...overrides,
  });
  assert.equal(count(), opened.processed, 'the dealt question');
  assert.equal(triesOn(count()), 1);
  // Nothing shown on this device yet: the stored question, as every count read before.
  assert.equal(count({ shown: new Map() }), opened.question);
  // A replacement is a new variant: the old variant's question is not it.
  assert.equal(count({ record: { status: 'unattempted', variantIndex: 1 } }), opened.question);
  // A question that is not a family slot counts on its own fallback.
  const plain = { questionId: 'plain', type: 'literal', prompt: 'Solve 2x = 6.', answer: '3' };
  assert.equal(count({ storedQuestion: plain, fallback: plain }), plain);
  // A teacher's preview is kept under its own key: a student's count never reads it.
  const preview = new Map([[shownDeliveryKey({ ...delivery, preview: true }), { delivery, question: opened.processed }]]);
  assert.equal(count({ shown: preview }), opened.question);
  assert.equal(count({ shown: preview, preview: true }), opened.processed);
  assert.notEqual(shownDeliveryKey({ ...delivery, preview: true }), shownDeliveryKey(delivery));
});

test('one miss closes it on the screen and on the server, and a second Submit records nothing', async () => {
  const { assignment, questionIndex } = warmUp2();
  const chromebook = createDevice(STUDENT);
  const opened = await openQuestion(chromebook, { assignment, questionIndex, nowMs: at(DAY, '08:01') });
  const { right, wrong } = answersFor(opened.processed);

  // The miss, as App.jsx records it and hands QuestionEngine the result.
  const miss = await submitFields(chromebook, opened, { responses: wrong, capturedAt: at(DAY, '08:02') });
  assert.equal(miss.verdict.isCorrect, false);
  assert.equal(miss.sessionRecord.status, 'expired');
  assert.equal(miss.sessionRecord.attemptCount, 1);
  assert.equal(miss.result.expired, true);
  assert.equal(miss.result.remainingAttempts, 0);

  // The server, on the same envelope, counts the same one try.
  let server = gradeDocumentFor(STUDENT);
  const ingested = ingestLikeServer({ envelope: miss.envelope, assignment, gradeDocument: server, now: at(DAY, '08:02', 2) });
  assert.equal(ingested.receipt.disposition, SUBMISSION_DISPOSITION.ACCEPTED);
  server = ingested.gradeDocument;
  const canonical = recordOf(server, assignment.id, questionIndex);
  assert.equal(canonical.status, 'expired');
  assert.equal(canonical.attemptCount, 1);
  assert.deepEqual(
    { status: miss.sessionRecord.status, attemptCount: miss.sessionRecord.attemptCount, totalAttempts: miss.sessionRecord.totalAttempts },
    { status: canonical.status, attemptCount: canonical.attemptCount, totalAttempts: canonical.totalAttempts },
    'the screen and the server hold the same record',
  );

  // The right answer after it: the screen's record takes nothing more, and
  // neither does the server (no "Correct!" for an attempt nobody records).
  const late = await submitFields(chromebook, opened, { responses: right, sessionRecord: miss.sessionRecord, capturedAt: at(DAY, '08:04') });
  assert.equal(late.verdict.isCorrect, true, 'the second answer is right');
  assert.equal(late.sessionRecord.status, 'expired');
  assert.equal(late.result.isCorrect, false);
  const refused = ingestLikeServer({ envelope: late.envelope, assignment, gradeDocument: server, now: at(DAY, '08:04', 2) });
  assert.equal(refused.receipt.disposition, SUBMISSION_DISPOSITION.SUPERSEDED);
  assert.deepEqual(refused.gradeDocument, server);
});

test('the screen locks after the miss: no Submit, the closed card', async () => {
  const { assignment, questionIndex } = warmUp2();
  const chromebook = createDevice(STUDENT);
  const opened = await openQuestion(chromebook, { assignment, questionIndex, nowMs: at(DAY, '08:01') });
  const miss = await submitFields(chromebook, opened, { responses: answersFor(opened.processed).wrong, capturedAt: at(DAY, '08:02') });
  const closed = await renderQuestion(chromebook, opened, { record: miss.sessionRecord, nowMs: at(DAY, '08:03') });
  assert.deepEqual(closed.errors, []);
  assert.equal(submitButton(closed.html), null, 'no Submit once the one try is used');
  assert.match(closed.html, /data-closed-question-card=""[\s\S]*This question is closed after 1 try\./);

  // What the screen showed before: the record App.jsx wrote counting on the
  // stored slot (three tries) left the question open under its one try.
  const counted = recordQuestionAttempt({
    record: undefined,
    isCorrect: false,
    parts: miss.verdict.parts,
    maximumAttempts: triesOn(opened.question),
  }).record;
  assert.equal(counted.status, 'attempted');
  const open = await renderQuestion(chromebook, opened, { record: counted, nowMs: at(DAY, '08:03') });
  assert.ok(submitButton(open.html), 'the old record left Submit on');
  assert.doesNotMatch(open.html, /data-closed-question-card=""/);
});

test('App.jsx counts every try on the question shown', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  // From a module that carries no family engine (the first load).
  const shownImport = app.match(/import \{([^}]*)\} from '\.\/platform\/generation\/shownFamilyQuestion\.js';/);
  assert.ok(shownImport, 'App reads the count from shownFamilyQuestion.js');
  for (const name of ['countedQuestion', 'shownDeliveryKey']) assert.match(shownImport[1], new RegExp(`\\b${name}\\b`), name);
  // What QuestionEngine reports showing is kept under the one key; a
  // teacher's preview under its own, and the preview hands it only there.
  assert.match(region(app, 'const handleFamilyDelivery = useCallback(', '}, [user?.role', 'handleFamilyDelivery'),
    /familyDeliveriesRef\.current\.set\(shownDeliveryKey\(delivery\), \{ delivery, question: renderedQuestion \|\| null \}\);/);
  assert.match(region(app, 'const handlePreviewFamilyDelivery = useCallback(', '}, []);', 'the preview keeper'),
    /familyDeliveriesRef\.current\.set\(shownDeliveryKey\(\{ \.\.\.delivery, preview: true \}\), \{ delivery, question: renderedQuestion \|\| null \}\);/);
  const mount = region(app, '<QuestionEngine\n              key={`${activeAssignmentId}', '/>', 'the assignment question mount');
  // Among the engine's handlers, each a stable function calling this
  // render's handler (renderStability.js stableCallbacks).
  assert.match(region(mount, '{...stableCallbacks({', '})}', 'the engine handlers'), /\n\s*onFamilyDelivery: preview \? handlePreviewFamilyDelivery : handleFamilyDelivery,\n/);
  // The count reads that map: countedQuestionFor takes its input, the map
  // first, from triesCountingFor (familyDealtTriesCounted.test.mjs holds the rest).
  assert.match(region(app, 'const triesCountingFor = ', '\n  });', 'triesCountingFor'), /=> \(\{\s*shown: familyDeliveriesRef\.current,/);
  assert.match(region(app, 'const countedQuestionFor = ', '});', 'countedQuestionFor'), /countedQuestion\(\{\s*\.\.\.triesCountingFor\(assignment, questionIndex, record, preview\),\s*fallback,\s*$/);
  // Each place App counts reads it: the attempt, the step, the navigator and
  // the limit QuestionEngine is handed.
  const sites = {
    attempt: region(app, 'const applyAttempt = (record) =>', '});', 'handleGradeSubmit applyAttempt'),
    step: region(app, 'const applyStep = (record, occurredAt = null) =>', '});', 'handleStepGrade applyStep'),
    navigator: region(app, 'const entryMaximumAttempts = (entry) => {', '};', 'entryMaximumAttempts'),
    engine: region(mount, 'maximumAttempts={resolveQuestionMaximumAttempts({', '})}', 'the engine limit'),
  };
  assert.match(sites.attempt, /question: countedQuestionFor\(localAssignment, currentQuestionIndex, record, activeQuestions\[currentQuestionIndex\], isTeacherPreview\),/);
  assert.match(sites.step, /question: countedQuestionFor\(localAssignment, currentQuestionIndex, record, activeQuestions\[currentQuestionIndex\], isTeacherPreview\),/);
  assert.match(sites.navigator, /question: countedQuestionFor\(assignment, entry\.index, workingTracker\?\.\[entry\.index\], questions\[entry\.index\], preview\),/);
  assert.match(sites.engine, /question: countedQuestionFor\(assignment, currentQuestionIndex, workingTracker\?\.\[currentQuestionIndex\], questions\[currentQuestionIndex\], preview\),/);
  // And no count in App reads a stored question past it.
  const counts = [...app.matchAll(/resolveQuestionMaximumAttempts\(\{\s*question: ([^\n]+)/g)].map((match) => match[1]);
  assert.equal(counts.length, 4, 'four places count tries');
  counts.forEach((question) => assert.match(question, /^countedQuestionFor\(/, `a count reads ${question}`));
});
