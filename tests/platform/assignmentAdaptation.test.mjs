// Assignment adaptation, and the three lines it must never cross.
//
// Most of this file is about what adaptation must REFUSE to do. Getting the
// pitching right is the easy half; the half that damages a classroom is
// adaptation that quietly changes what was assigned, quietly makes an
// assessment easier for one student, or quietly sends a student below the
// course inside their teacher's task.

import test from 'node:test';
import assert from 'node:assert/strict';

import { AUTHORED_CEILING } from '../../src/platform/path/recommendationV2.js';
import { INSTRUCTIONAL_BAND } from '../../src/platform/profile/studentLearningProfile.js';
import {
  ROLE_GROUP, VARIATION_MODE,
  adaptationRecord, describeAdaptation, normalizeVariationMode,
  resolveAdaptedTarget, resolveAdaptivePolicy, roleGroupFor,
} from '../../src/platform/assignments/assignmentAdaptation.js';

const question = (overrides = {}) => ({
  questionId: 'q1',
  teks: ['A.5C'],
  dok: 2,
  difficultyBand: 3,
  activityRole: 'practice',
  ...overrides,
});

const profileAt = (stableBand, overrides = {}) => ({
  baseline: { established: true },
  instructionalBand: INSTRUCTIONAL_BAND.ON,
  difficultyProfile: { stableBand },
  dokProfile: {},
  ...overrides,
});

const FRESH = { baseline: { established: false }, difficultyProfile: {}, dokProfile: {} };

// --- Backward compatibility --------------------------------------------------------

test('the legacy vocabulary keeps meaning what it meant', () => {
  // Every assignment saved before this module used 'shared' or 'personalized'.
  // "Personalized" always meant the numbers differ, which is VARIANT.
  assert.equal(normalizeVariationMode('shared'), VARIATION_MODE.SHARED);
  assert.equal(normalizeVariationMode('personalized'), VARIATION_MODE.VARIANT);
  assert.equal(normalizeVariationMode('variant'), VARIATION_MODE.VARIANT);
  assert.equal(normalizeVariationMode('adaptive'), VARIATION_MODE.ADAPTIVE);
});

test('an unknown or missing mode falls back to variant, never to adaptive', () => {
  // Silently upgrading an old assignment into an adaptive one is exactly the
  // change a teacher did not ask for.
  assert.equal(normalizeVariationMode(undefined), VARIATION_MODE.VARIANT);
  assert.equal(normalizeVariationMode(''), VARIATION_MODE.VARIANT);
  assert.equal(normalizeVariationMode('magic'), VARIATION_MODE.VARIANT);
  assert.equal(normalizeVariationMode(null), VARIATION_MODE.VARIANT);
});

test('an old assignment delivers exactly what it always delivered', () => {
  const target = resolveAdaptedTarget({
    question: question(),
    variationMode: 'personalized',
    profile: profileAt(1), // a student far below the assigned band
  });
  assert.equal(target.difficultyBand, 3, 'the assigned band');
  assert.equal(target.dok, 2, 'the assigned depth');
  assert.equal(target.adapted, false);
});

// --- Line 1: the assigned standard is never changed ----------------------------------

test('preserveStandard is not a setting', () => {
  // A teacher assigning A.5C made a curricular decision. Adaptation pitches
  // that standard; it does not substitute another.
  const policies = [
    resolveAdaptivePolicy({ question: question(), variationMode: 'adaptive' }),
    resolveAdaptivePolicy({
      question: question({ adaptivePolicy: { enabled: true, preserveStandard: false } }),
      variationMode: 'adaptive',
    }),
    resolveAdaptivePolicy({
      question: question(), variationMode: 'adaptive',
      teacherPolicy: { preserveStandard: false, differentiatedAssessment: true },
    }),
  ];
  policies.forEach((policy) => assert.equal(policy.preserveStandard, true));
});

