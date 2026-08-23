// TEACHER-FORCED CORRECTNESS IS NOT EVIDENCE, AND THE RULE HAS TO HOLD IN THREE PLACES.
//
// A teacher marking a question correct at a student's desk is a legitimate
// classroom act — it clears a jam, it keeps a lesson moving, sometimes it
// corrects the software. What it is not is a measurement of what the student
// can do alone, and the moment it counts as one, every downstream conclusion is
// contaminated by an act of kindness.
//
// The Live Class hub is where this rule is most likely to be broken, because
// that is where a teacher is standing beside a stuck student with the power to
// move them along. So this file pins the rule at every layer that could quietly
// drop it: the profile's evidence filter, the weekly grade, and the shape of
// the flag itself.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isClassifyingEvidence, buildStudentLearningProfile, buildDokProfile, buildDifficultyProfile,
} from '../../src/platform/profile/studentLearningProfile.js';
import { deriveCompletionsFromEvidence } from '../../src/platform/path/weeklyPathGoal.js';

const event = (overrides = {}) => ({
  eventKey: 'e1',
  occurredAt: 1_770_000_000_000,
  alignmentKeys: ['A.5C'],
  questionSnapshot: { dok: 2, difficultyBand: 3, questionInstanceId: 'q1' },
  performance: { status: 'finalized', isCorrect: true, score: 1 },
  source: { kind: 'path', activityRole: 'practice' },
  ...overrides,
});

test('a teacher-forced correct answer is not classifying evidence', () => {
  assert.equal(isClassifyingEvidence(event()), true, 'the control case must pass');
  assert.equal(isClassifyingEvidence(event({ teacherForced: true })), false);
});

test('the flag is honoured whether it sits on the event or on its source', () => {
  // Two writers, two shapes. A rule that only checks one of them is a rule that
  // works until somebody uses the other.
  assert.equal(isClassifyingEvidence(event({ teacherForced: true })), false);
  assert.equal(isClassifyingEvidence(event({ source: { kind: 'assignment', teacherForced: true } })), false);
});

test('a modified task is excluded too, because it measures a different construct', () => {
  assert.equal(isClassifyingEvidence(event({ supportUsage: { modified: true } })), false);
});

test('forced correctness cannot inflate the DOK or difficulty profile', () => {
  // The subtler failure. Even if a forced event never changed the band label,
  // it would change the accuracy figures a teacher reads underneath it.
  const honest = [event({ eventKey: 'a' }), event({ eventKey: 'b' })];
  const withForced = [...honest, event({ eventKey: 'c', teacherForced: true })];
  assert.deepEqual(buildDokProfile(withForced), buildDokProfile(honest));
  assert.deepEqual(buildDifficultyProfile(withForced), buildDifficultyProfile(honest));
});

test('forced correctness does not count towards establishing a baseline', () => {
  // Otherwise a teacher helping a struggling student through a hard week would
  // be the reason that student got classified at all.
  const forced = Array.from({ length: 20 }, (unused, index) => event({
    eventKey: `f${index}`,
    alignmentKeys: [`A.${index % 5}A`],
    source: { kind: 'path', activityRole: index % 2 ? 'practice' : 'dol' },
    teacherForced: true,
  }));
  const profile = buildStudentLearningProfile({ courseId: 'algebra1', evidenceEvents: forced });
  assert.equal(profile.baseline.established, false);
  assert.equal(profile.baseline.events, 0);
});

test('forced correctness does not count as a completed weekly path session', () => {
  const rows = deriveCompletionsFromEvidence([
    event({ eventKey: 'real' }),
    event({ eventKey: 'forced', teacherForced: true }),
  ]);
  assert.ok(!JSON.stringify(rows).includes('forced'), 'a forced event must not become a completion');
});

test('an honest incorrect answer IS evidence — the rule excludes forcing, not failure', () => {
  // Worth pinning explicitly. The exclusion is about who did the mathematics,
  // not about whether it came out right, and a filter that quietly dropped wrong
  // answers would flatter every student in the building.
  assert.equal(isClassifyingEvidence(event({ performance: { status: 'incorrect', isCorrect: false, score: 0 } })), true);
});
