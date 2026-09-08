import test from 'node:test';
import assert from 'node:assert/strict';

import { getAssignmentLifecycle } from '../../src/assignmentLifecycle.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  AUTHORING_STATES,
  canSalvageV5IntakeResult,
  deriveAssignmentAuthoringState,
  isAssignmentEligibleForNormalLibrary,
} from '../../src/platform/preflight/assignmentAuthoringState.js';
import {
  buildIncompleteAssignmentDraftRecord,
  markIncompleteDraftForReview,
  restoreIncompleteAssignmentV5,
} from '../../src/platform/preflight/incompleteAssignmentDraft.js';

const alignedQuestion = (overrides = {}) => ({
  questionId: 'q-cw-1',
  type: 'algebra',
  prompt: 'Solve x + 2 = 5.',
  answer: '3',
  activityRole: 'classwork',
  alignments: [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ],
  ...overrides,
});

const assignment = (question = alignedQuestion()) => ({
  schemaVersion: 5,
  assignment: {
    title: 'Repair Foundation',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  sections: [
    { id: 'cw', role: 'classwork', title: 'Classwork', questions: [question] },
  ],
});

test('authoring/review state is independent from the student deadline lifecycle', () => {
  const longClosed = {
    dueAt: '2024-01-01T12:00:00.000Z',
    lateDueAt: '2024-01-02T12:00:00.000Z',
  };
  assert.equal(getAssignmentLifecycle(longClosed, new Date('2026-09-07T12:00:00.000Z')).status, 'closed');
  assert.equal(
    deriveAssignmentAuthoringState({ assignment: longClosed, diagnostics: [], teacherFlags: [] }),
    AUTHORING_STATES.READY,
  );
});

test('blocking diagnostics make authoring incomplete without changing deadline state', () => {
  const diagnostics = [{ severity: 'blocking', code: 'semantic.example', message: 'Needs repair.' }];
  assert.equal(
    deriveAssignmentAuthoringState({ diagnostics }),
    AUTHORING_STATES.INCOMPLETE,
  );
});

test('warnings or unresolved teacher flags produce needsReview, clean work is ready, and clean published work is published', () => {
  assert.equal(
    deriveAssignmentAuthoringState({ diagnostics: [{ severity: 'warning', code: 'warning.example', message: 'Review this.' }] }),
    AUTHORING_STATES.NEEDS_REVIEW,
  );
  assert.equal(
    deriveAssignmentAuthoringState({ diagnostics: [], teacherFlags: [{ status: 'open', category: 'content' }] }),
    AUTHORING_STATES.NEEDS_REVIEW,
  );
  assert.equal(deriveAssignmentAuthoringState({ diagnostics: [] }), AUTHORING_STATES.READY);
  assert.equal(deriveAssignmentAuthoringState({ diagnostics: [], published: true }), AUTHORING_STATES.PUBLISHED);
});

test('Preflight exposes machine-readable diagnostics while preserving legacy errors and warnings', () => {
  const candidate = assignment(alignedQuestion({ questionWeight: 99 }));
  const model = buildAssignmentV5PreflightModel(candidate);

  assert.equal(model.isValid, false);
  assert.equal(model.authoringState, AUTHORING_STATES.INCOMPLETE);
  assert.ok(Array.isArray(model.diagnostics));
  assert.ok(model.errors.length > 0);

  const diagnostic = model.diagnostics.find((entry) => entry.questionId === 'q-cw-1');
  assert.ok(diagnostic, JSON.stringify(model.diagnostics, null, 2));
  assert.equal(diagnostic.severity, 'blocking');
  assert.equal(diagnostic.questionId, 'q-cw-1');
  assert.equal(diagnostic.questionNumber, 1);
  assert.equal(diagnostic.sectionId, 'cw');
  assert.equal(typeof diagnostic.source, 'string');
  assert.ok(diagnostic.source.length > 0);
  assert.equal(typeof diagnostic.code, 'string');
  assert.ok(diagnostic.code.length > 0);
  assert.equal(typeof diagnostic.repairRequirement, 'string');
  assert.ok(diagnostic.repairRequirement.length > 0);
  assert.equal(typeof diagnostic.fieldPath, 'string');
  assert.ok(diagnostic.fieldPath.includes('questionWeight'));
  assert.ok(model.errors.includes(diagnostic.message));
});

test('parseable V5 validation failures can be salvaged into Assignment Review', () => {
  const parsed = {
    sourceSchemaVersion: 5,
    assignmentV5: assignment(),
    questions: [alignedQuestion()],
  };
  assert.equal(canSalvageV5IntakeResult({
    ok: false,
    errors: ['Question 1 needs repair.'],
    parsed,
    sourceSchemaVersion: 5,
  }), true);
});

test('malformed, unparseable, or unsupported intake results are never treated as repairable V5 drafts', () => {
  assert.equal(canSalvageV5IntakeResult({
    ok: false,
    errors: ['Unexpected token.'],
    parsed: null,
    sourceSchemaVersion: null,
  }), false);

  assert.equal(canSalvageV5IntakeResult({
    ok: false,
    errors: ['V4 is unsupported.'],
    parsed: { assignmentV5: { schemaVersion: 4 } },
    sourceSchemaVersion: 4,
  }), false);
});

test('normal Assignment Library excludes explicit incomplete or needs-review drafts but preserves legacy library items', () => {
  assert.equal(isAssignmentEligibleForNormalLibrary({ authoringState: AUTHORING_STATES.INCOMPLETE }), false);
  assert.equal(isAssignmentEligibleForNormalLibrary({ authoringState: AUTHORING_STATES.NEEDS_REVIEW }), false);
  assert.equal(isAssignmentEligibleForNormalLibrary({ authoringState: AUTHORING_STATES.READY }), true);
  assert.equal(isAssignmentEligibleForNormalLibrary({ authoringState: AUTHORING_STATES.PUBLISHED }), true);
  assert.equal(isAssignmentEligibleForNormalLibrary({ authoringReview: { state: AUTHORING_STATES.INCOMPLETE } }), false);

  // Existing assignments created before authoringState existed must not vanish
  // from the Library simply because they predate the migration.
  assert.equal(isAssignmentEligibleForNormalLibrary({ title: 'Legacy clean library assignment' }), true);
});

test('a salvageable intake becomes a Firestore-safe incomplete draft without structurally storing broken question JSON', () => {
  const broken = assignment(alignedQuestion({ questionWeight: 99 }));
  const model = buildAssignmentV5PreflightModel(broken);
  const intakeResult = {
    ok: false,
    errors: [...model.errors],
    warnings: [...model.warnings],
    parsed: {
      sourceSchemaVersion: 5,
      assignmentV5: broken,
      questions: [broken.sections[0].questions[0]],
    },
    sourceSchemaVersion: 5,
  };
  const record = buildIncompleteAssignmentDraftRecord({
    intakeResult,
    rawText: JSON.stringify(broken),
    sourceName: 'broken.json',
    ownerUid: 'teacher-1',
    ownerEmail: 'teacher@example.org',
    nowIso: '2026-09-07T12:00:00.000Z',
  });

  assert.equal(record.schemaVersion, 5);
  assert.equal(record.title, 'Repair Foundation');
  assert.equal(record.courseId, 'algebra1');
  assert.equal(record.authoringState, AUTHORING_STATES.INCOMPLETE);
  assert.equal(record.authoringReview.state, AUTHORING_STATES.INCOMPLETE);
  assert.equal(record.authoringReview.ownerUid, 'teacher-1');
  assert.equal(record.authoringReview.questionCount, 1);
  assert.ok(record.authoringReview.blockingCount >= 1);
  assert.ok(record.authoringReview.diagnostics.some((entry) => entry.questionId === 'q-cw-1'));
  assert.equal(typeof record.authoringDraft.sourceJson, 'string');
  assert.equal(typeof record.authoringDraft.canonicalJson, 'string');
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'sections'), false);
  assert.deepEqual(record.assignedClassIds, []);
  assert.deepEqual(record.assignedClassPeriods, []);
  assert.equal(record.dueAt, null);
});