test('the record asserts the standard survived, rather than leaving it to be inferred', () => {
  const target = resolveAdaptedTarget({ question: question(), variationMode: 'adaptive', profile: profileAt(2) });
  const record = adaptationRecord({ target, teksCode: 'A.5C', studentId: 's1' });
  assert.equal(record.teksCode, 'A.5C');
  assert.equal(record.standardPreserved, true);
});

// --- Line 2: assessment rigor is not levelled per student ----------------------------

test('a DOL is the same rigor for every student', () => {
  // The whole point of a DOL is comparable independent evidence. A version
  // pitched per student is not evidence of the same thing.
  const strong = resolveAdaptedTarget({
    question: question({ activityRole: 'dol' }), variationMode: 'adaptive', profile: profileAt(4),
  });
  const weak = resolveAdaptedTarget({
    question: question({ activityRole: 'dol' }), variationMode: 'adaptive', profile: profileAt(1),
  });
  assert.equal(strong.difficultyBand, weak.difficultyBand);
  assert.equal(strong.dok, weak.dok);
  assert.equal(strong.adapted, false);
  assert.equal(strong.reason, 'assessment_rigor_is_the_same_for_every_student');
});

test('quizzes and tests behave the same way as a DOL', () => {
  ['quiz', 'test', 'assessment', 'formative'].forEach((role) => {
    const target = resolveAdaptedTarget({
      question: question({ activityRole: role }), variationMode: 'adaptive', profile: profileAt(4),
    });
    assert.equal(target.adapted, false, `${role} adapted, and must not`);
  });
});

test('an assessment can only open up when a teacher says so out loud', () => {
  // Not inferred from a class setting, a student profile, or an author's
  // default. A deliberate, named choice.
  const closed = resolveAdaptivePolicy({
    question: question({ activityRole: 'quiz' }), variationMode: 'adaptive',
  });
  const opened = resolveAdaptivePolicy({
    question: question({ activityRole: 'quiz' }), variationMode: 'adaptive',
    teacherPolicy: { differentiatedAssessment: true },
  });
  assert.equal(closed.enabled, false);
  assert.deepEqual(closed.difficultyRange, [3, 3], 'the range collapses to the assigned value');
  assert.equal(opened.enabled, true);
  assert.equal(opened.differentiatedAssessment, true);
});

test('even a differentiated assessment stays inside the authored envelope', () => {
  const target = resolveAdaptedTarget({
    question: question({ activityRole: 'quiz', adaptivePolicy: { enabled: true, difficultyRange: [3, 4] } }),
    variationMode: 'adaptive',
    teacherPolicy: { differentiatedAssessment: true },
    profile: profileAt(1),
  });
  assert.ok(target.difficultyBand >= 3, `dropped to ${target.difficultyBand}, below the authored floor`);
});

// --- Line 3: no below-course work inside an assignment --------------------------------

test('Foundation Bridge is off inside an assignment, in every mode and role', () => {
  // Below-course work is right, and it belongs in the Path where the student is
  // told it is a route back. Inside an assignment it just replaces the
  // teacher's grade-level task.
  ['practice', 'dol', 'classwork', 'warmup', 'quiz'].forEach((role) => {
    [VARIATION_MODE.SHARED, VARIATION_MODE.VARIANT, VARIATION_MODE.ADAPTIVE].forEach((mode) => {
      const policy = resolveAdaptivePolicy({
        question: question({ activityRole: role, adaptivePolicy: { allowFoundationBridge: true } }),
        variationMode: mode,
        teacherPolicy: { allowFoundationBridge: true },
      });
      assert.equal(policy.allowFoundationBridge, false, `${role}/${mode} allowed a bridge`);
    });
  });
});

// --- Practice: adaptive by default -----------------------------------------------------

test('practice adapts without the teacher remembering to enable it', () => {
  const policy = resolveAdaptivePolicy({ question: question(), variationMode: 'adaptive' });
  assert.equal(policy.enabled, true);
  assert.equal(policy.roleGroup, ROLE_GROUP.PRACTICE);
});

