/*
 * A REUSED assignmentKEY IS CAUGHT IN REVIEW, NOT ONLY AT CREATE (TT10).
 *
 * Create refuses an assignmentKey another saved assignment already uses (or a
 * split of it, "key:course:level"). That was the one remaining check that ran
 * only when the teacher pressed Create, after they had finished Review. Review
 * now asks the same question, from the same function, and holds Create on the
 * Details step with the reason.
 *
 * The question and the blocker are plain functions and run here. Review and
 * Create are components inside .jsx, so their wiring is asserted on source,
 * bound to the region that does the work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { destinationAssignmentKey, findAssignmentKeyConflict } from '../../src/assignmentDestinations.js';
import { blockersForStep, collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';
import { componentSource, region } from './helpers/sourceContract.mjs';

const validDraft = {
  title: 'Lesson 1',
  dueAt: '2026-09-01T16:00',
  lateDueAt: '2026-09-03T23:59',
  assignedClassIds: ['class-1'],
  assignedClassPeriods: ['Period 1'],
};
const saved = (...keys) => keys.map((assignmentKey, index) => ({ id: `a${index}`, assignmentKey }));

test('a key is taken by the same key, or by a split of it — and by nothing that only starts with the same letters', () => {
  const assignments = saved('alg1.m2.slope', null, undefined, '', 'alg1.m3.lines:algebra1:honors');
  assert.equal(findAssignmentKeyConflict({ assignments, assignmentKey: 'alg1.m2.slope' })?.id, 'a0', 'the same key');
  assert.equal(findAssignmentKeyConflict({ assignments, assignmentKey: 'alg1.m3.lines' })?.id, 'a4', 'a split of it ("key:course:level") holds the key');
  assert.equal(findAssignmentKeyConflict({ assignments, assignmentKey: ' alg1.m2.slope ' })?.id, 'a0', 'spaces around the key do not hide it');
  // Not a conflict.
  assert.equal(findAssignmentKeyConflict({ assignments, assignmentKey: 'alg1.m2' }), null, 'a key that is only the start of another is free');
  assert.equal(findAssignmentKeyConflict({ assignments, assignmentKey: 'alg1.m2.slope.extra' }), null);
  assert.equal(findAssignmentKeyConflict({ assignments, assignmentKey: 'alg1.m3.lines:algebra1:honors:extra' }), null, 'a longer key is free: only an exact match, or a saved key that starts with it and a colon, holds it');
  assert.equal(findAssignmentKeyConflict({ assignments, assignmentKey: 'ALG1.M2.SLOPE' }), null, 'keys are compared exactly');
});

test('no key, no list, or an odd list is never a conflict and never throws', () => {
  const assignments = saved('k1');
  for (const assignmentKey of [null, undefined, '', '   ']) assert.equal(findAssignmentKeyConflict({ assignments, assignmentKey }), null);
  for (const list of [undefined, null, 'k1', {}, [null, undefined, 7]]) assert.equal(findAssignmentKeyConflict({ assignments: list, assignmentKey: 'k1' }), null);
  assert.equal(findAssignmentKeyConflict(), null);
});

test('a key a split would write is the key the check looks for', () => {
  // Create saves a two-destination assignment as "key:course:level". A second
  // import of the same file asks about "key", and the saved split holds it.
  const destinations = [{ course: 'algebra1', courseLevel: 'standard' }, { course: 'algebra1', courseLevel: 'honors' }];
  const written = destinations.map((destination) => ({ assignmentKey: destinationAssignmentKey({ assignmentKey: 'alg1.m2.slope', destination, destinationCount: 2 }) }));
  assert.ok(findAssignmentKeyConflict({ assignments: written, assignmentKey: 'alg1.m2.slope' }));
  // And a single destination writes the key as it was.
  const single = [{ assignmentKey: destinationAssignmentKey({ assignmentKey: 'alg1.m2.slope', destination: destinations[0], destinationCount: 1 }) }];
  assert.ok(findAssignmentKeyConflict({ assignments: single, assignmentKey: 'alg1.m2.slope' }));
});

test('Review holds Create on the Details step and says which key, and nothing else changes when the key is free', () => {
  assert.deepEqual(collectReviewBlockers({ draft: validDraft, classPeriods: ['Period 1'], duplicateAssignmentKey: '' }), []);
  assert.deepEqual(collectReviewBlockers({ draft: validDraft, classPeriods: ['Period 1'] }), [], 'callers that know nothing of keys are unaffected');

  const blockers = collectReviewBlockers({ draft: validDraft, classPeriods: ['Period 1'], duplicateAssignmentKey: 'alg1.m2.slope' });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].stepId, 'details', 'the step a phone badges');
  assert.match(blockers[0].message, /"alg1\.m2\.slope"/, 'it names the key');
  assert.match(blockers[0].message, /assignment\.assignmentKey/, 'and the field to change');
  const readiness = summarizePreflightReadiness({ blockers, validationErrors: [], bundleIsValid: true });
  assert.equal(readiness.canCreate, false);
  assert.equal(readiness.firstBlockedStep, 'details');
  assert.equal(blockersForStep(readiness, 'details').length, 1);
  assert.equal(summarizePreflightReadiness({ blockers: [], validationErrors: [], bundleIsValid: true }).canCreate, true);
});

test('Review asks with the same function Create uses, never for a setup edit, and Create still refuses', () => {
  const modal = componentSource('src/components/teacher/LessonPreflightModal.jsx');
  const asked = region(modal, 'const duplicateAssignmentKey = useMemo(() => {', '  const readiness = useMemo(', 'Review duplicate key');
  assert.match(asked, /if \(reviewMode === 'update'\) return '';/, 'a setup edit keeps its own key');
  assert.match(asked, /findAssignmentKeyConflict\(\{ assignments: existingAssignments, assignmentKey: key \}\)/);
  assert.match(asked, /effectiveAssignmentV5\.assignment\?\.assignmentKey/, 'the key Create would write under');
  const readiness = region(modal, 'const readiness = useMemo(', 'The student preview shows either version', 'Review readiness');
  assert.match(readiness, /collectReviewBlockers\(\{[^}]*duplicateAssignmentKey[^}]*\}\)/);
  assert.match(readiness, /\[[^\]]*duplicateAssignmentKey[^\]]*\]\);/, 'recomputed when the answer changes');

  const workspace = componentSource('src/app/teacher/TeacherWorkspace.jsx');
  const mount = region(workspace, '<LessonPreflightModal', '/>', 'Review mount');
  assert.match(mount, /existingAssignments=\{assignments\}/, 'Review is given the list Create checks');
  const create = region(workspace, 'const handleCreateAssignment = async', 'const publishingIntent = normalizeLessonPublishingIntentV5', 'Create');
  assert.match(create, /if \(findAssignmentKeyConflict\(\{ assignments, assignmentKey: sourceAssignmentKey \}\)\) \{\s*throw new Error\(`An assignment with assignmentKey "\$\{sourceAssignmentKey\}" already exists\./);
});
