/*
 * THE TEACHER'S REPLAY MARKS A STORED RESPONSE THE WAY INGESTION DID.
 *
 * "Replay" and "Apply Corrected Grade" in the Student Response Inspector grade
 * the exact stored response again. They now go through the shared grading
 * registry, so a rich tool's structured work and a Question Family attempt can
 * be replayed — against the instance its validated pin rebuilds — and the
 * replayed verdict is the one ingestion would reach today.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { replayStoredResponse } from '../../functions/shared/responseInspector.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { learnerToken } from '../../functions/shared/questionGenerationIdentity.mjs';

const STATIC_LAB = { questionId: 'cpl-1', type: 'complexPlaneLab', toolId: 'complexPlaneLab', mode: 'operations', operation: 'add', z: { re: 3, im: 1 }, w: { re: 2, im: -1 }, activityRole: 'classwork' };
const FAMILY_LAB = {
  questionId: 'cpl-family', type: 'complexPlaneLab', toolId: 'complexPlaneLab', mode: 'operations', operation: 'add',
  prompt: 'Add ({{a}} + {{b}}i) and (2 - i).', z: { re: '{{a}}', im: '{{b}}' }, w: { re: 2, im: -1 }, activityRole: 'dol',
  questionFamily: { scope: 'assignment' },
  generator: { parameters: { a: { type: 'int', min: 1, max: 9 }, b: { type: 'int', min: 1, max: 9 } } },
};
const ASSIGNMENT = {
  id: 'A1',
  schemaVersion: 5,
  generationSeats: { version: 1, byClassId: { C1: { [learnerToken('A1', 'S1')]: 3, [learnerToken('A1', 'S2')]: 7 } } },
};

const evidenceFor = (response, automaticScore, automaticResult = null) => ({
  submittedResponse: response,
  automaticResult,
  automaticScore,
  submissionProvenance: 'exact-server-ingested-snapshot',
});

test('a rich tool\'s stored structured work replays through its shared grader', () => {
  const correct = gradeToolWork({ toolId: 'complexPlaneLab', question: STATIC_LAB, work: { real: '5', imaginary: '0' } });
  const replay = replayStoredResponse({ question: STATIC_LAB, record: { status: 'correct' }, gradingEvidence: evidenceFor(correct.toolResponse, 100, { isCorrect: correct.isCorrect, parts: correct.parts }) });
  assert.equal(replay.available, true, replay.reason);
  assert.equal(replay.adapter, 'shared-grading-registry');
  assert.equal(replay.currentScore, 100);
  assert.equal(replay.discrepancy, false);

  const half = gradeToolWork({ toolId: 'complexPlaneLab', question: STATIC_LAB, work: { real: '5', imaginary: '7' } });
  const halfReplay = replayStoredResponse({ question: STATIC_LAB, record: { status: 'attempted' }, gradingEvidence: evidenceFor(half.toolResponse, 50) });
  assert.equal(halfReplay.currentScore, 50);
});

test('a Question Family attempt replays against the instance its validated pin rebuilds — never the template, never a classmate\'s', () => {
  const mine = resolveFamilyQuestionInstance({ question: FAMILY_LAB, assignmentId: 'A1', storageIndex: 0, allocation: { seat: 3, variant: 0, stride: 40, index: 3, basis: 'seated' } });
  const theirs = resolveFamilyQuestionInstance({ question: FAMILY_LAB, assignmentId: 'A1', storageIndex: 0, allocation: { seat: 7, variant: 0, stride: 40, index: 7, basis: 'seated' } });
  const work = { real: String(Number(mine.question.z.re) + 2), imaginary: String(Number(mine.question.z.im) - 1) };
  const response = gradeToolWork({ toolId: 'complexPlaneLab', question: mine.question, work }).toolResponse;
  const record = { status: 'correct', variantIndex: 0, familyDelivery: mine.delivery };

  // Without the assignment the template alone cannot be replayed.
  const blind = replayStoredResponse({ question: FAMILY_LAB, record, gradingEvidence: evidenceFor(response, 100) });
  assert.equal(blind.available, false);

  const replay = replayStoredResponse({ question: FAMILY_LAB, record, gradingEvidence: evidenceFor(response, 100), assignment: ASSIGNMENT, questionIndex: 0, studentId: 'S1', classId: 'C1' });
  assert.equal(replay.available, true, replay.reason);
  assert.equal(replay.questionSource, 'family-delivery-pin');
  assert.equal(replay.currentScore, 100);

  // A record carrying a classmate's pin cannot be replayed into credit.
  const forged = replayStoredResponse({ question: FAMILY_LAB, record: { ...record, familyDelivery: theirs.delivery }, gradingEvidence: evidenceFor(response, 100), assignment: ASSIGNMENT, questionIndex: 0, studentId: 'S1', classId: 'C1' });
  assert.equal(forged.available, false);
});

test('workspace-draft recovery proposes the verdict ingestion will record, and never reads a typed-answer draft as a workspace answer', async () => {
  const { assessWorkspaceDraftEntry } = await import('../../functions/shared/workspaceDraftRecovery.mjs');
  const SAVED = Date.parse('2026-09-14T15:00:00Z');
  const CLOSE = Date.parse('2026-09-14T20:00:00Z');
  const entry = { key: 'mathmaster-draft:student:S1:A1:0:0:literal', value: '2x+1', savedAt: SAVED, questionIndex: 0, variantIndex: 0 };
  const typed = { type: 'literal', acceptedAnswers: ['2x+1'], solveFor: 'y', activityRole: 'classwork', questionId: 'q1' };
  const proposed = assessWorkspaceDraftEntry({ entry, question: typed, documentSavedAtMs: SAVED, closesAtMs: CLOSE });
  assert.equal(proposed.recoverable, true);
  assert.equal(proposed.proposedResult, 'Correct');

  // The same literal opened on the balance workspace is answered with a final
  // equation, not a typed expression: a typed-answer draft is not its work.
  const workspace = { ...typed, equation: 'y = 2x + 1', solveFor: 'x', presentation: 'workspace' };
  const refused = assessWorkspaceDraftEntry({ entry, question: workspace, documentSavedAtMs: SAVED, closesAtMs: CLOSE });
  assert.equal(refused.recoverable, false);
  assert.match(refused.reason, /draft-type-mismatch|unsupported-question/);

  // ...unless the workspace cannot be built, in which case the student saw
  // the typed answer box, and its draft is exactly what they answered.
  const unbuildable = { type: 'literal', equation: 'A = bh', solveFor: 'q', workspace: true, acceptedAnswers: ['2x+1'], activityRole: 'classwork', questionId: 'q1' };
  const typedBox = assessWorkspaceDraftEntry({ entry, question: unbuildable, documentSavedAtMs: SAVED, closesAtMs: CLOSE });
  assert.equal(typedBox.recoverable, true, typedBox.reason);
  assert.equal(typedBox.proposedResult, 'Correct');
});
