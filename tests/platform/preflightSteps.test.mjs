import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PREFLIGHT_STEP_IDS, blockersForStep, collectReviewBlockers,
  stepIndex, summarizePreflightReadiness,
} from '../../src/components/teacher/preflightSteps.js';

const validDraft = {
  title: 'Lesson 1',
  dueAt: '2026-09-01T16:00',
  lateDueAt: '2026-09-03T23:59',
  assignedClassIds: ['class-1'],
  assignedClassPeriods: ['Period 1'],
};

const messagesOf = (blockers) => blockers.map((entry) => entry.message);

test('a complete draft has nothing blocking it', () => {
  assert.deepEqual(collectReviewBlockers({ draft: validDraft, classPeriods: ['Period 1'] }), []);
  const readiness = summarizePreflightReadiness({ blockers: [], validationErrors: [] });
  assert.equal(readiness.canCreate, true);
  assert.equal(readiness.firstBlockedStep, null);
});

test('every blocker names the step that can fix it', () => {
  // An empty draft is now a LIBRARY save, so the only thing missing is a title.
  // Selecting no class stopped being a blocker when saving unassigned became a
  // supported action; it is the other path, not an error.
  const library = collectReviewBlockers({ draft: {}, classPeriods: ['Period 1'] });
  assert.deepEqual(messagesOf(library), ['Give the assignment a title.']);

  // An assigning draft still has to satisfy several steps at once.
  const assigning = collectReviewBlockers({
    draft: { assignedClassIds: ['class-1'], assignedClassPeriods: ['Period 1'], dolEnabled: true, dolMinutesBeforeEnd: 90 },
    classPeriods: ['Period 1'],
    honorsSelected: true,
    honorsReport: { isHonorsReady: false },
  });
  assert.ok(assigning.length >= 3);
  assert.ok(assigning.every((entry) => PREFLIGHT_STEP_IDS.includes(entry.stepId)),
    'a blocker with no step would be invisible on the phone layout');
  assert.ok(assigning.some((entry) => entry.stepId === 'details'));
  assert.ok(assigning.some((entry) => entry.stepId === 'classes'));
  assert.ok(assigning.some((entry) => entry.stepId === 'delivery'));
});

test('the late date must be after the due date', () => {
  const blockers = collectReviewBlockers({
    draft: { ...validDraft, lateDueAt: '2026-08-30T23:59' },
    classPeriods: ['Period 1'],
  });
  assert.deepEqual(messagesOf(blockers), ['The final late due date must be after the regular due date.']);
  assert.equal(blockers[0].stepId, 'details');
});

test('a release time after the due date is caught', () => {
  // Otherwise the assignment silently appears already late, and the teacher
  // hears about it from thirty students at once.
  const blockers = collectReviewBlockers({
    draft: { ...validDraft, releaseAt: '2026-09-02T08:00' },
    classPeriods: ['Period 1'],
  });
  assert.ok(messagesOf(blockers).some((message) => /never see it open/.test(message)));
});

test('an unparseable date is treated as a blocker, not silently accepted', () => {
  const blockers = collectReviewBlockers({
    draft: { ...validDraft, lateDueAt: 'whenever' },
    classPeriods: ['Period 1'],
  });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].stepId, 'details');
});

test('Honors destinations block until the rigor report is satisfied', () => {
  const blockers = collectReviewBlockers({
    draft: validDraft,
    classPeriods: ['Period 1'],
    honorsSelected: true,
    honorsReport: { isHonorsReady: false },
  });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].stepId, 'classes');

  assert.deepEqual(collectReviewBlockers({
    draft: validDraft, classPeriods: ['Period 1'],
    honorsSelected: true, honorsReport: { isHonorsReady: true },
  }), []);
});

test('the DOL window is range checked only when the DOL is on', () => {
  const off = collectReviewBlockers({ draft: { ...validDraft, dolMinutesBeforeEnd: 999 }, classPeriods: ['Period 1'] });
  assert.deepEqual(off, [], 'a stale value on a disabled DOL is not a blocker');

  const on = collectReviewBlockers({
    draft: { ...validDraft, dolEnabled: true, dolMinutesBeforeEnd: 999 },
    classPeriods: ['Period 1'],
  });
  assert.equal(on.length, 1);
  assert.equal(on[0].stepId, 'delivery');
});

test('bundle validation errors land on the Check step', () => {
  const readiness = summarizePreflightReadiness({
    blockers: [],
    validationErrors: ['Activity 1: question 3 has no prompt'],
    bundleIsValid: false,
  });
  assert.equal(readiness.canCreate, false);
  assert.equal(readiness.countByStep.check, 1);
  assert.equal(readiness.firstBlockedStep, 'check');
  assert.equal(blockersForStep(readiness, 'check').length, 1);
});

test('readiness counts per step so a phone can badge the right one', () => {
  const readiness = summarizePreflightReadiness({
    blockers: collectReviewBlockers({
      draft: { assignedClassIds: ['class-1'], assignedClassPeriods: ['Period 1'], dolEnabled: true, dolMinutesBeforeEnd: 90 },
      classPeriods: ['Period 1'],
      honorsSelected: true,
      honorsReport: { isHonorsReady: false },
    }),
    validationErrors: ['bundle problem'],
  });
  // title + due date
  assert.equal(readiness.countByStep.details, 2);
  assert.equal(readiness.countByStep.classes, 1);
  assert.equal(readiness.countByStep.delivery, 1);
  assert.equal(readiness.countByStep.check, 1);
  assert.equal(readiness.total, 5);
  assert.equal(readiness.firstBlockedStep, 'details', 'send the teacher to the earliest problem');
  assert.equal(readiness.canCreate, false);
});

test('a valid bundle with no blockers can create', () => {
  const readiness = summarizePreflightReadiness({ blockers: [], validationErrors: [], bundleIsValid: true });
  assert.equal(readiness.canCreate, true);
});

test('steps are ordered and indexable', () => {
  assert.deepEqual(PREFLIGHT_STEP_IDS, ['details', 'classes', 'delivery', 'check']);
  assert.equal(stepIndex('delivery'), 2);
  assert.equal(stepIndex('nonsense'), 0, 'an unknown step falls back to the first rather than to -1');
});

test('hostile input never throws', () => {
  for (const bad of [null, undefined, 42, 'x', []]) {
    assert.doesNotThrow(() => collectReviewBlockers(bad === undefined ? undefined : { draft: bad }));
    assert.doesNotThrow(() => summarizePreflightReadiness({ blockers: bad, validationErrors: bad }));
  }
  assert.doesNotThrow(() => summarizePreflightReadiness());
  assert.deepEqual(blockersForStep(null, 'details'), []);
});
