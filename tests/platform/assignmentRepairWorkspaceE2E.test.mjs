import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTHORING_STATES,
  isAssignmentEligibleForNormalLibrary,
} from '../../src/platform/preflight/assignmentAuthoringState.js';
import {
  applyIncompleteDraftRepairCommit,
  buildIncompleteAssignmentDraftRecord,
  finalizeIncompleteAssignmentReview,
  restoreIncompleteAssignmentV5,
} from '../../src/platform/preflight/incompleteAssignmentDraft.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  commitStagedQuestionRepairImport,
  stageSingleQuestionRepairImport,
} from '../../src/platform/preflight/questionRepairImport.js';
import {
  addTeacherReviewFlag,
  resolveTeacherReviewFlag,
} from '../../src/platform/preflight/teacherReviewContext.js';

const question = (questionId, prompt, role, answer = '3') => ({
  questionId,
  type: 'algebra',
  prompt,
  answer,
  activityRole: role,
  alignments: [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ],
});

const healthyAssignment = () => ({
  schemaVersion: 5,
  assignment: {
    assignmentId: 'assignment-e2e-repair',
    title: 'Repair workspace E2E',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  variantPolicy: {
    mode: 'personalized',
    sectionModes: { classwork: 'shared', practice: 'personalized', dol: 'shared' },
  },
  sections: [
    {
      id: 'cw',
      role: 'classwork',
      title: 'Classwork',
      questions: [question('q-cw-1', 'Solve x + 2 = 5.', 'classwork')],
    },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [question('q-pr-1', 'Solve x + 4 = 7.', 'practice')],
    },
    {
      id: 'dol',
      role: 'dol',
      title: 'DOL',
      questions: [question('q-dol-1', 'Solve x + 1 = 4.', 'dol')],
    },
  ],
});

test('save → diagnose → salvage → repair → revalidate → teacher verify → ready → explicit publish', () => {
  const broken = healthyAssignment();
  broken.sections[0].questions[0].xIntercepts = [[3, 0, 99]];

  const initialModel = buildAssignmentV5PreflightModel(broken);
  assert.equal(initialModel.isValid, false, 'the fixture must begin with a real deterministic blocker');
  assert.ok(initialModel.diagnostics.some((entry) => entry.severity === 'blocking'));

  const intakeResult = {
    ok: false,
    sourceSchemaVersion: 5,
    parsed: { assignmentV5: broken },
    errors: initialModel.errors,
    warnings: initialModel.warnings,
  };
  let draft = buildIncompleteAssignmentDraftRecord({
    intakeResult,
    rawText: JSON.stringify(broken),
    sourceName: 'E2E fixture',
    nowIso: '2026-09-07T17:00:00.000Z',
  });

  assert.equal(draft.authoringState, AUTHORING_STATES.INCOMPLETE);
  assert.equal(draft.assignmentRevision, 1);
  assert.equal(isAssignmentEligibleForNormalLibrary(draft), false, 'salvage belongs outside the normal Library');

  const reviewContext = addTeacherReviewFlag(draft.teacherReviewContext, {
    scope: 'question',
    targetId: 'q-cw-1',
    category: 'teacherReview',
    severity: 'needsEditing',
    note: 'Verify the repaired question still asks the same algebra skill.',
  }, {
    flagId: 'flag-e2e-1',
    assignmentRevision: 1,
    nowIso: '2026-09-07T17:01:00.000Z',
  });
  draft = { ...draft, teacherReviewContext: reviewContext };

  const savedV5 = restoreIncompleteAssignmentV5(draft);
  const replacement = structuredClone(savedV5.sections[0].questions[0]);
  delete replacement.xIntercepts;

  const staged = stageSingleQuestionRepairImport({
    assignmentV5: savedV5,
    questionId: 'q-cw-1',
    replacementQuestion: replacement,
    baseRevision: 1,
    currentRevision: 1,
    teacherReviewContext: reviewContext,
  });
  assert.equal(staged.canCommit, true, staged.validation.newBlockingDiagnostics.map((entry) => entry.message).join('\n'));
  assert.equal(staged.validation.newBlockingDiagnostics.length, 0);
  assert.ok(staged.validation.resolvedBlockingDiagnostics.length >= 1, 'revalidation should prove the original blocker was resolved');
  assert.deepEqual(staged.pendingTeacherFlagIds, ['flag-e2e-1']);

  const committed = commitStagedQuestionRepairImport({
    stagedImport: staged,
    teacherReviewContext: reviewContext,
    currentRevision: 1,
    nextRevision: 2,
    nowIso: '2026-09-07T17:02:00.000Z',
  });
  draft = applyIncompleteDraftRepairCommit(draft, committed, {
    nowIso: '2026-09-07T17:02:00.000Z',
  });

  assert.equal(draft.assignmentRevision, 2);
  assert.equal(draft.authoringState, AUTHORING_STATES.NEEDS_REVIEW, 'repair success still requires the human review boundary');
  assert.equal(isAssignmentEligibleForNormalLibrary(draft), false);
  assert.equal(draft.repairHistory.length, 1);
  assert.deepEqual(draft.repairHistory[0].questions.map((entry) => entry.questionId), ['q-cw-1'], 'history must not copy unrelated questions');

  assert.throws(
    () => finalizeIncompleteAssignmentReview(draft, { nowIso: '2026-09-07T17:03:00.000Z' }),
    /teacher|review|flag/i,
    'a repair import may not approve its own teacher-raised concern',
  );

  const resolvedContext = resolveTeacherReviewFlag(draft.teacherReviewContext, 'flag-e2e-1', { status: 'resolved' });
  draft = { ...draft, teacherReviewContext: resolvedContext };

  const ready = finalizeIncompleteAssignmentReview(draft, {
    nowIso: '2026-09-07T17:04:00.000Z',
  });
  assert.equal(ready.authoringState, AUTHORING_STATES.READY);
  assert.equal(ready.authoringReview.state, AUTHORING_STATES.READY);
  assert.equal(ready.assignmentRevision, 2, 'reviewing readiness does not mutate question content or revision');
  assert.equal(isAssignmentEligibleForNormalLibrary(ready), true);
  assert.equal(ready.authoringState === AUTHORING_STATES.PUBLISHED, false, 'Ready must never silently mean Published');

  const published = finalizeIncompleteAssignmentReview(ready, {
    published: true,
    nowIso: '2026-09-07T17:05:00.000Z',
  });
  assert.equal(published.authoringState, AUTHORING_STATES.PUBLISHED);
  assert.equal(published.authoringReview.state, AUTHORING_STATES.PUBLISHED);
  assert.equal(published.assignmentRevision, 2);
  assert.equal(isAssignmentEligibleForNormalLibrary(published), true);
});

test('final review refuses content that still has deterministic blockers', () => {
  const broken = healthyAssignment();
  broken.sections[0].questions[0].xIntercepts = [[3, 0, 99]];
  const model = buildAssignmentV5PreflightModel(broken);
  const draft = buildIncompleteAssignmentDraftRecord({
    intakeResult: {
      ok: false,
      sourceSchemaVersion: 5,
      parsed: { assignmentV5: broken },
      errors: model.errors,
      warnings: model.warnings,
    },
    rawText: JSON.stringify(broken),
  });

  assert.throws(
    () => finalizeIncompleteAssignmentReview(draft),
    /blocking|incomplete|repair/i,
  );
});

console.log('assignmentRepairWorkspaceE2E.test.mjs: all assertions passed');
