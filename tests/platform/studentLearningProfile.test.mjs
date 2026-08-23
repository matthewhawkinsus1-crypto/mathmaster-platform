// One profile, and the rules that keep it honest.
//
// The repository already held four independently written tables mapping the
// same mastery status to the same labels, two same-named `resolveAdaptiveRigor`
// functions with different shapes, and five vocabularies for confidence. This
// module is the single derived view that replaces guessing on each screen — so
// the tests are mostly about what it must REFUSE to say.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASELINE, BASELINE_REQUIREMENT, ENGAGEMENT, GAP, INSTRUCTIONAL_BAND, PERFORMANCE_PROJECTION,
  buildDifficultyProfile, buildDokProfile, buildStudentLearningProfile, buildTransferProfile,
  deriveEngagement, deriveInstructionalBand, diagnoseGaps, evaluateBaseline,
  isClassifyingEvidence, stabilizeBand,
} from '../../src/platform/profile/studentLearningProfile.js';

const evidence = ({ dok = 2, band = 3, correct = true, skill = 'A.5A', role = 'practice', framework = null, extra = {} } = {}) => ({
  performance: { status: 'finalized', isCorrect: correct },
  questionSnapshot: { dok, difficultyBand: band },
  alignmentKeys: [`texas:${skill}`],
  source: { activityRole: role, ...(framework ? { assessmentFramework: framework } : {}) },
  ...extra,
});

const many = (count, options) => Array.from({ length: count }, () => evidence(options));

// --- Completion is not mastery -------------------------------------------------

test('an unfinished question is missing evidence, not wrong evidence', () => {
  // The single most important rule in the brief: not completing work must never
  // become a mastery failure.
  const opened = { ...evidence(), performance: { status: 'attempted', isCorrect: false } };
  assert.equal(isClassifyingEvidence(opened), false,
    'a question the student never finished cannot classify them');
});

test('a teacher force-correct is not the student\'s mathematics', () => {
  const forced = evidence({ extra: { teacherForced: true } });
  assert.equal(isClassifyingEvidence(forced), false);
});

test('modified work measures a different construct and is excluded', () => {
  const modified = { ...evidence(), supportUsage: { modified: true } };
  assert.equal(isClassifyingEvidence(modified), false);
});

test('a finished, unmodified, unforced attempt does classify — right or wrong', () => {
  assert.equal(isClassifyingEvidence(evidence({ correct: true })), true);
  assert.equal(isClassifyingEvidence(evidence({ correct: false })), true,
    'a genuine wrong answer IS evidence; only absence is not');
});

// --- Baseline -------------------------------------------------------------------

test('a brand-new student is never labelled', () => {
  const profile = buildStudentLearningProfile({ evidenceEvents: many(4, {}) });
  assert.equal(profile.instructionalBand, INSTRUCTIONAL_BAND.BASELINE);
  assert.equal(profile.performanceProjection, PERFORMANCE_PROJECTION.BASELINE);
  assert.equal(profile.instructionalBandLabel, 'Establishing Baseline');
});

test('baseline needs breadth, not just volume', () => {
  // Twenty questions on one skill from one activity is not a picture of a
  // learner, however many of them there are.
  const narrow = evaluateBaseline(many(20, { skill: 'A.5A', role: 'practice' }));
  assert.equal(narrow.established, false);
  assert.ok(narrow.shortfall.distinctSkills > 0);
  assert.ok(narrow.shortfall.distinctSources > 0);
});

test('baseline reports exactly what is still missing', () => {
  const partial = evaluateBaseline([
    ...many(4, { skill: 'A.5A', role: 'practice' }),
    ...many(2, { skill: 'A.5C', role: 'dol' }),
  ]);
  assert.equal(partial.established, false);
  assert.equal(partial.shortfall.events, BASELINE_REQUIREMENT.events - 6);
  assert.equal(partial.shortfall.distinctSkills, 1);
  assert.equal(partial.shortfall.distinctSources, 0, 'two sources is already satisfied');
});

test('baseline is met by enough breadth and depth together', () => {
  const spread = evaluateBaseline([
    ...many(5, { skill: 'A.5A', role: 'practice' }),
    ...many(5, { skill: 'A.5C', role: 'dol' }),
    ...many(4, { skill: 'A.2A', role: 'quiz' }),
  ]);
  assert.equal(spread.established, true);
});

// --- DOK is its own axis ---------------------------------------------------------