test('a struggling student gets the same standard, pitched lower', () => {
  const target = resolveAdaptedTarget({
    question: question(), variationMode: 'adaptive', profile: profileAt(2),
  });
  assert.equal(target.assignedBand, 3);
  assert.equal(target.difficultyBand, 2, 'one band down, inside the default spread');
  assert.equal(target.adapted, true);
});

test('a strong student gets more depth, not just uglier numbers', () => {
  const target = resolveAdaptedTarget({
    question: question(),
    variationMode: 'adaptive',
    profile: profileAt(3, { dokProfile: { 3: { confident: true, accuracy: 0.85 } } }),
  });
  assert.equal(target.dok, 3);
  assert.equal(target.difficultyBand, 3, 'complexity did not move; demand did');
  assert.equal(target.reason, 'reasoning_evidence_supports_more_depth');
});

test('a recent miss above the stable band is answered inside the assignment', () => {
  // The same rule the Path uses. A wrong answer at Band 4 is evidence about
  // Band 4, and the response is a lower-complexity version of the SAME
  // standard, not a different standard.
  const target = resolveAdaptedTarget({
    question: question({ difficultyBand: 4 }),
    variationMode: 'adaptive',
    profile: profileAt(3),
    recentFailureBand: 4,
  });
  assert.equal(target.difficultyBand, 3);
  assert.equal(target.reason, 'recent_miss_at_higher_complexity_on_this_standard');
});

test('a student with no evidence yet gets exactly what was assigned', () => {
  const target = resolveAdaptedTarget({ question: question(), variationMode: 'adaptive', profile: FRESH });
  assert.equal(target.adapted, false);
  assert.equal(target.difficultyBand, 3);
  assert.equal(target.reason, 'not_enough_evidence_to_adapt_yet');
});

test('a student holding at no band is pitched to the floor, not to a guess', () => {
  const target = resolveAdaptedTarget({
    question: question(),
    variationMode: 'adaptive',
    profile: { baseline: { established: true }, difficultyProfile: { stableBand: null, evidenceCount: 12 }, dokProfile: {} },
  });
  assert.equal(target.difficultyBand, 2, 'the bottom of the default envelope');
  assert.equal(target.reason, 'not_yet_holding_at_any_complexity');
});

// --- Instruction: coherence beats personalisation ---------------------------------------

test('guided work keeps its cognitive demand so the lesson stays coherent', () => {
  // A teacher modelling at the board cannot have half the room on a different
  // kind of thinking.
  ['classwork', 'guidedPractice', 'warmup', 'instruction'].forEach((role) => {
    const policy = resolveAdaptivePolicy({ question: question({ activityRole: role }), variationMode: 'adaptive' });
    assert.deepEqual(policy.dokRange, [2, 2], `${role} allowed DOK to move`);
    assert.equal(policy.roleGroup, ROLE_GROUP.INSTRUCTION);
  });
});

test('guided work still gives one band of accessibility', () => {
  const target = resolveAdaptedTarget({
    question: question({ activityRole: 'classwork' }), variationMode: 'adaptive', profile: profileAt(2),
  });
  assert.equal(target.difficultyBand, 2);
  assert.equal(target.dok, 2, 'the thinking is unchanged');
});

// --- Envelopes ---------------------------------------------------------------------------

test('an author can narrow the envelope', () => {
  const policy = resolveAdaptivePolicy({
    question: question({ adaptivePolicy: { enabled: true, difficultyRange: [3, 3], dokRange: [2, 2] } }),
    variationMode: 'adaptive',
  });
  assert.deepEqual(policy.difficultyRange, [3, 3]);
  const target = resolveAdaptedTarget({
    question: question({ adaptivePolicy: { enabled: true, difficultyRange: [3, 3] } }),
    variationMode: 'adaptive',
    profile: profileAt(1),
  });
  assert.equal(target.difficultyBand, 3, 'a narrowed envelope is honoured over the profile');
});