test('saved incomplete drafts restore the exact V5 assignment for later repair', () => {
  const original = assignment(alignedQuestion({ questionWeight: 99 }));
  const record = buildIncompleteAssignmentDraftRecord({
    intakeResult: {
      ok: false,
      errors: ['Question 1 needs repair.'],
      warnings: [],
      parsed: { sourceSchemaVersion: 5, assignmentV5: original, questions: [original.sections[0].questions[0]] },
      sourceSchemaVersion: 5,
    },
    rawText: JSON.stringify(original),
    sourceName: 'resume.json',
    ownerUid: 'teacher-1',
    nowIso: '2026-09-07T12:00:00.000Z',
  });

  assert.deepEqual(restoreIncompleteAssignmentV5(record), original);
});

test('legacy incomplete drafts without question ids restore deterministic immutable ids', () => {
  const legacyQuestion = alignedQuestion({ questionId: undefined, questionWeight: 99 });
  const legacyAssignment = assignment(legacyQuestion);
  const record = {
    schemaVersion: 5,
    title: 'Legacy incomplete draft',
    assignmentRevision: 1,
    authoringDraft: {
      canonicalJson: JSON.stringify(legacyAssignment),
      sourceSchemaVersion: 5,
    },
  };

  const firstRestore = restoreIncompleteAssignmentV5(record);
  const secondRestore = restoreIncompleteAssignmentV5(record);
  const firstId = firstRestore.sections[0].questions[0].questionId;

  assert.ok(firstId, 'opening an older incomplete draft must assign its missing question id');
  assert.equal(secondRestore.sections[0].questions[0].questionId, firstId, 'the generated id must be stable every time the draft is opened');
});

test('a repaired draft stays outside the normal Library until the teacher finishes the normal review flow', () => {
  const original = assignment(alignedQuestion({ questionWeight: 99 }));
  const fixed = assignment(alignedQuestion({ questionWeight: 1 }));
  const record = buildIncompleteAssignmentDraftRecord({
    intakeResult: {
      ok: false,
      errors: ['Question 1 needs repair.'],
      warnings: [],
      parsed: { sourceSchemaVersion: 5, assignmentV5: original, questions: [original.sections[0].questions[0]] },
      sourceSchemaVersion: 5,
    },
    rawText: JSON.stringify(original),
    sourceName: 'repair.json',
    ownerUid: 'teacher-1',
    nowIso: '2026-09-07T12:00:00.000Z',
  });

  const reviewed = markIncompleteDraftForReview(record, fixed, {
    nowIso: '2026-09-07T12:15:00.000Z',
  });

  assert.equal(reviewed.authoringState, AUTHORING_STATES.NEEDS_REVIEW);
  assert.equal(reviewed.authoringReview.state, AUTHORING_STATES.NEEDS_REVIEW);
  assert.equal(reviewed.updatedAt, '2026-09-07T12:15:00.000Z');
  assert.deepEqual(restoreIncompleteAssignmentV5(reviewed), fixed);
  assert.equal(isAssignmentEligibleForNormalLibrary(reviewed), false);
});

console.log('questionReviewRepairFoundation.test.mjs: all assertions passed');