test('per-DOK accuracy is tracked, not just which DOK levels appeared', () => {
  const profile = buildDokProfile([
    ...many(6, { dok: 1, correct: true }),
    ...many(5, { dok: 2, correct: true }),
    ...many(4, { dok: 3, correct: false }),
  ]);
  assert.equal(profile['1'].accuracy, 1);
  assert.equal(profile['3'].accuracy, 0);
  assert.equal(profile['3'].confident, true, 'four attempts is enough to be worth reading');
});

test('a thin DOK bucket is marked unconfident rather than reported as fact', () => {
  const profile = buildDokProfile(many(2, { dok: 3, correct: false }));
  assert.equal(profile['3'].confident, false,
    'two questions is a rumour, and a diagnosis built on it would be one too');
});

// --- Difficulty is a separate axis ------------------------------------------------

test('the stable band is the highest one the student actually holds', () => {
  const profile = buildDifficultyProfile([
    ...many(5, { band: 2, correct: true }),
    ...many(4, { band: 3, correct: true }),
    ...many(4, { band: 4, correct: false }),
  ]);
  assert.equal(profile.stableBand, 3, 'band 4 is being attempted but is not holding');
});

test('a band with too little evidence cannot become the stable band', () => {
  const profile = buildDifficultyProfile([
    ...many(6, { band: 3, correct: true }),
    ...many(2, { band: 5, correct: true }),
  ]);
  assert.equal(profile.stableBand, 3, 'two lucky band-5 answers is not a capability');
});

// --- The band itself ---------------------------------------------------------------

test('Band 3 is the anchor for On Level', () => {
  const band = deriveInstructionalBand({
    difficultyProfile: { stableBand: 3 },
    dokProfile: { 2: { accuracy: 0.8, confident: true } },
  });
  assert.equal(band, INSTRUCTIONAL_BAND.ON);
});

test('Above Level needs reasoning evidence, not just hard arithmetic', () => {
  const withoutReasoning = deriveInstructionalBand({
    difficultyProfile: { stableBand: 5 },
    dokProfile: { 1: { accuracy: 1, confident: true } },
  });
  assert.equal(withoutReasoning, INSTRUCTIONAL_BAND.ON,
    'succeeding at hard computation alone is not working above grade level');

  const withReasoning = deriveInstructionalBand({
    difficultyProfile: { stableBand: 4 },
    dokProfile: { 3: { accuracy: 0.7, confident: true } },
  });
  assert.equal(withReasoning, INSTRUCTIONAL_BAND.ABOVE);
});

test('a confirmed foundation gap outranks a good run at an easy band', () => {
  const band = deriveInstructionalBand({
    difficultyProfile: { stableBand: 4 },
    dokProfile: { 3: { accuracy: 0.8, confident: true } },
    foundationGapDepth: 2,
  });
  assert.equal(band, INSTRUCTIONAL_BAND.BELOW);
});

// --- Stability ----------------------------------------------------------------------

test('a visible band does not move on a couple of questions', () => {
  const held = stabilizeBand({
    previous: INSTRUCTIONAL_BAND.ON,
    candidate: INSTRUCTIONAL_BAND.BELOW,
    eventsSincePreviousChange: 2,
  });
  assert.equal(held.band, INSTRUCTIONAL_BAND.ON, 'a label that flickers cannot be planned around');
  assert.equal(held.pendingCandidate, INSTRUCTIONAL_BAND.BELOW,
    'but the pending reading is reported, so nothing is hidden');
});

test('sustained evidence does move it', () => {
  const moved = stabilizeBand({
    previous: INSTRUCTIONAL_BAND.ON,
    candidate: INSTRUCTIONAL_BAND.BELOW,
    eventsSincePreviousChange: 8,
  });
  assert.equal(moved.band, INSTRUCTIONAL_BAND.BELOW);
  assert.equal(moved.reason, 'sustained_evidence');
});

test('a real assessment can move it immediately', () => {
  const moved = stabilizeBand({
    previous: INSTRUCTIONAL_BAND.BELOW,
    candidate: INSTRUCTIONAL_BAND.ON,
    eventsSincePreviousChange: 1,
    significantAssessment: true,
  });
  assert.equal(moved.band, INSTRUCTIONAL_BAND.ON);
});

// --- Engagement is kept apart --------------------------------------------------------

