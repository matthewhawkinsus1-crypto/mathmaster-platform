import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PREFLIGHT_STEP_IDS, blockersForStep, collectReviewBlockers, describeHonorsGap,
  stepIndex, summarizePreflightReadiness,
} from '../../src/components/teacher/preflightSteps.js';
import { HONORS_DEPTH_AREAS, HONORS_DEPTH_REQUIRED, inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';

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

test('a CCMR-only Honors gap does not block because audited Practice is sourced at publish', () => {
  const blockers = collectReviewBlockers({
    draft: validDraft,
    classPeriods: ['Period 1'],
    honorsSelected: true,
    honorsReport: {
      isHonorsReady: false,
      missing: ['ccmrEnrichment'],
    },
  });
  assert.deepEqual(blockers, []);
});

test('non-CCMR Honors depth still blocks before publish', () => {
  const blockers = collectReviewBlockers({
    draft: validDraft,
    classPeriods: ['Period 1'],
    honorsSelected: true,
    honorsReport: {
      isHonorsReady: false,
      missing: ['higherOrderReasoning', 'ccmrEnrichment'],
    },
  });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].stepId, 'classes');
  assert.match(blockers[0].message, /higher-order reasoning/);
});

test('Core TEKS blocker is named explicitly instead of looking like a generic depth failure', () => {
  const blockers = collectReviewBlockers({
    draft: validDraft,
    classPeriods: ['Period 1'],
    honorsSelected: true,
    honorsReport: {
      isHonorsReady: false,
      missing: ['coreTeks', 'ccmrEnrichment'],
    },
  });
  assert.equal(blockers.length, 1);
  assert.match(blockers[0].message, /Core TEKS alignment/);
  assert.doesNotMatch(blockers[0].message, /CCMR/);
});

/*
 * "Fix: multiple representations, modeling / application." stopped Algebra II
 * Honors — Dividing Polynomials, which was ONE depth area short: Honors needs
 * three of the four, it had two, and either missing area would do. The
 * message now states the rule, what the assignment has, and how many more of
 * which areas to add.
 */
const depthReport = (present) => ({
  isHonorsReady: false,
  isNarrowCheckpoint: false,
  missing: [...HONORS_DEPTH_AREAS.filter((key) => !present.includes(key)), 'ccmrEnrichment'],
});
const COUNTS = { one: 1, two: 2, three: 3 };
const AREA_OF_LABEL = {
  'higher-order reasoning': 'higherOrderReasoning',
  'multiple representations': 'multipleRepresentations',
  'explanation / justification': 'justification',
  'modeling / application': 'modelingApplication',
};
// Every way to pick `count` items from `list`.
const choices = (list, count) => (count === 0
  ? [[]]
  : list.flatMap((item, index) => choices(list.slice(index + 1), count - 1).map((rest) => [item, ...rest])));
// What the message asks a teacher to add: a DOK 3 question by name, and how many of which areas.
const askedFor = (message) => {
  const choose = message.match(/(?:Then add|Add) (one|two|three) of: ([^.]+)\./);
  return {
    reasoning: /Add at least one DOK 3 question/.test(message),
    count: choose ? COUNTS[choose[1]] : 0,
    options: choose ? choose[2].split(/, | or /).map((label) => AREA_OF_LABEL[label] || `unknown label "${label}"`) : [],
  };
};

test('an Honors class one depth area short is told to add ONE area, either of the missing ones', () => {
  const [blocker] = collectReviewBlockers({
    draft: validDraft,
    classPeriods: ['Period 1'],
    honorsSelected: true,
    honorsReport: depthReport(['higherOrderReasoning', 'justification']),
  });
  assert.equal(blocker.stepId, 'classes');
  assert.match(blocker.message, /^An Honors class is selected\. Honors needs 3 of the 4 depth areas, and this assignment has 2 \(higher-order reasoning, explanation \/ justification\)\./);
  assert.match(blocker.message, /Add one of: multiple representations or modeling \/ application\.$/);
  assert.doesNotMatch(blocker.message, /Fix: multiple representations, modeling/, 'the old list read as two things to build');
});

