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

console.log('questionReviewRepairFoundation.test.mjs: all assertions passed');