test('an envelope can never exceed what the content bank can serve', () => {
  const policy = resolveAdaptivePolicy({
    question: question({ adaptivePolicy: { enabled: true, difficultyRange: [1, 9], dokRange: [1, 9] } }),
    variationMode: 'adaptive',
  });
  assert.equal(policy.difficultyRange[1], AUTHORED_CEILING.difficultyBand);
  assert.equal(policy.dokRange[1], AUTHORED_CEILING.dok);
});

test('a backwards or malformed range falls back rather than inverting', () => {
  const policy = resolveAdaptivePolicy({
    question: question({ adaptivePolicy: { enabled: true, difficultyRange: [4, 2] } }),
    variationMode: 'adaptive',
  });
  assert.ok(policy.difficultyRange[0] <= policy.difficultyRange[1]);
  const junk = resolveAdaptivePolicy({
    question: question({ adaptivePolicy: { enabled: true, difficultyRange: 'wide', dokRange: [null] } }),
    variationMode: 'adaptive',
  });
  assert.ok(junk.difficultyRange[0] <= junk.difficultyRange[1]);
  assert.ok(junk.dokRange[0] <= junk.dokRange[1]);
});

test('an author or a teacher can switch adaptation off, neither can force it on', () => {
  const authorOff = resolveAdaptivePolicy({
    question: question({ adaptivePolicy: { enabled: false } }), variationMode: 'adaptive',
  });
  const teacherOff = resolveAdaptivePolicy({
    question: question(), variationMode: 'adaptive', teacherPolicy: { enabled: false },
  });
  assert.equal(authorOff.enabled, false);
  assert.equal(teacherOff.enabled, false);

  // Neither can turn it on for a DOL.
  const forced = resolveAdaptivePolicy({
    question: question({ activityRole: 'dol', adaptivePolicy: { enabled: true } }),
    variationMode: 'adaptive',
    teacherPolicy: { enabled: true },
  });
  assert.equal(forced.enabled, false);
});

// --- Honors ---------------------------------------------------------------------------------

test('Honors practice may reach for exam-style transfer; Honors assessment may not', () => {
  const practice = resolveAdaptivePolicy({ question: question(), variationMode: 'adaptive', honors: true });
  const dol = resolveAdaptivePolicy({ question: question({ activityRole: 'dol' }), variationMode: 'adaptive', honors: true });
  assert.equal(practice.allowCcmrTransfer, true);
  assert.equal(dol.allowCcmrTransfer, false);
});

test('Honors is not simply more questions', () => {
  const regular = resolveAdaptivePolicy({ question: question(), variationMode: 'adaptive', honors: false });
  const honors = resolveAdaptivePolicy({ question: question(), variationMode: 'adaptive', honors: true });
  assert.deepEqual(regular.difficultyRange, honors.difficultyRange,
    'Honors does not silently raise the assigned rigor — it opens transfer');
});

// --- Transparency -----------------------------------------------------------------------------

test('a teacher can read why two students got different work', () => {
  // The brief's example, in the brief's own shape.
  const weak = resolveAdaptedTarget({ question: question(), variationMode: 'adaptive', profile: profileAt(2) });
  const strong = resolveAdaptedTarget({
    question: question(), variationMode: 'adaptive',
    profile: profileAt(3, { dokProfile: { 3: { confident: true, accuracy: 0.8 } } }),
  });

  const weakText = describeAdaptation(weak);
  const strongText = describeAdaptation(strong);
  assert.match(weakText, /Assigned DOK 2 · Band 3 → received DOK 2 · Band 2/);
  assert.match(strongText, /Assigned DOK 2 · Band 3 → received DOK 3 · Band 3/);
  assert.notEqual(weakText, strongText, 'two students, two different explanations');
});

test('an unadapted question still explains itself', () => {
  const target = resolveAdaptedTarget({ question: question({ activityRole: 'dol' }), variationMode: 'adaptive', profile: profileAt(4) });
  assert.match(describeAdaptation(target), /same rigor for every student/i);
});