test('following the Honors message is exactly enough: never more than the rule needs, never less', () => {
  // Every combination of the four depth areas an assignment can have.
  for (let mask = 0; mask < 2 ** HONORS_DEPTH_AREAS.length; mask += 1) {
    const present = HONORS_DEPTH_AREAS.filter((_, index) => mask & (2 ** index));
    const hasReasoning = present.includes('higherOrderReasoning');
    const ready = hasReasoning && present.length >= HONORS_DEPTH_REQUIRED;
    const message = describeHonorsGap(depthReport(present));
    if (ready) {
      assert.equal(message, '', `${present}: depth is met, so the depth rule asks for nothing`);
      continue;
    }
    const asked = askedFor(message);
    assert.equal(asked.reasoning, !hasReasoning, `${present}: a DOK 3 question is asked for exactly when there is none`);
    const fewest = (hasReasoning ? 0 : 1) + Math.max(0, HONORS_DEPTH_REQUIRED - present.length - (hasReasoning ? 0 : 1));
    assert.equal((asked.reasoning ? 1 : 0) + asked.count, fewest, `${present}: ${message}`);
    // The options are exactly the missing areas other than higher-order reasoning,
    // which is asked for by name instead.
    if (asked.count) {
      assert.deepEqual(asked.options, HONORS_DEPTH_AREAS.filter((key) => key !== 'higherOrderReasoning' && !present.includes(key)), message);
      assert.ok(asked.options.length >= asked.count, message);
    }
    // Adding what was asked, whichever of the options a teacher picks, passes the real rule.
    for (const picked of choices(asked.options, asked.count)) {
      const after = new Set([...present, ...(asked.reasoning ? ['higherOrderReasoning'] : []), ...picked]);
      assert.ok(after.has('higherOrderReasoning') && after.size >= HONORS_DEPTH_REQUIRED, `${present} + ${picked}: ${message}`);
    }
  }
});

test('the message reads the report inspectHonorsRigor actually returns', () => {
  // DOK 3 work and an "explain" prompt: two depth areas, no table or graph, no context.
  const report = inspectHonorsRigor([
    { activityRole: 'classwork', standard: 'A2.7C', dok: 3, prompt: 'Divide $x^3 - 1$ by $x - 1$.' },
    { activityRole: 'practice', standard: 'A2.7C', dok: 2, prompt: 'Explain why the remainder is 0.' },
  ], { allowNarrowCheckpoint: true });
  assert.equal(report.depthCount, 2);
  const [blocker] = collectReviewBlockers({ draft: validDraft, honorsSelected: true, honorsReport: report });
  assert.match(blocker.message, /has 2 \(higher-order reasoning, explanation \/ justification\)\. Add one of: multiple representations or modeling \/ application\.$/);
});

test('a short Warm-Up or DOL for an Honors class is asked only for its Core TEKS', () => {
  const report = inspectHonorsRigor([
    { activityRole: 'dol', dok: 1, prompt: 'Simplify $\\frac{6x^2}{3x}$.' },
  ], { allowNarrowCheckpoint: true });
  assert.equal(report.isNarrowCheckpoint, true);
  assert.equal(report.isHonorsReady, false);
  const [blocker] = collectReviewBlockers({ draft: validDraft, honorsSelected: true, honorsReport: report });
  assert.equal(blocker.message, 'An Honors class is selected. Core TEKS alignment is missing: align at least one question to a Core TEKS.');
});

test('an Honors assignment that meets the depth rule is not blocked for an optional area it lacks', () => {
  // Three of four with higher-order reasoning; multiple representations and
  // CCMR missing. The CCMR gap is the Honors version's to fill, so the depth
  // rule has nothing to ask. This used to block with "Fix: multiple representations."
  const blockers = collectReviewBlockers({
    draft: validDraft,
    honorsSelected: true,
    honorsReport: { isHonorsReady: false, depthCount: 3, missing: ['multipleRepresentations', 'ccmrEnrichment'] },
  });
  assert.deepEqual(blockers, []);
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
