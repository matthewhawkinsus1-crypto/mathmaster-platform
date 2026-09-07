import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIncompleteAssignmentDraftRecord,
  finalizeIncompleteAssignmentReview,
} from '../../src/platform/preflight/incompleteAssignmentDraft.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';

/*
 * THE SECOND COPY OF THE OVERRIDE RULE NEEDS ITS OWN TEST.
 *
 * Two code paths decide whether an overridden finding still blocks:
 * deriveAssignmentAuthoringState, and finalizeIncompleteAssignmentReview. Each
 * re-derives eligibility rather than trusting the stored override list, and
 * assignmentOverrideReadiness.test.mjs covers the first one — so removing the
 * re-check from the SECOND passes every existing suite.
 *
 * That path is the one that promotes a draft to Ready and into the normal
 * Library. Trust the stored list there and a single hand-written row in a
 * Firestore document turns a question Firestore cannot even store into
 * publishable content, with the readiness check reporting success.
 *
 * The override row below is shaped exactly like a real one, because that is all
 * a corrupted or hand-edited document would ever be.
 */

const brokenAssignment = () => ({
  schemaVersion: 5,
  assignment: {
    assignmentId: 'finalize-override',
    title: 'Finalize override safety',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  sections: [{
    id: 'cw',
    role: 'classwork',
    title: 'Classwork',
    questions: [{
      questionId: 'q-1',
      type: 'algebra',
      prompt: 'Solve x + 2 = 5.',
      answer: '3',
      activityRole: 'classwork',
      alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
      // Firestore cannot store an array directly inside an array, and this is
      // not a recognisable coordinate pair, so nothing auto-repairs it.
      xIntercepts: [[3, 0, 99]],
    }],
  }],
});

const draftWithOverrides = (diagnosticOverrides) => {
  const broken = brokenAssignment();
  const model = buildAssignmentV5PreflightModel(broken);
  const record = buildIncompleteAssignmentDraftRecord({
    intakeResult: {
      ok: false,
      sourceSchemaVersion: 5,
      parsed: { assignmentV5: broken },
      errors: model.errors,
      warnings: model.warnings,
    },
    rawText: JSON.stringify(broken),
  });
  return {
    ...record,
    teacherReviewContext: { flags: [], diagnosticOverrides },
    blockingDiagnostics: model.diagnostics.filter((d) => d.severity === 'blocking'),
  };
};

test('a forged override cannot finalize an assignment Firestore cannot store', () => {
  const plain = draftWithOverrides([]);
  assert.ok(plain.blockingDiagnostics.length > 0, 'fixture must carry a real technical blocker');

  assert.throws(
    () => finalizeIncompleteAssignmentReview(plain),
    /blocking|incomplete|repair/i,
    'without an override the technical blocker must stop finalisation',
  );

  // Derived from the real diagnostics, so the forged rows key exactly the way a
  // genuine override would. A row copied out of the diagnostics list is the
  // most likely shape a hand-edited document takes.
  const forged = plain.blockingDiagnostics.map((diagnostic) => ({
    diagnosticCode: diagnostic.code,
    questionId: diagnostic.questionId ?? null,
    reason: 'Reviewed; I believe this is a false positive.',
    assignmentRevision: 1,
  }));

  assert.throws(
    () => finalizeIncompleteAssignmentReview(draftWithOverrides(forged)),
    /blocking|incomplete|repair/i,
    'a technical blocker is not override-eligible, so a stored override must not promote it to Ready',
  );
});

console.log('assignmentFinalizeOverrideSafety.test.mjs: all assertions passed');
