import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPublishable, buildDestinationGroups, canPublishToClassroom,
  destinationAssignmentKey, isLibraryAssignment,
  resolveAssignmentDates, resolveCreationMode,
} from '../../src/assignmentDestinations.js';
import { collectReviewBlockers, describePreflightAction } from '../../src/components/teacher/preflightSteps.js';

const CLASSES = [
  { classId: 'c-1', name: 'Algebra I — 1st', period: '1st', course: 'algebra1', courseLevel: 'standard', status: 'active' },
  { classId: 'c-2', name: 'Algebra I Honors — 2nd', period: '2nd', course: 'algebra1', courseLevel: 'honors', status: 'active' },
  { classId: 'c-3', name: 'Algebra I — 3rd', period: '3rd', course: 'algebra1', courseLevel: 'standard', status: 'active' },
];
const CLASS_PERIODS = CLASSES.map((entry) => entry.period);

// --- Acceptance 1 and 2: save with no classes and no dates ------------------

test('Acceptance 1 — no classes and blank dates is a library save, not an error', () => {
  const draft = { title: 'Attributes and Relations of Functions', assignedClassIds: [] };
  assert.equal(resolveCreationMode(draft), 'library');
  assert.deepEqual(collectReviewBlockers({ draft, classPeriods: CLASS_PERIODS }), []);
  assert.equal(describePreflightAction(draft).action, 'Save to Library');
});

test('Acceptance 2 — a library save carries null dates, never invented ones', () => {
  const dates = resolveAssignmentDates({ mode: 'library', dueValue: '', lateDueValue: '', releaseValue: '' });
  assert.deepEqual(dates, { dueAt: null, lateDueAt: null, dueDate: null, releaseAt: null });
  // Even if the JSON supplied dates, a library save does not take them: the
  // teacher did not choose a class, so there is nobody for them to be due from.
  const ignored = resolveAssignmentDates({ mode: 'library', dueValue: '2026-09-14T15:30', lateDueValue: '2026-09-20T15:30' });
  assert.equal(ignored.dueAt, null);
});

test('an assignment with no class periods reads as a library item', () => {
  assert.equal(isLibraryAssignment({ assignedClassIds: [] }), true);
  assert.equal(isLibraryAssignment({}), true);
  assert.equal(isLibraryAssignment({ assignedClassIds: ['c-1'] }), false);
});

// --- Acceptance 3 to 6: what assigning requires -----------------------------

test('Acceptance 3 — selecting a class makes the due date required', () => {
  const draft = { title: 'T', assignedClassIds: ['c-1'] };
  const blockers = collectReviewBlockers({ draft, classPeriods: CLASS_PERIODS });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].message, 'Set a due date before assigning this to students.');
  assert.equal(blockers[0].stepId, 'details');
  assert.equal(describePreflightAction(draft).action, 'Create & Assign');
});

test('Acceptance 4 — a class plus a valid due date is enough', () => {
  const draft = { title: 'T', assignedClassIds: ['c-1'], dueAt: '2026-09-14T15:30' };
  assert.deepEqual(collectReviewBlockers({ draft, classPeriods: CLASS_PERIODS }), []);
});

test('Acceptance 5 — a blank late date no longer blocks', () => {
  const dates = resolveAssignmentDates({ mode: 'assign', dueValue: '2026-09-14T15:30:00Z', lateDueValue: '' });
  assert.ok(dates.dueAt);
  assert.equal(dates.lateDueAt, null, 'no late window means practice after the due date, not a block');
});

test('Acceptance 6 — a late date on or before the due date is rejected', () => {
  assert.throws(
    () => resolveAssignmentDates({ mode: 'assign', dueValue: '2026-09-14T15:30:00Z', lateDueValue: '2026-09-13T15:30:00Z' }),
    /later than the regular due date/,
  );
  const draft = { title: 'T', assignedClassIds: ['c-1'], dueAt: '2026-09-14T15:30', lateDueAt: '2026-09-14T15:30' };
  assert.equal(collectReviewBlockers({ draft, classPeriods: CLASS_PERIODS }).length, 1);
});

test('assigning with no due date throws the teacher-facing message', () => {
  assert.throws(
    () => resolveAssignmentDates({ mode: 'assign', dueValue: '', lateDueValue: '' }),
    /Set a due date before assigning this to students/,
  );
});