test('not finishing work is an engagement concern, never an academic one', () => {
  assert.equal(deriveEngagement({ assigned: 10, completed: 3, overdue: 4 }), ENGAGEMENT.NEEDS_FOLLOW_UP);
  const profile = buildStudentLearningProfile({
    evidenceEvents: [
      ...many(5, { skill: 'A.5A', role: 'practice', band: 4, dok: 3 }),
      ...many(5, { skill: 'A.5C', role: 'dol', band: 4, dok: 3 }),
      ...many(4, { skill: 'A.2A', role: 'quiz', band: 4, dok: 3 }),
    ],
    masteryProfilesByTeks: { 'A.5A': { mastery: { estimate: 95, confidence: 'High' }, dimensions: { eligibleGradeLevelEvents: 10 } } },
    completion: { assigned: 10, completed: 2, overdue: 5 },
  });
  assert.equal(profile.instructionalBand, INSTRUCTIONAL_BAND.ABOVE,
    'a strong student who does not hand work in is still a strong student');
  assert.equal(profile.engagement, ENGAGEMENT.NEEDS_FOLLOW_UP,
    'and the completion problem is reported separately, not folded into the academic label');
});

// --- Transfer -----------------------------------------------------------------------

test('CCMR transfer is measured per framework and marked provisional when thin', () => {
  const transfer = buildTransferProfile([
    ...many(6, { framework: 'digitalSAT', correct: false }),
    ...many(2, { framework: 'act', correct: true }),
  ]);
  assert.equal(transfer.digitalSAT.provisional, false);
  assert.equal(transfer.act.provisional, true, 'two items is not a transfer measurement');
});

// --- Diagnosis ------------------------------------------------------------------------

test('strong recall with weak reasoning is named as a reasoning gap', () => {
  const profile = buildStudentLearningProfile({
    evidenceEvents: [
      ...many(6, { dok: 1, correct: true, skill: 'A.5A', role: 'practice' }),
      ...many(5, { dok: 2, correct: true, skill: 'A.5C', role: 'dol' }),
      ...many(4, { dok: 3, correct: false, skill: 'A.2A', role: 'quiz' }),
    ],
  });
  const gaps = diagnoseGaps(profile).map((gap) => gap.type);
  assert.ok(gaps.includes(GAP.STRATEGIC));
  assert.ok(!gaps.includes(GAP.PROCEDURAL), 'the opposite diagnosis must not fire too');
});

test('a complexity gap is named as one, not as a prerequisite gap', () => {
  // The distinction that keeps a student from being sent back a grade for a
  // problem that is only about structural load.
  const profile = buildStudentLearningProfile({
    evidenceEvents: [
      ...many(5, { band: 2, correct: true, skill: 'A.5A', role: 'practice' }),
      ...many(5, { band: 4, correct: false, skill: 'A.5C', role: 'dol' }),
      ...many(4, { band: 3, correct: true, skill: 'A.2A', role: 'quiz' }),
    ],
  });
  const gaps = diagnoseGaps(profile).map((gap) => gap.type);
  assert.ok(gaps.includes(GAP.DIFFICULTY));
  assert.ok(!gaps.includes(GAP.FOUNDATION), 'nothing here confirms a prerequisite problem');
});

test('a transfer gap needs strong course mastery behind it', () => {
  // Weak course mathematics plus weak exam performance is a COURSE gap. Calling
  // it a transfer gap would send the student to SAT practice they cannot use.
  const weakCourse = buildStudentLearningProfile({
    evidenceEvents: [
      ...many(5, { skill: 'A.5A', role: 'practice' }),
      ...many(5, { skill: 'A.5C', role: 'dol', framework: 'digitalSAT', correct: false }),
      ...many(4, { skill: 'A.2A', role: 'quiz' }),
    ],
    masteryProfilesByTeks: { 'A.5A': { mastery: { estimate: 40, confidence: 'Medium' }, dimensions: { eligibleGradeLevelEvents: 5 } } },
  });
  assert.ok(!diagnoseGaps(weakCourse).some((gap) => gap.type === GAP.TRANSFER));
});

test('nothing is diagnosed before baseline', () => {
  const profile = buildStudentLearningProfile({ evidenceEvents: many(3, { dok: 3, correct: false }) });
  assert.deepEqual(diagnoseGaps(profile), [], 'do not overdiagnose from a tiny sample');
});

// --- Robustness -----------------------------------------------------------------------

test('a malformed or empty history produces a profile rather than a crash', () => {
  [undefined, null, [], [null], [{}], [{ performance: null }]].forEach((events) => {
    const profile = buildStudentLearningProfile({ evidenceEvents: events });
    assert.equal(profile.instructionalBand, INSTRUCTIONAL_BAND.BASELINE);
    assert.equal(profile.courseMastery, null);
  });
});

// --- No stable band is a finding, not an absence -------------------------------

