import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { deriveAssignmentAuthoringState } from '../../src/platform/preflight/assignmentAuthoringState.js';
import { recordTeacherDiagnosticOverride } from '../../src/platform/preflight/assignmentRepairTriage.js';

/*
 * AN OVERRIDE THAT DOES NOT CHANGE READINESS IS THEATRE.
 *
 * The Repair Center greys out an overridden finding and tells the teacher it is
 * "not blocking publication". If readiness ignores overrides, that sentence is
 * simply false: the assignment stays Incomplete, it can never reach Ready, and
 * the teacher has done exactly what the screen asked with no effect and no
 * explanation. A UI that lies about what a control did is worse than one that
 * offers no control.
 *
 * The reverse matters more. Overrides live in a Firestore document that a
 * teacher's client writes, so the stored list is not evidence that anything was
 * ever eligible. Eligibility is re-derived at readiness time: a technical
 * blocker means the question cannot be stored or delivered, and a platform
 * defect means MathMaster is broken, and no entry in a document makes either of
 * those publishable.
 */

const blocking = (overrides = {}) => ({
  severity: 'blocking',
  source: 'semantic',
  code: 'semantic.rigor',
  message: 'Needs a stronger mathematical requirement.',
  questionId: 'q-1',
  issueKind: 'assignmentIssue',
  ...overrides,
});

const overridesFor = (diagnostic) => recordTeacherDiagnosticOverride({ flags: [] }, diagnostic, {
  reason: 'Reviewed: the validator applies the wrong rule to this representation.',
  assignmentRevision: 3,
}).diagnosticOverrides;

const stateFor = (diagnostics, diagnosticOverrides = []) => deriveAssignmentAuthoringState({
  diagnostics,
  teacherFlags: [],
  diagnosticOverrides,
});

test('an overridden quality blocker stops blocking readiness', () => {
  const quality = blocking();
  assert.equal(stateFor([quality]), 'incomplete', 'without an override it must still block');
  assert.equal(stateFor([quality], overridesFor(quality)), 'ready', 'the override must actually reach readiness');
});

test('a forged override cannot publish a technical blocker or a platform defect', () => {
  const technical = blocking({ source: 'persistence', code: 'persistence.nested-array', questionId: 'q-2' });
  const platform = blocking({ code: 'semantic.grading-mismatch', questionId: 'q-3', issueKind: 'platformIssue', componentId: 'stepAlgebra2' });

  // Shaped exactly like a real stored override, because that is all a corrupted
  // or hand-edited document would ever be.
  const forged = [
    { diagnosticCode: 'persistence.nested-array', questionId: 'q-2', reason: 'ignore it' },
    { diagnosticCode: 'semantic.grading-mismatch', questionId: 'q-3', reason: 'ignore it' },
  ];

  assert.equal(stateFor([technical], forged), 'incomplete', 'a stored entry must not make an unstorable question publishable');
  assert.equal(stateFor([platform], forged), 'incomplete', 'a stored entry must not publish a question MathMaster renders wrongly');
});

test('an override for one question does not clear the same code on another', () => {
  const first = blocking({ questionId: 'q-1' });
  const second = blocking({ questionId: 'q-9' });
  assert.equal(stateFor([first, second], overridesFor(first)), 'incomplete', 'overrides are per question, not per diagnostic code');
});

/*
 * The Repair Center computes readiness from its own live review context. Drop
 * that argument and every override applies on screen and disappears on reload.
 */
test('the Repair Center computes readiness with the review context', () => {
  const source = readFileSync(
    new URL('../../src/components/teacher/IncompleteAssignmentRepairCenter.jsx', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('const preflightModel = useMemo(');
  assert.notEqual(start, -1, 'preflightModel memo not found');
  const memo = source.slice(start, source.indexOf('const repairCenterModel', start));

  assert.match(memo, /buildAssignmentV5PreflightModel\(\s*assignmentV5,\s*\{\s*teacherReviewContext\s*\}/);
  assert.match(memo, /\[assignmentV5, teacherReviewContext\]/, 'readiness must recompute when an override is added');
});

console.log('assignmentOverrideReadiness.test.mjs: all assertions passed');