test('a release time after the due date is rejected', () => {
  assert.throws(
    () => resolveAssignmentDates({
      mode: 'assign', dueValue: '2026-09-14T15:30:00Z', lateDueValue: '', releaseValue: '2026-09-15T08:00:00Z',
    }),
    /before the due date/,
  );
});

// --- Acceptance 7: an unassigned assignment cannot be published -------------

test('Acceptance 7 — a library item cannot be posted to Google Classroom', () => {
  assert.throws(() => assertPublishable({ assignedClassIds: [], dueAt: null }), /not assigned to any class/);
  assert.equal(canPublishToClassroom({ assignedClassIds: [], dueAt: null }), false);
  // Assigned but somehow dateless is also refused, with its own reason.
  assert.throws(() => assertPublishable({ assignedClassIds: ['c-1'], dueAt: null }), /no due date/);
  assert.equal(canPublishToClassroom({ assignedClassIds: ['c-1'], dueAt: '2026-09-14T15:30:00Z' }), true);
});

// --- Acceptance 8: the split logic is shared, not duplicated ----------------

test('Acceptance 8 — one destination for a single-rigor selection', () => {
  const groups = buildDestinationGroups({ assignedClassIds: ['c-1', 'c-3'], classes: CLASSES });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].courseLevel, 'standard');
  assert.deepEqual(groups[0].periods, ['1st', '3rd']);
});

test('Acceptance 8 — a mixed Standard/Honors selection splits into two', () => {
  const groups = buildDestinationGroups({ assignedClassIds: ['c-1', 'c-2'], classes: CLASSES });
  assert.equal(groups.length, 2);
  const levels = groups.map((group) => group.courseLevel).sort();
  assert.deepEqual(levels, ['honors', 'standard']);
});

test('a library save produces no destinations, which is the correct answer', () => {
  // Not an error and not a default. Nobody has been given it, so there is
  // nothing to split — and materialising a Standard variant now would be wrong
  // the moment the teacher assigns it to an Honors class.
  assert.deepEqual(buildDestinationGroups({ assignedClassIds: [], classes: CLASSES }), []);
});

test('assignmentKey is only qualified when the destination actually splits', () => {
  const destination = { course: 'algebra1', courseLevel: 'honors' };
  assert.equal(
    destinationAssignmentKey({ assignmentKey: 'alg2.m1.functions', destination, destinationCount: 1 }),
    'alg2.m1.functions',
  );
  assert.equal(
    destinationAssignmentKey({ assignmentKey: 'alg2.m1.functions', destination, destinationCount: 2 }),
    'alg2.m1.functions:algebra1:honors',
  );
  assert.equal(destinationAssignmentKey({ assignmentKey: null, destination, destinationCount: 2 }), null);
});

test('an unknown class ID fails closed rather than silently dropping the audience', () => {
  assert.throws(
    () => buildDestinationGroups({ assignedClassIds: ['c-missing'], classes: CLASSES }),
    /no longer exist or are archived/i,
  );
});

// --- Regressions the change could plausibly cause ---------------------------

test('the title is still required for both actions', () => {
  ['library', 'assign'].forEach((mode) => {
    const draft = {
      title: '   ',
      assignedClassIds: mode === 'assign' ? ['c-1'] : [],
      dueAt: mode === 'assign' ? '2026-09-14T15:30' : null,
    };
    const blockers = collectReviewBlockers({ draft, classPeriods: CLASS_PERIODS });
    assert.ok(blockers.some((entry) => entry.message === 'Give the assignment a title.'), `${mode} must still require a title`);
  });
});

test('the Honors rigor blocker still fires', () => {
  const blockers = collectReviewBlockers({
    draft: { title: 'T', assignedClassIds: ['c-2'], dueAt: '2026-09-14T15:30' },
    classPeriods: CLASS_PERIODS,
    honorsSelected: true,
    honorsReport: { isHonorsReady: false },
  });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].stepId, 'classes');
});

test('the DOL window blocker still fires', () => {
  const blockers = collectReviewBlockers({
    draft: { title: 'T', assignedClassIds: ['c-1'], dueAt: '2026-09-14T15:30', dolEnabled: true, dolMinutesBeforeEnd: 90 },
    classPeriods: CLASS_PERIODS,
  });
  assert.ok(blockers.some((entry) => entry.stepId === 'delivery'));
});

test('a null draft does not throw', () => {
  assert.doesNotThrow(() => collectReviewBlockers({ draft: null, classPeriods: CLASS_PERIODS }));
  assert.equal(describePreflightAction(null).mode, 'library');
});