test('a student holding at no band, with real evidence, is Below Level', () => {
  // Returning Baseline here meant a struggling student with fourteen pieces of
  // evidence never resolved to a band — so the Foundation Bridge slot their
  // weekly mix depends on could not be requested for exactly the students who
  // needed it most.
  const band = deriveInstructionalBand({
    difficultyProfile: { stableBand: null, evidenceCount: 14, byBand: { 3: { attempts: 14, accuracy: 0.3 } } },
    dokProfile: {},
    baselineEstablished: true,
  });
  assert.equal(band, INSTRUCTIONAL_BAND.BELOW);
});

test('thin evidence with no stable band is still an open question', () => {
  const band = deriveInstructionalBand({
    difficultyProfile: { stableBand: null, evidenceCount: 3 },
    dokProfile: {},
    baselineEstablished: true,
  });
  assert.equal(band, INSTRUCTIONAL_BAND.BASELINE,
    'three attempts is not enough to conclude a student is below level');
});

test('without an established baseline nothing is concluded either way', () => {
  const band = deriveInstructionalBand({
    difficultyProfile: { stableBand: null, evidenceCount: 40 },
    dokProfile: {},
  });
  assert.equal(band, INSTRUCTIONAL_BAND.BASELINE);
});

test('a failing student reaches Below Level through the whole profile, not just the helper', () => {
  const failing = [
    ...Array.from({ length: 6 }, () => evidence({ correct: false, band: 3, dok: 2, skill: 'A.5A', role: 'practice' })),
    ...Array.from({ length: 5 }, () => evidence({ correct: false, band: 3, dok: 1, skill: 'A.3A', role: 'dol' })),
    ...Array.from({ length: 4 }, () => evidence({ correct: false, band: 2, dok: 2, skill: 'A.9A', role: 'quiz' })),
  ];
  const profile = buildStudentLearningProfile({ evidenceEvents: failing });
  assert.equal(profile.baseline.established, true);
  assert.equal(profile.instructionalBand, INSTRUCTIONAL_BAND.BELOW);
  assert.equal(profile.instructionalBandLabel, 'Below Level');
});

// --- Two writers, two status vocabularies ------------------------------------------

test('assignment evidence counts, not just My Math Path evidence', () => {
  // The server writes 'finalized'; the browser writes the attempt record's own
  // status. Accepting only 'finalized' silently dropped classwork, practice,
  // DOL, quizzes and tests — the overwhelming majority of what a student does —
  // so the profile was built from Path sessions alone.
  const assignmentCorrect = { ...evidence(), performance: { status: 'correct', isCorrect: true } };
  const assignmentWrong = { ...evidence(), performance: { status: 'incorrect', isCorrect: false } };
  assert.equal(isClassifyingEvidence(assignmentCorrect), true);
  assert.equal(isClassifyingEvidence(assignmentWrong), true);
});

test('a timed-out question is a real outcome, not an absence', () => {
  const expired = { ...evidence(), performance: { status: 'expired', isCorrect: false } };
  assert.equal(isClassifyingEvidence(expired), true);
});

test('an open question still classifies nothing', () => {
  ['attempted', 'unattempted', 'inProgress', ''].forEach((status) => {
    const open = { ...evidence(), performance: { status, isCorrect: false } };
    assert.equal(isClassifyingEvidence(open), false, `"${status}" must not classify`);
  });
});

test('the status rules do not override the support rules', () => {
  // A correct assignment answer that was modified still measures a different
  // construct, whichever writer produced it.
  const modified = {
    ...evidence(), performance: { status: 'correct', isCorrect: true }, supportUsage: { modified: true },
  };
  assert.equal(isClassifyingEvidence(modified), false);
});

test('a mixed evidence stream builds one profile', () => {
  // What a real student's history actually looks like: some Path, some
  // assignment, written by two different systems.
  const mixed = [
    ...Array.from({ length: 6 }, () => ({ ...evidence({ skill: 'A.5A', band: 3, dok: 2 }), performance: { status: 'finalized', isCorrect: true } })),
    ...Array.from({ length: 6 }, () => ({ ...evidence({ skill: 'A.3A', band: 3, dok: 2, role: 'dol' }), performance: { status: 'correct', isCorrect: true } })),
    ...Array.from({ length: 4 }, () => ({ ...evidence({ skill: 'A.9A', band: 2, dok: 1, role: 'quiz' }), performance: { status: 'incorrect', isCorrect: false } })),
  ];
  const profile = buildStudentLearningProfile({ evidenceEvents: mixed });
  assert.equal(profile.baseline.events, 16, 'every terminal event counts, from either writer');
  assert.equal(profile.baseline.established, true);
});