test('every reason code has human text — no raw identifiers reach a teacher', () => {
  const cases = [
    resolveAdaptedTarget({ question: question(), variationMode: 'shared', profile: profileAt(3) }),
    resolveAdaptedTarget({ question: question(), variationMode: 'variant', profile: profileAt(3) }),
    resolveAdaptedTarget({ question: question({ activityRole: 'dol' }), variationMode: 'adaptive', profile: profileAt(3) }),
    resolveAdaptedTarget({ question: question(), variationMode: 'adaptive', profile: FRESH }),
    resolveAdaptedTarget({ question: question(), variationMode: 'adaptive', profile: profileAt(2) }),
    resolveAdaptedTarget({ question: question(), variationMode: 'adaptive', profile: profileAt(3) }),
    resolveAdaptedTarget({ question: question({ adaptivePolicy: { enabled: false } }), variationMode: 'adaptive', profile: profileAt(3) }),
  ];
  cases.forEach((target) => {
    const text = describeAdaptation(target);
    assert.ok(text.length > 0);
    assert.ok(!/_/.test(text), `raw reason code leaked to a teacher: "${text}"`);
  });
});

test('the stored record keeps the reason long after the session', () => {
  const target = resolveAdaptedTarget({ question: question(), variationMode: 'adaptive', profile: profileAt(2) });
  const record = adaptationRecord({ target, teksCode: 'A.5C', studentId: 's1' });
  assert.equal(record.assignedBand, 3);
  assert.equal(record.deliveredBand, 2);
  assert.equal(record.adapted, true);
  assert.ok(record.reason.includes('Assigned DOK'));
  assert.equal(record.mode, VARIATION_MODE.ADAPTIVE);
});

// --- Robustness --------------------------------------------------------------------------------

test('an unknown activity role is treated as practice, not as an assessment', () => {
  // Guessing "assessment" would silently disable adaptation everywhere a role
  // was mistyped; guessing "practice" degrades to the platform's normal
  // behaviour, which is the safer wrong answer.
  assert.equal(roleGroupFor('somethingNew'), ROLE_GROUP.PRACTICE);
  assert.equal(roleGroupFor(null), ROLE_GROUP.PRACTICE);
});

test('a question missing DOK or difficulty still resolves to something valid', () => {
  const target = resolveAdaptedTarget({
    question: { teks: ['A.5C'], activityRole: 'practice' },
    variationMode: 'adaptive',
    profile: profileAt(3),
  });
  assert.ok(target.dok >= 1 && target.dok <= AUTHORED_CEILING.dok);
  assert.ok(target.difficultyBand >= 1 && target.difficultyBand <= AUTHORED_CEILING.difficultyBand);
});

test('no combination of inputs produces a target outside the servable range', () => {
  const roles = ['practice', 'classwork', 'dol', 'quiz', 'warmup', 'nonsense'];
  const modes = ['shared', 'personalized', 'variant', 'adaptive', undefined];
  const bands = [1, 2, 3, 4, 5];
  roles.forEach((role) => modes.forEach((mode) => bands.forEach((stableBand) => {
    [true, false].forEach((honors) => {
      const target = resolveAdaptedTarget({
        question: question({ activityRole: role, dok: 3, difficultyBand: 4 }),
        variationMode: mode,
        honors,
        profile: profileAt(stableBand, { dokProfile: { 3: { confident: true, accuracy: 0.95 } } }),
        teacherPolicy: { differentiatedAssessment: true },
      });
      assert.ok(target.difficultyBand >= 1 && target.difficultyBand <= AUTHORED_CEILING.difficultyBand,
        `${role}/${mode}/${stableBand} → band ${target.difficultyBand}`);
      assert.ok(target.dok >= 1 && target.dok <= AUTHORED_CEILING.dok,
        `${role}/${mode}/${stableBand} → dok ${target.dok}`);
    });
  })));
});

test('rubbish in does not throw', () => {
  assert.doesNotThrow(() => resolveAdaptedTarget({}));
  assert.doesNotThrow(() => resolveAdaptedTarget({ question: null, profile: null }));
  assert.equal(describeAdaptation(null), '');
  assert.equal(adaptationRecord({ target: null }), null);
});
